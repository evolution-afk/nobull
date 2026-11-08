import { authenticateAdminRequest } from '../admin'
import type {
  BackendEnvironment,
  D1Database,
  D1PreparedStatement,
} from '../_shared/settings'

interface MigrateVpnContext {
  request: Request
  env: BackendEnvironment
}

interface LegacyUser {
  telegramId: number
  username: string | null
  firstName: string | null
  lastName: string | null
  balanceToman: number
}

interface LegacySubscription {
  telegramId: number
  planId: string
  status: string
  startDate: string | null
  expiryDate: string | null
  quotaLimitGb: number
  quotaUsedGb: number
  radiusUsername: string
  radiusPassword: string
  serverCode: string | null
}

/** Statements per D1 transaction; keeps batches well below the request limits. */
const STATEMENT_CHUNK_SIZE = 100
/** Rows per `telegram_id IN (…)` lookup. */
const LOOKUP_CHUNK_SIZE = 90
const MAX_LEGACY_ROWS = 20000
const LEGACY_PLAN_FALLBACK = 'legacy'
const DEFAULT_SERVER_CODE = '49'

/**
 * `wallets` is defined in schema.sql but has no dedicated migration, so a fresh
 * database may be missing it. Creating it keeps the balance mirror reliable.
 */
const ENSURE_WALLETS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    balance REAL NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`

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

/** Returns the first non-empty string/number value among the given aliases. */
function pickString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

/** Returns the first value that parses to a finite number among the aliases. */
function pickNumber(
  row: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = row[key]
    if (value === null || value === undefined || value === '') continue
    const parsed =
      typeof value === 'number' ? value : Number(String(value).trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function pickTelegramId(
  row: Record<string, unknown>,
  keys: string[],
): number | null {
  const raw = pickString(row, keys)
  if (!/^\d{1,19}$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/** Normalizes MySQL DATETIME strings and epoch numbers into SQLite text. */
function pickDate(
  row: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return new Date(value > 1e12 ? value : value * 1000).toISOString()
    }
  }
  return null
}

function normalizeLegacyUser(value: unknown): LegacyUser | null {
  const row = asRecord(value)
  const telegramId = pickTelegramId(row, [
    'telegram_id',
    'telegramId',
    'chat_id',
    'chatId',
    'user_id',
    'userId',
    'id',
  ])
  if (telegramId === null) return null
  const balance =
    pickNumber(row, ['balance', 'balance_toman', 'wallet_balance', 'credit']) ??
    0
  return {
    telegramId,
    username: pickString(row, ['username', 'user_name', 'tg_username']) || null,
    firstName: pickString(row, ['first_name', 'firstName', 'name']) || null,
    lastName: pickString(row, ['last_name', 'lastName']) || null,
    // The wallet ledger enforces a non-negative balance.
    balanceToman: Math.max(0, balance),
  }
}

function normalizeLegacySubscription(value: unknown): LegacySubscription | null {
  const row = asRecord(value)
  const telegramId = pickTelegramId(row, [
    'customer_id',
    'customerId',
    'telegram_id',
    'telegramId',
    'user_id',
    'userId',
    'chat_id',
    'chatId',
  ])
  if (telegramId === null) return null
  const quotaLimit =
    pickNumber(row, [
      'quota_limit_gb',
      'quotaLimitGb',
      'quota_gb',
      'quotaGb',
      'data_limit_gb',
      'traffic_gb',
      'volume_gb',
    ]) ?? 0
  const quotaUsed =
    pickNumber(row, [
      'quota_used_gb',
      'quotaUsedGb',
      'used_gb',
      'usedGb',
      'usage_gb',
    ]) ?? 0
  return {
    telegramId,
    planId:
      pickString(row, ['plan_id', 'planId', 'plan_code', 'planCode', 'plan']) ||
      LEGACY_PLAN_FALLBACK,
    status:
      pickString(row, ['status', 'subscription_status', 'subscriptionStatus']) ||
      'active',
    startDate: pickDate(row, ['start_date', 'startDate', 'created_at', 'createdAt']),
    expiryDate: pickDate(row, [
      'expiry_date',
      'expiryDate',
      'expire_date',
      'expireDate',
      'expires_at',
      'expiresAt',
      'expiration_date',
    ]),
    quotaLimitGb: Math.max(0, Math.round(quotaLimit)),
    quotaUsedGb: Math.max(0, quotaUsed),
    radiusUsername: pickString(row, [
      'radius_username',
      'radiusUsername',
      'username',
      'user',
    ]),
    radiusPassword: pickString(row, [
      'radius_password',
      'radiusPassword',
      'password',
      'pass',
    ]),
    serverCode:
      pickString(row, ['server_code', 'serverCode', 'server']) || null,
  }
}

/** Runs statements in chunked transactions and sums the affected rows. */
async function runStatementChunks(
  database: D1Database,
  statements: D1PreparedStatement[],
): Promise<number> {
  let changes = 0
  for (let index = 0; index < statements.length; index += STATEMENT_CHUNK_SIZE) {
    const chunk = statements.slice(index, index + STATEMENT_CHUNK_SIZE)
    if (!chunk.length) continue
    const results = await database.batch(chunk)
    for (const result of results) changes += result.meta.changes ?? 0
  }
  return changes
}

async function fetchExistingTelegramIds(
  database: D1Database,
  telegramIds: number[],
): Promise<Set<number>> {
  const existing = new Set<number>()
  for (let index = 0; index < telegramIds.length; index += LOOKUP_CHUNK_SIZE) {
    const chunk = telegramIds.slice(index, index + LOOKUP_CHUNK_SIZE)
    const placeholders = chunk.map(() => '?').join(', ')
    const result = await database
      .prepare(`SELECT telegram_id FROM users WHERE telegram_id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ telegram_id: number }>()
    for (const row of result.results) existing.add(Number(row.telegram_id))
  }
  return existing
}

