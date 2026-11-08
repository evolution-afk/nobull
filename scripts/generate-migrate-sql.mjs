import { readFile, writeFile } from 'node:fs/promises'

const INPUT_FILE = new URL('../migrate.json', import.meta.url)
const OUTPUT_FILE = new URL('../migrate.sql', import.meta.url)
const MAX_LEGACY_ROWS = 20_000
const DEFAULT_PLAN_ID = 'legacy'
const DEFAULT_SERVER_CODE = '49'

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function pickString(row, keys) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function pickNumber(row, keys) {
  for (const key of keys) {
    const value = row[key]
    if (value === null || value === undefined || value === '') continue
    const parsed = typeof value === 'number' ? value : Number(String(value).trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function pickTelegramId(row, keys) {
  const raw = pickString(row, keys)
  if (!/^\d{1,19}$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function pickDate(row, keys) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      const date = new Date(value > 1e12 ? value : value * 1000)
      if (!Number.isFinite(date.getTime())) {
        throw new Error(`Invalid timestamp in field "${key}".`)
      }
      return date.toISOString()
    }
  }
  return null
}

function sql(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot write a non-finite SQL number.')
    return String(value)
  }
  return `'${String(value).replaceAll("'", "''")}'`
}

function normalizeUser(value) {
  const row = record(value)
  const telegramId = pickTelegramId(row, [
    'telegram_id', 'telegramId', 'chat_id', 'chatId', 'user_id', 'userId', 'id',
  ])
  if (telegramId === null) return null
  return {
    telegramId,
    username: pickString(row, ['username', 'user_name', 'tg_username']) || null,
    firstName: pickString(row, ['first_name', 'firstName', 'name']) || null,
    lastName: pickString(row, ['last_name', 'lastName']) || null,
    balanceToman: Math.max(
      0,
      pickNumber(row, ['balance', 'balance_toman', 'wallet_balance', 'credit']) ?? 0,
    ),
  }
}

function normalizeSubscription(value, legacyUserIds) {
  const row = record(value)
  const customerId = pickString(row, ['customer_id', 'customerId'])
  const telegramId = customerId
    ? legacyUserIds.get(customerId) ?? null
    : pickTelegramId(row, [
        'telegram_id', 'telegramId', 'chat_id', 'chatId',
        'user_id', 'userId',
      ])
  if (telegramId === null) return null
  const quotaLimit = pickNumber(row, [
    'quota_limit_gb', 'quotaLimitGb', 'quota_gb', 'quotaGb',
    'data_limit_gb', 'traffic_gb', 'volume_gb',
  ]) ?? 0
  const quotaUsed = pickNumber(row, [
    'quota_used_gb', 'quotaUsedGb', 'used_gb', 'usedGb', 'usage_gb',
  ]) ?? 0

  return {
    telegramId,
    planId: pickString(row, ['plan_id', 'planId', 'plan_code', 'planCode', 'plan']) || DEFAULT_PLAN_ID,
    status: pickString(row, ['status', 'subscription_status', 'subscriptionStatus']) || 'active',
    startDate: pickDate(row, ['start_date', 'startDate', 'created_at', 'createdAt']),
    expiryDate: pickDate(row, [
      'expiry_date', 'expiryDate', 'expire_date', 'expireDate',
      'expires_at', 'expiresAt', 'expiration_date',
    ]),
    quotaLimitGb: Math.max(0, Math.round(quotaLimit)),
    quotaUsedGb: Math.max(0, quotaUsed),
    radiusUsername: pickString(row, ['radius_username', 'radiusUsername', 'username', 'user']),
    radiusPassword: pickString(row, ['radius_password', 'radiusPassword', 'password', 'pass']),
    serverCode: pickString(row, ['server_code', 'serverCode', 'server']) || null,
  }
}

function userSql(user) {
  return [
    `INSERT OR IGNORE INTO users (telegram_id, username, first_name, last_name, status)`,
    `VALUES (${sql(user.telegramId)}, ${sql(user.username)}, ${sql(user.firstName)}, ${sql(user.lastName)}, 'active');`,
    `INSERT INTO wallets (user_id, balance, updated_at)`,
    `SELECT id, ${sql(user.balanceToman)}, CURRENT_TIMESTAMP FROM users WHERE telegram_id = ${sql(user.telegramId)}`,
    `ON CONFLICT(user_id) DO NOTHING;`,
    ...(user.balanceToman > 0
      ? [
          `INSERT INTO nobull_wallet_accounts`,
          `(chat_id, balance_toman, total_spent_toman, orders_count, updated_at)`,
          `VALUES (${sql(String(user.telegramId))}, ${sql(Math.round(user.balanceToman))}, 0, 0, unixepoch() * 1000)`,
          `ON CONFLICT(chat_id) DO NOTHING;`,
        ]
      : []),
  ].join('\n')
}

function subscriptionSql(subscription) {
  const username = subscription.radiusUsername || null
  const serverCode = subscription.serverCode ?? DEFAULT_SERVER_CODE
  return [
    `INSERT INTO subscriptions`,
    `(customer_id, plan_id, status, start_date, expiry_date, quota_limit_gb, quota_used_gb, radius_username, radius_password, server_code, provision_status)`,
    `SELECT (SELECT id FROM users WHERE telegram_id = ${sql(subscription.telegramId)}), ${sql(subscription.planId)}, ${sql(subscription.status)}, ${sql(subscription.startDate)}, ${sql(subscription.expiryDate)}, ${sql(subscription.quotaLimitGb)}, ${sql(subscription.quotaUsedGb)}, ${sql(username)}, ${sql(subscription.radiusPassword || null)}, ${sql(serverCode)}, 'imported'`,
    `WHERE EXISTS (SELECT 1 FROM users WHERE telegram_id = ${sql(subscription.telegramId)})`,
    `AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.customer_id = (SELECT id FROM users WHERE telegram_id = ${sql(subscription.telegramId)}) AND s.radius_username IS ${sql(username)});`,
  ].join('\n')
}

async function main() {
  const input = JSON.parse(await readFile(INPUT_FILE, 'utf8'))
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('migrate.json must contain a JSON object.')
  }
  if (!Array.isArray(input.legacy_users) || !Array.isArray(input.legacy_subscriptions)) {
    throw new Error('migrate.json must contain legacy_users and legacy_subscriptions arrays.')
  }
  if (input.legacy_users.length + input.legacy_subscriptions.length > MAX_LEGACY_ROWS) {
    throw new Error(`Input exceeds the ${MAX_LEGACY_ROWS}-row migration limit.`)
  }

  const usersById = new Map()
  const legacyUserIds = new Map()
  for (const row of input.legacy_users) {
    const user = normalizeUser(row)
    if (!user) continue
    if (!usersById.has(user.telegramId)) usersById.set(user.telegramId, user)
    const rowData = record(row)
    const legacyUserId = pickString(rowData, ['id', 'user_id', 'userId'])
    if (legacyUserId) legacyUserIds.set(legacyUserId, user.telegramId)
    legacyUserIds.set(String(user.telegramId), user.telegramId)
  }
  const subscriptions = input.legacy_subscriptions
    .map((row) => normalizeSubscription(row, legacyUserIds))
    .filter((item) => item !== null)

  const statements = [
    '-- Generated from migrate.json. Contains sensitive user and VPN credential data.',
    `CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  balance REAL NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`,
    ...[...usersById.values()].map(userSql),
    ...subscriptions.map(subscriptionSql),
  ]
  await writeFile(OUTPUT_FILE, `${statements.join('\n\n')}\n`, { encoding: 'utf8', mode: 0o600 })
  console.log(
    `Wrote migrate.sql: ${usersById.size} valid unique users and ${subscriptions.length} valid subscriptions. Treat it as sensitive and remove it after the migration.`,
  )
}

main().catch((error) => {
  console.error(`Could not generate migrate.sql: ${error.message}`)
  process.exitCode = 1
})
