# Google sign-in setup (KUR-018)

The app and backend are wired for Google sign-in end to end. The **code** is
complete; enabling it needs Google Cloud OAuth credentials and a native rebuild
— those are the only remaining steps, and they live outside the repo.

## How it works

1. The app obtains a Google **ID token** via the native SDK
   (`@react-native-google-signin/google-signin`).
2. It posts the token to `POST /auth/oauth` with `provider: "google"`.
3. The backend verifies the token against Google's JWKS, checking the audience
   against `GOOGLE_CLIENT_IDS`, then signs the user in (creating an account on
   first use). Google's `email_verified` carries over, so a verified Google
   account skips the email-code gate.

A build without the client ids simply does not offer Google: the "Continue with
Google" button is only shown when the ids that platform needs are in the build.

## 1. Create OAuth clients (Google Cloud Console)

Under **APIs & Services → Credentials**, create OAuth client IDs:

- **Web application** — this is the important one: Google mints the ID token with
  the **Web** client id as its audience, on every platform.
- **iOS** — bundle id `app.hevalo.mobile`.
- **Android** — package name + the signing SHA-1 (debug and release/Play).

## 2. App configuration (mobile)

The client ids are never committed. They are read from the build environment,
and the phone build needs two of them:

| Variable | Value | Needed for |
| --- | --- | --- |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | the **Web** client id | Google on Android and iOS |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | the **iOS** client id | Google on iOS |

Each value is the whole id as Google shows it, ending in
`.apps.googleusercontent.com`. Expo inlines `EXPO_PUBLIC_*` variables into the
app, so they are not secrets; store them with plain-text or sensitive
visibility, not secret.

Set both in the EAS environment of every build profile that should offer Google
(`production` for store builds, and `preview` if internal builds should have it
too), then start a new build. A JavaScript-only reload is not enough, because
the iOS id also changes the native project.

Nothing has to be added to `mobile/app.json` by hand. `mobile/app.config.ts`
extends it, and when `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set it adds the
`@react-native-google-signin/google-signin` config plugin with the iOS URL
scheme, which is the iOS client id reversed:

```
<ios-client-id>.apps.googleusercontent.com  →  com.googleusercontent.apps.<ios-client-id>
```

What each combination gives:

- **Neither id:** no Google button anywhere; email, Apple (iOS) and guest only.
- **Web id only:** Google on Android; hidden on iOS, because the build has no
  URL scheme for Google to return to.
- **Both ids:** Google on Android and iOS.
- **An iOS id that is not shaped like a client id:** the build stops with an
  error naming the variable, rather than producing an app that hides Google.

Android needs no build setting beyond the web id: Google matches its Android
client by the package name and the SHA-1 of the signing certificate, so add the
certificate the store build is signed with (from the EAS credentials, and the
app signing key from the Play Console once the app is there).

For a local development build, put the same two lines in `mobile/.env` (not
committed) and rebuild the dev client:

```bash
npx expo prebuild
npx expo run:ios   # and/or run:android
```

## 3. Backend configuration

Set `GOOGLE_CLIENT_IDS` to a comma-separated list of every client id that may
appear as the token audience — include at least the **Web** client id (and the
iOS/Android ids to be safe):

```
GOOGLE_CLIENT_IDS=<web-client-id>.apps.googleusercontent.com,<ios-client-id>.apps.googleusercontent.com
```

## 4. Verify

On a device: tap **Continue with Google**, pick an account, and you should land
signed in. If the backend rejects the token, the app surfaces the server's error
code (e.g. `OAUTH_NOT_CONFIGURED` if `GOOGLE_CLIENT_IDS` is unset,
`INVALID_OAUTH_TOKEN` if the audience doesn't match).
