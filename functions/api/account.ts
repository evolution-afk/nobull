import { listStoredOrders, type BackendEnvironment } from './_shared/settings'
import { verifyTelegramWebAppInitData } from './_shared/telegramAuth'
import { decryptDelivery, extractVaultCredentials } from './_shared/vault'

interface AccountEnvironment extends BackendEnvironment {}

interface AccountContext {
  request: Request
  env: AccountEnvironment
}

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

export async function onRequestPost({
  request,
  env,
}: AccountContext): Promise<Response> {
  if (!env.NOBULL_SETTINGS?.list) {
    return jsonResponse({ error: 'سابقه خرید در دسترس نیست.' }, 503)
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    return jsonResponse({ error: 'احراز هویت تلگرام پیکربندی نشده است.' }, 503)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'درخواست معتبر نیست.' }, 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'درخواست معتبر نیست.' }, 400)
  }
  const initData = (body as Record<string, unknown>).initData
  if (typeof initData !== 'string') {
    return jsonResponse({ error: 'برای مشاهده حساب، فروشگاه را از تلگرام باز کنید.' }, 401)
  }
  const user = await verifyTelegramWebAppInitData(env, initData)
  if (!user) {
    return jsonResponse({ error: 'نشست تلگرام معتبر نیست یا منقضی شده است.' }, 401)
  }

  try {
    const orders = (await listStoredOrders(env)).filter(
      (order) => order.userId === user.id,
    )
    const result = await Promise.all(
      orders.map(async (order) => {
        let credentials: ReturnType<typeof extractVaultCredentials> = []
        if (order.deliveredCredentials && env.VAULT_ENCRYPTION_KEY) {
          credentials = extractVaultCredentials(
            await decryptDelivery(
              env.VAULT_ENCRYPTION_KEY,
              order.deliveredCredentials,
            ),
          )
        }
        return {
          orderId: order.orderId,
          productTitle: order.productTitle,
          createdAt: order.createdAt,
          priceToman: order.priceToman,
          status: order.status,
          credentials,
          credentialsArchived: Boolean(order.deliveredCredentials),
        }
      }),
    )
    return jsonResponse({
      user: { firstName: user.firstName },
      orders: result,
      vaultAvailable: Boolean(env.VAULT_ENCRYPTION_KEY),
    })
  } catch (error) {
    console.error('Authenticated account request failed.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonResponse({ error: 'دریافت سابقه خرید ناموفق بود.' }, 500)
  }
}
