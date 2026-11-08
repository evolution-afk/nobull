import type { BackendEnvironment, D1Database } from '../_shared/settings'
import { sendMessage } from '../_shared/telegram'
import { verifyTelegramWebAppInitData } from '../_shared/telegramAuth'
import {
  VpnClient,
  type VpnProtocol,
  type VpnProvisionResult,
} from '../_shared/vpnClient'

interface VpnCheckoutContext {
  request: Request
  env: BackendEnvironment
}

interface PlanRow {
  id: string
  plan_code: string
  name: string
  quota_gb: number
  duration_days: number | null
  price_amount: number
  price_currency: string | null
}

interface ServerRow {
  code: string
  name: string
  ip_address: string
  protocol_default: string | null
}

const PLAN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const SERVER_CODE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9:_-]{8,64}$/
const DEFAULT_DURATION_DAYS = 30
const MAX_DURATION_DAYS = 3650
const DEFAULT_PROTOCOL: VpnProtocol = 'udp'
const PURCHASE_REASON = 'vpn_purchase'
const REFUND_REASON = 'vpn_refund'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function toToman(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed)
}

function toDurationDays(value: unknown): number {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DURATION_DAYS
  return Math.min(parsed, MAX_DURATION_DAYS)
}

function toQuotaGb(value: unknown): number | null {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

function normalizeProtocol(value: unknown): VpnProtocol {
  return toText(value).toLowerCase() === 'tcp' ? 'tcp' : DEFAULT_PROTOCOL
}

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Builds the OpenVPN profile returned to the storefront. The subscription
 * quota is shared across every server; this profile only pins the initial
 * endpoint the user connects to.
 */
function buildConfigUrl(
  client: VpnClient,
  server: ServerRow,
  username: string,
  password: string,
  provisioned: VpnProvisionResult,
): string | null {
  const providerUrl =
    toText(provisioned.config_url) || toText(provisioned.ovpn_url)
  if (providerUrl) return providerUrl
  try {
    const profile = client.generateOvpnConfig(
      server.ip_address,
      normalizeProtocol(server.protocol_default),
      username,
      password,
    )
    return `data:application/x-openvpn-profile;charset=utf-8;base64,${toBase64Utf8(profile)}`
  } catch (error) {
    console.error('OpenVPN profile could not be generated.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

interface RefundRequest {
  database: D1Database
  telegramId: string
  priceToman: number
  orderKey: string
  customerId: number
  provisionMarker: string
  reason: string
}

/**
 * Compensating transaction used when provisioning fails after the wallet debit
 * was committed. Returns whether the wallet was restored.
 */
async function refundFailedPurchase({
  database,
  telegramId,
  priceToman,
  orderKey,
  customerId,
  provisionMarker,
  reason,
}: RefundRequest): Promise<boolean> {
  const now = Date.now()
  try {
    await database.batch([
      database
        .prepare(
          `UPDATE nobull_wallet_accounts
           SET balance_toman = balance_toman + ?,
               total_spent_toman = MAX(0, total_spent_toman - ?),
               orders_count = MAX(0, orders_count - 1),
               updated_at = ?
           WHERE chat_id = ?`,
        )
        .bind(priceToman, priceToman, now, telegramId),
      database
        .prepare(
          `INSERT INTO nobull_wallet_transactions
           (chat_id, delta_toman, reference, reason, created_at)
           SELECT ?, ?, ?, ?, ? WHERE changes() = 1`,
        )
        .bind(telegramId, priceToman, `vpn-refund:${orderKey}`, REFUND_REASON, now),
      database
        .prepare(
          `UPDATE orders
           SET status = 'rejected',
               provision_status = 'failed',
               reject_reason = ?
           WHERE idempotency_key = ?`,
        )
        .bind(reason.slice(0, 200), orderKey),
      database
        .prepare(
          `UPDATE subscriptions
           SET status = 'cancelled',
               provision_status = 'failed',
               updated_at = CURRENT_TIMESTAMP
           WHERE customer_id = ? AND provision_status = ?`,
        )
        .bind(customerId, provisionMarker),
    ])
    return true
  } catch (error) {
    console.error('VPN wallet refund failed; manual review is required.', {
      orderKey,
      telegramId,
      priceToman,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return false
  }
}

async function alertAdmins(
  env: BackendEnvironment,
  lines: string[],
): Promise<void> {
  if (!env.TELEGRAM_ADMIN_CHAT_ID || !env.TELEGRAM_BOT_TOKEN) return
  try {
    await sendMessage(env, env.TELEGRAM_ADMIN_CHAT_ID, lines.join('\n'))
  } catch (error) {
    console.warn('VPN checkout failure alert could not reach the admin.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

function isMissingTableError(message: string): boolean {
  return /no such table/i.test(message)
}

/**
 * POST /api/vpn/checkout
 *
 * Body: { plan_id, server_code, initData, idempotency_key? }
 *
 * Debits the caller's D1 wallet, records the order and subscription, then
 * provisions the RADIUS account through the legacy var-api. If provisioning
 * fails after the debit, the wallet is credited back and the order is marked
 * rejected so support can trace it by reference.
 */
export async function onRequestPost({
  request,
  env,
}: VpnCheckoutContext): Promise<Response> {
  const database = env.NOBULL_WALLET_DB
  if (!database) {
    console.error(
      'VPN checkout requested but the NOBULL_WALLET_DB D1 binding is not configured.',
    )
    return jsonResponse(
      { ok: false, error: 'پایگاه داده کیف پول پیکربندی نشده است.' },
      503,
    )
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    return jsonResponse(
      { ok: false, error: 'احراز هویت تلگرام پیکربندی نشده است.' },
      503,
    )
  }
  if (!env.VAR_API_URL || !env.VAR_API_TOKEN) {
    return jsonResponse(
      { ok: false, error: 'سرویس فعال‌سازی وی‌پی‌ان پیکربندی نشده است.' },
      503,
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ ok: false, error: 'درخواست معتبر نیست.' }, 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ ok: false, error: 'درخواست معتبر نیست.' }, 400)
  }
  const payload = body as Record<string, unknown>
  const planId = toText(payload.plan_id)
  const serverCode = toText(payload.server_code)
  const initData = typeof payload.initData === 'string' ? payload.initData : ''
  if (
    !PLAN_ID_PATTERN.test(planId) ||
    !SERVER_CODE_PATTERN.test(serverCode) ||
    !initData
  ) {
    return jsonResponse(
      { ok: false, error: 'پلن، سرور یا نشست ارسال‌شده معتبر نیست.' },
      400,
    )
  }

  const suppliedKey = toText(payload.idempotency_key)
  if (suppliedKey && !IDEMPOTENCY_PATTERN.test(suppliedKey)) {
    return jsonResponse(
      { ok: false, error: 'شناسه درخواست خرید معتبر نیست.' },
      400,
    )
  }

  const user = await verifyTelegramWebAppInitData(env, initData)
  if (!user) {
    return jsonResponse(
      { ok: false, error: 'نشست تلگرام معتبر نیست یا منقضی شده است.' },
      401,
    )
  }

  const telegramId = user.id
  const telegramNumber = Number(telegramId)
  if (!Number.isSafeInteger(telegramNumber) || telegramNumber <= 0) {
    return jsonResponse(
      { ok: false, error: 'شناسه کاربر تلگرام معتبر نیست.' },
      400,
    )
  }

  const orderKey = suppliedKey || crypto.randomUUID()
  const provisionMarker = `pending:${orderKey}`
  const debitReference = `vpn:${orderKey}`
  let debited = false
  let customerId = 0
  let priceToman = 0

  try {
    const [plan, server] = await Promise.all([
      database
        .prepare(
          `SELECT id, plan_code, name, quota_gb, duration_days, price_amount, price_currency
           FROM plans WHERE id = ? AND is_active = 1`,
        )
        .bind(planId)
        .first<PlanRow>(),
      database
        .prepare(
          `SELECT code, name, ip_address, protocol_default
           FROM servers WHERE code = ? AND is_active = 1`,
        )
        .bind(serverCode)
        .first<ServerRow>(),
    ])
    if (!plan || !toText(plan.plan_code)) {
      return jsonResponse(
        { ok: false, error: 'پلن انتخابی موجود یا فعال نیست.' },
        404,
      )
    }
    if (!server) {
      return jsonResponse(
        { ok: false, error: 'سرور انتخابی موجود یا فعال نیست.' },
        404,
      )
    }
    const planPrice = toToman(plan.price_amount)
    const quotaGb = toQuotaGb(plan.quota_gb)
    if (planPrice === null || planPrice <= 0) {
      console.error('VPN plan has an invalid price.', { planId })
      return jsonResponse(
        { ok: false, error: 'قیمت پلن انتخابی معتبر نیست.' },
        503,
      )
    }
    if (quotaGb === null) {
      console.error('VPN plan has an invalid quota.', { planId })
      return jsonResponse(
        { ok: false, error: 'حجم پلن انتخابی معتبر نیست.' },
        503,
      )
    }
    priceToman = planPrice
    const durationDays = toDurationDays(plan.duration_days)
    const currency = toText(plan.price_currency).toUpperCase() || 'IRR'

    const wallet = await database
      .prepare(
        'SELECT balance_toman FROM nobull_wallet_accounts WHERE chat_id = ?',
      )
      .bind(telegramId)
      .first<{ balance_toman: number }>()
    const balanceToman = Number(wallet?.balance_toman ?? 0)
    if (!Number.isFinite(balanceToman) || balanceToman < priceToman) {
      return jsonResponse(
        {
          ok: false,
          error: 'موجودی کیف پول کافی نیست.',
          balance_toman: Number.isFinite(balanceToman) ? balanceToman : 0,
          required_toman: priceToman,
        },
        402,
      )
    }

    await database
      .prepare(
        `INSERT INTO users (telegram_id, username, first_name, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(telegram_id) DO UPDATE SET
           username = excluded.username,
           first_name = excluded.first_name,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(telegramNumber, user.username, user.firstName)
      .run()
    const customer = await database
      .prepare('SELECT id FROM users WHERE telegram_id = ?')
      .bind(telegramNumber)
      .first<{ id: number }>()
    if (!customer) throw new Error('The user record could not be created.')
    customerId = Number(customer.id)

    const now = Date.now()
    const results = await database.batch([
      database
        .prepare(
          `UPDATE nobull_wallet_accounts
           SET balance_toman = balance_toman - ?,
               total_spent_toman = total_spent_toman + ?,
               orders_count = orders_count + 1,
               updated_at = ?
           WHERE chat_id = ? AND balance_toman >= ?`,
        )
        .bind(priceToman, priceToman, now, telegramId, priceToman),
      database
        .prepare(
          `INSERT INTO nobull_wallet_transactions
           (chat_id, delta_toman, reference, reason, created_at)
           SELECT ?, ?, ?, ?, ? WHERE changes() = 1`,
        )
        .bind(telegramId, -priceToman, debitReference, PURCHASE_REASON, now),
      database
        .prepare(
          `INSERT INTO orders
           (customer_id, plan_id, amount, currency, status, payment_method,
            idempotency_key, server_code, provision_status, created_at)
           SELECT ?, ?, ?, ?, 'completed', 'wallet', ?, ?, ?, CURRENT_TIMESTAMP
           WHERE EXISTS (
             SELECT 1 FROM nobull_wallet_transactions WHERE reference = ?
           )`,
        )
        .bind(
          customerId,
          plan.id,
          priceToman,
          currency,
          orderKey,
          server.code,
          provisionMarker,
          debitReference,
        ),
      database
        .prepare(
          `INSERT INTO subscriptions
           (customer_id, plan_id, status, start_date, expiry_date,
            quota_limit_gb, server_code, provision_status, created_at, updated_at)
           SELECT ?, ?, 'active', CURRENT_TIMESTAMP, datetime('now', ?), ?, ?, ?,
                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
           WHERE EXISTS (
             SELECT 1 FROM orders WHERE idempotency_key = ?
           )`,
        )
        .bind(
          customerId,
          plan.id,
          `+${durationDays} days`,
          quotaGb,
          server.code,
          provisionMarker,
          orderKey,
        ),
    ])

    if ((results[0]?.meta.changes ?? 0) !== 1) {
      return jsonResponse(
        {
          ok: false,
          error: 'موجودی کیف پول کافی نیست.',
          balance_toman: Number.isFinite(balanceToman) ? balanceToman : 0,
          required_toman: priceToman,
        },
        402,
      )
    }
    debited = true

    const [orderRow, subscription] = await Promise.all([
      database
        .prepare('SELECT id FROM orders WHERE idempotency_key = ?')
        .bind(orderKey)
        .first<{ id: number }>(),
      database
        .prepare(
          `SELECT id, expiry_date FROM subscriptions
           WHERE customer_id = ? AND provision_status = ?
           ORDER BY id DESC LIMIT 1`,
        )
        .bind(customerId, provisionMarker)
        .first<{ id: number; expiry_date: string | null }>(),
    ])
    if (!orderRow || !subscription) {
      throw new Error('Order rows could not be read after the wallet debit.')
    }

    const client = new VpnClient(env)
    let provisioned: VpnProvisionResult
    try {
      provisioned = await client.provision({
        external_ref: telegramId,
        plan_code: plan.plan_code,
        order_id: String(orderRow.id),
        server_code: server.code,
      })
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown provisioning error'
      const refunded = await refundFailedPurchase({
        database,
        telegramId,
        priceToman,
        orderKey,
        customerId,
        provisionMarker,
        reason,
      })
      console.error('VPN provisioning failed after the wallet debit.', {
        orderId: orderRow.id,
        orderKey,
        telegramId,
        planId: plan.id,
        serverCode: server.code,
        refunded,
        reason,
      })
      await alertAdmins(env, [
        '❌ فعال‌سازی وی‌پی‌ان ناموفق بود',
        `سفارش: ${orderRow.id}`,
        `شناسه پیگیری: ${orderKey}`,
        `کاربر: ${telegramId}`,
        `پلن: ${plan.name} (${plan.id})`,
        `سرور: ${server.name} (${server.code})`,
        `بازگشت وجه: ${refunded ? 'انجام شد' : 'انجام نشد — بررسی دستی لازم است'}`,
        `خطا: ${reason.slice(0, 300)}`,
      ])
      return jsonResponse(
        {
          ok: false,
          error: refunded
            ? 'فعال‌سازی اشتراک ناموفق بود و مبلغ به کیف پول شما بازگردانده شد.'
            : 'فعال‌سازی اشتراک ناموفق بود؛ مبلغ در انتظار بررسی پشتیبانی است.',
          refunded,
          order_id: String(orderRow.id),
          order_reference: orderKey,
        },
        502,
      )
    }

    const username = toText(provisioned.radius_username)
    const password = toText(provisioned.password)
    if (!username || !password) {
      const reason = 'var-api returned empty RADIUS credentials'
      const refunded = await refundFailedPurchase({
        database,
        telegramId,
        priceToman,
        orderKey,
        customerId,
        provisionMarker,
        reason,
      })
      console.error('VPN provisioning returned empty credentials.', {
        orderId: orderRow.id,
        orderKey,
        telegramId,
        serverCode: server.code,
        refunded,
      })
      await alertAdmins(env, [
        '❌ فعال‌سازی وی‌پی‌ان بدون اطلاعات ورود بازگشت',
        `سفارش: ${orderRow.id}`,
        `شناسه پیگیری: ${orderKey}`,
        `کاربر: ${telegramId}`,
        `سرور: ${server.name} (${server.code})`,
        `بازگشت وجه: ${refunded ? 'انجام شد' : 'انجام نشد — بررسی دستی لازم است'}`,
        `خطا: ${reason}`,
      ])
      return jsonResponse(
        {
          ok: false,
          error: refunded
            ? 'اطلاعات اتصال از سرور دریافت نشد و مبلغ به کیف پول شما بازگردانده شد.'
            : 'اطلاعات اتصال از سرور دریافت نشد؛ مبلغ در انتظار بررسی پشتیبانی است.',
          refunded,
          order_id: String(orderRow.id),
          order_reference: orderKey,
        },
        502,
      )
    }

    const configUrl = buildConfigUrl(client, server, username, password, provisioned)
    await database.batch([
      database
        .prepare(
          `UPDATE subscriptions
           SET radius_username = ?,
               radius_password = ?,
               config_url = ?,
               provision_status = 'provisioned',
               updated_at = CURRENT_TIMESTAMP
           WHERE customer_id = ? AND provision_status = ?`,
        )
        .bind(username, password, configUrl, customerId, provisionMarker),
      database
        .prepare(
          `UPDATE orders
           SET radius_username = ?,
               radius_password = ?,
               config_url = ?,
               provision_status = 'provisioned',
               completed_at = CURRENT_TIMESTAMP
           WHERE idempotency_key = ?`,
        )
        .bind(username, password, configUrl, orderKey),
    ])
    debited = false

    const updatedWallet = await database
      .prepare(
        'SELECT balance_toman FROM nobull_wallet_accounts WHERE chat_id = ?',
      )
      .bind(telegramId)
      .first<{ balance_toman: number }>()

    return jsonResponse({
      ok: true,
      username,
      password,
      config_url: configUrl,
      order_id: String(orderRow.id),
      order_reference: orderKey,
      subscription_id: Number(subscription.id),
      expires_at: subscription.expiry_date,
      plan: {
        id: plan.id,
        name: plan.name,
        quota_gb: quotaGb,
        duration_days: durationDays,
        price_toman: priceToman,
      },
      server: {
        code: server.code,
        name: server.name,
        protocol: normalizeProtocol(server.protocol_default),
      },
      wallet_balance_toman: Number(updatedWallet?.balance_toman ?? 0),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (/UNIQUE constraint failed/i.test(message) && suppliedKey) {
      return jsonResponse(
        {
          ok: false,
          error: 'این سفارش قبلاً ثبت شده است؛ از ثبت دوباره خودداری کنید.',
          order_reference: orderKey,
        },
        409,
      )
    }
    if (isMissingTableError(message)) {
      console.error('VPN checkout schema is missing from D1.', { message })
      return jsonResponse(
        {
          ok: false,
          error:
            'جداول وی‌پی‌ان در پایگاه داده ایجاد نشده‌اند؛ مایگریشن‌ها را اجرا کنید.',
        },
        503,
      )
    }

    let refunded = false
    if (debited) {
      refunded = await refundFailedPurchase({
        database,
        telegramId,
        priceToman,
        orderKey,
        customerId,
        provisionMarker,
        reason: message,
      })
      await alertAdmins(env, [
        '❌ خطای غیرمنتظره در خرید وی‌پی‌ان',
        `شناسه پیگیری: ${orderKey}`,
        `کاربر: ${telegramId}`,
        `بازگشت وجه: ${refunded ? 'انجام شد' : 'انجام نشد — بررسی دستی لازم است'}`,
        `خطا: ${message.slice(0, 300)}`,
      ])
    }
    console.error('VPN checkout failed.', {
      orderKey,
      telegramId,
      planId,
      serverCode,
      refunded,
      error: message,
    })
    return jsonResponse(
      {
        ok: false,
        error: refunded
          ? 'ثبت سفارش وی‌پی‌ان ناموفق بود و مبلغ به کیف پول شما بازگردانده شد.'
          : 'ثبت سفارش وی‌پی‌ان ناموفق بود. اگر مبلغی کسر شد با پشتیبانی تماس بگیرید.',
        refunded,
        order_reference: orderKey,
      },
      500,
    )
  }
}
