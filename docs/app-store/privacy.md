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
| Motion | `NSMotionUsageDescription` | never: Hevalo leans and turns his head with the phone's tilt and swing from the motion sensor, which needs no permission; the sentence is declared because the sensor package also holds step counting, which Hevalo never uses. Readings stay on the phone, only while Hevalo is on screen, and nothing is kept. On Android the package's activity-recognition permission is blocked (`blockedPermissions`) | `expo-sensors` plugin string | nothing to deny |
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

## Where the apps ask for personal information, and why

Every point where the phone app or the website asks for something about the
person, or takes it from the device, with the reason the server code gives
for it. App Review guideline 5.1.1 wants the reason said at the moment of
asking; the last column is where each app says it.

| What | Where it is asked or taken | Why, from the code | Required? | Who sees it | How long it is kept | Said at the point of asking |
|---|---|---|---|---|---|---|
| Email address | sign-up and claiming a guest account, both apps; handed over by Apple or Google on a provider sign-in | the 6-digit confirmation code, signing in, password reset, the deletion notice (`api/src/auth`, `api/src/gdpr/service.ts`) | for an account; a guest has none | the person and Hevalo staff, never other members | until the account is deleted | phone: "I’ll send a code there to check it’s really you."; website: the same under the field |
| Username | the sign-up name step, Settings → Username | the name others know you by: profile, search, friends, rankings, letters | yes; a guest gets a generated one | other members, and the public web when the profile is set to Everyone | until deletion; an old one is held for the account 60 days after a change | phone: "Other learners will see the name you pick."; website: the same under the field |
| Password | sign-up, claiming, changing it | signing in; checked against known leaks; stored only as a hash | for an email account | nobody | until deletion | — |
| Birth month and year | sign-up’s age and month steps; the one-time question after an Apple or Google sign-up (`BirthDatePromptScreen`, `web/src/auth/BirthDatePrompt.tsx`); the website’s sign-up | under 13 no account is made (`assertOldEnough`); under 18 the profile is never public, strangers cannot find, list or reach them, friend requests from others never reach them, leagues are off by default (`api/src/users/age.ts`, `applyMinorDefaults`); under 16 analytics consent stays off; letters go only within 13–15, 16–17 or 18+ (`letterBandSql`); a report involving a minor is raised in priority. The month makes the age exact to the month; the day is never asked | yes, before anything social | nobody else; moderators see only adult, minor or unknown | until deletion; only support can correct it | age step: "Your age decides who can find and message you, and who your letters go to."; month step: "… so your age is always right. Only the month and year are kept."; website: both under the fields. The minimum age is deliberately not named, so the question does not hint at which answer gets in |
| Display name | Edit profile; the name Apple or Google shares on a first sign-in | shown with the profile, in lists and letters, and searchable | no | other members | until cleared or deletion | "Optional. Others see it and can search for you by it."; under Apple and Google: "Apple or Google shares your name and email with Hevalo. Others see the name on your profile, never the email." |
| Bio | Edit profile | the profile | no | whoever the profile visibility allows | until cleared or deletion | "Optional. Shown on your profile." |
| Country | Edit profile | the profile and the "My country" rankings | no | profile viewers; that country’s board | until cleared or deletion | "Optional. Shown on your profile, and it puts you on your country’s rankings." |
| Profile or group picture | the system photo picker | the profile, the group; checked first (see "Pictures are checked" below) | no | as the profile, or the group’s members; only the person while it is being checked | until removed or deletion; a refused one 182 days, privately | the iOS photo sentence in `mobile/app.json` |
| Identity tags (age, gender, ethnicity) | Tags | shown on the profile when the person chooses; a sensitive one needs a ticked consent | no | profile viewers, only while shown | until removed or deletion | "I consent to showing this sensitive tag. It’s optional and can be removed anytime." |
| Time zone | taken from the phone or browser | when a streak day ends, when reminders may arrive | automatic | nobody | until deletion | — |
| Device id | a random id the app keeps per install (`X-Device-Id`) | names sessions in Settings → Devices, a guest’s way back in, per-device sign-in limits, abuse checks, and keeping people who were banned from coming back on the same phone (`api/src/moderation/returns.ts`) | automatic | the person (Devices), staff | stored as a hash; which phones an account used, 180 days (`device_sightings`); a known device 180 days after its last sign-in; a session 90 days at most; a banned person’s, as a keyed hash on the ban registry while the ban stands | — |
| Push token | after "Continue" and the system’s notifications question | reminders, word of a letter, word of a badge; a banned person’s, kept as a keyed hash while the ban stands, recognises their phone if they come back | only if allowed | nobody | until that session ends; a banned person’s hash until the ban ends | the screen before the prompt (`ReminderOffer.tsx`) |
| Network address and its country | every request | rate limits, sign-in protection, the security log (`api/src/security/log.ts`, `api/src/net/sightings.ts`) | automatic | security staff; the address is sealed and opened only by a superadmin with a reason | network sightings (hashed) 90 days; security log 90 days, a year for warnings; the address in it 30 days | the privacy policy |
| Voice notes | the record button (microphone) | a voice note on a post or comment | no | as the post | until deleted | the iOS microphone sentence |
| Speaking-exercise recordings | the record button (microphone) | played back to the learner | no | nobody: they never leave the phone | not kept | the iOS microphone sentence |
| Posts, comments, messages, letters, group posts | their composers | the feature itself | no | the people it is written to; a letter or private message reaches the safety team only when someone in the conversation reports it, an automatic check flags it, or a superadmin opens a safety review, each reading recorded (`api/src/message-access`) | until deleted, or deletion of the account | — |
| Feedback (stars, choices, comment, app version, platform, language) | the rating box, Settings → Send feedback | improving the app | no; the comment says "(optional)" | the team | deleted with the account | — |
| Reports and appeals | report sheets, Account standing | moderation | no | moderators | kept as moderation records after deletion | — |
| Letters and messages an automatic check flags | the word filter, the text classifier and the picture check, on sending; only sexual words, slurs, hateful or self-harm content, a held drawing, or anything sent to a minor (`api/src/moderation/service.ts`) | moderation | — | moderators, in the flag's case | with its case until a year after the case is decided, or until the writer's account is deleted if that is sooner (`pruneEvidence`, `eraseAccountData`) | — |
| Purchases | Shop (Zêr); store receipts once in-app purchases open | what was bought | — | the person | until deletion | — |
| Friend search | Friends | finding people | — | nobody; not stored | not kept | — |
| Crash reports | release builds, on their own | fixing crashes | automatic | the team | in server logs, with no account or device id | — |
| Phone number | neither app asks; the API keeps an optional, unused route (`api/src/auth/phone-routes.ts`) | — | — | — | — | — |

