# Queue scaling + backpressure (KUR-119)

Jobs run on one BullMQ queue with **priority** and a **load-shedding** policy, so
a spike degrades gracefully instead of delaying critical work.

## Priority queues
Jobs are classified in `api/src/jobs/backpressure.ts`:

| Class | Jobs | BullMQ priority (lower = sooner) |
|-------|------|----------------------------------|
| `critical` | `send-email` (verification, password reset) | 1 |
| `standard` | `push-send` (notifications) | 5 |
| `bulk` | `analytics-*` | 10 |

`JobQueue.enqueue` stamps `priority: priorityForJob(name)` on every job, so
auth emails always jump ahead of push, which jumps ahead of analytics.

## Backpressure / load-shedding
`shouldShed(jobName, waitingDepth)` drops **non-critical** enqueues once the queue
backs up — bulk first, standard only under a severe backlog, **critical never**:

- `bulk` shed above **5,000** waiting jobs.
- `standard` shed above **20,000**.
- `critical` never shed.

Non-critical producers call `JobQueue.enqueueUnlessShed(...)` (returns `null` when
shed) using `JobQueue.waitingCount()` as the signal — so analytics load is
dropped *before* password-reset emails ever queue up.

## Worker autoscaling + concurrency (ops)
- Worker concurrency is set in `createWorker` (`api/src/jobs/worker.ts`); run
  multiple worker replicas and **autoscale on queue depth** (e.g. KEDA on the
  BullMQ `waiting` metric, or a HPA on a custom depth gauge). Per-class
  concurrency caps are enforced by dedicating replicas / rate limits per class.

## Edge case — poison messages
- Payloads are validated **before** they hit Redis (`enqueue` schema check), so a
  malformed producer fails its own request, never the queue.
- Runtime failures retry with exponential backoff up to `attempts` (default 4),
  then land in the BullMQ **failed set = our DLQ** (`removeOnFail: false`). The
  worker logs a **critical alert** when a job exhausts retries
  (`worker.ts` `failed` handler) — so a bad message is quarantined and surfaced,
  **never infinitely retried**.
