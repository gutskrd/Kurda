# Getting the app onto a phone

Two EAS profiles build the iOS app, and they behave completely differently once
installed. Picking the wrong one produces an error that looks like a bug in the
app and is not.

## Which one to install

**`preview` — the one you want to just use the app.**

```bash
npx eas-cli build --platform ios --profile preview
```

It is a release build: the JavaScript is compiled into the binary and
`EXPO_PUBLIC_API_URL` points at the live API. It needs no server, no Wi-Fi
setup and no laptop. Install it and open it.

**`development` — only for live-reloading while writing code.**

```bash
npx eas-cli build --platform ios --profile development   # needs Metro, see below
```

It sets `developmentClient: true`, which means the binary ships **without** a
JavaScript bundle and fetches one from a Metro dev server every time it opens.
With no server to fetch from it shows a red screen:

> Expected MIME-Type to be 'application/javascript' or 'text/javascript', but
> got 'text/html'.

That message means "I asked for my code and something handed me a web page". It
is the expected behaviour of a development build with nowhere to get its code
from — not a fault in the app.

Both profiles use the same bundle identifier (`app.kurda.mobile`), so whichever
you install last replaces the other. Installing `preview` over a broken
development build is a clean fix.

## If you do want the development build

Metro has to be running, and the phone has to be able to reach it.

```bash
REACT_NATIVE_PACKAGER_HOSTNAME=<your-LAN-IP> npx expo start --dev-client
```

The hostname matters. Started without it, Metro serves a manifest containing:

```json
"hostUri": "127.0.0.1:8081",
"launchAsset": { "url": "http://127.0.0.1:8081/..." }
```

`127.0.0.1` means *this device*, so the phone asks itself for the bundle, gets
whatever is listening there, and lands on the same red screen. The phone also
has to be on the same network — on cellular it cannot reach a LAN address at
all.

Check what Metro is advertising before blaming the phone:

```bash
curl -s -H "expo-platform: ios" -H "Accept: multipart/mixed" http://127.0.0.1:8081/ | grep -o '"hostUri":"[^"]*"'
```

## The port 8081 collision

`.claude/launch.json` has a `mobile-web` entry that runs `expo start --web` on
**port 8081** — the same port a development client expects Metro on. It is
there so the app can be looked at in a browser during development, which is the
only way to see the phone's screens without a device.

It serves the correct JavaScript for real bundle paths, but answers any unknown
path with the web page, so it is easy to mistake for the cause of the red
screen. If a development build is misbehaving, stop it first and take it out of
the picture.
