import {
  sendCustomBroadcast,
  type UserRegistryKV,
} from './_shared/broadcast'
import { callTelegram } from './_shared/telegram'
import { decideStoredOrder, type OrderActionEnvironment } from './_shared/orderActions'
import {
  DEFAULT_PROFIT_MARGIN_TIERS,
  changeUserWallet,
  getEffectiveSettings,
  getUserWallets,
  getProfitMarginPercent,
  listStoredCustomers,
  listStoredOrders,
  readAdminSettings,
  getProviders,
  getProviderKey,
  providerHeaders,
  providerRequestUrl,
  writeAdminSettings,
  type AdminSettings,
  type PromoCode,
  type StoredCustomer,
  type StoredOrder,
} from './_shared/settings'

interface AdminEnvironment extends OrderActionEnvironment {
  NOBULL_USERS?: UserRegistryKV
  TELEGRAM_ADMIN_CHAT_ID?: string
}

interface AdminContext {
  request: Request
  env: AdminEnvironment
}

interface LoginThrottle {
  failures: number[]
  lockedUntil?: number
  alerted?: boolean
}

interface OtpRecord {
  digest: string
  expiresAt: number
}

interface ProviderWallet {
  provider: string
  configured: boolean
  balance: number | null
  currency: string | null
  testCredit: number | string | boolean | null
  testCreditActive: boolean | null
  checkedAt: number
  error: string | null
}

const SESSION_TTL_SECONDS = 12 * 60 * 60
const LOCKOUT_MS = 15 * 60 * 1000
const FAILURE_WINDOW_MS = 15 * 60 * 1000
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function configuredSigningSecret(env: AdminEnvironment): string | null {
  return env.ADMIN_PANEL_PASSWORD || env.TELEGRAM_WEBHOOK_SECRET || null
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
  )
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  const length = 4096
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

async function issueSession(secret: string): Promise<string> {
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        aud: 'nobull-admin',
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
        nonce: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
      }),
    ),
  )
  const signature = toBase64Url(await hmac(secret, payload))
  return `${payload}.${signature}`
}

async function verifySession(
  token: string,
  secret: string,
): Promise<boolean> {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return false
  const supplied = fromBase64Url(signature)
  if (!supplied) return false
  const expected = await hmac(secret, payload)
  if (!constantTimeEqual(supplied, expected)) return false
  const decoded = fromBase64Url(payload)
  if (!decoded) return false
  try {
    const claims: unknown = JSON.parse(new TextDecoder().decode(decoded))
    const record = asRecord(claims)
    return (
      record.aud === 'nobull-admin' &&
      typeof record.exp === 'number' &&
      record.exp > Math.floor(Date.now() / 1000)
    )
  } catch {
    return false
  }
}

async function ipKey(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown'
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip)),
  )
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function readThrottle(
  env: AdminEnvironment,
  key: string,
): Promise<LoginThrottle> {
  if (!env.NOBULL_SETTINGS) throw new Error('Admin KV is not configured.')
  return (
    (await env.NOBULL_SETTINGS.get<LoginThrottle>(key, 'json')) ?? {
      failures: [],
    }
  )
}

async function checkLocked(
  env: AdminEnvironment,
  key: string,
): Promise<number> {
  const state = await readThrottle(env, key)
  return Math.max(0, (state.lockedUntil ?? 0) - Date.now())
}

async function recordFailedLogin(
  env: AdminEnvironment,
  request: Request,
  key: string,
): Promise<{ locked: boolean; retryAfterMs: number }> {
  if (!env.NOBULL_SETTINGS) throw new Error('Admin KV is not configured.')
  const now = Date.now()
  const state = await readThrottle(env, key)
  const failures = state.failures.filter(
    (timestamp) => now - timestamp < FAILURE_WINDOW_MS,
  )
  failures.push(now)
  const locked = failures.length >= 5
  const next: LoginThrottle = {
    failures,
    lockedUntil: locked ? now + LOCKOUT_MS : undefined,
    alerted: locked ? true : undefined,
  }
  await env.NOBULL_SETTINGS.put(
    key,
    JSON.stringify(next),
    { expirationTtl: Math.ceil(LOCKOUT_MS / 1000) },
  )
  if (locked && env.TELEGRAM_ADMIN_CHAT_ID && env.TELEGRAM_BOT_TOKEN) {
    const addressHash = (await ipKey(request)).slice(0, 12)
    await callTelegram(env, 'sendMessage', {
      chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
      text: `هشدار امنیتی پنل نوبول: پنج تلاش ورود ناموفق ثبت شد و دسترسی این IP برای ۱۵ دقیقه مسدود شد. شناسه ناشناس IP: ${addressHash}`,
      disable_web_page_preview: true,
    })
  }
  return { locked, retryAfterMs: locked ? LOCKOUT_MS : 0 }
}

