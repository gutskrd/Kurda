# Community Library — Stories & Poems (KUR-281)

A shared library of Kurdish literature that **admins and signed-in users**
publish and **guests read/listen**. Each post is text (required) with an
**optional** audio rendition. Commenting is #283; moderation/removal is #285.

## Model — `library_posts`

`id, author_id, author_role (user|admin), type (story|poem), title, body,
audio_media_id?, language, status (draft|published|removed), view_count,
comment_count, created_at, updated_at, published_at`.

Text is always required; **audio is optional and additional** (a confirmed media
key from the #013 pipeline). Body is control-char-stripped on input (#108) with
**newlines/tabs preserved** so poem line breaks survive; web/admin surfaces
`escapeHtml` on render.

## API

| Method | Route | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/library/posts` | user | create (text-only or text+audio); `author_role` from RBAC (#099); rate-limited |
| GET | `/library/posts` | public | browse published; `?type=&language=&authorId=&sort=newest\|popular&limit=&offset=` |
| GET | `/library/posts/:id` | public | read one + increment views |
| PATCH | `/library/posts/:id` | author/admin | edit title/body/audio/language |
| POST | `/library/posts/:id/unpublish` | author/admin | → draft (hidden from browse) |
| POST | `/library/posts/:id/publish` | author/admin | draft → published |
| DELETE | `/library/posts/:id` | author/admin | **soft** remove (retained for moderation #285) |

- **Guests cannot author** (401); reads need no auth.
- **Ownership**: only the author or an admin may edit/unpublish/remove (others 403).
- Removed posts are hidden from lists and unreadable but retained.

## Follow-ups

- Audio upload capability wiring in #282 (this uses the existing #013 media key).
- Threaded comments (#283) increment `comment_count`.
- Moderation surfacing (#285) via the report + #102 queue; the AI text tier
  (#293) can classify `body` at publish.
- Full-text search over titles/bodies (out of scope here).
