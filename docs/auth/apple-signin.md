# Sign in with Apple: revoking at account deletion

Signing in with Apple works with nothing more than `APPLE_CLIENT_IDS` (the app's
bundle id, `app.hevalo.mobile`, already set by the Blueprint). This page is about
the other half App Store guideline 5.1.1(v) asks for: when someone deletes an
account they made with Sign in with Apple, the app must revoke what Apple issued
for them, through Apple's REST API. That needs a key from Apple's developer
portal, and until it is configured nothing is revoked.

## How it works

1. On **Continue with Apple**, the phone sends the server three things Apple gave
   it: the identity token (which signs the person in, checked against
   `APPLE_CLIENT_IDS`), the one-time **authorization code**, and the **name** the
   person chose to share. Apple shares the name on the very first sign-in only;
   the server uses it as the display name of a new account and never changes the
   name of an existing one.
2. After the sign-in has succeeded, and without making it wait, the server
   exchanges the code at `https://appleid.apple.com/auth/token` for a **refresh
   token**. It authenticates with a client secret: a JWT it signs (ES256) with
   the Sign in with Apple key for each call, valid for an hour. The refresh token
   is kept **encrypted** (AES-256-GCM, `api/src/security/at-rest.ts`) in
   `oauth_identities.refresh_token_sealed`. Every later sign-in replaces it with
   a fresh one.
3. `DELETE /me` starts the 14-day grace period; signing in again cancels it.
   When it ends, the deletion job (`anonymize-deleted-accounts`) asks Apple to
   revoke the kept token at `https://appleid.apple.com/auth/revoke`, and only
   then anonymizes the account, which deletes the identity and the token with
   it. An account closed at once because its owner turned out to be under 13 is
   revoked at once too.
4. Apple being slow, down or refusing never stands in anyone's way: a failed
   exchange leaves the sign-in as it was, and a failed revoke leaves the
   deletion going ahead. Each failure is logged at warn level (the code and the
   tokens are never logged).

## What to create in the Apple Developer portal

At [developer.apple.com/account](https://developer.apple.com/account), with the
account that owns the app:

1. **Team ID.** Open **Membership details**: the Team ID is ten characters,
   such as `ABCDE12345`.
2. **The App ID has Sign in with Apple.** Under **Certificates, Identifiers &
   Profiles → Identifiers**, open `app.hevalo.mobile` and check that **Sign in
   with Apple** is ticked (it is, if signing in with Apple already works).
3. **A Sign in with Apple key.** Under **Keys**, press **+**, give it a name
   (for example "Hevalo Sign in with Apple"), tick **Sign in with Apple**, press
   **Configure** and choose `app.hevalo.mobile` as the primary App ID. Save,
   continue and register it.
4. **Download the key** (`AuthKey_<KEYID>.p8`). Apple lets you download it
   **once**, so keep it somewhere safe, such as a password manager, and never
   commit it. The **Key ID** is the ten characters shown with the key (and in
   the file name).

## Configuring the API

Set these on the API service (in Render: **Environment**, as secrets, then
redeploy). If a separate worker service ever runs the job queue, it needs the
same three, since it runs the deletions.

| Variable | Value |
| --- | --- |
| `APPLE_TEAM_ID` | the Team ID |
| `APPLE_KEY_ID` | the Key ID |
| `APPLE_PRIVATE_KEY` | the whole text of the `.p8` file, `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----`. Line breaks may be kept, or written as `\n` where a field takes one line. |
| `APPLE_CLIENT_ID` | optional. The client the tokens belong to: the first `APPLE_CLIENT_IDS` entry by default, which is the bundle id `app.hevalo.mobile`. Only needed if that ever changes. |

All three of the first variables must be set; with any of them missing, nothing
is exchanged, kept or revoked, and no request goes to Apple.

The kept tokens are encrypted with a key derived from `JWT_SECRET`. Rotating
`JWT_SECRET` makes the tokens kept before it unreadable: deleting such an
account logs a warning instead of revoking, until its owner signs in again and a
new token is kept.

## Checking it works

1. On a phone, sign in with Apple. The API logs no warning starting "Apple did
   not exchange" or "could not exchange", and
   `SELECT count(*) FROM oauth_identities WHERE provider = 'apple' AND refresh_token_sealed IS NOT NULL`
   counts the account.
2. Delete a test account made with Apple. Two weeks later (or at once, for an
   account closed as under 13) the app disappears from
   **Settings → [your name] → Sign-In & Security → Sign in with Apple** on that
   person's devices.

Accounts that last signed in with Apple before the key was configured, or from a
version of the app that did not send the code, have no token kept, so there is
nothing to revoke for them until they next sign in.
