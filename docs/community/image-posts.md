# Community Image & Meme Sharing (KUR-290)

A place to share Kurdish **memes** and images — humour teaches slang, idioms, and
culture a textbook can't. This is the content model + upload API; the feed/UI is
#291 and moderation is #292.

## Model — `image_posts`

`id, author_id, author_role (user|admin|founder), image_media_id (required),
caption?, category (meme|image), language?, status (published|removed),
view_count, reaction_count, comment_count, created/updated`.

The image is a **confirmed media key** from the #013 pipeline (type/size/dimension
limits, EXIF strip, animated-GIF, CDN — enforced there). Caption is optional and
control-char-stripped on input (#108); web/mobile escape on render. `category`
defaults to `meme` (memes first-class) and leaves room for plain images.

## API

| Method | Route | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/images` | user/admin/founder | `{ imageMediaId, caption?, category?, language? }`; rate-limited (#010) |
| GET | `/images` | public | browse published; `?category=&language=&authorId=&sort=newest\|popular&limit=&offset=` |
| GET | `/images/:id` | public | read one + increment views |
| PATCH | `/images/:id` | author/admin | edit caption |
| DELETE | `/images/:id` | author/admin | **soft** remove (retained for moderation #292) |

- **Guests cannot upload** (401); reads need no auth.
- `author_role` is derived from RBAC (#099/#286): `founder` role → `founder`,
  admin roles → `admin`, else `user`.
- Ownership: only the author or an admin edits/removes (others 403).

## Follow-ups

- Feed + upload UI (#291) reuses the profile-picture pick/crop flow (#180).
- Auto image-scan (#294) + report → #102 queue at upload/serve (#292) — the
  `ImageModerationService.scan(mediaKey, 'feed')` seam is ready to wire.
- Reactions (`reaction_count`) and comments (`comment_count`) in #291.
