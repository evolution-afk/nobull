import {
  callTelegram,
  formatDelivery,
  sendMessage,
  type TelegramEnvironment as BaseTelegramEnvironment,
} from './_shared/telegram'

interface TelegramEnvironment extends BaseTelegramEnvironment {
  TELEGRAM_WEBHOOK_SECRET?: string
  TELEGRAM_ADMIN_CHAT_ID?: string
  ADMIN_CARD_NUMBER?: string
  ADMIN_CARD_HOLDER?: string
  DANTE_KEY?: string
  USDT_MODE?: string
  MANUAL_USDT_TOMAN?: string
  PROFIT_MARGIN_PERCENT?: string
  FIXED_FEE_TOMAN?: string
}

interface TelegramContext {
  request: Request
  env: TelegramEnvironment
}

interface TelegramMessage {
  message_id: number
  text?: string
  caption?: string
  chat: { id: number }
  from?: { id: number; first_name?: string; username?: string }
  photo?: Array<{ file_id: string }>
  document?: { file_id: string; mime_type?: string }
  reply_to_message?: TelegramMessage
}

interface TelegramUpdate {
  message?: TelegramMessage
  callback_query?: {
    id: string
    from: { id: number }
    data?: string
    message?: { message_id: number; chat: { id: number } }
  }
}

interface CatalogProduct {
  id?: string | number
  product_id?: string | number
  uuid?: string
  name?: string
  title?: string
  product_name?: string
  price_toman?: number
}

interface DanteOrder {
  status?: string
  delivery?: unknown
  ref?: string
  product?: { name?: string; title?: string }
}

const DANTE_API = 'https://dantehub.shop/api/public/v1'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function unwrapList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  const record = asRecord(value)
  const data = record.data
  const nested = asRecord(data)
  const list =
    record.products ??
    record.items ??
    record.orders ??
    record.results ??
    (Array.isArray(data) ? data : undefined) ??
    nested.products ??
    nested.items ??
    nested.orders
  return Array.isArray(list) ? list : []
}