/**
 * POST /api/admin/migrate-vpn
 *
 * One-time import of legacy cPanel MySQL users and VPN subscriptions into the
 * D1 `NOBULL_WALLET_DB`. Secured with the same signed Bearer admin session as
 * the rest of `/api/admin`. Send `{ legacy_users: [...], legacy_subscriptions:
 * [...] }`; entries are matched to D1 users through their Telegram id, so a
 * legacy `customer_id` is interpreted as a Telegram id.
 */
export async function onRequestPost({
  request,
  env,
}: MigrateVpnContext): Promise<Response> {
  const database = env.NOBULL_WALLET_DB
  if (!database) {
    return jsonResponse({ error: 'NOBULL_WALLET_DB is not configured.' }, 503)
  }
  if (!(await authenticateAdminRequest(request, env))) {
    return jsonResponse({ error: 'نشست ورود معتبر نیست یا منقضی شده است.' }, 401)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'درخواست JSON معتبر نیست.' }, 400)
  }
  const body = asRecord(payload)
  const rawUsers = body.legacy_users
  const rawSubscriptions = body.legacy_subscriptions
  if (!Array.isArray(rawUsers) && !Array.isArray(rawSubscriptions)) {
    return jsonResponse(
      { error: 'درخواست باید آرایه‌های legacy_users یا legacy_subscriptions را داشته باشد.' },
      400,
    )
  }
  const userRows = Array.isArray(rawUsers) ? rawUsers : []
  const subscriptionRows = Array.isArray(rawSubscriptions)
    ? rawSubscriptions
    : []
  if (userRows.length + subscriptionRows.length > MAX_LEGACY_ROWS) {
    return jsonResponse(
      { error: `حجم داده از حد مجاز (${MAX_LEGACY_ROWS} ردیف) بیشتر است.` },
      413,
    )
  }

  const users = new Map<number, LegacyUser>()
  for (const row of userRows) {
    const user = normalizeLegacyUser(row)
    if (user && !users.has(user.telegramId)) users.set(user.telegramId, user)
  }
  const subscriptions = subscriptionRows
    .map(normalizeLegacySubscription)
    .filter((item): item is LegacySubscription => item !== null)

  try {
    await database.prepare(ENSURE_WALLETS_TABLE_SQL).run()

    const legacyUsers = [...users.values()]
    const existingIds = await fetchExistingTelegramIds(
      database,
      legacyUsers.map((user) => user.telegramId),
    )

    const userStatements = legacyUsers
      .filter((user) => !existingIds.has(user.telegramId))
      .map((user) =>
        database
          .prepare(
            `INSERT OR IGNORE INTO users
               (telegram_id, username, first_name, last_name, status)
             VALUES (?, ?, ?, ?, 'active')`,
          )
          .bind(user.telegramId, user.username, user.firstName, user.lastName),
      )

    // Wallets are keyed by the D1 user id, resolved through the Telegram id so
    // the generated autoincrement value never has to be read back.
    const now = Date.now()
    const walletStatements: D1PreparedStatement[] = []
    for (const user of legacyUsers) {
      walletStatements.push(
        database
          .prepare(
            `INSERT INTO wallets (user_id, balance, updated_at)
             SELECT id, ?, CURRENT_TIMESTAMP FROM users WHERE telegram_id = ?
             ON CONFLICT(user_id) DO NOTHING`,
          )
          .bind(user.balanceToman, user.telegramId),
      )
      if (user.balanceToman > 0) {
        walletStatements.push(
          database
            .prepare(
              `INSERT INTO nobull_wallet_accounts
                 (chat_id, balance_toman, total_spent_toman, orders_count, updated_at)
               VALUES (?, ?, 0, 0, ?)
               ON CONFLICT(chat_id) DO NOTHING`,
            )
            .bind(String(user.telegramId), Math.round(user.balanceToman), now),
        )
      }
    }

    const subscriptionStatements = subscriptions.map((subscription) => {
      const username = subscription.radiusUsername || null
      return database
        .prepare(
          `INSERT INTO subscriptions
             (customer_id, plan_id, status, start_date, expiry_date,
              quota_limit_gb, quota_used_gb, radius_username, radius_password,
              server_code, provision_status)
           SELECT u.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported'
           FROM users u
           WHERE u.telegram_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM subscriptions s
               WHERE s.customer_id = u.id AND s.radius_username IS ?
             )`,
        )
        .bind(
          subscription.planId,
          subscription.status,
          subscription.startDate,
          subscription.expiryDate,
          subscription.quotaLimitGb,
          subscription.quotaUsedGb,
          username,
          subscription.radiusPassword || null,
          subscription.serverCode ?? DEFAULT_SERVER_CODE,
          subscription.telegramId,
          username,
        )
    })

    const usersMigrated = await runStatementChunks(database, userStatements)
    await runStatementChunks(database, walletStatements)
    const subscriptionsMigrated = await runStatementChunks(
      database,
      subscriptionStatements,
    )

    return jsonResponse({
      ok: true,
      users_migrated: usersMigrated,
      subscriptions_migrated: subscriptionsMigrated,
    })
  } catch (error) {
    console.error('VPN legacy migration failed.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonResponse({ error: 'مهاجرت داده‌های وی‌پی‌ان ناموفق بود.' }, 500)
  }
}
