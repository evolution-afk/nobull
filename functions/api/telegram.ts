import {
  callTelegram,
  formatDelivery,
  sendMessage,
  type TelegramEnvironment as BaseTelegramEnvironment,
} from './_shared/telegram'
import {
  getEffectiveSettings,
  getProviderKey,
  getProviders,
  providerHeaders,
  providerRequestUrl,
  readAdminSettings,
  writeAdminSettings,
  type AdminSettings,
  type BackendEnvironment,
  type ProviderConfig,
} from './_shared/settings'

interface TelegramEnvironment extends BaseTelegramEnvironment, BackendEnvironment {
  TELEGRAM_WEBHOOK_SECRET?: string
  TELEGRAM_ADMIN_CHAT_ID?: string
  ADMIN_CARD_NUMBER?: string
  ADMIN_CARD_HOLDER?: string
  USDT_MODE?: string
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
  update_id?: number
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
  provider_product_id?: string | number
  provider_id?: string
  provider_name?: string
  name?: string
  title?: string
  product_name?: string
  category?: string
  category_name?: string
  price_toman?: number
  stock?: number | string | null
  quantity?: number | string | null
  in_stock?: boolean
  inStock?: boolean
}

interface ProviderOrder {
  status?: string
  delivery?: unknown
  ref?: string
  product?: { name?: string; title?: string }
}

interface ReceiptContext {
  userChatId: string
  productId: string
  providerId: string
  reference: string
  status?: 'pending' | 'processing'
}

interface ProductFilters {
  provider?: string
  category?: string
  stock?: string
}

const CATEGORY_FILTERS: Record<string, RegExp> = {
  ai: /هوش مصنوعی|artificial intelligence|\bai\b/i,
  security: /امنیت|vpn|security|privacy/i,
  media: /موسیقی|ویدیو|سرگرمی|music|video|stream/i,
  design: /طراحی|گرافیک|design|graphic/i,
  code: /برنامه‌نویسی|برنامه نویسی|کدنویسی|developer|coding|programming/i,
  tools: /آموزش|ابزار|education|learning|tool|productivity/i,
}

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

function isAdmin(env: TelegramEnvironment, userId: number | undefined): boolean {
  return Boolean(userId && String(userId) === env.TELEGRAM_ADMIN_CHAT_ID)
}

function adminDashboard(): {
  inline_keyboard: { text: string; callback_data: string }[][]
} {
  return {
    inline_keyboard: [
      [
        { text: '📊 آمار و موجودی', callback_data: 'panel:stats' },
        { text: '⚙️ تنظیمات قیمت و سود', callback_data: 'panel:pricing' },
      ],
      [
        { text: '💳 تغییر شماره کارت', callback_data: 'panel:card' },
        { text: '📦 مدیریت محصولات', callback_data: 'panel:products' },
      ],
      [
        { text: '📋 آخرین سفارش‌ها', callback_data: 'panel:orders' },
        { text: '🔌 تأمین‌کننده‌ها', callback_data: 'panel:providers' },
      ],
    ],
  }
}

function settingsSummary(
  env: TelegramEnvironment,
  settings: Awaited<ReturnType<typeof getEffectiveSettings>>,
): string {
  const format = (value: number) => new Intl.NumberFormat('fa-IR').format(value)
  return [
    `حالت نرخ: ${settings.rateOverride ? 'دستی (مدیریت ربات)' : env.USDT_MODE ?? 'manual'}`,
    `نرخ تتر: ${format(settings.manualRate)} تومان`,
    `حاشیه سود: ${format(settings.profitMarginPercent ?? 0)}٪`,
    `کارمزد ثابت: ${format(settings.fixedFeeToman ?? 0)} تومان`,
    `شماره کارت: ${settings.cardNumber ?? env.ADMIN_CARD_NUMBER ?? 'تنظیم نشده'}`,
    `صاحب کارت: ${settings.cardHolder ?? env.ADMIN_CARD_HOLDER ?? 'تنظیم نشده'}`,
    `ذخیره پایدار: ${env.NOBULL_SETTINGS ? 'فعال' : 'غیرفعال؛ NOBULL_SETTINGS KV لازم است'}`,
  ].join('\n')
}

