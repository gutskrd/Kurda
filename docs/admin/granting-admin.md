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

A role is not enough on its own either. Only the addresses in `ADMIN_ACCESS_EMAILS`
(comma-separated, on the **API** service) may use the console; when it is not set,
`BOOTSTRAP_ADMIN_EMAILS` is used instead. The account must also hold a staff role,
have confirmed that address, and be neither deleted nor banned
(`api/src/admin/owner-access.ts`).

To everyone else the console gives nothing away:

- **Signing in** (`POST /admin/auth/login`) answers exactly as a wrong password does
  — same status, same message, no session — whether the account exists, the
  password was right, or the account is staff.
- **Every staff route** answers a signed-in account that is not listed exactly as a
  route that does not exist (`404 NOT_FOUND`), so another staff role, a moderator
  left over, or a role written by mistake opens nothing.

In production, with **both lists empty, the console is shut to everyone** (the API
logs an error at boot). Set one of them before deploying. A moderator or support
account that should use the console needs its address added here as well.

## Revoking

```sql
UPDATE users SET roles = array_remove(array_remove(roles, 'admin'), 'superadmin')
WHERE email = 'someone@example.com';
```

Remove the address from `BOOTSTRAP_ADMIN_EMAILS` too, or the next restart re-grants it.
