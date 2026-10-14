# Load testing suite (KUR-118)

[k6](https://k6.io) scenarios for Kurda's hot paths, with release-gate thresholds.
Runs on demand against **staging** (never production).

## Scenarios
| File | Scenario | Stresses |
|------|----------|----------|
| `login-storm.js` | Concurrent login spike | auth + token issuance |
| `lesson-completion.js` | Sustained lesson traffic | read/write mix, XP writes, review queue |
| `story-quiz-surge.js` | Wave of solo story quizzes | game creation, the answer path, the rewards transaction |

## Run
```bash
# install k6 (https://k6.io/docs/get-started/installation/)
BASE_URL=https://staging.kurda.app k6 run load/login-storm.js
BASE_URL=https://staging.kurda.app k6 run load/lesson-completion.js
BASE_URL=https://staging.kurda.app k6 run load/story-quiz-surge.js
```
The story quiz surge needs published Kurmancî short stories on staging.

## Pass/fail thresholds (release gate)
Defined in `lib/config.js` and enforced by k6's exit code, so these double as a
**pre-release regression gate** in CI:
- API: `http_req_duration p95 < 300ms`, `http_req_failed rate < 1%`.

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
