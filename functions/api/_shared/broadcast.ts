import { callTelegram } from './telegram'
import type { TelegramEnvironment } from './telegram'
import {
  calculateProductPriceToman,
  listStoredOrders,
  type AdminSettings,
  type BackendEnvironment,
  type ProviderConfig,
} from './settings'
import {
  getPersianDeliveryDescription,
  getPersianWarrantyDescription,
  translateProductText,
} from '../../../src/utils/persianTranslator'

export interface UserRegistryKV {
  get(key: string): Promise<string | null>
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>
  delete(key: string): Promise<void>
  list(options?: {
    prefix?: string
    cursor?: string
  }): Promise<{
    keys: Array<{ name: string }>
    list_complete: boolean
    cursor?: string
  }>
}

export interface BroadcastEnvironment
  extends TelegramEnvironment, BackendEnvironment {
  TELEGRAM_BOT_USERNAME?: string
  NOBULL_USERS?: UserRegistryKV
}

export interface BroadcastProduct {
  id: string
  providerProductId: string
  provider: ProviderConfig
  source: Record<string, unknown>
  priceUsd: number
  usdtRate: number
  pricing: Pick<
    AdminSettings,
    'profitMarginPercent' | 'profitMarginTiers' | 'fixedFeeToman'
    | 'productOverrides'
  >
}

const REGISTRATION_PREFIX = 'user:'
const PRODUCT_SNAPSHOT_PREFIX = 'catalog-products:v1:'

function safeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)
}

export async function registerTelegramUser(
  env: BroadcastEnvironment,
  chatId: string | number,
): Promise<void> {
  if (!env.NOBULL_USERS) {
    throw new Error('NOBULL_USERS Cloudflare KV binding is not configured.')
  }
  const id = String(chatId)
  await env.NOBULL_USERS.put(`${REGISTRATION_PREFIX}${id}`, id)
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  return ''
}

function persianCategory(value: string): string {
  if (/ai|artificial intelligence|هوش مصنوعی/i.test(value)) return 'هوش مصنوعی'
  if (/vpn|security|privacy|امنیت/i.test(value)) return 'امنیت و VPN'
  if (/music|video|stream|entertainment|موسیقی|ویدیو|سرگرمی/i.test(value)) {
    return 'موسیقی و ویدیو'
  }
  if (/design|graphic|creative|طراحی|گرافیک/i.test(value)) {
    return 'طراحی و گرافیک'
  }
  if (/code|developer|programming|برنامه.?نویسی/i.test(value)) {
    return 'برنامه‌نویسی'
  }
  if (/education|learning|tool|productivity|آموزش|ابزار/i.test(value)) {
    return 'آموزش و ابزارها'
  }
  return 'اشتراک دیجیتال'
}

function persianProductDetails(
  product: BroadcastProduct,
): { title: string; details: string[] } {
  const source = product.source
  const title =
    text(source.name ?? source.title ?? source.product_name) || 'اشتراک جدید'
  const brand = translateProductText(
    text(source.brand ?? source.brand_name),
  )
  const category = text(source.category ?? source.category_name)
  const description = text(source.description ?? source.subtitle)
  const details = [
    `دسته‌بندی: ${persianCategory(`${category} ${brand} ${title}`)}`,
  ]
  details.push(`روش تحویل: ${getPersianDeliveryDescription(title, description)}`)
  details.push(getPersianWarrantyDescription(title, description))
  if (brand) details.push(`برند: ${brand}`)
  if (description) details.push(`توضیحات: ${translateProductText(description)}`)
  return { title: translateProductText(title) || 'اشتراک جدید', details }
}

function purchaseUrl(
  env: BroadcastEnvironment,
  product: BroadcastProduct,
): string {
  const username = (env.TELEGRAM_BOT_USERNAME || 'NoBullShopBot').replace(
    /^@/,
    '',
  )
  const payload = `buy_${product.provider.id}_${product.providerProductId}`
  return `https://t.me/${username}?start=${encodeURIComponent(payload)}`
}

