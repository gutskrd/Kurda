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
| Photo library | `NSPhotoLibraryUsageDescription` | never as a prompt: a profile picture (#180), a group's picture and a meme/image post (#291) are chosen in the system's own picker, which runs outside the app and hands back only what was chosen | `expo-image-picker` plugin string | nothing to deny; closing the picker leaves the screen as it was |
| Microphone | `NSMicrophoneUsageDescription` | at the tap on record, for a voice note (#282) or a speaking exercise (#36), with no screen of ours before it | `expo-audio` plugin string | a speaking exercise says the microphone is off for Hevalo, offers the phone's settings, and is put off with "Can't do this now — skip"; a voice note says the same in an alert, and the comment is typed instead |
| Notifications | (system prompt) | after a lesson, from a screen with one "Continue" button, or from the "Continue" row in Settings → Notification settings (#94/#95) | `expo-notifications` | the lesson's way on is taken exactly as if it had been allowed; nothing is sent; Settings says "Notifications are off" and offers the phone's settings |

No **camera**, **location**, **contacts**, **speech-recognition**, or **tracking**
permission is requested — the app never calls those APIs, so no usage string is
declared for them (an unused permission prompt is an App Store rejection risk).
Permissions are requested **in context** (on the action), never all at launch.

### Our own screens in front of a system prompt

The Human Interface Guidelines (Privacy → Requesting permission) read a screen
of the app's own, shown before a system prompt, as part of the request, and an
app is turned away for steering the answer there. What the code holds to:

- **Two places lead to the notifications prompt, and no other of ours does:**
  the screen after a lesson (`mobile/src/push/ReminderOffer.tsx`) and the row
  in Settings → Notification settings (`mobile/src/push/DevicePushControl.tsx`).
  The microphone prompt has no screen of ours before it at all.
- **One button, titled "Continue".** Never "Allow", "Turn on" or "Not now":
  the yes and the no belong to the system prompt. Nothing else on the screen
  can be pressed, and there is no ✕, skip or back out of it (Android's back
  stays on the screen), so it cannot be left without seeing the prompt.
- **It says what is sent, and only that:** a reminder on a day the streak is
  still waiting, word of a letter, word of a badge, which is what the server
  pushes (`api/src/notifications/streak-reminder-service.ts`,
  `api/src/letters/service.ts`, `api/src/badges/service.ts`). No reward for
  saying yes, no picture of the prompt, no pointing at one of its buttons.
- **Learn's banner about reminders appears only once the phone will not ask
  again**, where its button opens the phone's settings and no prompt follows
  (`shouldNudgeReminders` in `mobile/src/push/permission.ts`).
- **After "Don't Allow" everything goes on:** no spinner and no button left
  busy. The screen after a lesson takes the lesson's way on whatever the
  answer, an error included.
- **The sentence inside the prompt** (`mobile/app.json`, `mobile/locales/*.json`)
  is one complete sentence in the active voice that says what Hevalo does:
  it uploads the photos chosen, it records when record is tapped, and what
  for. Never "… is needed for a better experience", never "Turn on …".

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
- [ ] After a first lesson on an adult account: the screen before the
      notifications prompt has one button, "Continue", and nothing else to
      press; it brings up the prompt; "Don't Allow" goes on to where the lesson
      was going, with nothing left spinning. Learn's banner about reminders
      never shows before the prompt has been answered; after a "Don't Allow"
      it may show (a week after this screen, and no more than twice in all,
      this screen counted), and its button opens the phone's settings.
- [ ] Validate the generated `PrivacyInfo.xcprivacy` in the build; App Store Connect
      privacy answers match reality.