async function issueOtp(env: AdminEnvironment, key: string): Promise<void> {
  if (!env.NOBULL_SETTINGS) throw new Error('Admin KV is not configured.')
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) {
    throw new Error('Telegram login is not configured.')
  }
  const throttleKey = `nobull:admin:otp-cooldown:${key}`
  if (await env.NOBULL_SETTINGS.get<{ createdAt: number }>(throttleKey, 'json')) {
    throw new Error('برای دریافت کد جدید کمی صبر کنید.')
  }
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  const code = String(random[0] % 1_000_000).padStart(6, '0')
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)),
  )
  await env.NOBULL_SETTINGS.put(
    `nobull:admin:otp:${key}`,
    JSON.stringify({ digest: toBase64Url(digest), expiresAt: Date.now() + 5 * 60 * 1000 } satisfies OtpRecord),
    { expirationTtl: 5 * 60 },
  )
  await env.NOBULL_SETTINGS.put(
    throttleKey,
    JSON.stringify({ createdAt: Date.now() }),
    { expirationTtl: 60 },
  )
  await callTelegram(env, 'sendMessage', {
    chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
    text: `کد ورود پنل مدیریت نوبول: ${code}\nاین کد تا ۵ دقیقه معتبر است و فقط یک‌بار استفاده می‌شود.`,
    disable_web_page_preview: true,
  })
}

export async function authenticateAdminRequest(
  request: Request,
  env: AdminEnvironment,
): Promise<boolean> {
  const secret = configuredSigningSecret(env)
  if (!secret) return false
  const authorization = request.headers.get('Authorization') ?? ''
  const match = authorization.match(/^Bearer ([A-Za-z0-9_.-]+)$/)
  return match ? verifySession(match[1], secret) : false
}

