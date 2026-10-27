# Granting admin access

The first admin can't be created from the admin panel — something has to grant it.
The API reconciles an allowlist of addresses on every boot.

## How to grant

Set `BOOTSTRAP_ADMIN_EMAILS` on the **API** service (comma-separated), then restart:

```
BOOTSTRAP_ADMIN_EMAILS=someone@example.com,someone-else@example.com
```

Each listed address is granted the `admin` and `superadmin` roles. Both are needed:
`superadmin` drives the admin app's RBAC pages, while many older routes (moderation,
economy, events, experiments, fraud, analytics, tournaments) still accept only the
legacy `admin`. With one but not the other, parts of the panel answer `403`.

Roles are re-read from the database on **every request**, so a grant takes effect
immediately — no re-login or token refresh.

## The account must confirm its email first

A grant only happens once the account has **confirmed** that address. Listing an
address does nothing on its own; the code sent to that inbox has to have been
entered. This is what binds admin to the real mailbox owner rather than to whoever
first typed the address into a signup form.

So the order is:

1. Register the account normally and **complete email verification**.
2. Add the address to `BOOTSTRAP_ADMIN_EMAILS`.
3. Restart the API — or simply verify, which reconciles on the spot.

If an address is listed but its account hasn't verified yet, the API logs a warning
and grants nothing. The allowlist is re-checked **whenever an address is confirmed**,
so verifying after the API started grants immediately — no restart needed. It is also
re-checked on every boot, so a restart works too.

## What it will not do

- **It never revokes.** Removing an address stops future grants but leaves existing
  roles alone, so a config slip can't lock everyone out. Revoke deliberately (panel
  or database).
- **It skips deleted and banned accounts**, so a disabled account can't be quietly
  re-elevated.
- **It doesn't put addresses in the repository.** This repo is public; committing
  them would advertise exactly which accounts to attack. They belong in config.

## Audit

Every grant is written to the append-only `admin_audit_log` (action
`admin.bootstrap_grant`, actor `00000000-0000-0000-0000-000000000000` for the
system) in the same transaction as the role change — if the audit write fails, the
grant rolls back, so there is no unlogged elevation. Visible under **Audit** in the
admin app.

## The role is not the whole story

Sensitive admin routes additionally require enrolled **TOTP 2FA** (`requireAdmin`).
Holding the role gets you into the panel; those endpoints still demand a second
factor, so a stolen session alone isn't enough.

## Who may use the console at all

Only staff: an account holding a staff role (`admin`, `superadmin`, `moderator`,
`support`, `content_editor` or `founder`) that is neither deleted nor banned
(`api/src/admin/owner-access.ts`). To everyone else the console gives nothing away:

- **Signing in** (`POST /admin/auth/login`) answers exactly as a wrong password does
  — same status, same message, no session — whether the account exists, the
  password was right, or the account is staff.
- **Every staff route** answers a signed-in account that is not staff exactly as a
  route that does not exist (`404 NOT_FOUND`).

### A second lock: `ADMIN_ACCESS_EMAILS`

Set `ADMIN_ACCESS_EMAILS` on the **API** service (comma-separated) and only those
addresses may use the console, whatever roles anyone else holds; each account must
also have confirmed its address. A role granted by mistake, or a moderator left
over, then opens nothing. Put every admin's address on it, yours included — anyone
missing is answered like a stranger. Leave it unset and every staff role may sign in.

## The team that writes and records lessons

Someone who records their part of a conversation, or writes lessons, does not
need to be an admin. A superadmin gives them the **content editor** role from
their page in the console (**Users → the person → Profile → Lessons and
recording**), with a reason that is kept in the person's history. It opens the
lessons, the stories and the audio studio, and nothing about people or money.

- The account must have **confirmed its email address** first, and must not be
  banned.
- They sign in at the console with their own account and set up their own 2FA
  code the first time.
- If `ADMIN_ACCESS_EMAILS` is set, add their address there too, or the console
  answers them like a stranger.
- Taking the role away works the same way and takes effect at once; their
  recordings stay.

Each conversation in a lesson is recorded part by part on **Record audio →
Record conversations**. There, each person chooses their part, hears the line
before each of theirs, and records it; **Send … part** gives a link to the
other person's part, to send to whoever records it.

The parts are the characters themselves (Xezo, Hamo and Hevalo, each at most
once), called by their own names. Learners see the characters together,
looking at each other, and each line is said by the character whose part it
is, whoever recorded it.
