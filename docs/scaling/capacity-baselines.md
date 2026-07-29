# Capacity baselines (KUR-118)

Targets and measured capacity from the [load suite](../../load/README.md). Re-run
each scenario against staging before a release and update the *measured* columns;
a regression past the SLOs blocks the release.

## SLO targets (the release gate)
| Metric | Target |
|--------|--------|
| API latency (p95) | **< 300 ms** |
| API error rate | **< 1%** |
| WS event fan-out latency (p95) | **< 100 ms** |
| WS connect time (p95) | < 1 s |

## Measured baselines
Fill from the latest staging run (`k6` summary output). `RPS/node` = sustained
requests/sec per API replica at which p95 stays under target.

| Scenario | Max sustained load | RPS / node | API p95 | Error rate | Notes |
|----------|--------------------|-----------|---------|------------|-------|
| Login storm | _TBD_ | _TBD_ | _TBD_ | _TBD_ | ramp to 1.5k logins/s |
| Lesson traffic | _TBD_ | _TBD_ | _TBD_ | _TBD_ | 300 VU soak, 3 min |
| Matchmaking surge | _TBD_ | _TBD_ | _TBD_ | _TBD_ | 800 enqueues/s |
| WS games | _TBD_ concurrent | n/a | n/a | _TBD_ | fan-out p95 target < 100 ms; distributed run for 10k |

## Method
- Environment: staging, sized to match one production node class (document CPU/mem
  + replica count with each baseline so RPS/node is comparable).
- Warm caches first (KUR-116) so numbers reflect steady state, not cold start.
- Capture the k6 end-of-test summary (`http_req_duration`, `http_req_failed`,
  `ws_event_latency`) and attach it to the release notes.

## Regression policy
- The suite runs in CI on demand and **before each release**. k6 exits non-zero on
  any threshold breach, failing the job.
- Investigate any p95 regression > 20% vs the last recorded baseline before
  shipping; update this file when a new baseline is accepted.
