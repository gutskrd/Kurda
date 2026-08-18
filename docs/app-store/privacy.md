# iOS privacy configuration & App Privacy answers (KUR-277)

The source of truth for App Store review privacy: the permission **usage strings**,
the **Privacy Manifest** (`ios.privacyManifests` in [`mobile/app.json`](../../mobile/app.json)),
and the **App Privacy "nutrition label"** answers in App Store Connect. This file
documents the last one and cross-references the code so the three stay consistent
(with the privacy surfaces of #109 and export/deletion of #24).

**MyKurda does not track users and shows no ads.** `NSPrivacyTracking` is `false`
and `NSPrivacyTrackingDomains` is empty. No data is shared with data brokers or
used to follow users across other apps/sites.

## Permissions (requested just-in-time, with an in-context rationale)

| Permission | iOS key | When it's asked | Source | Denied → |
|---|---|---|---|---|
| Photo library | `NSPhotoLibraryUsageDescription` | when you tap to set a profile picture (#180) or add a meme/image post (#291) | `expo-image-picker` plugin string | an alert explains why + points to Settings; the rest of the app works |
| Microphone | `NSMicrophoneUsageDescription` | when you record a voice note (#282) or start a speaking exercise (#36) | `expo-audio` plugin string | the recorder shows the reason + offers Settings; text still works |
| Notifications | (system prompt) | when you opt into reminders (#94/#95) | `expo-notifications` | reminders simply don't send |

No **camera**, **location**, **contacts**, **speech-recognition**, or **tracking**
permission is requested — the app never calls those APIs, so no usage string is
declared for them (an unused permission prompt is an App Store rejection risk).
Permissions are requested **in context** (on the action), never all at launch.

## App Privacy — data collected (App Store Connect answers)

All linked to the user's account, **none used for tracking**. Purpose is *App
Functionality* unless noted. This mirrors the Privacy Manifest's
`NSPrivacyCollectedDataTypes`.

| Data type | Collected | Linked | Tracking | Purpose | Where in code |
|---|---|---|---|---|---|
| Email address | yes | yes | no | App Functionality | auth/registration |
| Name (username / display name) | yes | yes | no | App Functionality | users, profiles (#82) |
| User ID | yes | yes | no | App Functionality | account identity |
| Phone number | optional | yes | no | App Functionality | phone verification #297 — stored **hashed + masked**, raw number never stored |
| Photos or videos | yes | yes | no | App Functionality | profile pictures #180, image/meme posts #290/#291 |
| Audio data | yes | yes | no | App Functionality | voice notes #282, speaking answers #36 |
| Other user content | yes | yes | no | App Functionality | library posts/comments #281/#283, captions, chat #83 |
| Purchase history | yes | yes | no | App Functionality | IAP gems #72 |
| Product interaction | yes | yes | **no** | Analytics + App Functionality | analytics events #105 — first-party, not for ads |
| Crash data | yes | no | no | App Functionality | diagnostics |

Not collected: precise or coarse **location**, contacts, health/fitness, financial
account info (payments go through Apple IAP / the store, not stored by us), browsing
history, search history from other apps, sensitive demographic data **for ads**.
(Optional self-declared profile tags — age band / gender / ethnicity, #286 — are
consented, user-visible, and revocable per #109; they are profile "Other user
content," never used for tracking.)

## Required-reason APIs (`NSPrivacyAccessedAPITypes`)

Declared with Apple's approved reason codes (used by the RN/Expo runtime + our code):

| API category | Reason | Why |
|---|---|---|
| `UserDefaults` | `CA92.1` | app's own settings/state (this app only) |
| `FileTimestamp` | `C617.1` | timestamps of files the app itself created (media cache) |
| `SystemBootTime` | `35F9.1` | measure elapsed time for in-app timers (games) |
| `DiskSpace` | `E174.1` | check free space before writing a download/cache |

Third-party SDKs (Expo modules, etc.) ship their own bundled privacy manifests;
those are merged at build time. Re-audit dependencies for new required-reason APIs
whenever a native dependency is added or bumped.

## Consistency checklist (keep in sync)

- [ ] Every declared collected-data type has a real code path; remove any that don't.
- [ ] Every permission string matches the actual in-context use.
- [ ] App Store Connect answers match this table and the Privacy Manifest.
- [ ] Cross-checked against the privacy policy surfaced in-app (#109) and the
      export/delete guarantees (#24).
- [ ] No permission requested that the code never triggers.

## Device QA (needs a real device — not automatable here)

- [ ] Trigger each permission → the specific copy above appears.
- [ ] Deny each → graceful degradation + Settings deep-link (#278), no crash.
- [ ] Validate the generated `PrivacyInfo.xcprivacy` in the build; App Store Connect
      privacy answers match reality.