async function listBotSubscriberCount(env: AdminEnvironment): Promise<number> {
  if (!env.NOBULL_USERS) return 0
  let count = 0
  let cursor: string | undefined
  do {
    const page = await env.NOBULL_USERS.list({ prefix: 'user:', cursor })
    count += page.keys.length
    if (!page.list_complete && !page.cursor) {
      throw new Error('NOBULL_USERS returned an incomplete subscriber page.')
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return count
}

async function includeLegacySubscribers(
  env: AdminEnvironment,
  customers: StoredCustomer[],
): Promise<StoredCustomer[]> {
  if (!env.NOBULL_USERS) return customers
  const known = new Set(customers.map((customer) => customer.chatId))
  let cursor: string | undefined
  const merged = [...customers]
  do {
    const page = await env.NOBULL_USERS.list({ prefix: 'user:', cursor })
    const missing = page.keys
      .map(({ name }) => name.slice('user:'.length))
      .filter((id) => !known.has(id))
    for (const chatId of missing) {
      known.add(chatId)
      merged.push({
        chatId,
        username: '',
        firstName: '',
        firstSeenAt: 0,
        lastActiveAt: 0,
        totalOrders: 0,
        completedOrders: 0,
        totalSpentToman: 0,
      })
    }
    if (!page.list_complete && !page.cursor) {
      throw new Error('NOBULL_USERS returned an incomplete subscriber page.')
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return merged.sort((left, right) => right.lastActiveAt - left.lastActiveAt)
}

function summarizeSales(orders: StoredOrder[], now = Date.now()) {
  const periods = [
    { key: 'today', start: new Date(new Date(now).setHours(0, 0, 0, 0)).getTime() },
    { key: 'last7Days', start: now - 7 * 24 * 60 * 60 * 1000 },
    { key: 'last30Days', start: now - 30 * 24 * 60 * 60 * 1000 },
    { key: 'allTime', start: 0 },
  ] as const
  const sales = Object.fromEntries(
    periods.map(({ key, start }) => {
      const completed = orders.filter(
        (order) =>
          order.status === 'completed' &&
          (order.completedAt ?? order.updatedAt) >= start,
      )
      const periodOrders = orders.filter((order) => order.createdAt >= start)
      return [
        key,
        {
          revenueToman: completed.reduce((sum, order) => sum + order.priceToman, 0),
          netProfitToman: completed.reduce(
            (sum, order) => sum + order.estimatedProfitToman,
            0,
          ),
          completedOrders: completed.length,
          pendingOrders: periodOrders.filter(
            (order) => order.status === 'pending_receipt' || order.status === 'waiting_review',
          ).length,
        },
      ]
    }),
  )
  const products = new Map<string, { title: string; brand: string; count: number; revenueToman: number }>()
  const brands = new Map<string, { brand: string; count: number; revenueToman: number }>()
  for (const order of orders.filter((item) => item.status === 'completed')) {
    const key = `${order.brand}\u0000${order.productTitle}`
    const current = products.get(key) ?? {
      title: order.productTitle,
      brand: order.brand,
      count: 0,
      revenueToman: 0,
    }
    current.count += 1
    current.revenueToman += order.priceToman
    products.set(key, current)
    const brand = brands.get(order.brand) ?? {
      brand: order.brand,
      count: 0,
      revenueToman: 0,
    }
    brand.count += 1
    brand.revenueToman += order.priceToman
    brands.set(order.brand, brand)
  }
  return {
    sales,
    topProducts: [...products.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    topBrands: [...brands.values()].sort((a, b) => b.count - a.count).slice(0, 10),
  }
}

async function getLiveProducts(request: Request) {
  const catalogUrl = new URL('/api/catalog', request.url)
  catalogUrl.searchParams.set('includeHidden', '1')
  const response = await fetch(catalogUrl, {
    headers: {
      Accept: 'application/json',
      Authorization: request.headers.get('Authorization') ?? '',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    return { products: [], rate: null, error: `کاتالوگ در دسترس نیست (${response.status}).` }
  }
  const payload = asRecord(await response.json())
  const products = Array.isArray(payload.products) ? payload.products : []
  return {
    products,
    rate: typeof payload.usdt_rate_used === 'number' ? payload.usdt_rate_used : null,
    error: null,
  }
}

function findValue(
  value: unknown,
  names: string[],
  depth = 0,
): unknown {
  if (depth > 5 || !value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, names, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }
  const record = value as Record<string, unknown>
  for (const [key, nested] of Object.entries(record)) {
    if (names.includes(key.toLowerCase()) && nested !== null && nested !== undefined) {
      return nested
    }
  }
  for (const nested of Object.values(record)) {
    const found = findValue(nested, names, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

function parseWallet(payload: unknown): Pick<
  ProviderWallet,
  'balance' | 'currency' | 'testCredit' | 'testCreditActive'
> {
  const balanceValue = findValue(payload, [
    'balance',
    'available_balance',
    'availablebalance',
    'credit',
    'remaining_balance',
    'remainingbalance',
    'wallet_balance',
    'walletbalance',
  ])
  const rawBalance =
    typeof balanceValue === 'number' || typeof balanceValue === 'string'
      ? Number(balanceValue)
      : Number.NaN
  const testCreditValue = findValue(payload, [
    'test_credit',
    'testcredit',
    'test_balance',
    'testbalance',
    'trial_credit',
    'trialcredit',
  ])
  const testModeValue = findValue(payload, [
    'is_test',
    'test_mode',
    'istest',
    'testmode',
    'test_key',
    'testkey',
    'test_account',
    'istestaccount',
    'test_credit_active',
    'testcreditactive',
  ])
  const testCredit =
    typeof testCreditValue === 'number' ||
    typeof testCreditValue === 'string' ||
    typeof testCreditValue === 'boolean'
      ? testCreditValue
      : null
  const testCreditActive =
    typeof testModeValue === 'boolean'
      ? testModeValue
      : typeof testCreditValue === 'number'
        ? testCreditValue > 0
        : typeof testCreditValue === 'string' && testCreditValue.trim()
          ? Number.isFinite(Number(testCreditValue))
            ? Number(testCreditValue) > 0
            : /active|enabled|available/i.test(testCreditValue)
          : null
  const currencyValue = findValue(payload, [
    'currency',
    'currency_code',
    'currencycode',
    'unit',
  ])
  return {
    balance: Number.isFinite(rawBalance) ? rawBalance : null,
    currency: typeof currencyValue === 'string' ? currencyValue : null,
    testCredit,
    testCreditActive,
  }
}

async function getDanteWallet(env: AdminEnvironment): Promise<ProviderWallet> {
  const checkedAt = Date.now()
  const unavailable = (
    error: string,
    configured = Boolean(env.DANTE_KEY),
  ): ProviderWallet => ({
    provider: 'Dante Hub',
    configured,
    balance: null,
    currency: null,
    testCredit: null,
    testCreditActive: null,
    checkedAt,
    error,
  })

  if (!env.DANTE_KEY) return unavailable('کلید Dante Hub پیکربندی نشده است.', false)
  try {
    const provider = getProviders(env).find(
      (candidate) => candidate.id === 'dante' && candidate.apiKeyEnv === 'DANTE_KEY',
    )
    if (!provider?.balancePath) {
      return unavailable('مسیر دریافت موجودی برای Dante Hub پیکربندی نشده است.')
    }
    const apiKey = getProviderKey(env, provider)
    if (!apiKey) return unavailable('کلید دسترسی Dante Hub در دسترس نیست.', false)

    const response = await fetch(providerRequestUrl(provider, provider.balancePath), {
      method: 'GET',
      headers: providerHeaders(provider, apiKey),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      return unavailable(`Dante Hub پاسخ ${response.status} برگرداند.`)
    }
    const parsed: unknown = await response.json()
    const wallet = parseWallet(parsed)
    return {
      provider: provider.name,
      configured: true,
      ...wallet,
      checkedAt: Date.now(),
      error:
        wallet.balance === null
          ? 'پاسخ Dante Hub دریافت شد، اما مقدار موجودی قابل‌شناسایی نبود.'
          : null,
    }
  } catch (error) {
    console.error('Dante Hub balance request failed.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return unavailable('دریافت موجودی Dante Hub موقتاً ناموفق بود.')
  }
}

async function handleGet(request: Request, env: AdminEnvironment): Promise<Response> {
  const [orders, storedCustomers, settings, subscriberCount, catalog, providerWallet] =
    await Promise.all([
      listStoredOrders(env),
      listStoredCustomers(env),
      getEffectiveSettings(env),
      listBotSubscriberCount(env),
      getLiveProducts(request),
      getDanteWallet(env),
    ])
  const customersWithLegacy = await includeLegacySubscribers(env, storedCustomers)
  const wallets = await getUserWallets(
    env,
    customersWithLegacy.map((customer) => customer.chatId),
  )
  const customers = customersWithLegacy.map((customer) => ({
    ...customer,
    wallet: wallets.get(customer.chatId),
  }))
  const catalogProducts = catalog.products.map((item) => {
    const product = asRecord(item)
    const priceUsd = Number(product.price_usd)
    return {
      ...product,
      appliedMarginPercent: getProfitMarginPercent(
        priceUsd,
        settings,
        typeof product.id === 'string' ? product.id : undefined,
      ),
      buyCostToman:
        priceUsd * Number(product.usdt_rate_used ?? catalog.rate ?? settings.manualRate),
    }
  })
  return jsonResponse({
    orders,
    customers,
    walletConfigured: Boolean(env.NOBULL_WALLET_DB),
    analytics: {
      ...summarizeSales(orders),
      totalBotSubscribers: subscriberCount,
    },
    pricing: {
      usdtMode: settings.usdtMode,
      manualRate: settings.manualRate,
      fixedFeeToman: settings.fixedFeeToman,
      cardNumber: settings.cardNumber ?? env.ADMIN_CARD_NUMBER ?? '',
      cardHolder: settings.cardHolder ?? env.ADMIN_CARD_HOLDER ?? '',
      profitMarginTiers: settings.profitMarginTiers,
      productOverrides: settings.productOverrides ?? {},
      discountCodes: settings.discountCodes ?? [],
      tiers: DEFAULT_PROFIT_MARGIN_TIERS,
      updatedAt: settings.updatedAt ?? null,
    },
    catalog: { products: catalogProducts, rate: catalog.rate, error: catalog.error },
    providerWallet,
  })
}

async function parseRequestBody(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (contentLength > 100_000) return null
  const text = await request.text()
  if (text.length > 100_000) return null
  try {
    return asRecord(JSON.parse(text))
  } catch {
    return null
  }
}

function validatePricing(body: Record<string, unknown>): AdminSettings | null {
  const mode = body.usdtMode
  const manualRate = Number(body.manualRate)
  const fixedFeeToman = Number(body.fixedFeeToman)
  const cardNumber = String(body.cardNumber ?? '').replace(/[\s-]/g, '')
  const cardHolder = String(body.cardHolder ?? '').trim()
  const tiers = body.profitMarginTiers
  if (
    (mode !== 'auto' && mode !== 'manual') ||
    !Number.isFinite(manualRate) ||
    manualRate < 1000 ||
    manualRate > 100_000_000 ||
    !Number.isFinite(fixedFeeToman) ||
    fixedFeeToman < 0 ||
    fixedFeeToman > 1_000_000_000 ||
    (cardNumber !== '' && !/^\d{16}$/.test(cardNumber)) ||
    cardHolder.length > 80 ||
    !Array.isArray(tiers) ||
    tiers.length !== DEFAULT_PROFIT_MARGIN_TIERS.length ||
    !tiers.every(
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000,
    )
  ) {
    return null
  }
  return {
    usdtMode: mode,
    manualRate,
    rateOverride: mode === 'manual',
    fixedFeeToman,
    cardNumber: cardNumber
      ? cardNumber.replace(/(\d{4})(?=\d)/g, '$1-')
      : '',
    cardHolder,
    profitMarginTiers: tiers as number[],
  }
}

export async function onRequestGet({
  request,
  env,
}: AdminContext): Promise<Response> {
  if (!configuredSigningSecret(env)) {
    return jsonResponse({ error: 'Admin authentication is not configured.' }, 503)
  }
  if (!(await authenticateAdminRequest(request, env))) {
    return jsonResponse({ error: 'نشست ورود معتبر نیست یا منقضی شده است.' }, 401)
  }
  if (new URL(request.url).searchParams.get('resource') === 'balance') {
    return jsonResponse({ providerWallet: await getDanteWallet(env) })
  }
  try {
    return await handleGet(request, env)
  } catch (error) {
    console.error('Admin dashboard data request failed.', error)
    return jsonResponse({ error: 'دریافت اطلاعات پنل مدیریت ناموفق بود.' }, 500)
  }
}

export async function onRequestPost({
  request,
  env,
}: AdminContext): Promise<Response> {
  if (!env.NOBULL_SETTINGS) {
    return jsonResponse({ error: 'NOBULL_SETTINGS KV is not configured.' }, 503)
  }
  if (!configuredSigningSecret(env)) {
    return jsonResponse({ error: 'Admin authentication is not configured.' }, 503)
  }
  const body = await parseRequestBody(request)
  if (!body) return jsonResponse({ error: 'درخواست JSON معتبر نیست.' }, 400)
  const action = body.action
  const key = `nobull:admin:login:${await ipKey(request)}`

  if (action === 'request-otp') {
    const lockRemaining = await checkLocked(env, key)
    if (lockRemaining > 0) {
      return jsonResponse(
        { error: 'به‌دلیل تلاش‌های ناموفق، ورود موقتاً مسدود است.' },
        429,
      )
    }
    try {
      await issueOtp(env, key)
      return jsonResponse({ ok: true, message: 'کد ورود به تلگرام مدیر ارسال شد.' })
    } catch (error) {
      console.error('Admin Telegram OTP could not be issued.', error)
      return jsonResponse({ error: 'ارسال کد ورود ناموفق بود.' }, 503)
    }
  }

  if (action === 'login') {
    const remaining = await checkLocked(env, key)
    if (remaining > 0) {
      return jsonResponse(
        { error: 'به‌دلیل تلاش‌های ناموفق، ورود موقتاً مسدود است.' },
        429,
      )
    }
    const secret = configuredSigningSecret(env)!
    let valid = false
    if (body.method === 'password' && typeof body.password === 'string') {
      const supplied = new TextEncoder().encode(body.password.slice(0, 4096))
      const expected = new TextEncoder().encode(env.ADMIN_PANEL_PASSWORD || env.TELEGRAM_WEBHOOK_SECRET || '')
      valid = constantTimeEqual(supplied, expected)
    } else if (body.method === 'otp' && typeof body.code === 'string') {
      const stored = await env.NOBULL_SETTINGS.get<OtpRecord>(`nobull:admin:otp:${key}`, 'json')
      await env.NOBULL_SETTINGS.delete(`nobull:admin:otp:${key}`)
      const code = body.code.replace(/[^\d]/g, '')
      if (stored && stored.expiresAt > Date.now() && /^\d{6}$/.test(code)) {
        const digest = new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)),
        )
        valid = constantTimeEqual(digest, fromBase64Url(stored.digest) ?? new Uint8Array())
      }
    }
    if (!valid) {
      try {
        const result = await recordFailedLogin(env, request, key)
        return jsonResponse(
          {
            error: result.locked
              ? 'پنج تلاش ناموفق؛ ورود برای ۱۵ دقیقه مسدود شد.'
              : 'اطلاعات ورود صحیح نیست.',
          },
          result.locked ? 429 : 401,
        )
      } catch (error) {
        console.error('Admin failed-login tracking failed.', error)
        return jsonResponse({ error: 'ثبت تلاش ورود ناموفق بود.' }, 503)
      }
    }
    await env.NOBULL_SETTINGS.delete(key)
    await env.NOBULL_SETTINGS.delete(`nobull:admin:otp:${key}`)
    const token = await issueSession(secret)
    return jsonResponse({ token, expiresIn: SESSION_TTL_SECONDS })
  }

  if (!(await authenticateAdminRequest(request, env))) {
    return jsonResponse({ error: 'نشست ورود معتبر نیست یا منقضی شده است.' }, 401)
  }

  if (action === 'adjust-wallet') {
    const chatId = typeof body.chatId === 'string' ? body.chatId : ''
    const amountToman = body.amountToman
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim()
        : 'تعدیل موجودی توسط مدیر'
    if (
      !/^\d{1,20}$/.test(chatId) ||
      typeof amountToman !== 'number' ||
      !Number.isSafeInteger(amountToman) ||
      amountToman === 0 ||
      Math.abs(amountToman) > 1_000_000_000 ||
      reason.length > 200
    ) {
      return jsonResponse({ error: 'شناسه کاربر یا مبلغ تعدیل کیف پول معتبر نیست.' }, 400)
    }
    try {
      const result = await changeUserWallet(
        env,
        chatId,
        amountToman,
        `admin:${crypto.randomUUID()}`,
        reason,
      )
      if (result.status === 'insufficient') {
        return jsonResponse({ error: 'موجودی کیف پول برای این کاهش کافی نیست.' }, 409)
      }
      return jsonResponse({ ok: true, wallet: result.wallet })
    } catch (error) {
      console.error('Admin wallet adjustment failed.', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return jsonResponse(
        {
          error: env.NOBULL_WALLET_DB
            ? 'تعدیل کیف پول انجام نشد.'
            : 'پایگاه داده کیف پول پیکربندی نشده است.',
        },
        env.NOBULL_WALLET_DB ? 500 : 503,
      )
    }
  }

  if (action === 'save-pricing') {
    const settings = validatePricing(body)
    if (!settings) {
      return jsonResponse({ error: 'اطلاعات قیمت‌گذاری یا حاشیه سود معتبر نیست.' }, 400)
    }
    try {
      await writeAdminSettings(env, {
        ...(await readAdminSettings(env)),
        ...settings,
      })
      return jsonResponse({ ok: true, message: 'تنظیمات ذخیره شد؛ نسخه کاتالوگ بعدی تازه‌سازی می‌شود.' })
    } catch (error) {
      console.error('Admin pricing settings could not be saved.', error)
      return jsonResponse({ error: 'ذخیره تنظیمات قیمت‌گذاری ناموفق بود.' }, 500)
    }
  }

  if (
    action === 'save-product-override' ||
    action === 'reset-product-pricing' ||
    action === 'set-product-flag'
  ) {
    const productId = typeof body.productId === 'string' ? body.productId : ''
    if (!/^[a-z0-9-]{1,16}--[a-zA-Z0-9_-]{1,60}$/i.test(productId)) {
      return jsonResponse({ error: 'شناسه محصول معتبر نیست.' }, 400)
    }

    const stored = await readAdminSettings(env)
    const overrides = { ...(stored.productOverrides ?? {}) }
    const override = { ...(overrides[productId] ?? {}) }

    if (action === 'reset-product-pricing') {
      delete override.customMarginPercent
      delete override.customPriceToman
    } else if (action === 'set-product-flag') {
      if (
        (body.flag !== 'featured' && body.flag !== 'hidden') ||
        typeof body.value !== 'boolean'
      ) {
        return jsonResponse({ error: 'تنظیم نمایان‌بودن یا پیشنهاد ویژه معتبر نیست.' }, 400)
      }
      override[body.flag] = body.value
    } else {
      const customMarginPercent = body.customMarginPercent
      const customPriceToman = body.customPriceToman
      const hasMargin = Object.hasOwn(body, 'customMarginPercent')
      const hasPrice = Object.hasOwn(body, 'customPriceToman')
      if (!hasMargin && !hasPrice) {
        return jsonResponse({ error: 'درصد سود یا قیمت فروش معتبر نیست.' }, 400)
      }
      if (hasMargin) {
        if (
          typeof customMarginPercent !== 'number' ||
          !Number.isFinite(customMarginPercent) ||
          customMarginPercent < 0 ||
          customMarginPercent > 1000
        ) {
          return jsonResponse({ error: 'درصد سود یا قیمت فروش معتبر نیست.' }, 400)
        }
        override.customMarginPercent = customMarginPercent
      }
      if (hasPrice) {
        if (
          typeof customPriceToman !== 'number' ||
          !Number.isFinite(customPriceToman) ||
          customPriceToman < 1000 ||
          customPriceToman > 1_000_000_000
        ) {
          return jsonResponse({ error: 'درصد سود یا قیمت فروش معتبر نیست.' }, 400)
        }
        override.customPriceToman = customPriceToman
      }
    }

    if (Object.keys(override).length) overrides[productId] = override
    else delete overrides[productId]

    try {
      await writeAdminSettings(env, { ...stored, productOverrides: overrides })
      return jsonResponse({ ok: true })
    } catch (error) {
      console.error('Admin product pricing override could not be saved.', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return jsonResponse({ error: 'ذخیره تنظیم محصول ناموفق بود.' }, 500)
    }
  }

  if (action === 'save-discount') {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    const type: PromoCode['type'] | null =
      body.type === 'percent' || body.type === 'fixed_toman'
        ? body.type
        : null
    const value = body.value
    const maxUses = body.maxUses
    const active = body.active
    const expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt.trim() : ''
    const description =
      typeof body.description === 'string' ? body.description.trim() : ''
    if (
      !/^[A-Z0-9_-]{2,20}$/.test(code) ||
      type === null ||
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      (type === 'percent' && value > 100) ||
      value > 1_000_000_000 ||
      typeof maxUses !== 'number' ||
      !Number.isInteger(maxUses) ||
      maxUses < 1 ||
      maxUses > 1_000_000 ||
      typeof active !== 'boolean' ||
      (expiresAt !== '' && !Number.isFinite(Date.parse(expiresAt))) ||
      description.length > 120
    ) {
      return jsonResponse({ error: 'اطلاعات کد تخفیف معتبر نیست.' }, 400)
    }
    try {
      const stored = await readAdminSettings(env)
      const codes = [...(stored.discountCodes ?? [])]
      const existingIndex = codes.findIndex(
        (item) => item.code.toUpperCase() === code,
      )
      const usedCount = existingIndex >= 0 ? codes[existingIndex].usedCount : 0
      if (maxUses < usedCount) {
        return jsonResponse(
          { error: 'سقف استفاده نمی‌تواند کمتر از تعداد مصرف‌شده باشد.' },
          400,
        )
      }
      const updated = {
        code,
        type,
        value,
        maxUses,
        usedCount,
        active,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        ...(description ? { description } : {}),
      }
      if (existingIndex >= 0) codes[existingIndex] = updated
      else codes.push(updated)
      await writeAdminSettings(env, { ...stored, discountCodes: codes })
      return jsonResponse({ ok: true, discountCode: updated })
    } catch (error) {
      console.error('Admin discount code could not be saved.', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return jsonResponse({ error: 'ذخیره کد تخفیف ناموفق بود.' }, 500)
    }
  }

  if (action === 'delete-discount') {
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
      return jsonResponse({ error: 'کد تخفیف معتبر نیست.' }, 400)
    }
    try {
      const stored = await readAdminSettings(env)
      const discountCodes = (stored.discountCodes ?? []).filter(
        (item) => item.code.toUpperCase() !== code,
      )
      await writeAdminSettings(env, { ...stored, discountCodes })
      return jsonResponse({ ok: true })
    } catch (error) {
      console.error('Admin discount code could not be deleted.', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return jsonResponse({ error: 'حذف کد تخفیف ناموفق بود.' }, 500)
    }
  }

  if (action === 'send_broadcast') {
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const audience = body.audience
    const buttonText =
      typeof body.buttonText === 'string' ? body.buttonText.trim() : ''
    const buttonUrl =
      typeof body.buttonUrl === 'string' ? body.buttonUrl.trim() : ''
    let button: { text: string; url: string } | undefined
    if (
      !message ||
      message.length > 4096 ||
      (audience !== 'all' && audience !== 'buyers') ||
      (Boolean(buttonText) !== Boolean(buttonUrl)) ||
      buttonText.length > 64
    ) {
      return jsonResponse({ error: 'متن، مخاطبان یا دکمه پیام معتبر نیست.' }, 400)
    }
    if (buttonText) {
      try {
        const url = new URL(buttonUrl)
        if (url.protocol !== 'https:' || url.username || url.password) {
          return jsonResponse({ error: 'لینک دکمه باید یک نشانی HTTPS معتبر باشد.' }, 400)
        }
        button = { text: buttonText, url: url.toString() }
      } catch {
        return jsonResponse({ error: 'لینک دکمه معتبر نیست.' }, 400)
      }
    }
    try {
      const result = await sendCustomBroadcast(env, {
        message,
        audience,
        ...(button ? { button } : {}),
      })
      return jsonResponse(result)
    } catch (error) {
      console.error('Admin custom broadcast could not be sent.', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return jsonResponse({ error: 'ارسال پیام همگانی ناموفق بود.' }, 500)
    }
  }

  if (action === 'decide-order') {
    const orderId = typeof body.orderId === 'string' ? body.orderId : ''
    const decision = body.decision
    if (decision !== 'approve' && decision !== 'reject') {
      return jsonResponse({ error: 'تصمیم سفارش معتبر نیست.' }, 400)
    }
    try {
      const order = await decideStoredOrder(env, orderId, decision)
      return jsonResponse({ ok: true, order })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'تصمیم‌گیری برای سفارش ناموفق بود.'
      const notFound = /not found/i.test(message)
      const conflict = /no longer pending|not a private user/i.test(message)
      return jsonResponse(
        {
          error: notFound
            ? 'سفارش پیدا نشد.'
            : conflict
              ? 'سفارش دیگر در وضعیت قابل‌بررسی نیست.'
              : 'عملیات سفارش ناموفق بود؛ وضعیت تأمین‌کننده را بررسی کنید.',
        },
        notFound ? 404 : conflict ? 409 : 502,
      )
    }
  }

  return jsonResponse({ error: 'عملیات پنل شناخته‌شده نیست.' }, 400)
}
