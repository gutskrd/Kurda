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

Until the client IDs are set, the "Continue with Google" button falls back to a
"coming soon" notice instead of a broken flow.

## 1. Create OAuth clients (Google Cloud Console)

Under **APIs & Services → Credentials**, create OAuth client IDs:

- **Web application** — this is the important one: Google mints the ID token with
  the **Web** client id as its audience, on every platform.
- **iOS** — bundle id `com.gutskrd.kurda`.
- **Android** — package name + the signing SHA-1 (debug and release/Play).

## 2. App configuration (mobile)

Provide the client IDs as environment variables (Expo inlines `EXPO_PUBLIC_*`):

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios-client-id>.apps.googleusercontent.com
```

Add the config plugin to `mobile/app.json` under `expo.plugins` so the native
build gets the iOS URL scheme (the **reversed** iOS client id):

```json
[
  "@react-native-google-signin/google-signin",
  { "iosUrlScheme": "com.googleusercontent.apps.<ios-client-id>" }
]
```

Then rebuild the dev client (a native module was added, so a JS-only reload is
not enough):

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
