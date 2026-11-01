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

Bind a Cloudflare KV namespace to Pages Functions as `NOBULL_SETTINGS`. The Telegram admin commands `/setrate`, `/setmargin`, `/setcard`, `/setprovider`, and `/autorate` write to this namespace; without it, dynamic changes are rejected rather than stored only in a temporary isolate.

Configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, and `TELEGRAM_WEBHOOK_SECRET` as server-side Pages variables. Set Telegram's webhook secret token to the same `TELEGRAM_WEBHOOK_SECRET`. Keep provider keys and card details server-side; never use a `VITE_` prefix for secrets.

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
