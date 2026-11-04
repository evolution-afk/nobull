import {
  applyDiscountToPrice,
  findActiveDiscountCode,
  getEffectiveSettings,
  type BackendEnvironment,
} from './_shared/settings'

interface DiscountContext {
  request: Request
  env: BackendEnvironment
}

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

export async function onRequestGet({
  request,
  env,
}: DiscountContext): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')?.trim() ?? ''
  const productId = url.searchParams.get('productId')?.trim() ?? ''
  if (
    !/^[A-Za-z0-9_-]{2,20}$/.test(code) ||
    !/^[A-Za-z0-9_-]{1,60}$/.test(productId)
  ) {
    return jsonResponse({ valid: false, error: 'کد تخفیف یا محصول معتبر نیست.' }, 400)
  }

  try {
    const [settings, catalogResponse] = await Promise.all([
      getEffectiveSettings(env),
      fetch(new URL('/api/catalog', request.url), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      }),
    ])
    if (!catalogResponse.ok) {
      return jsonResponse({ error: 'قیمت محصول در حال حاضر در دسترس نیست.' }, 502)
    }

    const payload: unknown = await catalogResponse.json()
    const catalog =
      payload && typeof payload === 'object'
        ? (payload as { products?: unknown })
        : {}
    const products = Array.isArray(catalog.products) ? catalog.products : []
    const product = products.find((item) => {
      if (!item || typeof item !== 'object') return false
      return (item as Record<string, unknown>).id === productId
    })
    if (!product || typeof product !== 'object') {
      return jsonResponse({ valid: false, error: 'محصول پیدا نشد.' }, 404)
    }
    const rawPrice = Number((product as Record<string, unknown>).price_toman)
    if (!Number.isFinite(rawPrice) || rawPrice < 0) {
      return jsonResponse({ error: 'قیمت محصول معتبر نیست.' }, 502)
    }
    const discount = findActiveDiscountCode(settings.discountCodes, code)
    if (!discount) {
      return jsonResponse({
        valid: false,
        error: 'کد تخفیف نامعتبر، غیرفعال یا منقضی شده است.',
      })
    }

    const discountedPriceToman = applyDiscountToPrice(rawPrice, discount)
    return jsonResponse({
      valid: true,
      code: discount.code,
      originalPriceToman: rawPrice,
      discountedPriceToman,
      discountToman: rawPrice - discountedPriceToman,
    })
  } catch (error) {
    console.error('Discount validation failed.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonResponse({ error: 'بررسی کد تخفیف موقتاً ناموفق بود.' }, 500)
  }
}