async function providerRequest(
  env: TelegramEnvironment,
  provider: ProviderConfig,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const apiKey = getProviderKey(env, provider)
  if (!apiKey) throw new Error(`Provider ${provider.id} is not configured.`)
  const headers = providerHeaders(provider, apiKey)
  if (init.body) headers.set('Content-Type', 'application/json')
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  const response = await fetch(providerRequestUrl(provider, path), {
    ...init,
    headers,
    signal: AbortSignal.timeout(12000),
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(`Provider ${provider.id} request failed (${response.status}).`)
  }
  return payload
}

async function sendAdminDashboard(
  env: TelegramEnvironment,
  chatId: number,
  messageId?: number,
): Promise<void> {
  const text = `مدیریت نوبول\n\n${settingsSummary(env, await getEffectiveSettings(env))}`
  if (messageId) {
    await callTelegram(env, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: adminDashboard(),
    })
  } else {
    await sendMessage(env, chatId, text, adminDashboard())
  }
}

async function listProviders(env: TelegramEnvironment): Promise<ProviderConfig[]> {
  return getProviders(env)
}

async function handleProviderList(
  env: TelegramEnvironment,
  chatId: number,
): Promise<void> {
  const [providers, settings] = await Promise.all([
    listProviders(env),
    readAdminSettings(env),
  ])
  const lines = providers.map((provider) => {
    const active = settings.activeProviderId === provider.id ? ' ← فعال' : ''
    const configured = getProviderKey(env, provider) ? 'آماده' : 'کلید تنظیم نشده'
    return `• ${provider.name} (${provider.id}) — ${configured}${active}`
  })
  await sendMessage(
    env,
    chatId,
    `تأمین‌کننده‌ها:\n${lines.join('\n') || 'تأمین‌کننده‌ای تعریف نشده.'}\n\nتغییر تأمین‌کننده پیش‌فرض: /setprovider <شناسه>\nتعریف تأمین‌کننده‌ها و کلیدها با PRODUCT_PROVIDERS_JSON و کلیدهای محیطی انجام می‌شود.`,
  )
}

async function showBalance(env: TelegramEnvironment, chatId: number): Promise<void> {
  const providers = await listProviders(env)
  const configured = providers.filter(
    (provider) =>
      provider.balancePath && getProviderKey(env, provider),
  )
  const results = await Promise.all(
    configured.map(async (provider) => ({
      provider,
      balance: await providerRequest(env, provider, provider.balancePath!),
    })),
  )
  const settings = await getEffectiveSettings(env)
  const balances = results.map(
    ({ provider, balance }) =>
      `${provider.name}:\n${JSON.stringify(balance, null, 2).slice(0, 1200)}`,
  )
  await sendMessage(
    env,
    chatId,
    `آمار و موجودی:\n${balances.join('\n\n') || 'مسیر موجودی برای تأمین‌کننده‌ای پیکربندی نشده است.'}\n\n${settingsSummary(env, settings)}`,
  )
}

async function showRecentOrders(
  env: TelegramEnvironment,
  chatId: number,
): Promise<void> {
  const settings = await readAdminSettings(env)
  const providers = await listProviders(env)
  const selected = providers.filter(
    (provider) =>
      (settings.activeProviderId === provider.id ||
        (!settings.activeProviderId && provider.id === 'dante')) &&
      getProviderKey(env, provider),
  )
  const targetProviders =
    selected.length > 0
      ? selected
      : providers.filter((provider) => getProviderKey(env, provider))
  const result = await Promise.all(
    targetProviders.map(async (provider) => {
      const payload = await providerRequest(env, provider, provider.ordersPath)
      return { provider, orders: unwrapList(payload).slice(0, 5) }
    }),
  )
  const lines = result.flatMap(({ provider, orders }) =>
    orders.map((value, index) => {
      const order = asRecord(value)
      const id = order.id ?? order.order_id ?? '—'
      const status = order.status ?? '—'
      return `${provider.name} ${index + 1}. سفارش ${String(id)} | ${String(status)}`
    }),
  )
  await sendMessage(
    env,
    chatId,
    lines.length ? `آخرین سفارش‌ها:\n${lines.join('\n')}` : 'سفارشی ثبت نشده است.',
  )
}

