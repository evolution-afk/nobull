export interface SettingsKV {
  get<T>(key: string, type: 'json'): Promise<T | null>
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>
  delete(key: string): Promise<void>
}

export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  productsPath: string
  ordersPath: string
  balancePath?: string
  apiKeyEnv: string
  authHeader: string
  authPrefix: string
}

export interface AdminSettings {
  manualRate?: number
  rateOverride?: boolean
  profitMarginPercent?: number
  profitMarginTiers?: number[]
  fixedFeeToman?: number
  cardNumber?: string
  cardHolder?: string
  activeProviderId?: string
  updatedAt?: number
}

export interface BackendEnvironment {
  [key: string]: string | object | undefined
  DANTE_KEY?: string
  PRODUCT_PROVIDERS_JSON?: string
  NOBULL_SETTINGS?: SettingsKV
  USDT_MODE?: string
  MANUAL_USDT_TOMAN?: string
  PROFIT_MARGIN_PERCENT?: string
  FIXED_FEE_TOMAN?: string
  ADMIN_CARD_NUMBER?: string
  ADMIN_CARD_HOLDER?: string
}

const SETTINGS_KEY = 'nobull:admin-settings:v1'

export const DEFAULT_PROFIT_MARGIN_TIERS = [
  { minUsd: 0, maxUsd: 1, percent: 25 },
  { minUsd: 1, maxUsd: 2, percent: 20 },
  { minUsd: 2, maxUsd: 3, percent: 15 },
  { minUsd: 3, maxUsd: 5, percent: 12 },
  { minUsd: 5, maxUsd: 8, percent: 10 },
  { minUsd: 8, maxUsd: 12, percent: 8 },
  { minUsd: 12, maxUsd: null, percent: 5 },
] as const

export type EffectiveSettings = Awaited<ReturnType<typeof getEffectiveSettings>>

export async function readAdminSettings(
  env: BackendEnvironment,
): Promise<AdminSettings> {
  if (!env.NOBULL_SETTINGS) return {}
  return (await env.NOBULL_SETTINGS.get<AdminSettings>(SETTINGS_KEY, 'json')) ?? {}
}

export async function writeAdminSettings(
  env: BackendEnvironment,
  settings: AdminSettings,
): Promise<void> {
  if (!env.NOBULL_SETTINGS) {
    throw new Error('Configure the NOBULL_SETTINGS Cloudflare KV binding first.')
  }
  await env.NOBULL_SETTINGS.put(
    SETTINGS_KEY,
    JSON.stringify({ ...settings, updatedAt: Date.now() }),
  )
}

export async function getEffectiveSettings(
  env: BackendEnvironment,
): Promise<Required<
  Pick<
    AdminSettings,
    'manualRate' | 'profitMarginPercent' | 'profitMarginTiers' | 'fixedFeeToman'
  >
> &
  Omit<
    AdminSettings,
    'manualRate' | 'profitMarginPercent' | 'profitMarginTiers' | 'fixedFeeToman'
  >> {
  const stored = await readAdminSettings(env)
  const manualRate = Number(env.MANUAL_USDT_TOMAN ?? '68000')
  const margin = Number(env.PROFIT_MARGIN_PERCENT ?? '0')
  const fee = Number(env.FIXED_FEE_TOMAN ?? '0')
  const storedRate = Number(stored.manualRate)
  const storedMargin = Number(stored.profitMarginPercent)
  const storedFee = Number(stored.fixedFeeToman)
  const profitMarginTiers = DEFAULT_PROFIT_MARGIN_TIERS.map(
    (tier, index) => {
      const storedTier = stored.profitMarginTiers?.[index]
      return typeof storedTier === 'number' &&
        Number.isFinite(storedTier) &&
        storedTier >= 0 &&
        storedTier <= 1000
        ? storedTier
        : tier.percent
    },
  )
  return {
    ...stored,
    manualRate:
      (Number.isFinite(storedRate) && storedRate > 0 ? storedRate : undefined) ??
      (Number.isFinite(manualRate) && manualRate > 0 ? manualRate : 68000),
    profitMarginPercent:
      (Number.isFinite(storedMargin) && storedMargin >= 0
        ? storedMargin
        : undefined) ??
      (Number.isFinite(margin) && margin >= 0 ? margin : 0),
    profitMarginTiers,
    fixedFeeToman:
      (Number.isFinite(storedFee) && storedFee >= 0 ? storedFee : undefined) ??
      (Number.isFinite(fee) && fee >= 0 ? fee : 0),
  }
}

