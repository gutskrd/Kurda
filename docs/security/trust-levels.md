# New-Account Trust Levels & Spam Auto-Moderation (KUR-295)

New and suspicious accounts are throttled automatically so spam and bots are
contained without adding friction for established, genuine users. Limits **lift
on their own** as an account ages, verifies, and behaves.

## Trust levels (`trust/levels.ts`, pure)

`getTrustLevel(facts)` is computed **per request** (no cached authority) from
account facts:

| Level | Reached when |
| --- | --- |
| `new` | default — unverified, brand-new, or any confirmed violation on record |
| `basic` | email-verified **and** ≥ 1 hour old |
| `established` | email-verified **and** ≥ 7 days old (≥ 1 day if phone-verified, #297) |

A confirmed violation (a mute/ban in `admin_actions`, including auto-actions)
holds the account at `new` until it is earned back.

## Per-level velocity caps (`VELOCITY_CAPS`, per hour)

| Action | new | basic | established |
| --- | --- | --- | --- |
| message | 20 | 100 | 500 |
| group_create | 1 | 5 | 20 |
| comment | 15 | 60 | 300 |
| upload | 3 | 20 | 100 |
| post | 2 | 10 | 50 |

Enforced at the **write-path route** (`TrustService.checkAction` → 429 with a
clear reason, then `recordAction` on success). Route-level so the auth boundary
owns it, exactly like the #010 limiter — service methods are unaffected.

## Spam auto-moderation (`trust/spam.ts`, pure)

`evaluateSpam({ repeatCount, burstCount })` maps duplicate/burst signals to a
graduated response, applied by `TrustService.assessContent` **before the message
lands**:

| Response | Trigger (identical repeats / burst) | Effect |
| --- | --- | --- |
| `allow` | — | proceed |
| `throttle` | 3 repeats / 10 in burst | message rejected, no penalty |
| `mute` | 5 repeats | `users.muted_until` (1h) + queued for review |
| `suspend` | 8 repeats / 30 in burst | ban (1d) + **sessions revoked** (token_version) + queued |

Every automated mute/suspend is written to `admin_actions` with **`admin_id`
NULL** (a system action), so it is visible in the user's moderation history and
**reversible** by a moderator (#101) — and audited (#104).

## Wired now

- `POST /chat/:userId/messages` — message velocity cap + duplicate/burst spam
  auto-mute/suspend.
- `POST /groups` — group-creation velocity cap.
- `GET /me/trust` — the caller's current level + caps (client transparency).

## Deferred (dependencies not yet built)

- Comment / upload / library-post caps land with those write-paths
  (#283 / #290 / #281).
- `queueForReview` enqueues into the moderation queue when **#102** ships (the
  signal is already produced).
- Phone-verified fast-track once #297 stores a verified flag.
- Shared-device/IP weighting reuses the risk-scoring signals (#296).
