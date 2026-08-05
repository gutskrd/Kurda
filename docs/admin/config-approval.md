# Shop + Event Config with Dual-Admin Approval (KUR-103)

Live-ops config — shop items and event definitions — edited by admins **without a
deploy**, with a second-admin sign-off on the costly stuff.

## Flow

```
POST /admin/config/changes { target, payload }
      │
      ├─ low-impact  → applied immediately (200)
      └─ sensitive   → queued for approval (202, status: pending)

GET  /admin/config/changes                     → pending queue
POST /admin/config/changes/:id/approve         → a DIFFERENT admin applies it
POST /admin/config/changes/:id/reject { reason }
```

- `target: 'shop_item'` → payload is a `CreateItemInput` (sku, name, currency,
  price, …); applied via `ShopService.createItem`.
- `target: 'event'` → payload is an `UpsertEventInput` (key, name, type, startsAt,
  endsAt, rewards, …); applied via `EventService.upsert`.
- Applying goes through those services, so **validation + cache invalidation**
  (the 5-min shop catalog cache, the boundary-cached event feed) happen for free.

## What's "sensitive" (needs a second admin)

- **shop_item**: `price >= 1000` (large price / high-value grant).
- **event**: grants currency — `rewards` is non-empty.

Non-sensitive changes apply on propose. Sensitive ones stay `pending` until a
**different** admin approves — the proposer **cannot approve their own change**
(`403 SELF_APPROVE`). All decisions are recorded (`proposer_id`, `reviewer_id`,
`decided_at`) in `admin_config_changes`.

## Validation

- Events **cannot be scheduled in the past** (`422 PAST_SCHEDULE`); `endsAt` must
  be after `startsAt` (`BAD_WINDOW`).
- Shop `price >= 0` (`BAD_PRICE`); required fields present (`INVALID_PAYLOAD`).

## Follow-ups

- The admin web UI (schedule live-preview, forms) renders this API (#103 UI part).
- Per-field "large price *change*" (delta vs current) in addition to absolute
  threshold; configurable thresholds.
- Approvals into the #104 audit log alongside `admin_config_changes`.
