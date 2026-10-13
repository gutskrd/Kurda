# Community Library — written posts, with pictures (KUR-281)

A shared library of Kurdish writing that **admins and signed-in users**
publish and **guests read/listen**. A post is a **gotin** (a saying, no title
needed), a **çîrok** (story) or a **helbest** (poem). It is words, up to **four
pictures**, or both, X-style, with an **optional** audio rendition. Commenting
is #283; moderation/removal is #285.

The rules for what a post may be live in `shared/src/post-composer.ts`, which
the API, the browser and the phone all use: the limits, how the kind is decided,
how characters are counted, the check behind the Post button, and the draft the
composer keeps on the device.

## Model

`library_posts`: `id, author_id, author_role (user|admin), type
(gotin|story|poem), title?, body, audio_media_id?, language, status
(draft|published|removed), is_meme, source_credit?, view_count, comment_count,
created_at, updated_at, published_at`.

`library_post_media`: `post_id, position (0–3), media_key, alt_text?, width,
height, created_at` — one row per picture, in order. A media key belongs to one
post at most.

- Title: required for a story or a poem (the database holds to this too); a
  gotin may have none.
- Body: may be empty (`''`) only when the post has a picture.
- `is_meme`: marks a post with pictures for the Memes filter; a post without
  pictures cannot be one.
- `source_credit`: an optional "Source / credit" line shown under the post.

Text is control-char-stripped on input (#108) with **newlines/tabs preserved**
so poem line breaks survive; web/admin surfaces `escapeHtml` on render.

### Limits (counted trimmed, the way the composer's counter counts)

| Field | Limit |
| --- | --- |
| title | 200 |
| body | 50,000, with or without pictures |
| alt text (each picture) | 1,000 |
| source / credit | 200 |
| pictures | 4 |

## Pictures

1. Upload each picture with `POST /images/upload` (raw bytes). The answer is
   `{ imageMediaId, url, width, height, signed }`. "I made this" is on unless
   the upload is `POST /images/upload?ownWork=false`; when on, the picture
   carries the Hevalo signature with the poster's handle, and when off it goes
   up without it (a signature on somebody else's picture would claim it).
2. Name the uploads on the post as `media: [{ mediaKey, altText? }]`.

A post may use a picture only if **its author uploaded it**, it is a picture
upload, the **scan cleared it**, and **no post uses it yet** (`media/postMedia.ts`).
The upload stays unconfirmed until a post claims it, in the same transaction
that saves the post; an upload nobody posts is deleted by the orphan sweep after
a day. One upload is one post's: an upload already on a post is refused as in
use. Uploading the same file again gives back the same upload while it is
unposted, and a new upload once it is on a post — so a picture can go on a new
post after its first post was deleted (the removed post keeps its own file).

## API

| Method | Route | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/library/posts` | user | `{ type?, title?, body?, media?, meme?, sourceCredit?, audioMediaId?, language?, publish? }`; rate-limited |
| GET | `/library/posts` | public | browse published; `?type=gotin\|story\|poem&language=&authorId=&sort=newest\|popular&limit=&offset=` |
| GET | `/library/posts/:id` | public | read one + increment views |
| PATCH | `/library/posts/:id` | author/admin | change `type`, `title` (`null` clears a gotin's), `body`, `media`, `meme`, `sourceCredit` (`null` clears), `audioMediaId`, `language` |
| POST | `/library/posts/:id/unpublish` | author/admin | → draft (hidden from browse) |
| POST | `/library/posts/:id/publish` | author/admin | draft → published |
| DELETE | `/library/posts/:id` | author/admin | **soft** remove (retained for moderation #285, pictures too) |
| GET | `/me/library/drafts` | user | your own server drafts, most recently edited first (`?limit&offset`) |

- **Kind**: a `type` sent wins; without one, a title makes a story and no title
  a gotin. A helbest is only ever chosen.
- **Edits**: `media` replaces the whole list in the order given. A key already
  on the post stays; a new one must be an unused upload of the **post's
  author** (an admin cannot put their own upload on somebody's post); a key
  left out is let go to the orphan sweep (its owner can post it again within the
  day) — unless a moderator still has to see it: on a post with an open report
  or an unresolved case, or flagged by its scan, it is kept, as a removed
  post's pictures are. An edit is checked as the post it would leave, so it can
  be refused for the same reasons a new post can.
- **Answers**: every post carries `media: [{ mediaKey, url, altText, width,
  height }]`, `meme`, `sourceCredit` and `audioUrl`, beside the fields it always
  had.
- **Drafts**: the new composer keeps drafts on the device. The server's
  `draft` status stays for the apps installed before it, and
  `GET /me/library/drafts` is how a draft one of them saved is found, finished
  and published.
- **Guests cannot author** (401); reads need no auth.
- **Ownership**: only the author or an admin may edit/unpublish/remove (others 403).
- Removed posts are hidden from lists and unreadable but retained.

### Refusals

| Status | Code | When |
| --- | --- | --- |
| 422 | `EMPTY_POST` | no words and no pictures |
| 422 | `TITLE_REQUIRED` | a story or a poem without a title |
| 422 | `TOO_LONG` | a field over its limit; with `field` and `max` |
| 422 | `TOO_MANY_PICTURES` | more than four; with `max` |
| 422 | `MEME_NEEDS_PICTURE` | `meme` on a post with no pictures |
| 422 | `INVALID_MEDIA` | not the author's own cleared picture upload; with `mediaKey` |
| 422 | `MEDIA_IN_USE` | already on a post, or twice in this one; with `mediaKey` |
| 422 | `INVALID_AUDIO` | the narration is not a confirmed audio upload |
| 429 | `TRUST_VELOCITY` | posting faster than the account's trust level allows |
| 403 | `AUTO_MODERATED` | the account was just restricted for spam |

An invalid edit answers 422 with its reason (it used to answer 403 "not your
post"). Nothing of a refused post is kept, and none of its pictures are claimed.

## Screening

Every way words or pictures reach readers goes through one gate
(`trust/post-gate.ts`): a new post, a draft published, an edit that adds words
or pictures to a published post, a picture post and its caption. The gate is
the per-level velocity cap (#295), the duplicate/burst spam check on the new
words (title, text, alt texts and credit — only what an edit changed), and the
AI screening (#293) after the post lands, which flags for the review queue and
never blocks. A draft is counted when it is published, not when it is saved; a
post refused for its shape or its pictures is refused before it counts.

## On the wall (`GET /feed`)

A written post is a card with `targetType: 'library'` and `href:
/app/library/:id`, pictures or not, so the apps installed before pictures still
open it. Each card carries `images: [{ url, alt, width, height }]` (in order, at
most four), `imageAlt` (the first picture's alt text) and `meme`; `imageUrl` is
the first picture, which is where those older apps already look for one. An old
picture post carries its one picture in `images` too, with no alt text or size.
`kind` is the post's type (`gotin`, `story`, `poem`) or an old picture post's
category (`image`, `meme`).

The halves go by what a post has:

| Filter | Shows |
| --- | --- |
| `section=gotin` (Sayings `gotin`, Stories `cirok`, Poems `helbest`) | written posts with words that are not memes |
| `section=dimen` | every post with pictures, old picture posts included |
| `kind=wene` (Photos) | written posts with pictures not marked as memes, old picture posts of category `image` |
| `kind=mim` (Memes) | written posts marked as memes, old memes |

A photo with a paragraph under it is in both halves, and once on the full wall.

## Follow-ups

- Full-text search over titles/bodies (out of scope here).
