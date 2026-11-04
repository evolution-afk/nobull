export interface SettingsKV {
  get<T>(key: string, type: 'json'): Promise<T | null>
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>
  delete(key: string): Promise<void>
  list?(options?: {
    prefix?: string
    cursor?: string
  }): Promise<{
    keys: Array<{ name: string }>
    list_complete: boolean
    cursor?: string
  }>
}

export interface WalletDatabaseStatement {
  bind(...values: Array<string | number>): WalletDatabaseStatement
  first<T>(): Promise<T | null>
  all<T>(): Promise<{ results: T[] }>
  run(): Promise<{
    success: boolean
    meta: { changes?: number }
  }>
}

export interface WalletDatabase {
  prepare(query: string): WalletDatabaseStatement
  batch(
    statements: WalletDatabaseStatement[],
  ): Promise<Array<{ success: boolean; meta: { changes?: number } }>>
}

export interface UserWallet {
  chatId: string
  balanceToman: number
  totalSpentToman: number
  ordersCount: number
}

export type WalletChangeResult =
  | { status: 'updated'; wallet: UserWallet }
  | { status: 'insufficient'; wallet: UserWallet }
  | { status: 'duplicate'; wallet: UserWallet }

export interface EncryptedDelivery {
  iv: string
  ciphertext: string
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
  usdtMode?: 'auto' | 'manual'
  fixedFeeToman?: number
  cardNumber?: string
  cardHolder?: string
  activeProviderId?: string
  productOverrides?: Record<string, ProductOverride>
  discountCodes?: PromoCode[]
  updatedAt?: number
}

export interface ProductOverride {
  customMarginPercent?: number
  customPriceToman?: number
  featured?: boolean
  hidden?: boolean
}

export interface PromoCode {
  code: string
  type: 'percent' | 'fixed_toman'
  value: number
  maxUses: number
  usedCount: number
  active: boolean
  expiresAt?: string
  description?: string
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
  ADMIN_PANEL_PASSWORD?: string
  TELEGRAM_WEBHOOK_SECRET?: string
  TELEGRAM_ADMIN_CHAT_ID?: string
  TELEGRAM_BOT_TOKEN?: string
  NOBULL_WALLET_DB?: WalletDatabase
  VAULT_ENCRYPTION_KEY?: string
}

export type OrderStatus =
  | 'pending_receipt'
  | 'waiting_review'
  | 'completed'
  | 'rejected'
  | 'processing'

export interface StoredOrder {
  orderId: string
  createdAt: number
  updatedAt: number
  status: OrderStatus
  paymentMethod?: 'receipt' | 'wallet'
  userId: string
  username: string
  firstName: string
  productId: string
  productTitle: string
  productDescription?: string
  productWarrantySource?: string
  deliveredCredentials?: EncryptedDelivery
  brand: string
  provider: string
  priceUsd: number
  usdtRate: number
  appliedMarginPercent: number
  priceToman: number
  estimatedProfitToman: number
  discountCode?: string
  discountToman?: number
  reference: string
  completedAt?: number
}

export interface StoredCustomer {
  chatId: string
  username: string
  firstName: string
  firstSeenAt: number
  lastActiveAt: number
  totalOrders: number
  completedOrders: number
  totalSpentToman: number
}

const SETTINGS_KEY = 'nobull:admin-settings:v1'

export const DEFAULT_PROFIT_MARGIN_TIERS = [
  { minUsd: 0, maxUsd: 1, percent: 150 },
  { minUsd: 1, maxUsd: 2, percent: 100 },
  { minUsd: 2, maxUsd: 3, percent: 90 },
  { minUsd: 3, maxUsd: 5, percent: 80 },
  { minUsd: 5, maxUsd: 8, percent: 70 },
  { minUsd: 8, maxUsd: 12, percent: 60 },
  { minUsd: 12, maxUsd: null, percent: 50 },
] as const

function walletFromRow(
  chatId: string,
  row: {
    balance_toman: number
    total_spent_toman: number
    orders_count: number
  } | null,
): UserWallet {
  return {
    chatId,
    balanceToman: Number(row?.balance_toman ?? 0),
    totalSpentToman: Number(row?.total_spent_toman ?? 0),
    ordersCount: Number(row?.orders_count ?? 0),
  }
}