async function danteRequest(
  env: TelegramEnvironment,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  if (!env.DANTE_KEY) throw new Error('Dante Hub is not configured.')
  const response = await fetch(`${DANTE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.DANTE_KEY}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(12000),
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) throw new Error(`Dante Hub request failed (${response.status}).`)
  return payload
}

function adminSettings(env: TelegramEnvironment): string {
  const manualRate = Number(env.MANUAL_USDT_TOMAN ?? '68000')
  const margin = Number(env.PROFIT_MARGIN_PERCENT ?? '0')
  const fee = Number(env.FIXED_FEE_TOMAN ?? '0')
  return [
    `حالت نرخ: ${env.USDT_MODE ?? 'manual'}`,
    `نرخ دستی تتر: ${new Intl.NumberFormat('fa-IR').format(Number.isFinite(manualRate) ? manualRate : 68000)} تومان`,
    `حاشیه سود: ${new Intl.NumberFormat('fa-IR').format(Number.isFinite(margin) ? margin : 0)}٪`,
    `کارمزد ثابت: ${new Intl.NumberFormat('fa-IR').format(Number.isFinite(fee) ? fee : 0)} تومان`,
  ].join('\n')
}

async function handleAdminCommand(
  env: TelegramEnvironment,
  chatId: number,
  command: string,
): Promise<void> {
  if (command === '/admin' || command === '/balance') {
    const balance = await danteRequest(env, '/balance')
    await sendMessage(
      env,
      chatId,
      `موجودی زنده کیف پول Dante Hub:\n${JSON.stringify(balance, null, 2).slice(0, 2500)}\n\nتنظیمات قیمت:\n${adminSettings(env)}`,
    )
    return
  }

  const payload = unwrapList(await danteRequest(env, '/orders'))
  const latest = payload.slice(0, 5)
  const lines = latest.map((value, index) => {
    const order = asRecord(value)
    const id = order.id ?? order.order_id ?? '—'
    const status = order.status ?? '—'
    const ref = order.ref ?? order.reference ?? ''
    return `${index + 1}. سفارش ${String(id)} | ${String(status)}${ref ? ` | ${String(ref)}` : ''}`
  })
  await sendMessage(
    env,
    chatId,
    latest.length ? `۵ سفارش اخیر:\n${lines.join('\n')}` : 'سفارشی ثبت نشده است.',
  )
}

async function findProduct(
  request: Request,
  productId: string,
): Promise<CatalogProduct | null> {
  const response = await fetch(new URL('/api/catalog', request.url), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error('Catalog request failed.')
  const products = unwrapList(await response.json())
  return (
    (products as CatalogProduct[]).find((product) =>
      [product.id, product.product_id, product.uuid].some(
        (id) => id !== undefined && String(id) === productId,
      ),
    ) ?? null
  )
}

async function startPurchase(
  request: Request,
  env: TelegramEnvironment,
  message: TelegramMessage,
  productId: string,
): Promise<void> {
  const cardNumber = env.ADMIN_CARD_NUMBER?.trim()
  const cardHolder = env.ADMIN_CARD_HOLDER?.trim()
  if (
    !cardNumber ||
    !cardHolder ||
    /X{2,}/i.test(cardNumber) ||
    cardHolder === 'نام صاحب کارت'
  ) {
    await sendMessage(
      env,
      message.chat.id,
      'پرداخت این محصول در حال حاضر پیکربندی نشده است. لطفاً کمی بعد دوباره تلاش کنید.',
    )
    return
  }

  const product = await findProduct(request, productId)
  if (!product || !Number.isFinite(Number(product.price_toman))) {
    await sendMessage(env, message.chat.id, 'محصول موردنظر پیدا نشد.')
    return
  }
  const title =
    product.name ?? product.title ?? product.product_name ?? `محصول ${productId}`
  const price = new Intl.NumberFormat('fa-IR').format(
    Number(product.price_toman),
  )
  const invoice = [
    '🧾 فاکتور خرید نوبول',
    '',
    `محصول: ${title}`,
    `شناسه محصول: ${productId}`,
    `مبلغ قابل پرداخت: ${price} تومان`,
    '',
    `شماره کارت: ${cardNumber}`,
    `به نام: ${cardHolder}`,
    '',
    'پس از پرداخت، تصویر رسید را با کپشن buy_' +
      productId +
      ' ارسال کنید یا در پاسخ به همین فاکتور بفرستید.',
  ].join('\n')
  await sendMessage(env, message.chat.id, invoice, {
    inline_keyboard: [
      [
        {
          text: 'مشاهده فروشگاه NoBull',
          web_app: { url: new URL('/', request.url).toString() },
        },
      ],
    ],
  })
}

function productIdFromMessage(message: TelegramMessage): string | null {
  const sources = [message.caption, message.reply_to_message?.text]
  for (const source of sources) {
    if (!source) continue
    const match =
      source.match(/\bbuy_([a-zA-Z0-9_-]+)\b/) ??
      source.match(/شناسه محصول:\s*([a-zA-Z0-9_-]+)/)
    if (match) return match[1]
  }
  return null
}

async function forwardReceipt(
  env: TelegramEnvironment,
  message: TelegramMessage,
): Promise<void> {
  const adminChatId = env.TELEGRAM_ADMIN_CHAT_ID
  if (!adminChatId) throw new Error('Telegram admin chat is not configured.')
  const productId = productIdFromMessage(message)
  if (!productId) {
    await sendMessage(
      env,
      message.chat.id,
      'برای بررسی رسید، آن را با کپشن buy_<شناسه محصول> بفرستید یا در پاسخ به فاکتور همان محصول ارسال کنید.',
    )
    return
  }

  const user = message.from
  const sender = user
    ? `${user.first_name ?? ''}${user.username ? ` (@${user.username})` : ''}`.trim()
    : 'کاربر'
  const caption = `رسید پرداخت\nکاربر: ${sender}\nشناسه کاربر: ${message.chat.id}\nشناسه محصول: ${productId}`
  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '✅ تایید و خرید خودکار',
          callback_data: `approve:${message.chat.id}:${productId}`,
        },
        {
          text: '❌ رد پرداخت',
          callback_data: `reject:${message.chat.id}`,
        },
      ],
    ],
  }

  if (message.photo?.length) {
    await callTelegram(env, 'sendPhoto', {
      chat_id: adminChatId,
      photo: message.photo[message.photo.length - 1].file_id,
      caption,
      reply_markup: replyMarkup,
    })
  } else if (message.document?.file_id) {
    await callTelegram(env, 'sendDocument', {
      chat_id: adminChatId,
      document: message.document.file_id,
      caption,
      reply_markup: replyMarkup,
    })
  } else {
    return
  }

  await sendMessage(env, message.chat.id, 'رسید شما برای بررسی به پشتیبانی ارسال شد.')
}

function unwrapOrder(value: unknown): DanteOrder {
  const payload = asRecord(value)
  const data = asRecord(payload.data)
  return (asRecord(payload.order ?? data.order ?? payload.data ?? payload) as DanteOrder)
}

async function handleCallback(
  env: TelegramEnvironment,
  update: NonNullable<TelegramUpdate['callback_query']>,
): Promise<void> {
  const callbackData = update.data ?? ''
  if (String(update.from.id) !== env.TELEGRAM_ADMIN_CHAT_ID) {
    await callTelegram(env, 'answerCallbackQuery', {
      callback_query_id: update.id,
      text: 'این عملیات فقط برای مدیر در دسترس است.',
      show_alert: true,
    })
    return
  }

  await callTelegram(env, 'answerCallbackQuery', {
    callback_query_id: update.id,
    text: 'در حال پردازش...',
  })

  const parts = callbackData.split(':')
  const action = parts[0]
  const userChatId = parts[1]
  const productId = parts[2]
  if (!/^\d+$/.test(userChatId ?? '')) return
  if (action === 'reject') {
    await sendMessage(env, userChatId, 'پرداخت شما تأیید نشد. برای پیگیری با پشتیبانی تماس بگیرید.')
    if (update.message) {
      await callTelegram(env, 'editMessageReplyMarkup', {
        chat_id: update.message.chat.id,
        message_id: update.message.message_id,
        reply_markup: { inline_keyboard: [] },
      })
    }
    return
  }
  if (action !== 'approve' || !/^[a-zA-Z0-9_-]+$/.test(productId ?? '')) return

  const reference = `tg-${userChatId}-${Date.now()}`
  const response = await danteRequest(env, '/orders', {
    method: 'POST',
    body: JSON.stringify({ product_id: productId, qty: 1, ref: reference }),
  })
  const order = unwrapOrder(response)
  if (order.delivery) {
    const delivery = formatDelivery(order.delivery)
    if (!delivery) throw new Error('Dante Hub returned an empty delivery.')
    const message = `✅ سفارش شما آماده است.\n\n${delivery}`
    await sendMessage(env, userChatId, message)
    await sendMessage(
      env,
      env.TELEGRAM_ADMIN_CHAT_ID ?? userChatId,
      `تحویل سفارش ${reference} برای کاربر ${userChatId} انجام شد:\n\n${delivery}`,
    )
  } else if (order.status === 'processing') {
    await sendMessage(
      env,
      userChatId,
      '✅ سفارش شما ثبت شد. اطلاعات حساب به‌محض آماده‌شدن به‌صورت خودکار برایتان ارسال می‌شود.',
    )
    await sendMessage(
      env,
      env.TELEGRAM_ADMIN_CHAT_ID ?? userChatId,
      `سفارش ${reference} برای کاربر ${userChatId} در وضعیت پردازش است.`,
    )
  } else {
    await sendMessage(
      env,
      env.TELEGRAM_ADMIN_CHAT_ID ?? userChatId,
      `سفارش ${reference} ثبت شد؛ وضعیت Dante Hub: ${order.status ?? 'نامشخص'}.`,
    )
  }

  if (update.message) {
    await callTelegram(env, 'editMessageReplyMarkup', {
      chat_id: update.message.chat.id,
      message_id: update.message.message_id,
      reply_markup: { inline_keyboard: [] },
    })
  }
}

export async function onRequestPost({
  request,
  env,
}: TelegramContext): Promise<Response> {
  if (
    !env.TELEGRAM_BOT_TOKEN ||
    !env.TELEGRAM_ADMIN_CHAT_ID ||
    !env.TELEGRAM_WEBHOOK_SECRET
  ) {
    return jsonResponse({ error: 'Telegram webhook is not configured.' }, 503)
  }
  const providedSecret =
    request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? ''
  let secretDifference =
    providedSecret.length ^ env.TELEGRAM_WEBHOOK_SECRET.length
  for (
    let index = 0;
    index < env.TELEGRAM_WEBHOOK_SECRET.length;
    index += 1
  ) {
    secretDifference |=
      env.TELEGRAM_WEBHOOK_SECRET.charCodeAt(index) ^
      (providedSecret.charCodeAt(index) || 0)
  }
  if (secretDifference !== 0) {
    return jsonResponse({ error: 'Invalid webhook secret.' }, 401)
  }
  try {
    const update = (await request.json()) as TelegramUpdate
    if (update.callback_query) {
      await handleCallback(env, update.callback_query)
      return jsonResponse({ ok: true })
    }

    const message = update.message
    if (!message) return jsonResponse({ ok: true })
    const text = message.text?.trim() ?? ''
    const command = text.split(/\s+/)[0].split('@')[0].toLowerCase()

    if (
      ['/admin', '/balance', '/orders'].includes(command) &&
      String(message.from?.id ?? '') === env.TELEGRAM_ADMIN_CHAT_ID
    ) {
      await handleAdminCommand(env, message.chat.id, command)
    } else if (command === '/start') {
      const productId = text.match(/^\/start(?:@\w+)?\s+buy_([a-zA-Z0-9_-]+)$/i)?.[1]
      if (productId) {
        await startPurchase(request, env, message, productId)
      } else {
        await sendMessage(
          env,
          message.chat.id,
          'به نوبول خوش آمدید! برای شروع خرید، از فروشگاه یک محصول را انتخاب کنید.',
          {
            inline_keyboard: [
              [
                {
                  text: 'بازکردن فروشگاه NoBull',
                  web_app: { url: new URL('/', request.url).toString() },
                },
              ],
            ],
          },
        )
      }
    } else if (message.photo?.length || message.document?.file_id) {
      await forwardReceipt(env, message)
    }
    return jsonResponse({ ok: true })
  } catch {
    return jsonResponse({ error: 'Telegram webhook processing failed.' }, 500)
  }
}
