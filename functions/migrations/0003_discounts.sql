CREATE TABLE IF NOT EXISTS nobull_discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  max_usage INTEGER NOT NULL CHECK (max_usage > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  expires_at TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS nobull_discount_reservations (
  code TEXT NOT NULL COLLATE NOCASE,
  order_id TEXT PRIMARY KEY NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS nobull_discount_reservations_code_expiry
  ON nobull_discount_reservations (code, expires_at);

CREATE TABLE IF NOT EXISTS nobull_discount_redemptions (
  code TEXT NOT NULL COLLATE NOCASE,
  order_id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS nobull_discount_redemptions_code
  ON nobull_discount_redemptions (code, created_at DESC);
