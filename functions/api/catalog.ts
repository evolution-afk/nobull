import {
  detectAndBroadcastProducts,
  type BroadcastEnvironment,
  type BroadcastProduct,
} from './_shared/broadcast'
import {
  getEffectiveSettings,
  calculateProductPriceToman,
  getProviderKey,
  getProviders,
  providerHeaders,
  providerRequestUrl,
  settingsRevision,
  type AdminSettings,
  type BackendEnvironment,
  type ProviderConfig,
} from './_shared/settings'

interface CatalogEnvironment
  extends BackendEnvironment, BroadcastEnvironment {
  USDT_MODE?: string
}

interface CatalogFunctionContext {
  request: Request
  env: CatalogEnvironment
  waitUntil?: (promise: Promise<unknown>) => void
}

interface CloudflareCacheStorage extends CacheStorage {
  default: Cache
}

interface RatePayload {
  rate: number
}

const NOBITEX_RATE_URL =
  'https://api.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls'
const CATALOG_CACHE_SECONDS = 60
const RATE_CACHE_SECONDS = 300
const PRODUCT_FIELDS = [
  'id',
  'product_id',
  'uuid',
  'name',
  'title',
  'product_name',
  'brand',
  'brand_name',
  'category',
  'category_name',
  'description',
  'subtitle',
  'stock',
  'quantity',
  'available_stock',
  'in_stock',
  'inStock',
  'stock_updated_at',
  'inventory_updated_at',
  'purchase_url',
  'telegram_url',
  'mini_app_url',
  'price_usd',
] as const

let memoryRateCache: { rate: number; expiresAt: number } | null = null

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function extractProducts(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload
  const record = asRecord(payload)
  if (!record) return null
  if (Array.isArray(record.products)) return record.products
  if (Array.isArray(record.items)) return record.items
  if (Array.isArray(record.results)) return record.results

  const data = record.data
  if (Array.isArray(data)) return data
  const dataRecord = asRecord(data)
  if (dataRecord) {
    if (Array.isArray(dataRecord.products)) return dataRecord.products
    if (Array.isArray(dataRecord.items)) return dataRecord.items
  }
  return null
}

function jsonResponse(
  body: unknown,
  status: number,
  cacheControl: string,
  cacheStatus: 'HIT' | 'MISS' | 'BYPASS',
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': cacheControl,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Cache': cacheStatus,
    },
  })
}

function parseNobitexRate(payload: unknown): number | null {
  const record = asRecord(payload)
  const stats = asRecord(record?.stats)
  const usdtRial = asRecord(stats?.usdt_rls)
  const latest = Number(usdtRial?.latest)
  const toman = latest / 10
  return Number.isFinite(toman) && toman > 0 ? toman : null
}

