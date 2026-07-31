# Community Library Moderation (KUR-285)

Keeps user-published stories, poems, and comments safe by reusing the existing
moderation infrastructure: **user reports** + **automated text screening** →
the unified moderation queue (#102) → one-click admin actions.

## Reporting

```
POST /library/posts/:id/report      { reason? }   (auth, rate-limited #010)
POST /library/comments/:id/report   { reason? }
```

- Any signed-in user can report a post or comment; **text and audio are both
  reportable** (audio can't be auto-scanned, so reports are first-class).
- **One report per user per item** (`library_reports` unique on
  `(target_type, target_id, reporter_id)`); re-reporting is a no-op (`deduped`).

## Into the queue (#102)

`ModerationQueueService.sync` ingests open reports and **collapses mass-reports
of one item into a single case** (`source = 'library_report'`,
`source_ref = 'library_post:<id>'` / `'library_comment:<id>'`). The case carries
the content author as subject and, in `evidence`, the target, report count, and
audio media key (for playback in the admin surface). Automated **text screening**
(#293, `surface = 'library'`) runs on post/comment creation — a flagged body
enters the queue as a `text_flag`.

## Resolving

From the queue, a moderator applies one action (all audited via `admin_actions`,
#101/#104):

| Resolution | Effect |
| --- | --- |
| `dismiss` | close, no action |
| `remove` | **soft-delete the content** (post → `removed`; comment → tombstone), reports closed — hidden publicly, **retained for audit** |
| `warn` / `mute` / `ban` | action the content author (mirrors #101) |

`remove` keeps the row (and a comment's subtree) for audit/appeal; the post/
comment disappears from public reads and browse.

## Follow-ups

- Admin surface audio playback for reported voice notes (#284/#287 UI).
- Snapshot the reported content at report time (edge case: author edits/deletes
  before review) — today the live row is retained via soft-delete.
