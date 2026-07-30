# AI-Assisted Content Moderation (KUR-293)

The automated moderation tier: it scores user text and auto-flags / auto-actions
suspicious content, **layered after** the fast wordlist filter (#086). The
wordlist is the cheap first pass; this is the smart second pass that catches
evasion, context, and spam patterns wordlists miss. It feeds the **same #102
human review queue** — no separate review surface.

## Pipeline

```
text → (#086 wordlist mask) → classify → policy → action → moderation_flags (→ #102)
```

- **Policy engine** (`moderation/policy.ts`, pure): per-category scores →
  `allow` / `flag` / `auto_hide` / `auto_block`, with **per-surface** thresholds
  (`chat` / `library` / `caption` / `profile`; profiles strictest). Severe
  categories (hate / sexual / self-harm) get a lower block threshold.
- **Classifier seam** (`moderation/classifier.ts`): `ModerationClassifier` is
  provider-agnostic — a hosted API (OpenAI / Perspective-style) or a self-hosted
  model drops in by config. `classifyForSurface` degrades gracefully: any
  classifier error yields the configured **fail-open** (low-risk surfaces) or
  **fail-closed** (high-risk → `auto_hide`) result, never a throw.
- **Orchestrator** (`moderation/ai-service.ts`): classify (identical-text
  cached) → evaluate → persist a `moderation_flags` row for any action above
  `allow`, storing the driving category, score, full per-category scores, and
  **model version** for audit + threshold tuning (#104).

## Default backend

Until a provider is configured, the default is a deterministic **spam/scam
heuristic** (`HeuristicSpamClassifier`, `heuristic-spam-v1`): link-spam, scam
keywords, character-flooding, shouting. Spam is the tier we can score well
without a model; **toxicity / hate / sexual / self-harm are left to the hosted
model** behind the same interface (score 0 in the heuristic). The policy engine,
wiring, flags store, and review path are all provider-ready today.

## Reversibility (false positives)

Every automated action is a `moderation_flags` row with `status = 'pending'`.
Admins review via `GET /admin/moderation/flags` and resolve via
`POST /admin/moderation/flags/:id/resolve` with `{ outcome: 'actioned' | 'reversed' }`
— `reversed` is the false-positive path (content restored). Nothing is destroyed;
decisions are auditable and overturnable.

## Wired now

- `POST /chat/:userId/messages` — after the wordlist + trust checks, a
  high-confidence hit (`auto_block`, or `auto_hide` since a DM can't be hidden
  after delivery) blocks the send; lower hits flag for review.

## Deferred / follow-ups

- Concrete hosted-classifier adapter (config-only) with multilingual
  (Kurdish / Arabic / Turkish) quality measurement.
- Library posts/comments (#283/#285), meme captions (#290), profile fields —
  call `AiModerationService.moderate` when those write-paths land.
- Async classify-then-reconcile via the job queue (#7) for latency-sensitive
  surfaces (today it classifies inline).
- The #102 queue UI reads `moderation_flags` (pending feed) alongside human
  reports.
