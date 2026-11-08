import type { BackendEnvironment } from '../_shared/settings'
import {
  readTelegramInitData,
  verifyTelegramWebAppInitData,
} from '../_shared/telegramAuth'
import { VpnClient } from '../_shared/vpnClient'

interface VpnMyContext {
  request: Request
  env: BackendEnvironment
}

interface SubscriptionRow {
  id: number
  plan_id: string
  plan_name: string | null
  plan_name_en: string | null
  status: string
  start_date: string | null
  expiry_date: string | null
  quota_limit_gb: number
  quota_used_gb: number
  radius_username: string | null
  server_code: string | null
  provision_status: string | null
}

interface ServerRow {
  code: string
  name: string
  protocol_default: string | null
}

/**
 * Usage figures the dashboard renders. `live` is false when the RADIUS
 * lookup failed and the numbers came from the cached subscription row.
 */
export interface VpnUsageSnapshot {
  used_gb: number
  quota_gb: number
  remaining_gb: number
  bytes_total: number | null
  bytes_used: number | null
  live: boolean
}

interface SubscriptionSummary {
  id: number
  plan_id: string
  plan_name: string
  plan_name_en: string | null
  status: string
  start_date: string | null
  expiry_date: string | null
  quota_limit_gb: number
  quota_used_gb: number
  radius_username: string
  server_code: string
  provision_status: string | null
  usage: VpnUsageSnapshot
}

const BYTES_PER_GB = 1024 ** 3
const DEFAULT_PROTOCOL = 'udp'

const ACTIVE_SUBSCRIPTIONS_QUERY = `
  SELECT s.id,
         s.plan_id,
         p.name AS plan_name,
         p.name_en AS plan_name_en,
         s.status,
         s.start_date,
         s.expiry_date,
         s.quota_limit_gb,
         s.quota_used_gb,
         s.radius_username,
         s.server_code,
         s.provision_status
  FROM subscriptions s
  JOIN users u ON u.id = s.customer_id
  LEFT JOIN plans p ON p.id = s.plan_id
  WHERE u.telegram_id = ? AND s.status = 'active'
  ORDER BY s.created_at DESC`

const ACTIVE_SERVERS_QUERY =
  'SELECT code, name, protocol_default FROM servers WHERE is_active = 1 ORDER BY sort_order ASC'

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

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function roundGb(value: number): number {
  return Math.round(value * 100) / 100
}

