# Community Image & Meme Sharing (KUR-290)

A place to share Kurdish **memes** and images — humour teaches slang, idioms, and
culture a textbook can't. This is the content model + upload API; the feed/UI is
#291 and moderation is #292.

New posts with pictures are **written posts** now — a gotin, çîrok or helbest
can carry up to four pictures (see [library.md](library.md)). `image_posts`
keeps the picture posts already made, and `POST /images` stays for the apps
installed before that; both use the same upload.

## Model — `image_posts`

`id, author_id, author_role (user|admin|founder), image_media_id (required),
caption?, category (meme|image), language?, status (published|removed),
view_count, reaction_count, comment_count, created/updated`.

Caption is optional and control-char-stripped on input (#108); web/mobile escape
on render. `category` defaults to `meme` (memes first-class) and leaves room for
plain images.

## Upload — `POST /images/upload`

Raw image bytes in, a stored WebP out: sniffed, resized, compressed, scanned
(#294), and signed with the uploader's handle unless `?ownWork=false` ("I made
this" switched off). Answers `{ imageMediaId, url, width, height, signed }`.

`media_uploads` records the **uploader**, the **kind** (`image-post`) and the
size. The key mixes in the uploader, so two people uploading the same file get
an upload each. The upload is **unconfirmed** until a post uses it; one nobody
posts is deleted by the orphan sweep after a day. The same file uploaded again
by the same person is the same upload until it is posted, and a new upload
after, so a picture whose post was deleted can be posted again. Bytes that
moderation blocked or took off the bucket are refused (422 `IMAGE_REJECTED`)
under any key — the upload records a hash of what it stored for that.

## API

| Method | Route | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/images` | user/admin/founder | `{ imageMediaId, caption?, category?, language? }`; rate-limited (#010) |
| GET | `/images` | public | browse published; `?category=&language=&authorId=&sort=newest\|popular&limit=&offset=` |
| GET | `/images/:id` | public | read one + increment views |
| PATCH | `/images/:id` | author/admin | edit caption |
| DELETE | `/images/:id` | author/admin | **soft** remove (retained for moderation #292) |

- The picture must be the author's own upload, cleared by the scan, and on no
  other post (`media/postMedia.ts`); otherwise 422 `INVALID_POST`, or
  `MEDIA_IN_USE` when it is already on a post.
- A picture post and a changed caption go through the same gate as written
  posts (`trust/post-gate.ts`): velocity cap, spam check on the caption, AI
  screening of the caption after it lands. Staff changing somebody's caption
  are not posting, so the gate leaves that alone.
- A post mute stops the upload, the post and a caption edit, and a feature
  limit the upload and the post: 403 `MUTED` with `details: { scope, until }`.
- **Guests cannot upload** (401); reads need no auth.
- `author_role` is derived from RBAC (#099/#286): `founder` role → `founder`,
  admin roles → `admin`, else `user`.
- Ownership: only the author or an admin edits/removes (others 403).
