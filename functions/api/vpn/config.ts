import type { BackendEnvironment } from '../_shared/settings'
import {
  readTelegramInitData,
  verifyTelegramWebAppInitData,
} from '../_shared/telegramAuth'
import { VpnClient, type VpnProtocol } from '../_shared/vpnClient'

interface VpnConfigContext {
  request: Request
  env: BackendEnvironment
}

interface SubscriptionCredentialRow {
  id: number
  status: string | null
  radius_username: string | null
  radius_password: string | null
}

interface ServerRow {
  code: string
  name: string
  ip_address: string
  protocol_default: string | null
}

const SUBSCRIPTION_ID_PATTERN = /^\d{1,19}$/
const SERVER_CODE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const DEFAULT_PROTOCOL: VpnProtocol = 'udp'

const SUBSCRIPTION_QUERY = `
  SELECT s.id, s.status, s.radius_username, s.radius_password
  FROM subscriptions s
  JOIN users u ON u.id = s.customer_id
  WHERE s.id = ? AND u.telegram_id = ?`

const SERVER_QUERY =
  'SELECT code, name, ip_address, protocol_default FROM servers WHERE code = ? AND is_active = 1'

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

function toText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || fallback
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

function normalizeProtocol(value: unknown): VpnProtocol {
  return toText(value).toLowerCase() === 'tcp' ? 'tcp' : DEFAULT_PROTOCOL
}

/** Keeps the download filename free of quotes and path separators. */
function toFilenameSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 64)
}

/**
 * GET /api/vpn/config?sub_id=…&server_code=…&initData=…
 *
 * Streams a ready-to-use `.ovpn` profile for any active server; the
 * subscription quota is shared across every location. The caller must own
 * the subscription, which is verified against D1 before the config is built.
 */
export async function onRequestGet({
  request,
  env,
}: VpnConfigContext): Promise<Response> {
  const database = env.NOBULL_WALLET_DB
  if (!database) {
    console.error(
      'VPN config requested but the NOBULL_WALLET_DB D1 binding is not configured.',
    )
    return jsonResponse(
      { ok: false, error: 'پایگاه داده اشتراک‌ها پیکربندی نشده است.' },
      503,
    )
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    return jsonResponse(
      { ok: false, error: 'احراز هویت تلگرام پیکربندی نشده است.' },
      503,
    )
  }

  const url = new URL(request.url)
  const initData = readTelegramInitData(request)
  const subscriptionId = (url.searchParams.get('sub_id') ?? '').trim()
  const serverCode = (url.searchParams.get('server_code') ?? '').trim()
  if (!initData) {
    return jsonResponse({ ok: false, error: 'نشست تلگرام یافت نشد.' }, 401)
  }
  if (
    !SUBSCRIPTION_ID_PATTERN.test(subscriptionId) ||
    !SERVER_CODE_PATTERN.test(serverCode)
  ) {
    return jsonResponse(
      { ok: false, error: 'شناسه اشتراک یا سرور معتبر نیست.' },
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
  const telegramNumber = Number(user.id)
  if (!Number.isSafeInteger(telegramNumber) || telegramNumber <= 0) {
    return jsonResponse(
      { ok: false, error: 'شناسه کاربر تلگرام معتبر نیست.' },
      400,
    )
  }

  try {
    const subscription = await database
      .prepare(SUBSCRIPTION_QUERY)
      .bind(Number(subscriptionId), telegramNumber)
      .first<SubscriptionCredentialRow>()
    if (!subscription) {
      return jsonResponse(
        { ok: false, error: 'اشتراکی با این شناسه برای حساب شما یافت نشد.' },
        404,
      )
    }
    if (toText(subscription.status) !== 'active') {
      return jsonResponse(
        { ok: false, error: 'این اشتراک فعال نیست و کانفیگ جدید صادر نمی‌شود.' },
        409,
      )
    }
    const username = toText(subscription.radius_username)
    const password = toText(subscription.radius_password)
    if (!username || !password) {
      return jsonResponse(
        {
          ok: false,
          error: 'اطلاعات ورود این اشتراک کامل نیست؛ با پشتیبانی تماس بگیرید.',
        },
        409,
      )
    }

    const server = await database
      .prepare(SERVER_QUERY)
      .bind(serverCode)
      .first<ServerRow>()
    if (!server) {
      return jsonResponse(
        { ok: false, error: 'سرور انتخابی موجود یا فعال نیست.' },
        404,
      )
    }

    const client = new VpnClient(env)
    const profile = client.generateOvpnConfig(
      toText(server.ip_address),
      normalizeProtocol(server.protocol_default),
      username,
      password,
    )

    const filename = `Veloxa-${toFilenameSegment(serverCode)}-${toFilenameSegment(username)}.ovpn`
    return new Response(profile, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        'Content-Type': 'application/x-openvpn-profile',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('VPN config generation failed.', {
      subscriptionId,
      serverCode,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonResponse(
      { ok: false, error: 'ساخت فایل کانفیگ ناموفق بود. دوباره تلاش کنید.' },
      500,
    )
  }
}