async function broadcastProduct(
  env: BroadcastEnvironment,
  product: BroadcastProduct,
): Promise<boolean> {
  if (!env.NOBULL_USERS || !env.TELEGRAM_BOT_TOKEN) {
    throw new Error('User registry or Telegram bot is not configured.')
  }
  const details = persianProductDetails(product)
  const priceToman = calculateProductPriceToman(
    product.priceUsd,
    product.usdtRate,
    product.pricing,
    product.id,
  )
  const message = [
    '🚀 محصول جدید به نوبول اضافه شد!',
    '',
    `💠 ${details.title}`,
    '',
    ...details.details,
    `💰 قیمت نهایی با قیمت‌گذاری پلکانی: ${new Intl.NumberFormat('fa-IR').format(priceToman)} تومان`,
    '',
    'قیمت شفاف، خرید با اطلاع از شرایط محصول.',
  ].join('\n')
  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '🛒 خرید آنی و امن',
          url: purchaseUrl(env, product),
        },
      ],
    ],
  }

  if (env.TELEGRAM_ADMIN_CHAT_ID) {
    try {
      await callTelegram(env, 'sendMessage', {
        chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
        text: message.slice(0, 4096),
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      })
    } catch {
      console.warn('New product announcement could not be delivered to admin.')
    }
  }

  let cursor: string | undefined
  let sent = 0
  let blocked = 0
  let failed = 0
  const productKey = `${safeKey(product.provider.id)}:${safeKey(product.providerProductId)}`
  do {
    const page = await env.NOBULL_USERS.list({
      prefix: REGISTRATION_PREFIX,
      cursor,
    })
    for (let index = 0; index < page.keys.length; index += 20) {
      const batch = page.keys.slice(index, index + 20)
      const results = await Promise.allSettled(
        batch.map(async ({ name }) => {
          const deliveryKey = `broadcast:${productKey}:${safeKey(name.slice(REGISTRATION_PREFIX.length))}`
          if (await env.NOBULL_USERS?.get(deliveryKey)) return
          const chatId = await env.NOBULL_USERS?.get(name)
          if (!chatId) return
          if (chatId === env.TELEGRAM_ADMIN_CHAT_ID) return
          try {
            await callTelegram(env, 'sendMessage', {
              chat_id: chatId,
              text: message.slice(0, 4096),
              disable_web_page_preview: true,
              reply_markup: replyMarkup,
            })
            await env.NOBULL_USERS?.put(deliveryKey, 'sent')
            sent += 1
          } catch (error) {
            const reason =
              error instanceof Error ? error.message.toLowerCase() : ''
            if (
              /bot was blocked|chat not found|user is deactivated|bot can't initiate conversation/.test(
                reason,
              )
            ) {
              await env.NOBULL_USERS?.delete(name)
              blocked += 1
              return
            }
            failed += 1
            console.warn('Product broadcast delivery failed for a user.')
          }
        }),
      )
      for (const result of results) {
        if (result.status === 'rejected') {
          failed += 1
          console.warn('Product broadcast user lookup failed.')
        }
      }
    }
    if (!page.list_complete && !page.cursor) {
      throw new Error('User registry returned an incomplete page without a cursor.')
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  console.info('New product broadcast finished.', {
    providerId: product.provider.id,
    sent,
    blocked,
    failed,
  })
  return failed === 0
}

export interface CustomBroadcastOptions {
  message: string
  audience: 'all' | 'buyers'
  button?: { text: string; url: string }
}

export interface CustomBroadcastResult {
  sentCount: number
  failedCount: number
  totalTargeted: number
}

function isBlockedUserError(error: unknown): boolean {
  const reason = error instanceof Error ? error.message.toLowerCase() : ''
  return /bot was blocked|chat not found|user is deactivated|bot can't initiate conversation/.test(
    reason,
  )
}

