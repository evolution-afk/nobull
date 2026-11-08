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

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    plan_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    quota_gb INTEGER NOT NULL,
    duration_days INTEGER DEFAULT 30,
    price_amount REAL NOT NULL,
    partner_price REAL NULL,
    price_currency TEXT DEFAULT 'IRR',
    is_active INTEGER DEFAULT 1,
    max_speed_mbps INTEGER,
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

CREATE TABLE IF NOT EXISTS servers (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    protocol_default TEXT DEFAULT 'udp',
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    balance REAL NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_ledger_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    type TEXT NOT NULL,
    reference_id TEXT NULL,
    reason TEXT NULL,
    created_by INTEGER NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discount_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    percent REAL NULL,
    fixed_amount REAL NULL,
    max_uses INTEGER NULL,
    used_count INTEGER NOT NULL DEFAULT 0,
    valid_from DATETIME NULL,
    valid_until DATETIME NULL,
    for_partner_only INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discount_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discount_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    order_id INTEGER NULL,
    amount_before REAL,
    amount_after REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    `key` TEXT PRIMARY KEY,
    `value` TEXT,
    description TEXT,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);