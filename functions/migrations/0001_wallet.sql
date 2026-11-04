CREATE TABLE IF NOT EXISTS nobull_wallet_accounts (
  chat_id TEXT PRIMARY KEY NOT NULL,
  balance_toman INTEGER NOT NULL DEFAULT 0 CHECK (balance_toman >= 0),
  total_spent_toman INTEGER NOT NULL DEFAULT 0 CHECK (total_spent_toman >= 0),
  orders_count INTEGER NOT NULL DEFAULT 0 CHECK (orders_count >= 0),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nobull_wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  delta_toman INTEGER NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS nobull_wallet_transactions_chat_created
  ON nobull_wallet_transactions (chat_id, created_at DESC);
