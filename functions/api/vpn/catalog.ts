import type { BackendEnvironment } from '../_shared/settings'

interface VpnCatalogContext {
  request: Request
  env: BackendEnvironment
}

/**
 * Raw row shapes as returned by the D1 tables in `schema.sql`.
 */
interface PlanRow {
  id: string
  plan_code: string
  name: string
  name_en: string | null
  quota_gb: number
  partner_price: number | null
  price_amount: number
  price_currency: string | null
  max_speed_mbps: number | null
  duration_days: number | null
  is_active: number
  created_at: string | null
  updated_at: string | null
}

interface ServerRow {
  code: string
  name: string
  protocol_default: string | null
}

/**
 * Public response shapes. Internal columns such as `partner_price` (reseller
 * pricing) and lifecycle timestamps are deliberately not exposed.
 */
export interface VpnPlan {
  id: string
  plan_code: string
  name: string
  name_en: string | null
  quota_gb: number
  duration_days: number | null
  price_amount: number
  price_currency: string
  max_speed_mbps: number | null
}

export interface VpnServer {
  code: string
  name: string
  protocol_default: string
}

interface VpnCatalogResponse {
  ok: true
  plans: VpnPlan[]
  servers: VpnServer[]
}

interface VpnCatalogErrorResponse {
  ok: false
  error: string
}

const ACTIVE_PLANS_QUERY =
  'SELECT * FROM plans WHERE is_active = 1 ORDER BY price_amount ASC'
const ACTIVE_SERVERS_QUERY =
  'SELECT code, name, protocol_default FROM servers WHERE is_active = 1 ORDER BY sort_order ASC'
const DEFAULT_PROTOCOL = 'udp'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
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

function toNullableText(value: unknown): string | null {
  const text = toText(value)
  return text === '' ? null : text
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toPlan(row: PlanRow): VpnPlan {
  return {
    id: toText(row.id),
    plan_code: toText(row.plan_code),
    name: toText(row.name),
    name_en: toNullableText(row.name_en),
    quota_gb: toNumber(row.quota_gb),
    duration_days: toNullableNumber(row.duration_days),
    price_amount: toNumber(row.price_amount),
    price_currency: toText(row.price_currency, 'IRR').toUpperCase(),
    max_speed_mbps: toNullableNumber(row.max_speed_mbps),
  }
}

function toServer(row: ServerRow): VpnServer {
  return {
    code: toText(row.code),
    name: toText(row.name),
    protocol_default: toText(row.protocol_default, DEFAULT_PROTOCOL).toLowerCase(),
  }
}

/**
 * GET /api/vpn/catalog
 *
 * Serves the active VPN plans (cheapest first) and active servers (by the
 * operator-defined sort order) so the storefront can render the catalog
 * without any credential-bearing upstream provider calls.
 */
export async function onRequestGet({
  env,
}: VpnCatalogContext): Promise<Response> {
  const database = env.NOBULL_WALLET_DB
  if (!database) {
    console.error(
      'VPN catalog requested but the NOBULL_WALLET_DB D1 binding is not configured.',
    )
    return jsonResponse(
      {
        ok: false,
        error: 'پایگاه داده کاتالوگ سرویس پیکربندی نشده است.',
      } satisfies VpnCatalogErrorResponse,
      503,
    )
  }

  try {
    const [plansResult, serversResult] = await Promise.all([
      database.prepare(ACTIVE_PLANS_QUERY).all<PlanRow>(),
      database.prepare(ACTIVE_SERVERS_QUERY).all<ServerRow>(),
    ])

    const body: VpnCatalogResponse = {
      ok: true,
      plans: plansResult.results.map(toPlan),
      servers: serversResult.results.map(toServer),
    }
    return jsonResponse(body)
  } catch (error) {
    console.error('VPN catalog query failed.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonResponse(
      {
        ok: false,
        error: 'دریافت کاتالوگ سرویس‌ها ناموفق بود. لطفاً دوباره تلاش کنید.',
      } satisfies VpnCatalogErrorResponse,
      500,
    )
  }
}
