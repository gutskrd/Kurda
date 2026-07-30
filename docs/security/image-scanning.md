# Automatic Image Scanning (KUR-294)

Every uploaded image is auto-classified (NSFW / violence) and hash-matched
(CSAM) at the media finalize step, and the verdict **gates whether it is ever
publicly served**. This is the machine baseline behind the human review in #292
— images can't be text-filtered, so scanning is the only pre-serve defense.

## Pipeline

```
upload confirmed → scan → verdict → media_uploads.scan_status  (gate)
                                  → image_scans  (audit + review #102)
```

- **Verdict engine** (`moderation/image-scan.ts`, pure): NSFW + violence scores
  → `allow` / `flag` / `gate` / `auto_block`; a **CSAM hash match overrides
  everything** → `hard_block` + evidence preservation. Per-surface thresholds
  (`feed` vs stricter `profile`).
- **Scanner seam** (`moderation/image-scanner.ts`): `ImageScanner` is
  provider-agnostic — a cloud vision API or self-hosted model + a CSAM hashing
  service drops in by config. `StubImageScanner` reports clean by default (with a
  per-key override for tests/staging). **Fails closed** (`gate`) on any scanner
  error — an unscanned image is never served; there is no fail-open for images.
- **Orchestrator** (`moderation/image-moderation-service.ts`): image consumers
  call `scan(mediaKey, surface)` once an upload is confirmed and **before serving
  it**. It sets `media_uploads.scan_status` (`cleared` / `gated` / `blocked`),
  records every above-`allow` verdict in `image_scans` (scores + reasons + model
  version, #104), and exposes `isServable(key)` for consumers to check.

## Visibility gate

`media_uploads.scan_status`:

| status | served? | set by |
| --- | --- | --- |
| `cleared` | yes | `allow` / `flag` verdict, or a reversed false positive |
| `gated` | no (blur/hold) | `gate` verdict |
| `blocked` | no | `auto_block` / `hard_block` |

Existing rows default to `cleared` (backward-compatible); a consumer that opts
into scanning gets the gate. `isServable` returns true only for `cleared`.

## CSAM handling

A CSAM hash match is **hard-blocked with the `image_scans` record preserved**
(`preserve_evidence = true`) — never soft-deleted. A preserved-evidence flag can
be `actioned` but **never reversed to servable** (enforced in `resolve`). The
legal/reporting workflow (mandated reporting, evidence handoff) is coordinated
with counsel; this issue provides the technical seam + the safe default
(block + preserve).

## Reversibility

`GET /admin/moderation/image-flags` (pending feed) + `POST …/:id/resolve`
`{ outcome: 'actioned' | 'reversed' }`. `reversed` re-clears a false positive;
CSAM stays blocked regardless.

## Deferred / follow-ups

- Concrete scanner adapter (cloud vision + PhotoDNA-style hashing), config-only.
- Call `scan` at each image finalize: profile pictures (#181), memes (#290).
- Animated GIF frame sampling; perceptual-hash dedupe + repeat-offender detection.
- Async scan via the job queue (#7) with a `pending`-hold for slow scans.
- The #102 queue UI reads `image_scans` alongside text flags + human reports.