export async function getUserWallet(
  env: BackendEnvironment,
  chatId: string | number,
): Promise<UserWallet> {
  if (!env.NOBULL_WALLET_DB) {
    throw new Error('NOBULL_WALLET_DB D1 binding is not configured.')
  }
  const id = String(chatId)
  const row = await env.NOBULL_WALLET_DB.prepare(
    `SELECT balance_toman, total_spent_toman, orders_count
     FROM nobull_wallet_accounts WHERE chat_id = ?`,
  )
    .bind(id)
    .first<{
      balance_toman: number
      total_spent_toman: number
      orders_count: number
    }>()
  return walletFromRow(id, row)
}

export async function getUserWallets(
  env: BackendEnvironment,
  chatIds: string[],
): Promise<Map<string, UserWallet>> {
  if (!env.NOBULL_WALLET_DB) {
    return new Map(
      chatIds.map((chatId) => [
        chatId,
        walletFromRow(chatId, null),
      ]),
    )
  }
  const wallets = new Map<string, UserWallet>()
  for (let index = 0; index < chatIds.length; index += 90) {
    const batch = chatIds.slice(index, index + 90)
    if (!batch.length) continue
    const placeholders = batch.map(() => '?').join(', ')
    const result = await env.NOBULL_WALLET_DB.prepare(
      `SELECT chat_id, balance_toman, total_spent_toman, orders_count
       FROM nobull_wallet_accounts WHERE chat_id IN (${placeholders})`,
    )
      .bind(...batch)
      .all<{
        chat_id: string
        balance_toman: number
        total_spent_toman: number
        orders_count: number
      }>()
    for (const row of result.results) {
      wallets.set(row.chat_id, walletFromRow(row.chat_id, row))
    }
  }
  for (const chatId of chatIds) {
    if (!wallets.has(chatId)) wallets.set(chatId, walletFromRow(chatId, null))
  }
  return wallets
}

export async function changeUserWallet(
  env: BackendEnvironment,
  chatId: string | number,
  amountToman: number,
  reference: string,
  reason: string,
): Promise<WalletChangeResult> {
  const database = env.NOBULL_WALLET_DB
  if (!database) {
    throw new Error('NOBULL_WALLET_DB D1 binding is not configured.')
  }
  if (
    !/^\d+$/.test(String(chatId)) ||
    !Number.isSafeInteger(amountToman) ||
    amountToman === 0 ||
    Math.abs(amountToman) > 1_000_000_000 ||
    !/^[A-Za-z0-9:_-]{1,120}$/.test(reference) ||
    reason.length > 200
  ) {
    throw new Error('Wallet transaction details are invalid.')
  }
  const id = String(chatId)
  const now = Date.now()
  const accountUpdate =
    amountToman > 0
      ? database
          .prepare(
            `INSERT INTO nobull_wallet_accounts
             (chat_id, balance_toman, total_spent_toman, orders_count, updated_at)
             VALUES (?, ?, 0, 0, ?)
             ON CONFLICT(chat_id) DO UPDATE SET
               balance_toman = balance_toman + excluded.balance_toman,
               updated_at = excluded.updated_at`,
          )
          .bind(id, amountToman, now)
      : database
          .prepare(
            `UPDATE nobull_wallet_accounts
             SET balance_toman = balance_toman + ?, updated_at = ?
             WHERE chat_id = ? AND balance_toman + ? >= 0`,
          )
          .bind(amountToman, now, id, amountToman)
  try {
    const results = await database.batch([
      accountUpdate,
      database
        .prepare(
          `INSERT INTO nobull_wallet_transactions
           (chat_id, delta_toman, reference, reason, created_at)
           SELECT ?, ?, ?, ?, ? WHERE changes() = 1`,
        )
        .bind(id, amountToman, reference, reason, now),
    ])
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      return { status: 'insufficient', wallet: await getUserWallet(env, id) }
    }
    return { status: 'updated', wallet: await getUserWallet(env, id) }
  } catch (error) {
    const existing = await database
      .prepare(
        'SELECT chat_id FROM nobull_wallet_transactions WHERE reference = ?',
      )
      .bind(reference)
      .first<{ chat_id: string }>()
    if (existing) {
      return { status: 'duplicate', wallet: await getUserWallet(env, id) }
    }
    throw error
  }
}