export async function sendCustomBroadcast(
  env: BroadcastEnvironment,
  options: CustomBroadcastOptions,
): Promise<CustomBroadcastResult> {
  if (!env.NOBULL_USERS || !env.TELEGRAM_BOT_TOKEN) {
    throw new Error('User registry or Telegram bot is not configured.')
  }

  const targets = new Set<string>()
  if (options.audience === 'buyers') {
    const orders = await listStoredOrders(env)
    for (const order of orders) {
      if (order.status === 'completed') targets.add(order.userId)
    }
  } else {
    let cursor: string | undefined
    do {
      const page = await env.NOBULL_USERS.list({
        prefix: REGISTRATION_PREFIX,
        cursor,
      })
      const values = await Promise.all(
        page.keys.map(({ name }) => env.NOBULL_USERS!.get(name)),
      )
      values.forEach((value) => {
        if (value) targets.add(value)
      })
      if (!page.list_complete && !page.cursor) {
        throw new Error('User registry returned an incomplete subscriber page.')
      }
      cursor = page.list_complete ? undefined : page.cursor
    } while (cursor)
  }

  const replyMarkup = options.button
    ? {
        inline_keyboard: [[{
          text: options.button.text,
          url: options.button.url,
        }]],
      }
    : undefined
  const recipients = [...targets]
  let sentCount = 0
  let failedCount = 0

  for (let index = 0; index < recipients.length; index += 20) {
    const batch = recipients.slice(index, index + 20)
    const results = await Promise.allSettled(
      batch.map(async (chatId) => {
        try {
          await callTelegram(env, 'sendMessage', {
            chat_id: chatId,
            text: options.message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
          })
          sentCount += 1
        } catch (error) {
          failedCount += 1
          if (isBlockedUserError(error)) {
            try {
              await env.NOBULL_USERS?.delete(`${REGISTRATION_PREFIX}${chatId}`)
            } catch (pruneError) {
              console.warn('Blocked broadcast recipient could not be pruned.', {
                error:
                  pruneError instanceof Error
                    ? pruneError.message
                    : 'Unknown error',
              })
            }
          }
          console.warn('Custom broadcast delivery failed for a user.', {
            blocked: isBlockedUserError(error),
          })
        }
      }),
    )
    for (const result of results) {
      if (result.status === 'rejected') failedCount += 1
    }
  }

  return {
    sentCount,
    failedCount,
    totalTargeted: recipients.length,
  }
}

export async function detectAndBroadcastProducts(
  env: BroadcastEnvironment,
  products: BroadcastProduct[],
): Promise<void> {
  if (products.length === 0) return
  const registry = env.NOBULL_USERS
  if (!registry) {
    console.warn('Product broadcasts skipped: NOBULL_USERS KV is not configured.')
    return
  }

  const byProvider = new Map<string, BroadcastProduct[]>()
  for (const product of products) {
    const list = byProvider.get(product.provider.id) ?? []
    list.push(product)
    byProvider.set(product.provider.id, list)
  }

  try {
    for (const [providerId, providerProducts] of byProvider) {
      const snapshotKey = `${PRODUCT_SNAPSHOT_PREFIX}${safeKey(providerId)}`
      const snapshot = await registry.get(snapshotKey)
      if (snapshot === null) {
        await registry.put(
          snapshotKey,
          JSON.stringify(
            providerProducts.map((product) => product.providerProductId),
          ),
        )
        console.info('New product broadcast baseline initialized.', {
          providerId,
          productCount: providerProducts.length,
        })
        continue
      }

      let knownProductIds: Set<string>
      try {
        const parsed: unknown = JSON.parse(snapshot)
        if (
          !Array.isArray(parsed) ||
          !parsed.every((id) => typeof id === 'string')
        ) {
          throw new Error('Stored product snapshot is invalid.')
        }
        knownProductIds = new Set(parsed)
      } catch (error) {
        console.error('Stored product snapshot could not be read.', {
          providerId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        continue
      }

      let snapshotChanged = false
      for (const product of providerProducts) {
        if (knownProductIds.has(product.providerProductId)) continue
        try {
          if (await broadcastProduct(env, product)) {
            knownProductIds.add(product.providerProductId)
            snapshotChanged = true
          }
        } catch (error) {
          console.error('New product broadcast failed.', {
            providerId,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
      if (snapshotChanged) {
        await registry.put(snapshotKey, JSON.stringify([...knownProductIds]))
      }
    }
  } catch (error) {
    console.error('Product change detection failed.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