async function getUsdtRate(
  requestUrl: string,
  env: CatalogEnvironment,
  settings: Awaited<ReturnType<typeof getEffectiveSettings>>,
): Promise<number> {
  if (settings.rateOverride || env.USDT_MODE !== 'auto') {
    return settings.manualRate
  }
  if (memoryRateCache && memoryRateCache.expiresAt > Date.now()) {
    return memoryRateCache.rate
  }

  const cache = (globalThis.caches as CloudflareCacheStorage).default
  const cacheKey = new Request(
    new URL('/_internal/usdt-rate', requestUrl).toString(),
  )
  try {
    const cached = await cache.match(cacheKey)
    if (cached) {
      const payload = (await cached.json()) as RatePayload
      if (Number.isFinite(payload.rate) && payload.rate > 0) {
        memoryRateCache = {
          rate: payload.rate,
          expiresAt: Date.now() + RATE_CACHE_SECONDS * 1000,
        }
        return payload.rate
      }
    }
  } catch {
    // Continue to the live rate request if the edge cache is unavailable.
  }

  let rate = settings.manualRate
  try {
    const response = await fetch(NOBITEX_RATE_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('Nobitex rate request failed.')

    const liveRate = parseNobitexRate(await response.json())
    if (liveRate === null) throw new Error('Nobitex returned an invalid rate.')
    rate = liveRate
  } catch (error) {
    console.error('Live USDT rate unavailable; using configured manual rate.', error)
  }

  memoryRateCache = {
    rate,
    expiresAt: Date.now() + RATE_CACHE_SECONDS * 1000,
  }
  try {
    await cache.put(
      cacheKey,
      jsonResponse({ rate }, 200, `public, max-age=${RATE_CACHE_SECONDS}`, 'MISS'),
    )
  } catch {
    // In-memory caching still limits repeated requests within this isolate.
  }
  return rate
}

function calculateProducts(
  products: unknown[],
  usdtRate: number,
  settings: AdminSettings,
  provider: ProviderConfig,
): Record<string, unknown>[] {
  return products.flatMap((product) => {
    const record = asRecord(product)
    if (!record) return []
    const price = Number(record.price_usd ?? record.price ?? record.usdt_price)
    if (!Number.isFinite(price) || price < 0) return []

    const rawId = record.id ?? record.product_id ?? record.uuid
    const clean: Record<string, unknown> = {}
    for (const field of PRODUCT_FIELDS) {
      if (field in record) clean[field] = record[field]
    }
    if (rawId !== undefined && rawId !== null) {
      clean.provider_product_id = String(rawId)
      clean.id = `${provider.id}--${String(rawId)}`
    }
    clean.provider_id = provider.id
    clean.provider_name = provider.name
    clean.price_usd = price
    clean.price_toman = calculateProductPriceToman(price, usdtRate, settings)
    clean.usdt_rate_used = usdtRate
    return [clean]
  })
}

async function fetchProviderProducts(
  env: CatalogEnvironment,
  provider: ProviderConfig,
): Promise<unknown[]> {
  const apiKey = getProviderKey(env, provider)
  if (!apiKey) return []
  const response = await fetch(
    providerRequestUrl(provider, provider.productsPath),
    {
      headers: providerHeaders(provider, apiKey),
      signal: AbortSignal.timeout(10000),
    },
  )
  if (!response.ok) {
    throw new Error(`Provider ${provider.id} failed (${response.status}).`)
  }
  const products = extractProducts(await response.json())
  if (!products) throw new Error(`Provider ${provider.id} returned invalid products.`)
  return products
}

export async function onRequestGet({
  request,
  env,
  waitUntil,
}: CatalogFunctionContext): Promise<Response> {
  let settings: Awaited<ReturnType<typeof getEffectiveSettings>>
  let providers: ProviderConfig[]
  try {
    ;[settings, providers] = await Promise.all([
      getEffectiveSettings(env),
      Promise.resolve(getProviders(env)),
    ])
  } catch (error) {
    console.error('Catalog configuration could not be loaded.', error)
    return jsonResponse(
      { error: 'Catalog configuration is invalid or unavailable.' },
      503,
      'no-store',
      'BYPASS',
    )
  }

  const configuredProviders = providers.filter(
    (provider) => getProviderKey(env, provider) !== null,
  )
  if (configuredProviders.length === 0) {
    return jsonResponse(
      { error: 'No product provider is configured.' },
      503,
      'no-store',
      'BYPASS',
    )
  }

  const cache = (globalThis.caches as CloudflareCacheStorage).default
  const cacheUrl = new URL('/api/catalog', request.url)
  cacheUrl.searchParams.set('revision', settingsRevision(settings))
  cacheUrl.searchParams.set(
    'providers',
    configuredProviders.map(({ id }) => id).sort().join(','),
  )
  const cacheKey = new Request(cacheUrl.toString())
  try {
    const cached = await cache.match(cacheKey)
    if (cached) {
      const headers = new Headers(cached.headers)
      headers.set('X-Cache', 'HIT')
      headers.set('Cache-Control', 'no-store')
      return new Response(cached.body, { status: cached.status, headers })
    }
  } catch {
    // Continue without a cached catalog if edge cache is unavailable.
  }

  try {
    const [providerProducts, usdtRate] = await Promise.all([
      Promise.all(
        configuredProviders.map(async (provider) => ({
          provider,
          products: await fetchProviderProducts(env, provider),
        })),
      ),
      getUsdtRate(request.url, env, settings),
    ])
    const calculatedProducts = providerProducts.map(
      ({ provider, products: sourceProducts }) => ({
        provider,
        products: calculateProducts(
          sourceProducts,
          usdtRate,
          settings,
          provider,
        ),
      }),
    )
    const products = calculatedProducts.flatMap(({ products }) => products)
    const newProductCandidates: BroadcastProduct[] = calculatedProducts.flatMap(
      ({ provider, products: providerProducts }) =>
        providerProducts
          .filter(
            (product) =>
              typeof product.id === 'string' &&
              typeof product.provider_product_id === 'string' &&
              Number.isFinite(Number(product.price_toman)),
          )
          .map((product) => ({
            id: String(product.id),
            providerProductId: String(product.provider_product_id),
            provider,
            source: product,
            priceUsd: Number(product.price_usd),
            usdtRate,
            pricing: settings,
          })),
    )
    const broadcast = detectAndBroadcastProducts(env, newProductCandidates)
    if (waitUntil) waitUntil(broadcast)
    else await broadcast
    const body = {
      products,
      usdt_rate_used: usdtRate,
      providers: configuredProviders.map(({ id, name }) => ({ id, name })),
    }
    const cacheResponse = jsonResponse(
      body,
      200,
      `public, max-age=${CATALOG_CACHE_SECONDS}, s-maxage=${CATALOG_CACHE_SECONDS}`,
      'MISS',
    )
    let cacheStatus: 'MISS' | 'BYPASS' = 'MISS'
    try {
      await cache.put(cacheKey, cacheResponse.clone())
    } catch {
      cacheStatus = 'BYPASS'
      console.warn('Catalog edge cache write failed.')
    }
    return jsonResponse(body, 200, 'no-store', cacheStatus)
  } catch (error) {
    console.error('Catalog provider request failed.', error)
    return jsonResponse(
      { error: 'One or more product providers are temporarily unavailable.' },
      502,
      'no-store',
      'BYPASS',
    )
  }
}
