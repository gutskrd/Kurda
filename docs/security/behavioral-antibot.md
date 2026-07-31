# Behavioral Bot Detection (KUR-110)

XP farms and scripted play distort leaderboards and the economy. This scores
each account's *behavior* for bot-likeness and responds in two graduated steps:
an invisible CAPTCHA on the next session, and — at high confidence — reversal of
ill-gotten XP through the ledger.

## Signals → score

`antibot/signals.ts` derives 0..1 anomaly levels from concrete aggregates
(deterministic, unit-tested); `antibot/scoring.ts` (the pure core) weights them.

| Signal | Weight | Source |
| --- | --- | --- |
| pacing (impossibly fast answers) | 0.30 | `cheat_stats.impossible_count` (#058) |
| timing uniformity (scripted) | 0.30 | `cheat_stats.fast_count + rtt_anomaly_count` |
| uptime (24/7 activity) | 0.25 | distinct active hours from `xp_ledger` |
| device (accounts per fingerprint) | 0.15 | `risk_decisions.device_hash` (#296) |

`score ≥ 0.4` → **challenge**; `score ≥ 0.6` → **flagged**. Behavioral signals
need a minimum sample (20 answered questions) before they count. The device
weight (0.15) is **below the challenge threshold by design**, so a shared
classroom device — many legitimate accounts on one fingerprint — can never flag
anyone on its own; it only tips borderline cases.

## Lifecycle

```
scoreActive()  → bot_scores (per user: score, tier, signals, status='active')
challenge tier → GET /antibot/challenge → client presents invisible CAPTCHA
flagged  tier  → GET /admin/antibot/flagged  (human review)
                 POST /admin/antibot/:id/reverse → confirm + reverse XP
                 POST /admin/antibot/:id/clear   → false positive
```

- **Scoring job:** `scoreActive()` scores every account with enough game
  activity; runs on a schedule and via `POST /admin/antibot/score`.
- **CAPTCHA gating:** `requiresChallenge(userId)` reads the latest active verdict;
  the client checks it at session start and presents the invisible CAPTCHA.
- **Reversal (reversible):** confirming a flagged account writes a **compensating
  negative `xp_ledger` entry** (`source = 'bot_reversal'`) and zeroes the balance
  — `users.xp` stays exactly the ledger sum (the append-only invariant holds; the
  `amount > 0` check was relaxed to `amount <> 0` for admin corrections). A
  cleared false positive drops the challenge/flag.
- A **confirmed** bot stays confirmed across re-scores; a **cleared** account
  re-activates only if it scores suspicious again.

## Follow-ups

- Schedule `scoreActive` as a repeatable job (#7) rather than manual/cron.
- Richer signals from the analytics event stream (#105): per-answer timing
  distributions, session-length patterns.
- Wire `requiresChallenge` into the lesson/practice session-start response so the
  client always knows without a separate call.
- Currency (Zêr/gems) reversal alongside XP for confirmed bots (wallet ledger).
