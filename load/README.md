# Load testing suite (KUR-118)

[k6](https://k6.io) scenarios for Kurda's hot paths, with release-gate thresholds.
Runs on demand against **staging** (never production).

## Scenarios
| File | Scenario | Stresses |
|------|----------|----------|
| `login-storm.js` | Concurrent login spike | auth + token issuance |
| `lesson-completion.js` | Sustained lesson traffic | read/write mix, XP writes, review queue |
| `matchmaking-surge.js` | "Play" wave | atomic queue + pairing sweep |
| `ws-games.js` | 10k concurrent WS games | gateway fan-out, event latency |

## Run
```bash
# install k6 (https://k6.io/docs/get-started/installation/)
BASE_URL=https://staging.kurda.app k6 run load/login-storm.js
BASE_URL=https://staging.kurda.app k6 run load/lesson-completion.js
BASE_URL=https://staging.kurda.app k6 run load/matchmaking-surge.js
BASE_URL=https://staging.kurda.app WS_URL=wss://staging.kurda.app k6 run load/ws-games.js
```
The 10k-WS target needs a distributed run (k6 Cloud or ~5 load generators at
2k VUs each) — one node won't hold 10k sockets.

## Pass/fail thresholds (release gate)
Defined in `lib/config.js` and enforced by k6's exit code, so these double as a
**pre-release regression gate** in CI:
- API: `http_req_duration p95 < 300ms`, `http_req_failed rate < 1%`.
- WS: `ws_event_latency p95 < 100ms` (fan-out), `ws_connecting p95 < 1s`.

A run that breaches any threshold exits non-zero → the release is blocked until
the regression is understood.

## Test-data isolation (edge case)
Load-test VUs use emails under the reserved `loadtest.kurda.invalid` domain
(`vuEmail` here mirrors `api/src/loadtest/marker.ts`). `isLoadTestUser()` flags
them so **analytics (KUR-105/106) and leaderboards exclude them** — a load run
never pollutes product metrics or rankings. Seed these accounts on staging before
a run and reap them after.

## Baselines
Measured capacity + targets live in [`docs/scaling/capacity-baselines.md`](../docs/scaling/capacity-baselines.md).