export async function recordWalletPurchase(
  env: BackendEnvironment,
  chatId: string | number,
  amountToman: number,
  orderId: string,
): Promise<WalletChangeResult> {
  const database = env.NOBULL_WALLET_DB
  if (!database) {
    throw new Error('NOBULL_WALLET_DB D1 binding is not configured.')
  }
  if (
    !Number.isSafeInteger(amountToman) ||
    amountToman <= 0 ||
    amountToman > 1_000_000_000 ||
    !/^[a-f0-9-]{16,64}$/i.test(orderId)
  ) {
    throw new Error('Wallet purchase details are invalid.')
  }
  const id = String(chatId)
  const now = Date.now()
  try {
    const results = await database.batch([
      database
        .prepare(
          `UPDATE nobull_wallet_accounts
           SET balance_toman = balance_toman - ?,
               total_spent_toman = total_spent_toman + ?,
               orders_count = orders_count + 1,
               updated_at = ?
           WHERE chat_id = ? AND balance_toman >= ?`,
        )
        .bind(amountToman, amountToman, now, id, amountToman),
      database
        .prepare(
          `INSERT INTO nobull_wallet_transactions
           (chat_id, delta_toman, reference, reason, created_at)
           SELECT ?, ?, ?, 'purchase', ? WHERE changes() = 1`,
        )
        .bind(id, -amountToman, `purchase:${orderId}`, now),
    ])
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      return { status: 'insufficient', wallet: await getUserWallet(env, id) }
    }
    return { status: 'updated', wallet: await getUserWallet(env, id) }
  } catch (error) {
    const existing = await database
      .prepare(
        'SELECT chat_id FROM nobull_wallet_transactions WHERE reference = ?',
      )
      .bind(`purchase:${orderId}`)
      .first<{ chat_id: string }>()
    if (existing) {
      return { status: 'duplicate', wallet: await getUserWallet(env, id) }
    }
    throw error
  }
}

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

const ORDER_PREFIX = 'nobull:order:'
const ORDER_REFERENCE_PREFIX = 'nobull:order-reference:'
const CUSTOMER_PREFIX = 'nobull:customer:'

export async function saveOrder(
  env: BackendEnvironment,
  order: StoredOrder,
): Promise<void> {
  if (!env.NOBULL_SETTINGS) {
    throw new Error('Configure NOBULL_SETTINGS KV before recording orders.')
  }
  await env.NOBULL_SETTINGS.put(
    `${ORDER_PREFIX}${order.orderId}`,
    JSON.stringify(order),
  )
  await env.NOBULL_SETTINGS.put(
    `${ORDER_REFERENCE_PREFIX}${order.reference}`,
    JSON.stringify(order.orderId),
  )
}

export async function getOrder(
  env: BackendEnvironment,
  orderId: string,
): Promise<StoredOrder | null> {
  if (!env.NOBULL_SETTINGS) {
    throw new Error('Configure NOBULL_SETTINGS KV before reading orders.')
  }
  return env.NOBULL_SETTINGS.get<StoredOrder>(
    `${ORDER_PREFIX}${orderId}`,
    'json',
  )
}

export async function getOrderByReference(
  env: BackendEnvironment,
  reference: string,
): Promise<StoredOrder | null> {
  if (!env.NOBULL_SETTINGS) {
    throw new Error('Configure NOBULL_SETTINGS KV before reading orders.')
  }
  const orderId = await env.NOBULL_SETTINGS.get<string>(
    `${ORDER_REFERENCE_PREFIX}${reference}`,
    'json',
  )
  return orderId ? getOrder(env, orderId) : null
}

