import type {
  VpnCheckoutResult,
  VpnPlan,
  VpnServer,
  VpnSubscription,
} from '../types'

const PROTOCOL_LABELS: Record<string, string> = {
  udp: 'UDP',
  tcp: 'TCP',
  wireguard: 'WireGuard',
  openvpn: 'OpenVPN',
  ikev2: 'IKEv2',
  l2tp: 'L2TP',
  pptp: 'PPTP',
}

export function protocolLabel(protocol: string): string {
  const normalized = protocol.trim().toLowerCase()
  if (!normalized) return 'UDP'
  return PROTOCOL_LABELS[normalized] ?? normalized.toUpperCase()
}

export interface NormalizedVpnCatalog {
  plans: VpnPlan[]
  servers: VpnServer[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(asText(value))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeServerList(rawServers: unknown[]): VpnServer[] {
  const seenServers = new Set<string>()
  return rawServers.flatMap((item): VpnServer[] => {
    const row = asRecord(item)
    const code = asText(row.code)
    const name = asText(row.name)
    if (!code || !name || seenServers.has(code)) return []
    seenServers.add(code)
    return [{ code, name, protocol_default: asText(row.protocol_default) || 'udp' }]
  })
}

/**
 * Normalizes the `/api/vpn/catalog` payload so partially broken rows cannot
 * render empty cards or `NaN` prices in the storefront.
 */
export function normalizeVpnCatalog(payload: unknown): NormalizedVpnCatalog {
  const record = asRecord(payload)
  const rawPlans = Array.isArray(record.plans) ? record.plans : []
  const rawServers = Array.isArray(record.servers) ? record.servers : []

  const plans = rawPlans.flatMap((item): VpnPlan[] => {
    const row = asRecord(item)
    const id = asText(row.id)
    const name = asText(row.name)
    const price = asNumber(row.price_amount)
    const quota = asNumber(row.quota_gb)
    if (!id || !name || price === null || price < 0 || quota === null || quota < 0) {
      return []
    }
    return [
      {
        id,
        plan_code: asText(row.plan_code),
        name,
        name_en: asText(row.name_en) || null,
        quota_gb: quota,
        duration_days: asNumber(row.duration_days),
        price_amount: price,
        price_currency: asText(row.price_currency).toUpperCase() || 'IRR',
        max_speed_mbps: asNumber(row.max_speed_mbps),
      },
    ]
  })

  return { plans, servers: normalizeServerList(rawServers) }
}

/** Formats the SQLite UTC timestamp returned by the checkout API. */
export function formatVpnExpiry(value: string | null): string | null {
  if (!value) return null
  const normalized = value.includes('T')
    ? value
    : `${value.replace(' ', 'T')}Z`
  const timestamp = Date.parse(normalized)
  if (!Number.isFinite(timestamp)) return null
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(timestamp)
}

/**
 * Validates the `/api/vpn/checkout` success payload before it is shown to the
 * buyer, so a malformed response cannot render blank credentials.
 */
export function normalizeCheckoutResult(
  payload: unknown,
): VpnCheckoutResult | null {
  const record = asRecord(payload)
  if (record.ok !== true) return null
  const username = asText(record.username)
  const password = asText(record.password)
  if (!username || !password) return null
  const plan = asRecord(record.plan)
  const server = asRecord(record.server)
  return {
    username,
    password,
    configUrl: asText(record.config_url) || null,
    orderId: asText(record.order_id),
    orderReference: asText(record.order_reference),
    expiresAt: asText(record.expires_at) || null,
    planId: asText(plan.id),
    planTitle: asText(plan.name),
    quotaGb: asNumber(plan.quota_gb) ?? 0,
    durationDays: asNumber(plan.duration_days) ?? 0,
    serverCode: asText(server.code),
    serverName: asText(server.name),
    walletBalanceToman: asNumber(record.wallet_balance_toman) ?? 0,
  }
}

export interface NormalizedVpnSubscriptions {
  subscriptions: VpnSubscription[]
  servers: VpnServer[]
}

/**
 * Normalizes the `/api/vpn/my` payload. Returns null when the response is not
 * a successful one so the caller can surface an error banner.
 */
export function normalizeVpnSubscriptions(
  payload: unknown,
): NormalizedVpnSubscriptions | null {
  const record = asRecord(payload)
  if (record.ok !== true) return null
  const rawSubscriptions = Array.isArray(record.subscriptions)
    ? record.subscriptions
    : []

  const subscriptions = rawSubscriptions.flatMap(
    (item): VpnSubscription[] => {
      const row = asRecord(item)
      const id = asNumber(row.id)
      if (id === null || id <= 0) return []
      const usageRow = asRecord(row.usage)
      const quotaGb =
        asNumber(usageRow.quota_gb) ?? asNumber(row.quota_limit_gb) ?? 0
      const usedGb = asNumber(usageRow.used_gb) ?? asNumber(row.quota_used_gb) ?? 0
      return [
        {
          id,
          plan_id: asText(row.plan_id),
          plan_name: asText(row.plan_name) || 'اشتراک وی‌پی‌ان',
          plan_name_en: asText(row.plan_name_en) || null,
          status: asText(row.status),
          start_date: asText(row.start_date) || null,
          expiry_date: asText(row.expiry_date) || null,
          quota_limit_gb: asNumber(row.quota_limit_gb) ?? quotaGb,
          quota_used_gb: asNumber(row.quota_used_gb) ?? usedGb,
          radius_username: asText(row.radius_username),
          server_code: asText(row.server_code),
          provision_status: asText(row.provision_status) || null,
          usage: {
            used_gb: usedGb,
            quota_gb: quotaGb,
            remaining_gb:
              asNumber(usageRow.remaining_gb) ?? Math.max(0, quotaGb - usedGb),
            bytes_total: asNumber(usageRow.bytes_total),
            bytes_used: asNumber(usageRow.bytes_used),
            live: usageRow.live === true,
          },
        },
      ]
    },
  )

  return {
    subscriptions,
    servers: Array.isArray(record.servers)
      ? normalizeServerList(record.servers)
      : [],
  }
}
