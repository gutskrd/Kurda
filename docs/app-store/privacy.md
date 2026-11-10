# iOS privacy configuration & App Privacy answers (KUR-277)

The source of truth for App Store review privacy: the permission **usage strings**,
the **Privacy Manifest** (`ios.privacyManifests` in [`mobile/app.json`](../../mobile/app.json)),
and the **App Privacy "nutrition label"** answers in App Store Connect. This file
documents the last one and cross-references the code so the three stay consistent
(with the privacy surfaces of #109 and export/deletion of #24).

**Hevalo does not track users and shows no ads.** `NSPrivacyTracking` is `false`
and `NSPrivacyTrackingDomains` is empty. No data is shared with data brokers or
used to follow users across other apps/sites.

## Permissions (requested just-in-time, with an in-context rationale)

| Permission | iOS key | When it's asked | Source | Denied → |
|---|---|---|---|---|
| Photo library | `NSPhotoLibraryUsageDescription` | when you tap to set a profile picture (#180), a group's picture, or add a meme/image post (#291) | `expo-image-picker` plugin string | an alert explains why + points to Settings; the rest of the app works |
| Microphone | `NSMicrophoneUsageDescription` | when you record a voice note (#282) or start a speaking exercise (#36) | `expo-audio` plugin string | the recorder shows the reason + offers Settings; text still works |
| Notifications | (system prompt) | when you opt into reminders (#94/#95) | `expo-notifications` | reminders simply don't send |

No **camera**, **location**, **contacts**, **speech-recognition**, or **tracking**
permission is requested — the app never calls those APIs, so no usage string is
declared for them (an unused permission prompt is an App Store rejection risk).
Permissions are requested **in context** (on the action), never all at launch.

## App Privacy — data collected (App Store Connect answers)

All linked to the user's account except crash data, **none used for tracking**.
Purpose is *App Functionality* unless noted. The rows are the Privacy Manifest's
`NSPrivacyCollectedDataTypes`, one for one and in its order: answer App Store
Connect from this table, and change the two together. The name in the first
column is the one App Store Connect shows.

| Data type (App Store Connect) | Manifest type | Linked | Tracking | Purpose | What it is here |
|---|---|---|---|---|---|
| Contact Info → Email Address | `EmailAddress` | yes | no | App Functionality | sign-up and sign-in, the emailed code, password reset |
| Contact Info → Name | `Name` | yes | no | App Functionality | username and display name on profiles |
| Identifiers → User ID | `UserID` | yes | no | App Functionality | the account's id |
| User Content → Photos or Videos | `PhotosorVideos` | yes | no | App Functionality | profile picture, a group's picture, image and meme posts |
| User Content → Audio Data | `AudioData` | yes | no | App Functionality | voice notes on posts and comments, speaking exercises |
| User Content → Other User Content | `OtherUserContent` | yes | no | App Functionality | posts, comments, captions, saved words |
| Purchases → Purchase History | `PurchaseHistory` | yes | no | App Functionality | what was bought in the shop with Zêr and Gewher; receipts of in-app purchases once those open (none are sold today) |
| Usage Data → Product Interaction | `ProductInteraction` | yes | no | Analytics, App Functionality | lessons done, streak, XP; first-party only, never for ads |
| User Content → Emails or Text Messages | `EmailsOrTextMessages` | yes | no | App Functionality | direct and group messages |
| User Content → Gameplay Content | `GameplayContent` | yes | no | App Functionality | game rounds, scores, ranks, the village |
| User Content → Customer Support | `CustomerSupport` | yes | no | App Functionality | feedback sent from the app, reports and appeals |
| Identifiers → Device ID | `DeviceID` | yes | no | App Functionality | the push token and a per-install id that names a signed-in device |
| Sensitive Info | `SensitiveInfo` | yes | no | App Functionality | the identity tags a member chooses to show on their profile; optional, visible to them, and removable |
| Other Data → Other Data Types | `OtherDataTypes` | yes | no | App Functionality | the birth month and year asked at sign-up for the age check |
| Diagnostics → Crash Data | `CrashData` | **no** | no | App Functionality | crash reports, sent first-party without the account |

Not collected: **phone number** (the app never asks for one), precise or coarse
**location**, contacts, health and fitness, financial or payment information
(any purchase goes through the store, which keeps the card), browsing history,
search history, advertising data. No third-party analytics or advertising SDK
is in the build, so there is no App Tracking Transparency prompt.

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