export async function listStoredOrders(
  env: BackendEnvironment,
): Promise<StoredOrder[]> {
  if (!env.NOBULL_SETTINGS?.list) {
    throw new Error('NOBULL_SETTINGS KV list support is required for analytics.')
  }
  const orders: StoredOrder[] = []
  let cursor: string | undefined
  do {
    const page = await env.NOBULL_SETTINGS.list({
      prefix: ORDER_PREFIX,
      cursor,
    })
    const values = await Promise.all(
      page.keys.map(({ name }) =>
        env.NOBULL_SETTINGS!.get<StoredOrder>(name, 'json'),
      ),
    )
    orders.push(...values.filter((value): value is StoredOrder => value !== null))
    if (!page.list_complete && !page.cursor) {
      throw new Error('NOBULL_SETTINGS returned an incomplete order page.')
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return orders.sort((left, right) => right.createdAt - left.createdAt)
}

export async function upsertCustomer(
  env: BackendEnvironment,
  chatId: string | number,
  profile: { username?: string; firstName?: string },
  orderDelta?: { totalOrders?: number; completedOrders?: number; totalSpentToman?: number },
): Promise<StoredCustomer> {
  if (!env.NOBULL_SETTINGS) {
    throw new Error('Configure NOBULL_SETTINGS KV before recording customers.')
  }
  const id = String(chatId)
  const key = `${CUSTOMER_PREFIX}${id}`
  const current = await env.NOBULL_SETTINGS.get<StoredCustomer>(key, 'json')
  const now = Date.now()
  const customer: StoredCustomer = {
    chatId: id,
    username: profile.username ?? current?.username ?? '',
    firstName: profile.firstName ?? current?.firstName ?? '',
    firstSeenAt: current?.firstSeenAt ?? now,
    lastActiveAt: now,
    totalOrders: Math.max(0, (current?.totalOrders ?? 0) + (orderDelta?.totalOrders ?? 0)),
    completedOrders: Math.max(
      0,
      (current?.completedOrders ?? 0) + (orderDelta?.completedOrders ?? 0),
    ),
    totalSpentToman: Math.max(
      0,
      (current?.totalSpentToman ?? 0) + (orderDelta?.totalSpentToman ?? 0),
    ),
  }
  await env.NOBULL_SETTINGS.put(key, JSON.stringify(customer))
  return customer
}

export async function listStoredCustomers(
  env: BackendEnvironment,
): Promise<StoredCustomer[]> {
  if (!env.NOBULL_SETTINGS?.list) {
    throw new Error('NOBULL_SETTINGS KV list support is required for analytics.')
  }
  const customers: StoredCustomer[] = []
  let cursor: string | undefined
  do {
    const page = await env.NOBULL_SETTINGS.list({
      prefix: CUSTOMER_PREFIX,
      cursor,
    })
    const values = await Promise.all(
      page.keys.map(({ name }) =>
        env.NOBULL_SETTINGS!.get<StoredCustomer>(name, 'json'),
      ),
    )
    customers.push(
      ...values.filter((value): value is StoredCustomer => value !== null),
    )
    if (!page.list_complete && !page.cursor) {
      throw new Error('NOBULL_SETTINGS returned an incomplete customer page.')
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return customers.sort((left, right) => right.lastActiveAt - left.lastActiveAt)
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
    usdtMode: stored.usdtMode === 'auto' || stored.usdtMode === 'manual'
      ? stored.usdtMode
      : env.USDT_MODE === 'auto'
        ? 'auto'
        : 'manual',
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
  settings: Pick<
    AdminSettings,
    'profitMarginPercent' | 'profitMarginTiers' | 'productOverrides'
  >,
  productId?: string,
): number {
  const override = productId
    ? settings.productOverrides?.[productId]?.customMarginPercent
    : undefined
  if (
    typeof override === 'number' &&
    Number.isFinite(override) &&
    override >= 0 &&
    override <= 1000
  ) {
    return override
  }
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
    | 'profitMarginPercent'
    | 'profitMarginTiers'
    | 'fixedFeeToman'
    | 'productOverrides'
  >,
  productId?: string,
): number {
  const customPrice = productId
    ? settings.productOverrides?.[productId]?.customPriceToman
    : undefined
  if (
    typeof customPrice === 'number' &&
    Number.isFinite(customPrice) &&
    customPrice >= 0
  ) {
    return Math.round(customPrice)
  }
  return (
    Math.ceil(
      (priceUsd *
        usdtRate *
        (1 + getProfitMarginPercent(priceUsd, settings, productId) / 100) +
        (settings.fixedFeeToman ?? 0)) /
        1000,
    ) * 1000
  )
}

export function findActiveDiscountCode(
  codes: PromoCode[] | undefined,
  input: string,
  now = Date.now(),
): PromoCode | null {
  const code = input.trim().toUpperCase()
  if (!code) return null
  const match = codes?.find(
    (candidate) =>
      candidate.code.toUpperCase() === code &&
      candidate.active &&
      candidate.usedCount < candidate.maxUses &&
      (!candidate.expiresAt || Date.parse(candidate.expiresAt) > now),
  )
  if (
    !match ||
    !Number.isFinite(match.value) ||
    match.value <= 0 ||
    (match.type === 'percent' && match.value > 100)
  ) {
    return null
  }
  return match
}

export function applyDiscountToPrice(
  priceToman: number,
  discount: PromoCode,
): number {
  const discountToman =
    discount.type === 'percent'
      ? Math.round((priceToman * discount.value) / 100)
      : Math.round(discount.value)
  return Math.max(0, priceToman - discountToman)
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
    settings.usdtMode ?? '',
    settings.fixedFeeToman ?? 0,
    settings.activeProviderId ?? '',
    JSON.stringify(settings.productOverrides ?? {}),
  ].join('-')
}