### Pictures are checked before others see them

Every picture someone shares (a post picture, a profile or group picture, a
drawing on a letter) is checked before anyone else can see it: automatically,
by an AI service working for us, and by people on our moderation team. Only the
picture is sent to the AI service, made smaller; never the account, the name or
any words with it (`api/src/moderation/vision-scanner.ts`).

- A clear picture is shown at once.
- An uncertain one is kept privately and only its owner sees it ("Being
  checked") until a person decides.
- A refused picture is not shown; its owner can ask a person to look. It is
  kept privately for up to **182 days**, for that review and for an appeal,
  then deleted.
- A possible child-safety hit is kept privately as evidence for **365 days**
  after it is decided, as other moderation evidence is.

The privacy policy (`web/src/pages/Privacy.tsx`) needs to say this too; that
wording is with the website's catalogues.

### Keeping banned people from coming back

When someone is suspended or banned, Hevalo keeps scrambled (keyed-hash)
copies of what identifies them: their email address (with `+tags` and Gmail's
dots taken out), their Apple or Google sign-in, a verified phone number, the
install ids of the phones they used in the last 180 days (at most 50) and
their push tokens (`api/src/moderation/ban-registry.ts`). Networks are never
on that list. A new account or a sign-in is compared with it
(`api/src/moderation/return-score.ts` has the rules):

- the same address, sign-in or phone number is refused as any sign-up refusal;
- the same phone (install id or push token) holds the new account: it can
  learn, but not post, message, upload, write letters or join groups, until a
  person on the moderation team decides; the hold is shown in Account
  standing with its reasons and can be appealed;
- a shared quiet network around the time of the ban, with the same time zone
  and language, only asks a person to look; a network on its own, or a busy or
  shared one (a school, a carrier, a VPN), does nothing at all.

The scrambled copies are kept while the ban stands (a suspension's until it
ends) and deleted when it is lifted or overturned; they stay if the banned
person deletes their account, as moderation records do. Which phones an
account used is kept 180 days, the networks it was seen on 90 days. This is
fraud prevention within App Functionality, not tracking: nothing leaves
Hevalo and nothing is matched with other companies' data.

Terms and the privacy policy are one tap from sign-up (the agreement line on
the phone’s first sign-in screen and on its last sign-up step, and under the
website’s sign-up form) and from Settings on both (Terms of Use, Privacy
Policy). Settings on both also has the data export and account deletion.

## App Privacy — data collected (App Store Connect answers)

All linked to the user's account except crash data, **none used for tracking**.
Purpose is *App Functionality* unless noted. The rows are the Privacy Manifest's
`NSPrivacyCollectedDataTypes`, one for one and in its order, which is the order
App Store Connect lists them in (`mobile/src/privacy-config.test.ts` checks the
two agree). The name in the first column is the one App Store Connect shows.

| Data type (App Store Connect) | Manifest type | Linked | Tracking | Purpose | What it is here |
|---|---|---|---|---|---|
| Contact Info → Name | `Name` | yes | no | App Functionality | username and display name on profiles; the name Apple or Google shares on a first sign-in |
| Contact Info → Email Address | `EmailAddress` | yes | no | App Functionality | sign-up and sign-in, the emailed code, password reset |
| Location → Coarse Location | `CoarseLocation` | yes | no | App Functionality | the country a sign-in came from, kept in the security log; the country a member may put on their profile. No precise location is ever read |
| Sensitive Info → Sensitive Info | `SensitiveInfo` | yes | no | App Functionality | the ethnicity, gender or age tag a member chooses to show on their profile; optional, consented, and removable |
| User Content → Emails or Text Messages | `EmailsOrTextMessages` | yes | no | App Functionality | direct and group messages, letters |
| User Content → Photos or Videos | `PhotosorVideos` | yes | no | App Functionality | profile picture, a group's picture, image and meme posts |
| User Content → Audio Data | `AudioData` | yes | no | App Functionality | voice notes on posts and comments; speaking-exercise recordings stay on the phone |
| User Content → Gameplay Content | `GameplayContent` | yes | no | App Functionality | game rounds, scores, ranks, the village |
| User Content → Customer Support | `CustomerSupport` | yes | no | App Functionality | feedback sent from the app, reports and appeals |
| User Content → Other User Content | `OtherUserContent` | yes | no | App Functionality | posts, comments, captions, bio, saved words |
| Identifiers → User ID | `UserID` | yes | no | App Functionality | the account's id |
| Identifiers → Device ID | `DeviceID` | yes | no | App Functionality | the random per-install id that names a signed-in device, and the push token; both also keep people who were banned from coming back on the same phone (fraud prevention, never tracking) |
| Purchases → Purchase History | `PurchaseHistory` | yes | no | App Functionality | what was bought in the shop with Zêr; receipts of in-app purchases once those open (none are sold today) |
| Usage Data → Product Interaction | `ProductInteraction` | yes | no | Analytics, App Functionality | lessons done, streak, XP, and the owner's first-party counts of active learners; never for ads |
| Diagnostics → Crash Data | `CrashData` | **no** | no | App Functionality | crash reports, sent first-party without the account |
| Other Data → Other Data Types | `OtherDataTypes` | yes | no | App Functionality | the birth month and year asked at sign-up, and the phone's time zone for streak days |

Not collected: **phone number** (neither app asks for one), **precise
location**, contacts, health and fitness, financial or payment information
(any purchase goes through the store, which keeps the card), browsing history,
search history (searches are answered and not kept), advertising data. No
third-party analytics or advertising SDK is in the build, so there is no App
Tracking Transparency prompt.

Google Play's Data safety form takes the same answers: approximate location
for the sign-in country, and the rest as above.

## Required-reason APIs (`NSPrivacyAccessedAPITypes`)

Declared with Apple's approved reason codes (used by the RN/Expo runtime + our code):

| API category | Reason | Why |
|---|---|---|
| `UserDefaults` | `CA92.1`, `1C8F.1` | the app's own settings and state; `1C8F.1` for the letter widget, which reads the app group `group.app.hevalo.mobile` |
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
- [ ] The privacy policy (`web/src/pages/Privacy.tsx`, `privacy.*` in the
      website's catalogues) names everything in the table above, and how long
      it is kept.
- [ ] Each question in the table "Where the apps ask" still says its reason.
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
- [ ] On the first sign-in screen of an iPhone, the line under the Apple and
      Google buttons says what they share and who sees it.
- [ ] Validate the generated `PrivacyInfo.xcprivacy` in the build; App Store Connect
      privacy answers match reality.

## Entering it in App Store Connect, step by step

1. **App Information**: Privacy Policy URL `https://hevalo.app/privacy`.
   User Privacy Choices URL (optional) `https://hevalo.app/privacy`, whose
   "Your choices" part says how to export and delete.
2. **App Privacy → Get Started**: "Do you or your third-party partners
   collect data from this app?" → **Yes, we collect data from this app**.
3. Tick exactly these, and nothing else:
   - Contact Info: **Name**, **Email Address**
   - Location: **Coarse Location**
   - Sensitive Info: **Sensitive Info**
   - User Content: **Emails or Text Messages**, **Photos or Videos**,
     **Audio Data**, **Gameplay Content**, **Customer Support**,
     **Other User Content**
   - Identifiers: **User ID**, **Device ID**
   - Purchases: **Purchase History**
   - Usage Data: **Product Interaction**
   - Diagnostics: **Crash Data**
   - Other Data: **Other Data Types**

   Then **Save**.
4. For each ticked type App Store Connect asks three questions. Answer every
   one the same way except where the table says otherwise:
   - "How is this data used?" → **App Functionality** only. Product
     Interaction alone: **App Functionality** and **Analytics**.
   - "Is this data linked to the user's identity?" → **Yes**. Crash Data
     alone: **No**.
   - "Is this data used for tracking purposes?" → **No**, for every type.
5. Check the preview reads "Data Linked to You" with the fifteen linked types,
   "Data Not Linked to You" with Crash Data, and no "Data Used to Track You".
   Then **Publish**.
6. In **App Review Information → Notes**, say that a guest can try the app
   without an account (the "Try Hevalo first" link), that an account can be
   deleted in Settings → Delete account, and give a demo account.
