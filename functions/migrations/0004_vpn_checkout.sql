-- VPN checkout: user, order and subscription records for the storefront flow.
-- The plans and servers catalogue comes from schema.sql / seed_vpn.sql.

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    photo_url TEXT,
    balance REAL DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    is_partner INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    partner_id INTEGER NULL,
    plan_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'IRR',
    status TEXT DEFAULT 'pending',
    payment_method TEXT DEFAULT 'card_to_card',
    idempotency_key TEXT NULL UNIQUE,
    reject_reason TEXT NULL,
    gateway_provider TEXT NULL,
    gateway_invoice_id TEXT NULL,
    gateway_final_amount INTEGER NULL,
    gateway_payment_link TEXT NULL,
    gateway_status TEXT NULL,
    radius_username TEXT NULL,
    radius_password TEXT NULL,
    config_url TEXT NULL,
    server_code TEXT NULL,
    provision_status TEXT NULL,
    completed_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    start_date DATETIME NULL,
    expiry_date DATETIME NULL,
    quota_limit_gb INTEGER NOT NULL,
    quota_used_gb REAL DEFAULT 0,
    radius_username TEXT,
    radius_password TEXT,
    config_url TEXT,
    server_code TEXT DEFAULT '49',
    provision_status TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS orders_customer_created
    ON orders (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscriptions_customer_created
    ON subscriptions (customer_id, created_at DESC);
