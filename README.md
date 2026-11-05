# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Cloudflare Pages admin settings and providers

Bind Cloudflare KV namespaces to Pages Functions as `NOBULL_SETTINGS` and `NOBULL_USERS`. `NOBULL_SETTINGS` stores admin settings, login throttles/OTPs, receipt state, persistent orders, and customer aggregates; its KV `list` operation is required by the admin analytics API. `NOBULL_USERS` stores Telegram chat registrations and product-notification state. User tracking and broadcasts require this binding.

Create a Cloudflare D1 database for wallet balances and bind it as `NOBULL_WALLET_DB`. Apply all migrations to the same database used by that binding. For a new database, apply `functions/migrations/0001_wallet.sql` and `functions/migrations/0003_discounts.sql`. If the wallet tables are missing on an existing database, first apply the repeatable repair migration `functions/migrations/0002_wallet_schema_repair.sql`, then apply `functions/migrations/0003_discounts.sql` (for example, `npx wrangler d1 execute <database-name> --remote --file=functions/migrations/0003_discounts.sql`). The account schema uses `chat_id`, `balance_toman`, `total_spent_toman`, `orders_count`, and `updated_at`; the transaction schema uses `id`, `chat_id`, `delta_toman`, `reference`, `reason`, and `created_at`. The discount schema stores percent coupons, usage limits, active state, expiry, reservations, and one-time order redemptions. Save percent-based coupons in the admin panel to sync them to D1; existing percentage coupons are synced automatically when first used by the bot. Telegram checkout reserves a use while the invoice is open and increments `used_count` only when wallet payment is taken or receipt payment is approved. D1 is the authoritative wallet and Telegram discount ledger because KV cannot atomically prevent concurrent debits or coupon overuse. Set a high-entropy server-side `VAULT_ENCRYPTION_KEY` containing at least 32 characters; it encrypts delivered credentials before they are stored with orders. Keep this key stable and back it up securely: losing or changing it makes previously archived credentials undecryptable. Wallet views and admin balance adjustments remain unavailable until the D1 binding and migration are configured.

The storefront account/vault view requires opening the mini app inside Telegram so the backend can validate fresh Telegram WebApp `initData`; a client-supplied chat ID is never accepted as authentication. `/wallet` shows the balance and provides receipt-based top-up instructions. Wallet-funded bot purchases are automatically debited from D1 and submitted for fulfillment when sufficient balance is available. If automated provider fulfillment fails after a debit, the order remains recorded for support follow-up; users should not retry the purchase.

The catalog route checks provider products on catalog cache misses. Its first successful observation for each provider is saved as a baseline without notifying users about the existing inventory. Newly detected provider product IDs are broadcast with the already calculated Toman price and a direct purchase button only during an authenticated admin catalog request; public storefront reads do not trigger broadcasts. Failed deliveries are retried on a later authenticated refresh, and users who blocked the bot are removed from the registry.

Configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, and `TELEGRAM_WEBHOOK_SECRET` as server-side Pages variables. Set Telegram's webhook secret token to the same `TELEGRAM_WEBHOOK_SECRET`. Set a separate strong `ADMIN_PANEL_PASSWORD` Pages secret for web-admin password login; when it is absent, the panel uses `TELEGRAM_WEBHOOK_SECRET` as the password fallback. The web panel is available at `/#admin`, supports a Telegram-delivered one-time code, and requires a signed 12-hour bearer session for dashboard data and actions. Failed logins are rate-limited per Cloudflare client IP. Keep all secrets, provider keys, and card details server-side; never use a `VITE_` prefix for secrets.

The admin dashboard reads and writes order/customer analytics and pricing settings through the KV bindings above. Product-specific margin and sale-price overrides, featured/hidden status, and promo codes are stored in `NOBULL_SETTINGS`. The storefront validates promo codes through `/api/discount`; Telegram revalidates the code at invoice creation and applies the same discount. The dashboard's Broadcast tab can send Markdown messages to all registered bot users or completed-order buyers, with an optional HTTPS inline button; blocked recipients are pruned and delivery counts are returned per send. Configure the Telegram bot and admin chat ID for OTP delivery, failed-login alerts, broadcasts, buyer notifications, and provider-delivery messages. Purchases, receipts, and administrative bot actions are restricted to private chats. Use a provider webhook secret and configure the provider's delivered-order webhook to `/api/dante-webhook` when asynchronous Dante delivery is enabled.

Default profit margins are selected from the raw USD product cost: 150% below $1, 100% from $1 to under $2, 90% from $2 to under $3, 80% from $3 to under $5, 70% from $5 to under $8, 60% from $8 to under $12, and 50% at $12 or above. The web panel and Telegram `/settier` command accept margins from 0% through 1000%.

The default provider uses `DANTE_KEY`. For more providers, define `PRODUCT_PROVIDERS_JSON` as a JSON array and configure each referenced key as its own Pages secret. Provider endpoints must use HTTPS and return the same products/orders response shape and USDT product prices expected by the catalog and purchase flow. Example:

```json
[
  {
    "id": "dante",
    "name": "Dante Hub",
    "baseUrl": "https://dantehub.shop",
    "productsPath": "/api/public/v1/products",
    "ordersPath": "/api/public/v1/orders",
    "balancePath": "/api/public/v1/balance",
    "apiKeyEnv": "DANTE_KEY",
    "authHeader": "Authorization",
    "authPrefix": "Bearer "
  },
  {
    "id": "supplier-two",
    "name": "Supplier Two",
    "baseUrl": "https://supplier.example",
    "productsPath": "/api/v1/products",
    "ordersPath": "/api/v1/orders",
    "apiKeyEnv": "SUPPLIER_TWO_KEY",
    "authHeader": "Authorization",
    "authPrefix": "Bearer "
  }
]
```

The admin can inspect providers with `/providers`, switch the default with `/setprovider <id>`, inspect inventory with `/products [provider|all] [ai|security|media|design|code|tools] [available|unavailable|unknown|all]`, and use the dashboard buttons for balances, pricing, products, and recent orders. Provider keys are read only from their configured environment variable names; the provider JSON itself should not contain API key values.
