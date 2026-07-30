# Unified Moderation Queue (KUR-102)

One severity-sorted queue for **every** moderation source, with claim-locking,
one-click resolutions, and an SLA metric. It is where the automated tiers
(#293 text, #294 image) and the human/system flags (#086 chat reports, #058
anti-cheat) converge for a moderator.

## Sources → cases

`ModerationQueueService.sync()` ingests open items from each source into
`moderation_cases` (idempotent via `UNIQUE (source, source_ref)`), normalizing
them to a common shape with a severity score:

| Source | Table | Severity |
| --- | --- | --- |
| `image_flag` | `image_scans` (pending) | CSAM `hard_block` 100 · `auto_block` 90 · `gate` 70 · else 50 |
| `anti_cheat` | `cheat_reviews` (unreviewed) | shadow-flagged 90 · else 60 |
| `text_flag` | `moderation_flags` (pending) | `auto_block` 85 · `auto_hide` 70 · else 50 |
| `chat_report` | `chat_reports` (open) | 50 (user-submitted) |

Each case carries the subject user (where applicable) and an `evidence` blob
(the reported message + context, the timing evidence, the classifier scores,
the media key).

## Workflow

```
GET  /admin/moderation/queue            → sync() then severity-sorted cases
POST /admin/moderation/cases/:id/claim  → claim-lock (first moderator wins)
POST /admin/moderation/cases/:id/resolve { resolution: dismiss|warn|mute|ban }
GET  /admin/moderation/sla              → median time-to-resolution
```

- **Claim-locking:** `claim` only succeeds on an `open` case; a second moderator
  gets `409 ALREADY_CLAIMED`.
- **One-click resolve:** applies the action to the subject (`warn` / `mute` 24h /
  `ban` — mirrors the #101 moderation writes, recorded in `admin_actions`),
  **closes the underlying source row** so it never re-enters the queue, and marks
  the case resolved. `dismiss` closes without actioning the user.
- **SLA:** `percentile_cont(0.5)` over `resolved_at − created_at` across resolved
  cases (median seconds + count).

All admin-guarded (`requireRoles('admin')`, KUR-099).

## Notes / follow-ups

- The queue is the review surface the automated tiers promised: resolving a
  `text_flag` / `image_flag` here writes back the flag's `status` (actioned /
  reversed), and reversing an image flag re-clears it for serving.
- Assignment is single-claim today; round-robin / re-assignment and per-moderator
  workload are follow-ups.
- The admin web UI (React/Vite) renders this API — this issue delivers the
  server queue + actions.
