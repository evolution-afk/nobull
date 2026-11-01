import type { ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

interface ServerSettings {
  danteKey: string
  usdtMode: string
  manualRate: number
  profitMarginPercent: number
  fixedFeeToman: number
}

interface CachedValue<T> {
  value: T
  expiresAt: number
}

const PRODUCTS_URL = 'https://dantehub.shop/api/public/v1/products'
const NOBITEX_RATE_URL =
  'https://api.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls'
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

let catalogCache: CachedValue<unknown> | null = null
let rateCache: CachedValue<number> | null = null

function jsonResponse(
  response: ServerResponse,
  status: number,
  body: unknown,
  cacheControl = 'no-store',
) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', cacheControl)
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(JSON.stringify(body))
}

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

function productPrice(product: unknown): number | null {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    return null
  }
  const record = product as Record<string, unknown>
  const price = Number(record.price ?? record.usdt_price)
  return Number.isFinite(price) && price >= 0 ? price : null
}

function cleanProducts(
  products: unknown[],
  settings: ServerSettings,
  usdtRate: number,
): Record<string, unknown>[] {
  return products.flatMap((product) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) {
      return []
    }

    const record = product as Record<string, unknown>
    const price = productPrice(record)
    if (price === null) return []

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

function createCatalogPlugin(settings: ServerSettings): Plugin {
  return {
    name: 'nobull-server-catalog',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split('?')[0]
        if (pathname !== '/api/catalog') {
          next()
          return
        }

        if (request.method !== 'GET') {
          response.setHeader('Allow', 'GET')
          jsonResponse(response, 405, { error: 'Method not allowed.' })
          return
        }

        if (!settings.danteKey) {
          jsonResponse(response, 503, {
            error: 'Catalog service is not configured.',
          })
          return
        }

        if (catalogCache && catalogCache.expiresAt > Date.now()) {
          jsonResponse(
            response,
            200,
            catalogCache.value,
            'private, max-age=60',
          )
          return
        }

        try {
          const [upstream, usdtRate] = await Promise.all([
            fetch(PRODUCTS_URL, {
              headers: { Authorization: `Bearer ${settings.danteKey}` },
              signal: AbortSignal.timeout(10000),
            }),
            getUsdtRate(settings),
          ])

          if (!upstream.ok) {
            jsonResponse(response, 502, {
              error: 'Catalog service is temporarily unavailable.',
            })
            return
          }

          const products = extractProducts(await upstream.json())
          if (!products) {
            jsonResponse(response, 502, {
              error: 'Catalog service returned an invalid response.',
            })
            return
          }

          const catalog = {
            products: cleanProducts(products, settings, usdtRate),
            usdt_rate_used: usdtRate,
          }
          catalogCache = { value: catalog, expiresAt: Date.now() + 60000 }
          jsonResponse(response, 200, catalog, 'private, max-age=60')
        } catch {
          jsonResponse(response, 502, {
            error: 'Catalog service is temporarily unavailable.',
          })
        }
      })
    },
  }
}

async function getUsdtRate(settings: ServerSettings): Promise<number> {
  if (settings.usdtMode !== 'auto') return settings.manualRate
  if (rateCache && rateCache.expiresAt > Date.now()) return rateCache.value

  try {
    const response = await fetch(NOBITEX_RATE_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('Nobitex rate request failed.')

    const rate = parseNobitexRate(await response.json())
    if (rate === null) throw new Error('Nobitex returned an invalid rate.')
    rateCache = { value: rate, expiresAt: Date.now() + 5 * 60 * 1000 }
    return rate
  } catch {
    if (!Number.isFinite(settings.manualRate) || settings.manualRate <= 0) {
      throw new Error('A valid manual USDT rate is required as a fallback.')
    }
    rateCache = {
      value: settings.manualRate,
      expiresAt: Date.now() + 5 * 60 * 1000,
    }
    return settings.manualRate
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const settings: ServerSettings = {
    danteKey: env.DANTE_KEY ?? '',
    usdtMode: env.USDT_MODE ?? 'manual',
    manualRate: Number(env.MANUAL_USDT_TOMAN) || 68000,
    profitMarginPercent: Number(env.PROFIT_MARGIN_PERCENT) || 0,
    fixedFeeToman: Number(env.FIXED_FEE_TOMAN) || 0,
  }

  return {
    plugins: [react(), createCatalogPlugin(settings)],
  }
})
