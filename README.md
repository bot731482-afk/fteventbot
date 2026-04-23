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
