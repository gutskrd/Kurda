# Core dashboards (KUR-106)

Daily-refreshed dashboards over the event store (KUR-105). A scheduled job runs
`DashboardService.refreshDay(day)` once per day (default: yesterday, UTC) and
materializes **counts only** into rollup tables (`analytics_daily_metrics`,
`analytics_retention`) — no user ids, no PII. Because the numbers are stored,
they stay correct after a user is deleted or anonymized (raw events cascade
away; history remains). All endpoints are admin-only and accept `?from=&to=`
(YYYY-MM-DD; default: last 30 days).

## Definitions

### Activity — `GET /admin/analytics/activity`
- **DAU** — distinct users with **≥ 1 tracked event** on that day.
- **WAU** — distinct active users over the **7-day window ending on that day** (inclusive).
- **MAU** — distinct active users over the **30-day window ending on that day**.

"Active" means *any* validated event in the schema registry (a screen view
counts). Anonymous/unauthenticated events (no `user_id`) are excluded.

### Retention — `GET /admin/analytics/retention`
For a **cohort** of users **first seen** on `cohort_day`:
- **D1 / D7 / D30** — the fraction of that cohort with **≥ 1 event exactly N days later**.
- `rate = retained / cohort_size` (0 for an empty cohort).

"First seen" = the earliest day the user has any event. Cohorts are computed when
they mature (on day `cohort_day + N`).

### Funnels — `GET /admin/analytics/funnel?name=onboarding|lesson`
Ordered event-type sequences; a user **reaches a step** by firing its event that day.
- **onboarding**: `screen_view → lesson_start → lesson_complete`
- **lesson**: `lesson_start → lesson_complete`

Each step reports `users`, `rateFromFirst` (share of the top-of-funnel still
present) and `rateFromPrev` (step-to-step conversion). Step counts are summed
over the selected range. This is a *reach* funnel (did the user do each step in
the window), not a strict per-session ordered funnel — sufficient for the
product-health view; session-scoped funnels are a later refinement.

## Refresh
- Scheduled: a 24h interval calls `refreshDay()` for yesterday.
- Manual/ops/backfill: `POST /admin/analytics/refresh?day=YYYY-MM-DD` recomputes a specific day (idempotent upsert).

## GDPR
The rollup tables hold only aggregate counts, so **deleted/anonymized users
remain in historical aggregates** while no PII is retained (the edge case in the
issue). Raw `analytics_events` cascade-delete with the user; the already-computed
rollups are unaffected.
