# Threaded Comments on Library Posts (KUR-283)

Discussion on stories & poems: a comment is **text, audio, or both**, and every
comment can be replied to **indefinitely deep**. Signed-in users and admins
comment; **guests read-only**. Extends the #281 library.

## Model — `library_comments`

`id, post_id, author_id, author_role, parent_comment_id?, depth, body?,
audio_media_id?, status (visible|removed), reply_count, created/updated`.

- **≥ 1 content** required (`CHECK: status='removed' OR body IS NOT NULL OR
  audio_media_id IS NOT NULL`) — a live comment must carry text or audio; a
  tombstone may be empty.
- **Unbounded nesting** via `parent_comment_id`; `depth` is cached for render
  capping (#284). Audio uses the voice-note capability (#282); text is
  control-char-stripped (#108).

## API

| Method | Route | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/library/posts/:postId/comments` | user | `{ body?, audioMediaId?, parentId? }`; rate-limited (#010) |
| GET | `/library/posts/:postId/comments` | public | top-level, paginated (`?limit&offset&sort=newest\|oldest`) |
| GET | `/library/comments/:id/replies` | public | direct replies, **load-more per branch** (oldest-first) |
| PATCH | `/library/comments/:id` | author/admin | edit text/audio |
| DELETE | `/library/comments/:id` | author/admin | soft-delete (tombstone) |

The thread loads **top-level first**, and each branch's replies load on demand
(`/replies` with `reply_count` as the hint) — unlimited logical depth without
fetching an entire tree at once.

## Deletion & counts

- **Soft-delete tombstones** the node (`status='removed'`, content cleared) and
  **keeps the subtree** — a removed parent still shows "comment removed" with its
  replies intact.
- `library_posts.comment_count` tracks *visible* comments (++ on create, −− on
  remove, floored at 0); a parent's `reply_count` tracks its direct children.
  Both are maintained inside the mutation transaction.

## Follow-ups

- Moderation/report → the #102 queue (#285); the AI text tier (#293) can classify
  comment `body`.
- Mobile thread UI with render-depth cap + "continue thread" (#284).