async function getCatalog(request: Request): Promise<CatalogProduct[]> {
  const response = await fetch(new URL('/api/catalog', request.url), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`)
  return unwrapList(await response.json()) as CatalogProduct[]
}

function productStock(product: CatalogProduct): boolean | null {
  const stock = Number(product.stock ?? product.quantity)
  if (Number.isFinite(stock)) return stock > 0
  if (typeof product.in_stock === 'boolean') return product.in_stock
  if (typeof product.inStock === 'boolean') return product.inStock
  return null
}

async function showProducts(
  env: TelegramEnvironment,
  request: Request,
  chatId: number,
  filters: ProductFilters = {},
): Promise<void> {
  const savedFilters =
    (await env.NOBULL_SETTINGS?.get<ProductFilters>(
      `nobull:product-filters:${chatId}`,
      'json',
    )) ?? {}
  const activeSettings = await readAdminSettings(env)
  const currentFilters: ProductFilters = {
    provider:
      filters.provider ??
      savedFilters.provider ??
      activeSettings.activeProviderId ??
      'all',
    category: filters.category ?? savedFilters.category,
    stock: filters.stock ?? savedFilters.stock ?? 'all',
  }
  await env.NOBULL_SETTINGS?.put(
    `nobull:product-filters:${chatId}`,
    JSON.stringify(currentFilters),
    { expirationTtl: 60 * 60 * 24 * 30 },
  )
  const products = await getCatalog(request)
  const selectedProvider = currentFilters.provider ?? 'all'
  const categoryPattern = currentFilters.category
    ? CATEGORY_FILTERS[currentFilters.category]
    : undefined
  const filtered = products.filter((product) => {
    const category = String(product.category ?? product.category_name ?? '')
    const matchesProvider =
      selectedProvider === 'all' || product.provider_id === selectedProvider
    const matchesCategory = !categoryPattern || categoryPattern.test(category)
    const stock = productStock(product)
    const matchesStock =
      !currentFilters.stock ||
      currentFilters.stock === 'all' ||
      (currentFilters.stock === 'available' && stock === true) ||
      (currentFilters.stock === 'unavailable' && stock === false) ||
      (currentFilters.stock === 'unknown' && stock === null)
    return matchesProvider && matchesCategory && matchesStock
  })
  const lines = filtered.slice(0, 15).map((product, index) => {
    const id = product.provider_product_id ?? product.id ?? '—'
    const title =
      product.name ?? product.title ?? product.product_name ?? 'محصول'
    const stock = productStock(product)
    const stockText = stock === null ? 'نامشخص' : stock ? 'موجود' : 'ناموجود'
    const price = Number.isFinite(Number(product.price_toman))
      ? `${new Intl.NumberFormat('fa-IR').format(Number(product.price_toman))} تومان`
      : 'قیمت نامشخص'
    return `${index + 1}. ${title}\n   ${product.provider_name ?? product.provider_id} | ${String(id)} | ${stockText} | ${price}`
  })
  const providers = await listProviders(env)
  const keyboard = {
    inline_keyboard: [
      providers.slice(0, 4).map((provider) => ({
        text: `${selectedProvider === provider.id ? '✓ ' : ''}${provider.name}`,
        callback_data: `products:provider:${provider.id}`,
      })),
      [
        { text: 'همه تأمین‌کننده‌ها', callback_data: 'products:provider:all' },
        { text: 'فقط موجود', callback_data: 'products:stock:available' },
        { text: 'همه موجودی‌ها', callback_data: 'products:stock:all' },
      ],
      [
        { text: 'هوش مصنوعی', callback_data: 'products:category:ai' },
        { text: 'امنیت/VPN', callback_data: 'products:category:security' },
        { text: 'موسیقی/ویدیو', callback_data: 'products:category:media' },
      ],
      [
        { text: 'طراحی', callback_data: 'products:category:design' },
        { text: 'برنامه‌نویسی', callback_data: 'products:category:code' },
        { text: 'آموزش/ابزارها', callback_data: 'products:category:tools' },
      ],
      [{ text: 'پاک‌کردن فیلترها', callback_data: 'products:reset' }],
    ],
  }
  await sendMessage(
    env,
    chatId,
    `کاتالوگ (${filtered.length} محصول)\nفیلتر تأمین‌کننده: ${selectedProvider}\n\n${lines.join('\n\n') || 'محصولی با این فیلترها پیدا نشد.'}${filtered.length > 15 ? '\n\n۱۵ مورد نخست نمایش داده شده‌اند.' : ''}`,
    keyboard,
  )
}

async function findProduct(
  request: Request,
  productId: string,
  providerId?: string,
): Promise<CatalogProduct | null> {
  const products = await getCatalog(request)
  return (
    products.find((product) => {
      const id = String(product.provider_product_id ?? product.id ?? '')
      return (
        id === productId &&
        (!providerId || product.provider_id === providerId)
      )
    }) ?? null
  )
}

async function startPurchase(
  request: Request,
  env: TelegramEnvironment,
  message: TelegramMessage,
  productId: string,
  providerId?: string,
): Promise<void> {
  const [stored, product] = await Promise.all([
    readAdminSettings(env),
    findProduct(request, productId, providerId),
  ])
  const cardNumber = stored.cardNumber ?? env.ADMIN_CARD_NUMBER?.trim()
  const cardHolder = stored.cardHolder ?? env.ADMIN_CARD_HOLDER?.trim()
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
  if (!product || !Number.isFinite(Number(product.price_toman))) {
    await sendMessage(env, message.chat.id, 'محصول موردنظر پیدا نشد.')
    return
  }
  const id = String(product.provider_product_id ?? product.id)
  const title =
    product.name ?? product.title ?? product.product_name ?? `محصول ${id}`
  const price = new Intl.NumberFormat('fa-IR').format(
    Number(product.price_toman),
  )
  const invoice = [
    '🧾 فاکتور خرید نوبول',
    '',
    `محصول: ${title}`,
    `تأمین‌کننده: ${product.provider_name ?? product.provider_id ?? '—'}`,
    `شناسه محصول: ${id}`,
    `مبلغ قابل پرداخت: ${price} تومان`,
    '',
    `شماره کارت: ${cardNumber}`,
    `به نام: ${cardHolder}`,
    '',
    `پس از پرداخت، تصویر رسید را با کپشن buy_${product.provider_id ?? 'dante'}__${id} ارسال کنید یا در پاسخ به همین فاکتور بفرستید.`,
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

function parseProductReference(
  value: string,
): { providerId: string; productId: string } | null {
  const valueMatch = value.match(/\bbuy_([a-z0-9-]{1,16})__([a-zA-Z0-9_-]{1,38})\b/i)
  if (valueMatch) return { providerId: valueMatch[1], productId: valueMatch[2] }
  const singleSeparatorMatch = value.match(
    /\bbuy_([a-z0-9-]{1,16})_([a-zA-Z0-9_-]{1,38})\b/i,
  )
  if (singleSeparatorMatch) {
    return {
      providerId: singleSeparatorMatch[1],
      productId: singleSeparatorMatch[2],
    }
  }
  const legacyMatch =
    value.match(/\bbuy_([a-zA-Z0-9_-]+)\b/) ??
    value.match(/شناسه محصول:\s*([a-zA-Z0-9_-]+)/)
  return legacyMatch
    ? { providerId: 'dante', productId: legacyMatch[1] }
    : null
}

async function saveReceiptContext(
  env: TelegramEnvironment,
  context: ReceiptContext,
): Promise<string> {
  if (!env.NOBULL_SETTINGS) {
    throw new Error('Configure NOBULL_SETTINGS KV before accepting receipts.')
  }
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24)
  await env.NOBULL_SETTINGS.put(
    `nobull:receipt:${token}`,
    JSON.stringify(context),
    { expirationTtl: 60 * 60 * 24 },
  )
  return token
}

async function readReceiptContext(
  env: TelegramEnvironment,
  token: string,
): Promise<ReceiptContext | null> {
  return (
    (await env.NOBULL_SETTINGS?.get<ReceiptContext>(
      `nobull:receipt:${token}`,
      'json',
    )) ?? null
  )
}

async function forwardReceipt(
  env: TelegramEnvironment,
  message: TelegramMessage,
): Promise<void> {
  const adminChatId = env.TELEGRAM_ADMIN_CHAT_ID
  if (!adminChatId) throw new Error('Telegram admin chat is not configured.')
  const selected = [
    message.caption,
    message.reply_to_message?.text,
  ].find((value) => value && parseProductReference(value))
  const reference = selected ? parseProductReference(selected) : null
  if (!reference) {
    await sendMessage(
      env,
      message.chat.id,
      'برای بررسی رسید، آن را با کپشن buy_<شناسه محصول> بفرستید یا در پاسخ به فاکتور همان محصول ارسال کنید.',
    )
    return
  }

  const token = await saveReceiptContext(env, {
    userChatId: String(message.chat.id),
    productId: reference.productId,
    providerId: reference.providerId,
    reference: `tg-${message.chat.id}-${Date.now()}`,
  })
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '✅ تایید و خرید خودکار', callback_data: `approve:${token}` },
        { text: '❌ رد پرداخت', callback_data: `reject:${token}` },
      ],
    ],
  }
  for (const button of replyMarkup.inline_keyboard[0]) {
    if (new TextEncoder().encode(button.callback_data).length > 64) {
      throw new Error('Receipt callback exceeds Telegram callback data limit; configure KV.')
    }
  }

  const user = message.from
  const sender = user
    ? `${user.first_name ?? ''}${user.username ? ` (@${user.username})` : ''}`.trim()
    : 'کاربر'
  const caption = `رسید پرداخت\nکاربر: ${sender}\nشناسه کاربر: ${message.chat.id}\nتأمین‌کننده: ${reference.providerId}\nشناسه محصول: ${reference.productId}`
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
  }
  await sendMessage(env, message.chat.id, 'رسید شما برای بررسی به پشتیبانی ارسال شد.')
}

function unwrapOrder(value: unknown): ProviderOrder {
  const payload = asRecord(value)
  const data = asRecord(payload.data)
  return asRecord(payload.order ?? data.order ?? payload.data ?? payload) as ProviderOrder
}

async function editCallbackMarkup(
  env: TelegramEnvironment,
  message: NonNullable<NonNullable<TelegramUpdate['callback_query']>['message']>,
): Promise<void> {
  await callTelegram(env, 'editMessageReplyMarkup', {
    chat_id: message.chat.id,
    message_id: message.message_id,
    reply_markup: { inline_keyboard: [] },
  })
}

async function handleAdminCallback(
  env: TelegramEnvironment,
  request: Request,
  update: NonNullable<TelegramUpdate['callback_query']>,
): Promise<void> {
  const data = update.data ?? ''
  const message = update.message
  if (!message) return
  const chatId = message.chat.id
  if (data === 'panel:home') {
    await sendAdminDashboard(env, chatId, message.message_id)
    return
  }
  if (data === 'panel:stats') {
    await showBalance(env, chatId)
    return
  }
  if (data === 'panel:orders') {
    await showRecentOrders(env, chatId)
    return
  }
  if (data === 'panel:products') {
    await showProducts(env, request, chatId)
    return
  }
  if (data === 'panel:providers') {
    await handleProviderList(env, chatId)
    return
  }
  if (data === 'panel:pricing') {
    const settings = await getEffectiveSettings(env)
    await sendMessage(
      env,
      chatId,
      `تنظیمات قیمت:\n${settingsSummary(env, settings)}\n\nبرای تغییر نرخ: /setrate <تومان>\nبرای حاشیه سود: /setmargin <درصد>\nبرای بازگشت به نرخ محیط: /autorate`,
    )
    return
  }
  if (data === 'panel:card') {
    await sendMessage(
      env,
      chatId,
      'تغییر کارت پرداخت:\n/setcard <شماره کارت ۱۶ رقمی> <نام صاحب کارت>',
    )
    return
  }
  if (data.startsWith('products:')) {
    const [, filter, value] = data.split(':')
    const stored =
      (await env.NOBULL_SETTINGS?.get<ProductFilters>(
        `nobull:product-filters:${chatId}`,
        'json',
      )) ?? {}
    const filters: ProductFilters =
      filter === 'reset'
        ? { provider: 'all', category: undefined, stock: 'all' }
        : {
            ...stored,
            ...(filter === 'provider' ? { provider: value } : {}),
            ...(filter === 'category' ? { category: value } : {}),
            ...(filter === 'stock' ? { stock: value } : {}),
          }
    await showProducts(env, request, chatId, filters)
    return
  }
  if (data.startsWith('approve:') || data.startsWith('reject:')) {
    await handleReceiptCallback(env, update)
  }
}

async function handleReceiptCallback(
  env: TelegramEnvironment,
  update: NonNullable<TelegramUpdate['callback_query']>,
): Promise<void> {
  const data = update.data ?? ''
  const [action, ...parts] = data.split(':')
  let context: ReceiptContext | null = null
  if (parts.length === 1 && env.NOBULL_SETTINGS) {
    context = await readReceiptContext(env, parts[0])
  } else if (/^\d+$/.test(parts[0] ?? '')) {
    context = {
      userChatId: parts[0],
      providerId: action === 'approve' ? parts[1] : 'dante',
      productId: action === 'approve' ? parts[2] : '',
      reference: `tg-${parts[0]}-${Date.now()}`,
    }
  }
  if (!context) throw new Error('Receipt approval context is missing or expired.')
  if (context.status && context.status !== 'pending') {
    throw new Error('This receipt has already been processed.')
  }

  const adminChatId = env.TELEGRAM_ADMIN_CHAT_ID
  if (!adminChatId) throw new Error('Telegram admin chat is not configured.')
  if (action === 'reject') {
    if (parts.length === 1) {
      await env.NOBULL_SETTINGS?.put(
        `nobull:receipt:${parts[0]}`,
        JSON.stringify({ ...context, status: 'processing' }),
        { expirationTtl: 60 * 60 * 24 },
      )
    }
    await sendMessage(
      env,
      context.userChatId,
      'پرداخت شما تأیید نشد. برای پیگیری با پشتیبانی تماس بگیرید.',
    )
    if (parts.length === 1) {
      await env.NOBULL_SETTINGS?.delete(`nobull:receipt:${parts[0]}`)
    }
    if (update.message) await editCallbackMarkup(env, update.message)
    return
  }

  const provider = getProviders(env).find(
    (item) => item.id === context?.providerId,
  )
  if (!provider) throw new Error(`Unknown provider ${context.providerId}.`)
  const reference = context.reference
  if (parts.length === 1) {
    await env.NOBULL_SETTINGS?.put(
      `nobull:receipt:${parts[0]}`,
      JSON.stringify({ ...context, status: 'processing' }),
      { expirationTtl: 60 * 60 * 24 },
    )
  }
  let payload: unknown
  try {
    payload = await providerRequest(env, provider, provider.ordersPath, {
      method: 'POST',
      body: JSON.stringify({
        product_id: context.productId,
        qty: 1,
        ref: reference,
      }),
    })
  } catch (error) {
    if (parts.length === 1) {
      await env.NOBULL_SETTINGS?.put(
        `nobull:receipt:${parts[0]}`,
        JSON.stringify({ ...context, status: 'pending' }),
        { expirationTtl: 60 * 60 * 24 },
      )
    }
    throw error
  }
  const order = unwrapOrder(payload)
  if (order.delivery) {
    const delivery = formatDelivery(order.delivery)
    if (!delivery) throw new Error('Provider returned an empty delivery.')
    await sendMessage(
      env,
      context.userChatId,
      `✅ سفارش شما آماده است.\n\n${delivery}`,
    )
    await sendMessage(
      env,
      adminChatId,
      `تحویل سفارش ${reference} برای کاربر ${context.userChatId} انجام شد.`,
    )
  } else if (order.status === 'processing') {
    await sendMessage(
      env,
      context.userChatId,
      '✅ سفارش شما ثبت شد. اطلاعات حساب به‌محض آماده‌شدن به‌صورت خودکار برایتان ارسال می‌شود.',
    )
    await sendMessage(
      env,
      adminChatId,
      `سفارش ${reference} برای کاربر ${context.userChatId} در وضعیت پردازش است.`,
    )
  } else {
    await sendMessage(
      env,
      adminChatId,
      `سفارش ${reference} ثبت شد؛ وضعیت تأمین‌کننده: ${order.status ?? 'نامشخص'}.`,
    )
  }
  if (parts.length === 1) {
    await env.NOBULL_SETTINGS?.delete(`nobull:receipt:${parts[0]}`)
  }
  if (update.message) await editCallbackMarkup(env, update.message)
}

async function parseCommandSettings(
  env: TelegramEnvironment,
  command: string,
  args: string[],
  chatId: number,
): Promise<boolean> {
  const current = await readAdminSettings(env)
  const next: AdminSettings = { ...current }
  const normalizeDigits = (value: string) =>
    value
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
  const numeric = (value: string | undefined) =>
    value
      ? Number(normalizeDigits(value).replace(/[٬,]/g, ''))
      : Number.NaN

  if (command === '/setrate') {
    const rate = numeric(args[0])
    if (!Number.isFinite(rate) || rate < 1000 || rate > 100_000_000) {
      await sendMessage(env, chatId, 'مقدار نرخ معتبر نیست. نمونه: /setrate 68000')
      return true
    }
    next.manualRate = rate
    next.rateOverride = true
    await writeAdminSettings(env, next)
    console.info('Admin setting updated.', { action: 'setrate' })
    await sendMessage(env, chatId, `نرخ تتر روی ${new Intl.NumberFormat('fa-IR').format(rate)} تومان تنظیم شد.`)
    return true
  }
  if (command === '/setmargin') {
    const margin = numeric(args[0])
    if (!Number.isFinite(margin) || margin < 0 || margin > 1000) {
      await sendMessage(env, chatId, 'درصد حاشیه سود باید بین ۰ تا ۱۰۰۰ باشد.')
      return true
    }
    next.profitMarginPercent = margin
    await writeAdminSettings(env, next)
    console.info('Admin setting updated.', { action: 'setmargin' })
    await sendMessage(env, chatId, `حاشیه سود روی ${new Intl.NumberFormat('fa-IR').format(margin)}٪ تنظیم شد.`)
    return true
  }
  if (command === '/setcard') {
    const cardNumber = normalizeDigits(args[0] ?? '').replace(/[\s-]/g, '')
    const holder = args.slice(1).join(' ').trim()
    if (!/^\d{16}$/.test(cardNumber) || holder.length < 2 || holder.length > 80) {
      await sendMessage(env, chatId, 'فرمت درست: /setcard <شماره کارت ۱۶ رقمی> <نام صاحب کارت>')
      return true
    }
    next.cardNumber = cardNumber.replace(/(\d{4})(?=\d)/g, '$1-')
    next.cardHolder = holder
    await writeAdminSettings(env, next)
    console.info('Admin setting updated.', { action: 'setcard' })
    await sendMessage(env, chatId, 'شماره کارت و نام صاحب کارت با موفقیت به‌روز شد.')
    return true
  }
  if (command === '/setprovider') {
    const providerId = args[0]
    const provider = getProviders(env).find((item) => item.id === providerId)
    if (!provider || !getProviderKey(env, provider)) {
      await sendMessage(env, chatId, 'این تأمین‌کننده تعریف نشده یا کلید API آن تنظیم نیست.')
      return true
    }
    next.activeProviderId = provider.id
    await writeAdminSettings(env, next)
    console.info('Admin setting updated.', { action: 'setprovider', providerId })
    await sendMessage(env, chatId, `تأمین‌کننده پیش‌فرض روی ${provider.name} تنظیم شد.`)
    return true
  }
  return false
}

function validWebhookSecret(provided: string, expected: string): boolean {
  let difference = provided.length ^ expected.length
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ (provided.charCodeAt(index) || 0)
  }
  return difference === 0
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
  if (
    !validWebhookSecret(
      request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '',
      env.TELEGRAM_WEBHOOK_SECRET,
    )
  ) {
    return jsonResponse({ error: 'Invalid webhook secret.' }, 401)
  }

  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch (error) {
    console.warn('Telegram webhook received invalid JSON.', error)
    return jsonResponse({ error: 'Invalid Telegram update.' }, 400)
  }

  try {
    if (update.callback_query) {
      const callback = update.callback_query
      const data = callback.data ?? ''
      const isAdminActor = isAdmin(env, callback.from.id)
      const isAdminAction = data.startsWith('panel:') ||
        data.startsWith('products:') ||
        data.startsWith('approve:') ||
        data.startsWith('reject:')
      if (isAdminAction && !isAdminActor) {
        await callTelegram(env, 'answerCallbackQuery', {
          callback_query_id: callback.id,
          text: 'این عملیات فقط برای مدیر در دسترس است.',
          show_alert: true,
        })
        return jsonResponse({ ok: true })
      }
      if (isAdminActor) {
        console.info('Admin callback received.', {
          action: data.split(':', 1)[0],
          adminId: callback.from.id,
        })
      }
      await callTelegram(env, 'answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'در حال پردازش...',
      })
      if (isAdminActor) {
        await handleAdminCallback(env, request, callback)
      }
      return jsonResponse({ ok: true })
    }

    const message = update.message
    if (!message) return jsonResponse({ ok: true })
    const text = message.text?.trim() ?? ''
    const [rawCommand = '', ...args] = text.split(/\s+/)
    const command = rawCommand.split('@')[0].toLowerCase()
    const admin = isAdmin(env, message.from?.id)
    if (admin && command.startsWith('/')) {
      console.info('Admin command received.', {
        action: command,
        adminId: message.from?.id,
      })
    }

    if (admin && ['/admin', '/start'].includes(command) && !args.length) {
      await sendAdminDashboard(env, message.chat.id)
      return jsonResponse({ ok: true })
    }
    if (admin && ['/setrate', '/setmargin', '/setcard', '/setprovider'].includes(command)) {
      if (!env.NOBULL_SETTINGS) {
        await sendMessage(
          env,
          message.chat.id,
          'برای ذخیره پایدار تنظیمات، ابتدا KV Binding با نام NOBULL_SETTINGS را به Cloudflare Pages Function وصل کنید.',
        )
        return jsonResponse({ ok: true })
      }
      await parseCommandSettings(env, command, args, message.chat.id)
      return jsonResponse({ ok: true })
    }
    if (admin && command === '/autorate') {
      if (!env.NOBULL_SETTINGS) {
        await sendMessage(
          env,
          message.chat.id,
          'برای ذخیره تنظیمات، ابتدا KV Binding با نام NOBULL_SETTINGS را وصل کنید.',
        )
        return jsonResponse({ ok: true })
      }
      const settings = await readAdminSettings(env)
      delete settings.rateOverride
      await writeAdminSettings(env, settings)
      console.info('Admin setting updated.', { action: 'autorate' })
      await sendMessage(env, message.chat.id, 'نرخ دستی غیرفعال شد؛ حالت نرخ محیط دوباره فعال است.')
      return jsonResponse({ ok: true })
    }
    if (admin && ['/balance', '/pricing', '/providers', '/orders'].includes(command)) {
      if (command === '/balance') await showBalance(env, message.chat.id)
      else if (command === '/pricing') {
        const settings = await getEffectiveSettings(env)
        await sendMessage(env, message.chat.id, settingsSummary(env, settings))
      } else if (command === '/providers') await handleProviderList(env, message.chat.id)
      else await showRecentOrders(env, message.chat.id)
      return jsonResponse({ ok: true })
    }
    if (admin && command === '/products') {
      const [provider, category, stock] = args
      await showProducts(env, request, message.chat.id, {
        provider,
        category: CATEGORY_FILTERS[category] ? category : undefined,
        stock: ['all', 'available', 'unavailable', 'unknown'].includes(stock)
          ? stock
          : undefined,
      })
      return jsonResponse({ ok: true })
    }
    if (command === '/start') {
      const legacyProviderMatch = text.match(
        /^\/start(?:@\w+)?\s+buy_([a-z0-9-]{1,16})__([a-zA-Z0-9_-]{1,38})$/i,
      )
      const match = legacyProviderMatch ?? text.match(
        /^\/start(?:@\w+)?\s+buy_([a-z0-9-]{1,16})_([a-zA-Z0-9_-]{1,38})$/i,
      )
      const legacy = text.match(/^\/start(?:@\w+)?\s+buy_([a-zA-Z0-9_-]+)$/i)
      const productId = match?.[2] ?? legacy?.[1]
      if (productId) {
        await startPurchase(request, env, message, productId, match?.[1])
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
      return jsonResponse({ ok: true })
    }
    if (message.photo?.length || message.document?.file_id) {
      await forwardReceipt(env, message)
    }
    return jsonResponse({ ok: true })
  } catch (error) {
    console.error('Telegram webhook update failed.', {
      updateId: update.update_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    const updateMessage =
      update.message?.chat.id ??
      update.callback_query?.message?.chat.id
    const notifyChat =
      update.message && isAdmin(env, update.message.from?.id)
        ? update.message.chat.id
        : update.callback_query &&
            isAdmin(env, update.callback_query.from.id) &&
            update.callback_query.message
          ? update.callback_query.message.chat.id
          : updateMessage ?? env.TELEGRAM_ADMIN_CHAT_ID
    try {
      await sendMessage(
        env,
        notifyChat,
        'در انجام عملیات خطایی رخ داد. تنظیمات یا وضعیت سرویس را بررسی کنید و دوباره تلاش کنید.',
      )
      return jsonResponse({ ok: true })
    } catch (notificationError) {
      console.error('Telegram webhook error notification failed.', {
        updateId: update.update_id,
        error:
          notificationError instanceof Error
            ? notificationError.message
            : 'Unknown error',
      })
      return jsonResponse({ error: 'Telegram webhook processing failed.' }, 500)
    }
  }
}
