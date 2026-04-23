# EonFuntimeHelper Architecture Notes

## FunTime API integration

- Only official API `https://api.funtime.su`.
- Every request uses header `Authorization-Token: <FUNTIME_API_TOKEN>`.
- `FunTimeGateway` wraps:
  - `GET /method/servers-info`
  - `GET /method/events?event-type=all&server-type=<batch>`
- Batching rule: max 30 servers per request.
- Retry strategy: exponential backoff + jitter for transient upstream failures.
- Status mapping:
  - `401` -> unauthorized token error
  - `402` -> rate-limit domain error
  - `403/404` -> retryable upstream domain error
- Fail-safe: bot reads cached snapshot if refresh fails and marks data as stale.

## Redis cache and queue policy

- Keys:
  - `funtime:servers:list` TTL 900s
  - `funtime:events:all` TTL 45s
  - `funtime:events:server:<code>` TTL 45s
  - `user:profile:<telegramId>` short-lived user cache
- Stampede protection:
  - distributed lock `lock:funtime:refresh` (single-flight refresh).
- Queue topology (BullMQ):
  - `funtime-sync`
  - `notifications`
  - `billing`
  - `broadcast`

## Billing and lifetime unlimited

- Product matrix:
  - `VIEWS_X3`, `VIEWS_X5`, `VIEWS_X10`
  - `UNLIMITED_LIFETIME` (never expires)
- Payment flow:
  - Create invoice -> store `PENDING` -> verify in worker -> idempotent apply grant.
- Anti double-credit:
  - idempotency key by `invoice_id`.
  - applied invoice registry at service layer + DB unique constraints.

## Notification engine

- One active rule per user (`user_notifications` + uniqueness policy).
- Trigger windows: 1, 3, 5 minutes before event.
- Dedup key: `user+server+event+window`.
- Retry on transient Telegram send failures.
