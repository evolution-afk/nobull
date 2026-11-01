interface CatalogEnvironment {
  DANTE_KEY?: string
  USDT_MODE?: string
  MANUAL_USDT_TOMAN?: string
  PROFIT_MARGIN_PERCENT?: string
  FIXED_FEE_TOMAN?: string
}

interface CatalogFunctionContext {
  request: Request
  env: CatalogEnvironment
}

interface CloudflareCacheStorage extends CacheStorage {
  default: Cache
}

interface RatePayload {
  rate: number
}

const PRODUCTS_URL = 'https://dantehub.shop/api/public/v1/products'
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
] as const

let memoryRateCache: { rate: number; expiresAt: number } | null = null

function extractProducts(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  if (Array.isArray(record.products)) return record.products
  if (Array.isArray(record.items)) return record.items
  if (Array.isArray(record.results)) return record.results

  const data = record.data
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const dataRecord = data as Record<string, unknown>
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

function getSettings(env: CatalogEnvironment) {
  const manualRate = Number(env.MANUAL_USDT_TOMAN ?? '68000')
  const profitMarginPercent = Number(env.PROFIT_MARGIN_PERCENT ?? '0')
  const fixedFeeToman = Number(env.FIXED_FEE_TOMAN ?? '0')

  return {
    usdtMode: env.USDT_MODE ?? 'manual',
    manualRate:
      Number.isFinite(manualRate) && manualRate > 0 ? manualRate : 68000,
    profitMarginPercent:
      Number.isFinite(profitMarginPercent) && profitMarginPercent >= 0
        ? profitMarginPercent
        : 0,
    fixedFeeToman:
      Number.isFinite(fixedFeeToman) && fixedFeeToman >= 0
        ? fixedFeeToman
        : 0,
  }
}

function parseNobitexRate(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const stats = (payload as Record<string, unknown>).stats
  if (!stats || typeof stats !== 'object') return null
  const usdtRial = (stats as Record<string, unknown>).usdt_rls
  if (!usdtRial || typeof usdtRial !== 'object') return null
  const latest = Number((usdtRial as Record<string, unknown>).latest)
  const toman = latest / 10
  return Number.isFinite(toman) && toman > 0 ? toman : null
}

async function getUsdtRate(
  requestUrl: string,
  env: CatalogEnvironment,
): Promise<number> {
  const settings = getSettings(env)
  if (settings.usdtMode !== 'auto') return settings.manualRate

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
  } catch {
    rate = settings.manualRate
  }

  memoryRateCache = {
    rate,
    expiresAt: Date.now() + RATE_CACHE_SECONDS * 1000,
  }
  try {
    await cache.put(
      cacheKey,
      jsonResponse(
        { rate },
        200,
        `public, max-age=${RATE_CACHE_SECONDS}`,
        'MISS',
      ),
    )
  } catch {
    // In-memory caching still limits repeated requests within this isolate.
  }
  return rate
}

function calculateProducts(
  products: unknown[],
  usdtRate: number,
  env: CatalogEnvironment,
): Record<string, unknown>[] {
  const settings = getSettings(env)

  return products.flatMap((product) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) {
      return []
    }

    const record = product as Record<string, unknown>
    const price = Number(record.price ?? record.usdt_price)
    if (!Number.isFinite(price) || price < 0) return []

    const clean: Record<string, unknown> = {}
    for (const field of PRODUCT_FIELDS) {
      if (field in record) clean[field] = record[field]
    }
    clean.price_toman =
      Math.ceil(
        (price * usdtRate * (1 + settings.profitMarginPercent / 100) +
          settings.fixedFeeToman) /
          1000,
      ) * 1000
    clean.usdt_rate_used = usdtRate
    return [clean]
  })
}

export async function onRequestGet({
  request,
  env,
}: CatalogFunctionContext): Promise<Response> {
  if (!env.DANTE_KEY) {
    return jsonResponse(
      { error: 'Catalog service is not configured.' },
      503,
      'no-store',
      'BYPASS',
    )
  }

  const cache = (globalThis.caches as CloudflareCacheStorage).default
  const cacheKey = new Request(new URL('/api/catalog', request.url).toString())
  try {
    const cached = await cache.match(cacheKey)
    if (cached) {
      const headers = new Headers(cached.headers)
      headers.set('X-Cache', 'HIT')
      return new Response(cached.body, { status: cached.status, headers })
    }
  } catch {
    // Continue without a cached catalog if edge cache is unavailable.
  }

  try {
    const [upstream, usdtRate] = await Promise.all([
      fetch(PRODUCTS_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.DANTE_KEY}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }),
      getUsdtRate(request.url, env),
    ])

    if (!upstream.ok) {
      return jsonResponse(
        { error: 'Catalog service is temporarily unavailable.' },
        502,
        'no-store',
        'BYPASS',
      )
    }

    const products = extractProducts(await upstream.json())
    if (!products) {
      return jsonResponse(
        { error: 'Catalog service returned an invalid response.' },
        502,
        'no-store',
        'BYPASS',
      )
    }

    const response = jsonResponse(
      {
        products: calculateProducts(products, usdtRate, env),
        usdt_rate_used: usdtRate,
      },
      200,
      `public, max-age=${CATALOG_CACHE_SECONDS}, s-maxage=${CATALOG_CACHE_SECONDS}`,
      'MISS',
    )
    try {
      await cache.put(cacheKey, response.clone())
    } catch {
      response.headers.set('X-Cache', 'BYPASS')
    }
    return response
  } catch {
    return jsonResponse(
      { error: 'Catalog service is temporarily unavailable.' },
      502,
      'no-store',
      'BYPASS',
    )
  }
}
