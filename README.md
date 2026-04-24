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

## Bot-first Runtime Guarantees

- `bot-service` starts with local fallback config and cached config.
- Remote sync via `CORE_API_URL` is optional; bot remains operational if core-api is unavailable.
- Manual polling persists `offset` state and acknowledges updates deterministically to prevent infinite duplicate loops.
