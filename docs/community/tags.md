# User Tags & Badges (KUR-286)

Identity tags for profiles: exactly **one main tag** (by precedence) plus any
number of **claimable** tags.

## Main tag — resolved, never stored

Computed live from RBAC + entitlements, so it always reflects current state:

```
Founder  (users.roles has 'founder')                 ── highest
Admin    (users.roles has an admin role, #099)
Kurdish  (owns the 'tag_kurdish' shop entitlement, #071)
none     (default)                                    ── lowest
```

- **Founder** is a dedicated role (one account), distinct from admin.
- **Kurdish** is a shop item (`tag_kurdish`, seeded); buying it grants the
  entitlement → the tag; a **refund/clawback removes the entitlement → the tag
  drops** automatically (no extra wiring — it's read from `user_entitlements`).
- An admin who also bought Kurdish shows **Admin** (precedence); the Kurdish
  entitlement is retained and reappears if the admin role is later removed.

## Claimable tags

Additional to the main tag; the user controls which are shown.

| Category | Acquisition | Notes |
| --- | --- | --- |
| `year_joined` | auto-grant | from account `created_at` (live) |
| `level` | auto-grant | from XP via `levelForXp` (live) |
| `age` / `gender` / `ethnicity` | self-claim | **sensitive** — see privacy |

Admins/founder can create more (`POST /admin/tags`) with any category/acquisition.

## API

| Method | Route | Who |
| --- | --- | --- |
| GET | `/users/:id/tags` | public — main + displayed claimable (profiles #82, comments #284) |
| GET | `/me/tags` · `/tags` | owner — my tags · claim catalog |
| POST | `/me/tags/claim` | owner — `{ key, value?, consent? }` |
| POST | `/me/tags/display` | owner — `{ key, displayed }` show/hide |
| DELETE | `/me/tags/:key` | owner — revoke a self-claim |
| POST · DELETE | `/admin/tags` · `/admin/tags/:key` | admin/founder — create · deactivate |

## Privacy (#109 / #24)

`age` / `gender` / `ethnicity` are **sensitive personal data**: claiming is
strictly optional and requires explicit `consent: true`, is hideable
(`display`), and fully **revocable** (`DELETE` removes the stored value).
`user_tags` cascade-delete with the account (erasure #24). Nothing sensitive is
required or shared beyond the chosen display.

## Follow-ups

- Localized labels (i18n keys) instead of plain `label`.
- Include claimed tags in the GDPR export payload (#24).
- Tags UI — display, claim, buy, admin management (#287).