/** Returns the first key whose value parses to a finite, non-negative number. */
function pickNumber(
  source: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const parsed = Number(source[key])
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return null
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function cachedUsage(fallback: {
  quotaGb: number
  usedGb: number
}): VpnUsageSnapshot {
  const quotaGb = roundGb(Math.max(0, fallback.quotaGb))
  const usedGb = roundGb(Math.min(Math.max(0, fallback.usedGb), quotaGb))
  return {
    used_gb: usedGb,
    quota_gb: quotaGb,
    remaining_gb: roundGb(Math.max(0, quotaGb - usedGb)),
    bytes_total: null,
    bytes_used: null,
    live: false,
  }
}

/**
 * Maps the var-api usage payload onto the dashboard fields. The provider
 * payload shape has changed between releases, so a few aliases are accepted
 * before falling back to the cached subscription quota.
 */
function normalizeUsage(
  payload: unknown,
  fallback: { quotaGb: number; usedGb: number },
): VpnUsageSnapshot {
  const usage = toRecord(payload)
  const bytesTotal = pickNumber(usage, [
    'bytes_total',
    'total_bytes',
    'quota_bytes',
    'bytes_limit',
  ])
  const bytesUsed = pickNumber(usage, [
    'bytes_used',
    'used_bytes',
    'bytes_consumed',
  ])
  const liveUsedGb =
    pickNumber(usage, ['used_gb', 'usage_gb']) ??
    (bytesUsed !== null ? bytesUsed / BYTES_PER_GB : null)
  const liveQuotaGb =
    pickNumber(usage, ['quota_gb', 'total_gb']) ??
    (bytesTotal !== null ? bytesTotal / BYTES_PER_GB : null)

  if (liveUsedGb === null && liveQuotaGb === null) return cachedUsage(fallback)

  const quotaGb = roundGb(Math.max(0, liveQuotaGb ?? fallback.quotaGb))
  const usedGb = roundGb(
    Math.min(Math.max(0, liveUsedGb ?? fallback.usedGb), quotaGb),
  )
  return {
    used_gb: usedGb,
    quota_gb: quotaGb,
    remaining_gb: roundGb(Math.max(0, quotaGb - usedGb)),
    bytes_total: bytesTotal,
    bytes_used: bytesUsed,
    live: true,
  }
}

async function loadUsage(
  client: VpnClient | null,
  row: SubscriptionRow,
): Promise<VpnUsageSnapshot> {
  const fallback = {
    quotaGb: toNumber(row.quota_limit_gb),
    usedGb: toNumber(row.quota_used_gb),
  }
  const username = toText(row.radius_username)
  if (!client || !username) return cachedUsage(fallback)

  try {
    return normalizeUsage(await client.getUsage(username), fallback)
  } catch (error) {
    // A RADIUS outage must not blank the whole dashboard, so degrade to the
    // last cached quota instead of failing the request.
    console.warn('VPN usage lookup failed; serving the cached quota.', {
      subscriptionId: row.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return cachedUsage(fallback)
  }
}

/**
 * GET /api/vpn/my
 *
 * Lists the caller's active subscriptions with real-time usage and the
 * servers they can download a config for. Authenticated via the Telegram
 * WebApp initData (query param or header).
 */
export async function onRequestGet({
  request,
  env,
}: VpnMyContext): Promise<Response> {
  const database = env.NOBULL_WALLET_DB
  if (!database) {
    console.error(
      'VPN subscriptions requested but the NOBULL_WALLET_DB D1 binding is not configured.',
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

  const initData = readTelegramInitData(request)
  if (!initData) {
    return jsonResponse({ ok: false, error: 'نشست تلگرام یافت نشد.' }, 401)
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
    const [subscriptionsResult, serversResult] = await Promise.all([
      database
        .prepare(ACTIVE_SUBSCRIPTIONS_QUERY)
        .bind(telegramNumber)
        .all<SubscriptionRow>(),
      database.prepare(ACTIVE_SERVERS_QUERY).all<ServerRow>(),
    ])

    const client =
      env.VAR_API_URL && env.VAR_API_TOKEN ? new VpnClient(env) : null
    const subscriptions = await Promise.all(
      subscriptionsResult.results.map(
        async (row): Promise<SubscriptionSummary> => ({
          id: Number(row.id),
          plan_id: toText(row.plan_id),
          plan_name: toText(row.plan_name, 'اشتراک وی‌پی‌ان'),
          plan_name_en: toText(row.plan_name_en) || null,
          status: toText(row.status),
          start_date: toText(row.start_date) || null,
          expiry_date: toText(row.expiry_date) || null,
          quota_limit_gb: toNumber(row.quota_limit_gb),
          quota_used_gb: toNumber(row.quota_used_gb),
          radius_username: toText(row.radius_username),
          server_code: toText(row.server_code),
          provision_status: toText(row.provision_status) || null,
          usage: await loadUsage(client, row),
        }),
      ),
    )

    return jsonResponse({
      ok: true,
      subscriptions,
      servers: serversResult.results.map((row) => ({
        code: toText(row.code),
        name: toText(row.name),
        protocol_default:
          toText(row.protocol_default, DEFAULT_PROTOCOL).toLowerCase(),
      })),
    })
  } catch (error) {
    console.error('VPN subscriptions query failed.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonResponse(
      { ok: false, error: 'دریافت اشتراک‌های وی‌پی‌ان ناموفق بود.' },
      500,
    )
  }
}