export function getProfitMarginPercent(
  priceUsd: number,
  settings: Pick<AdminSettings, 'profitMarginPercent' | 'profitMarginTiers'>,
): number {
  if (!Number.isFinite(priceUsd) || priceUsd < 0) {
    return settings.profitMarginPercent ?? 0
  }
  const tierIndex = DEFAULT_PROFIT_MARGIN_TIERS.findIndex(
    ({ minUsd, maxUsd }) => priceUsd >= minUsd && (maxUsd === null || priceUsd < maxUsd),
  )
  const tierMargin =
    tierIndex >= 0 ? settings.profitMarginTiers?.[tierIndex] : undefined
  return Number.isFinite(tierMargin)
    ? tierMargin!
    : settings.profitMarginPercent ?? 0
}

export function calculateProductPriceToman(
  priceUsd: number,
  usdtRate: number,
  settings: Pick<
    AdminSettings,
    'profitMarginPercent' | 'profitMarginTiers' | 'fixedFeeToman'
  >,
): number {
  return (
    Math.ceil(
      (priceUsd *
        usdtRate *
        (1 + getProfitMarginPercent(priceUsd, settings) / 100) +
        (settings.fixedFeeToman ?? 0)) /
        1000,
    ) * 1000
  )
}

function isProviderConfig(value: unknown): value is ProviderConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const provider = value as Partial<ProviderConfig>
  if (
    !provider.id ||
    !/^[a-z0-9-]{1,16}$/.test(provider.id) ||
    typeof provider.name !== 'string' ||
    !provider.name.trim() ||
    typeof provider.baseUrl !== 'string' ||
    typeof provider.apiKeyEnv !== 'string' ||
    !provider.apiKeyEnv ||
    (provider.productsPath !== undefined &&
      (typeof provider.productsPath !== 'string' ||
        !provider.productsPath.startsWith('/') ||
        provider.productsPath.startsWith('//'))) ||
    (provider.ordersPath !== undefined &&
      (typeof provider.ordersPath !== 'string' ||
        !provider.ordersPath.startsWith('/') ||
        provider.ordersPath.startsWith('//'))) ||
    (provider.balancePath !== undefined &&
      (typeof provider.balancePath !== 'string' ||
        !provider.balancePath.startsWith('/') ||
        provider.balancePath.startsWith('//'))) ||
    (provider.authHeader !== undefined &&
      (typeof provider.authHeader !== 'string' ||
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(provider.authHeader))) ||
    (provider.authPrefix !== undefined &&
      typeof provider.authPrefix !== 'string')
  ) {
    return false
  }
  let url: URL
  try {
    url = new URL(provider.baseUrl)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    /^[A-Z][A-Z0-9_]{1,63}$/.test(provider.apiKeyEnv) &&
    !provider.apiKeyEnv.startsWith('VITE_')
  )
}

export function getProviders(env: BackendEnvironment): ProviderConfig[] {
  let configured: unknown[]
  if (env.PRODUCT_PROVIDERS_JSON) {
    const parsed: unknown = JSON.parse(env.PRODUCT_PROVIDERS_JSON)
    if (!Array.isArray(parsed) || !parsed.every(isProviderConfig)) {
      throw new Error('PRODUCT_PROVIDERS_JSON has an invalid provider definition.')
    }
    configured = parsed
  } else {
    configured = [
      {
        id: 'dante',
        name: 'Dante Hub',
        baseUrl: 'https://dantehub.shop',
        productsPath: '/api/public/v1/products',
        ordersPath: '/api/public/v1/orders',
        balancePath: '/api/public/v1/balance',
        apiKeyEnv: 'DANTE_KEY',
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
      },
    ]
  }

  const ids = new Set<string>()
  for (const value of configured) {
    const provider = value as ProviderConfig
    if (ids.has(provider.id)) throw new Error('Provider ids must be unique.')
    ids.add(provider.id)
    provider.productsPath ??= '/api/public/v1/products'
    provider.ordersPath ??= '/api/public/v1/orders'
    provider.authHeader ??= 'Authorization'
    provider.authPrefix ??= 'Bearer '
  }
  return configured as ProviderConfig[]
}

export function getProviderKey(
  env: BackendEnvironment,
  provider: ProviderConfig,
): string | null {
  const key = env[provider.apiKeyEnv]
  return typeof key === 'string' && key ? key : null
}

export function providerRequestUrl(
  provider: ProviderConfig,
  path: string,
): URL {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Provider paths must be relative to the configured host.')
  }
  return new URL(path, provider.baseUrl)
}

export function providerHeaders(
  provider: ProviderConfig,
  apiKey: string,
): Headers {
  const headers = new Headers({ Accept: 'application/json' })
  headers.set(provider.authHeader, `${provider.authPrefix}${apiKey}`)
  return headers
}

export function settingsRevision(settings: AdminSettings): string {
  return [
    settings.updatedAt ?? 0,
    settings.manualRate ?? 0,
    settings.rateOverride ? 1 : 0,
    settings.profitMarginPercent ?? 0,
    ...(settings.profitMarginTiers ?? []),
    settings.fixedFeeToman ?? 0,
    settings.activeProviderId ?? '',
  ].join('-')
}
