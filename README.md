# EonFuntimeHelper

Production SaaS platform for FunTime event tracking:

- Telegram bot for nearest events and paid access
- Web admin panel for owner operations
- Dedicated workers for sync, billing, notifications
- Official FunTime API only (`Authorization-Token` header)

## Services

- `apps/core-api` — central business API, FunTime integration, admin endpoints
- `apps/bot-service` — Telegram UX, subscription gate, menu actions
- `apps/scheduler-worker` — periodic event refresh + notification scheduling
- `apps/billing-worker` — CryptoBot invoice reconciliation and grants
- `apps/admin-web` — owner-only web admin panel (Next.js)

## Shared packages

- `packages/shared-domain` — domain types, contracts, enums
- `packages/shared-infra` — queue names, cache keys, retry utilities
- `packages/shared-config` — typed env config schemas

## Infrastructure

- PostgreSQL + Prisma (source of truth)
- Redis (cache + locks + BullMQ backend)
- Winston structured logging
- PM2 / Docker for production runtime

## Production Build and Start

1. Install deps and generate Prisma client:
   - `pnpm install`
   - `pnpm db:generate`
2. Apply DB migrations:
   - `pnpm db:migrate:deploy`
3. Build workspace packages/apps:
   - `pnpm --filter @eon/shared-domain build`
   - `pnpm --filter @eon/shared-config build`
   - `pnpm --filter @eon/shared-infra build`
   - `pnpm --filter @eon/core-api build`
   - `pnpm --filter @eon/admin-web build`
   - `pnpm --filter @eon/bot-service build`
4. Start services:
   - `pnpm start:core-api`
   - `pnpm start:web`
   - `pnpm start:bot`
   - or sequential orchestrator: `pnpm start:stack`

## VPS Production (localhost core-api, nginx + systemd)

Target model:
- `core-api` binds only `127.0.0.1:3000`
- only `admin-web` is exposed externally (via nginx + basic auth)
- `admin-web` proxies server-side to `core-api` (`/api/core/*`) and injects `OWNER_ADMIN_ID` from server env
- `bot-service` talks to core-api via internal URL (`http://127.0.0.1:3000/v1`)

### Required env (server-side)

- `OWNER_ADMIN_ID`: secret owner id (never typed into UI)
- `CORE_API_INTERNAL_URL=http://127.0.0.1:3000/v1`
- `NEXT_PUBLIC_ADMIN_PROXY_MODE=true` (disables UI editing of apiBaseUrl/owner id)

### systemd units

See:
- `deploy/systemd/core-api.service`
- `deploy/systemd/admin-web.service`
- `deploy/systemd/bot-service.service`

### nginx config (basic auth)

See `deploy/nginx/admin-web.conf`.

### E2E config sync verification (admin-web -> core-api)

When `admin-web` runs in proxy mode, the browser talks only to admin-web, and admin-web proxies to core-api server-side.

Examples (from the VPS):

- **Public config** (proxied): `curl -u user:pass http://your-domain/api/core/bot/config`
- **Admin view** (proxied): `curl -u user:pass http://your-domain/api/core/admin/bot-config`

## Bot-first Runtime Guarantees

- `bot-service` starts with local fallback config and cached config.
- Remote sync via `CORE_API_URL` is optional; bot remains operational if core-api is unavailable.
- Manual polling persists `offset` state and acknowledges updates deterministically to prevent infinite duplicate loops.
