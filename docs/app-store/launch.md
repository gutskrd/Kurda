# Submitting Hevalo to the App Store and Google Play

What has to be true, and what has to be filled in, before the iOS build is sent
for review, and the Android build after it (section 8). The code side is checked against the review guidelines in this
repository's tests and audits; this page is the part that lives outside the
code: App Store Connect, the server's settings, and the content. What goes into
the listing itself, word for word in every language, is in
[`listing.md`](listing.md); the App Privacy answers are in
[`privacy.md`](privacy.md). What changes for the version with child profiles and Hevalo+ is in
[`children-and-selling.md`](children-and-selling.md).

Tick each line before pressing Submit. A line marked **owner** can only be done
by the account holder.

## 0. What Apple asks of every submission in 2026

- Builds uploaded since 28 April 2026 must be made with Xcode 26 against the
  iOS 26 SDK; from April 2027 it is the iOS 27 SDK. The build service's
  default image for this app's SDK (Expo 57) is on Xcode 26, so nothing has to
  be set; a build made on an older image is refused at upload.
- The age rating questionnaire has asked about social media since July 2026,
  and the answer is required since September 2026. Two more content
  descriptors, Shared Location and Dating and Relationships, are asked from
  16 November 2026 and must be answered for every app by 12 January 2027.
  The answers for Hevalo are in section 2.
- In Texas (since 4 June 2026), Utah (6 May 2026) and Louisiana (1 July 2026)
  a new Apple Account's age category is given to apps through Apple's age-range
  framework, and the law there puts duties on the app as well as on the store:
  read the age category, and ask a parent through the store before a
  significant change for a minor. Hevalo 1.0.0 does not read it. Until it does,
  leave the United States out of the countries the app is offered in (section
  2, Availability), and Brazil too, where Apple applies new age rules of its
  own (its notice of 24 February 2026). Reading it is one native module this app's SDK already offers
  (`expo-age-range`) and an entitlement on the App ID, for a later version.

## 1. Accounts and agreements (owner)

- [x] Apple Developer Program membership is active (it renews each August).
      Zagrosian (KvK 42217689) is an eenmanszaak, and Apple takes only legal
      entities as organisations, so the membership is the owner's own, as an
      individual: the store names the owner as the seller and Hevalo as the
      app. Having Zagrosian named as the seller needs a legal entity, such as
      a BV, and the membership moved to it through Apple's developer support.
- [ ] App Store Connect → Business: the free apps agreement is accepted. The
      **Paid Apps** agreement, with bank and tax details, is only needed once
      something is sold; nothing is in 1.0.0. When it is, the bank details are
      the business's own ING account, entered there by the owner; account
      numbers never go into this repository.
- [ ] App Store Connect → the app → App Information → **Digital Services Act**:
      trader status declared, with the address, telephone number and email
      from the trade register (they are in `shared/src/provider.ts`). Apple
      shows these on the product page in the EU. Without it the app is not
      offered in the EU.

## 2. The app record

- [ ] New app: platform iOS, name **Hevalo: Learn Kurdish**, primary language
      English (U.S.), bundle id `app.hevalo.mobile`, SKU `hevalo-ios`.
      If the name is taken, the store says so on this screen; the listing's
      other languages carry their own names (`listing.md`).
- [ ] Category: **Education**. No secondary category: a second one adds little to search, and Games would put the app under a parent's time limit for games.
- [ ] Version `1.0.0` (matches `mobile/app.json`).
- [ ] **Privacy Policy URL** `https://hevalo.app/privacy`, **Support URL**
      `https://hevalo.app/faq`, Marketing URL `https://hevalo.app`. All three
      must be live from the production branch before review.
- [ ] **App Privacy** answers copied from [`privacy.md`](privacy.md), row for
      row. "Data used to track you": none.
- [ ] Every language in [`listing.md`](listing.md) added under App
      Information and the version page: name, subtitle, promotional text,
      description, keywords, what's new. `node scripts/check-listing.mjs`
      first, so nothing is refused for its length.
- [ ] Screenshots: the six in `docs/app-store/screenshots/` into the
      **6.9-inch iPhone** slot, in their numbered order. The store makes every
      smaller iPhone's from them. No iPad set: the build is iPhone-only
      (`supportsTablet: false`), so an iPad runs it in its iPhone window, and
      the store asks for iPad screenshots only from apps built for iPad.
- [ ] **Age rating** questionnaire, answered as below. The result is **13+**,
      which matches the app: it asks for a birth month and refuses anybody
      under 13, so it is not in the Kids category.

  | Question | Answer | Why |
  |---|---|---|
  | Parental controls | No | |
  | Age assurance | No | the birth month is declared, not checked |
  | Unrestricted web access | No | links open the browser, nothing browses inside the app |
  | User-generated content | Yes | posts, comments, pictures, voice notes |
  | Social media | Yes | a feed with likes, comments and reposts |
  | Social media disabled for users under 13 | No | there are no accounts under 13, but the store means the age-range check, which 1.0.0 does not make |
  | Messaging and chat | Yes | direct messages and groups |
  | Advertising | No | |
  | Realistic violence | Infrequent/Mild | the legends and the history behind them tell of killings and a massacre (Halabja), in words, never shown |
  | Profanity, horror, alcohol, medical, wellness, sexuality, cartoon or fantasy violence | None | the app's own content; what members post is moderated |
  | Gambling, simulated gambling | No | |
  | Contests | None | leagues pay Zêr, which is not money |
  | Loot boxes | No | a quest's chest is earned, never bought, and holds Zêr |
  | Shared location | No | a member's country is chosen by them, never read from the phone |
  | Dating and relationships | No | |

- [ ] **Availability**: every country and region except the **United States**
      and **Brazil** (section 0), and **China mainland**: the country list
      names Taiwan, Palestine and Kurdistan as countries, which that
      storefront refuses.
- [ ] Export compliance: the build already declares
      `ITSAppUsesNonExemptEncryption = false` (only the system's HTTPS).
- [ ] Accessibility Nutrition Labels (optional): fill in only what was tried
      on a phone with the TestFlight build (section 6) — VoiceOver, larger
      text, dark interface, reduced motion — and leave the rest unanswered.

## 3. What the reviewer needs (App Review Information)

Most of the app sits behind an account, and a new account waits for an emailed
code. A reviewer cannot receive that code, so give them accounts that are
already through it.

- [ ] **Demo account 1**: an adult account (a birth month that makes it
      18 or over), email confirmed, with at least one friend, one group, a few
      posts in its feed, a letter on its window, a tree planted, and some Zêr
      to spend in the shop. Sign in with it on a phone once before submitting.
- [ ] **Demo account 2**: the friend, so that chat, gifts and a game against a
      person can be tried. Put both sign-ins in the notes, never in this
      repository.
- [ ] Notes for the reviewer, in these words or close to them:

  > Hevalo is a Kurdish-learning app with a community. Guest mode ("Try Hevalo
  > first, no account needed" on the first screen) opens lessons, the
  > dictionary and solo games.
  > Community features need an account; two are provided above.
  >
  > User-generated content (Guideline 1.2):
  > - Report: the "…" menu on any post, comment, message or group, and the
  >   "…" at the top of any profile → Report.
  > - Block: the "…" at the top of a profile → Block; the list is in
  >   Settings → Privacy → Blocked people.
  > - Text is filtered for objectionable words when it is posted; reported
  >   content is reviewed by a person within 24 hours and removed, and the
  >   account that posted it is restricted or closed.
  > - Terms are agreed to at sign-up; they are in Settings → About & legal →
  >   Terms of Use.
  > - Contact: support@hevalo.app, also in Settings → Help → Contact support.
  >
  > Account deletion (Guideline 5.1.1(v)): Settings → Delete account. It is
  > also offered on the email-code screen of a new account.
  >
  > Letters (pen pals): a learner can send one letter at a time to another
  > learner chosen at random, and only within the same age band (13–15,
  > 16–17, adults). Letters carry no links or contact details, pass the same
  > word filter, and every letter can be reported and its writer blocked.
  > Direct messages are between friends only, and people under 18 cannot be
  > sent friend requests.
  >
  > The "How are you enjoying Hevalo?" stars are our own feedback form; they
  > never lead to the App Store, and the store's rating prompt is the system's.
  >
  > Sign in with Apple is offered wherever Google is.
  > Nothing is sold: Zêr is earned by learning and cannot be bought.
  > The app has no advertising and no third-party analytics.

  Do not say that pictures are scanned automatically unless a scanner has been
  connected (section 5).

## 4. Server settings (owner, on the hosting dashboard)

Nobody has signed in with Apple or Google on the live server yet (its logs
have no such request), so none of these has been proven by use. Check each on
the dashboard before submitting, and sign in once with Apple from the
TestFlight build (section 6).

- [ ] `APPLE_CLIENT_IDS` contains `app.hevalo.mobile`. Without it the server
      answers every Sign in with Apple with "not configured", the button the
      reviewer is most likely to try fails, and the app is rejected under 2.1.
- [ ] `APPLE_TEAM_ID` (`C66L2R2VX2`), `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`: the
      Sign in with Apple key. Without them a deleted account's Apple sign-in
      is not revoked with Apple, which the deletion guideline asks for. Set
      them before review: only sign-ins made after the key exists can be
      revoked.
- [ ] Email delivery works (the email service's key is set and the sending
      domain verified): a new email account cannot get past its code without
      it.
- [ ] Media storage works: a profile picture and a voice note upload from the
      TestFlight build.
- [ ] `GOOGLE_CLIENT_IDS` contains the web, iOS and Android client ids, and the
      build has `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and
      `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Without them the Google button is
      hidden, which is allowed, but it should be a choice.
- [ ] `IAP_PURCHASES_OFF=true` for as long as nothing is sold.
- [x] The evidence bucket (`S3_EVIDENCE_BUCKET`) is writable, so data exports
      and report evidence are kept off the public bucket. Done: the server's
      start-up log says "private storage ready".
- [x] The server's plan does not sleep (a paid instance, checked 13 November
      2026): a reviewer who meets a cold start of half a minute on the first
      screen reports the app as not loading.

## 5. Content and moderation

- [ ] Lessons are published (the course is all drafts until each lesson is
      reviewed and published in the admin).
- [ ] At least a few stories are published, and the games that are listed have
      their content approved. The phone lists a game only once it can be
      played, so nothing in the build says "coming soon".
- [ ] Somebody reads the report queue in the admin every day from the day of
      launch. The promise in the review notes is 24 hours.
- [ ] Pictures: the build posts them at once and relies on reports, behind the
      scanning seam (`moderation/image-scanner.ts`), which until a provider is
      connected passes every picture. Guideline 1.2 asks for a way to filter
      objectionable material; the text filter, the reports and the 24-hour
      promise are that today. Connecting a scanning service is one class
      behind that seam and one key on the server; decide before launch, and
      say only what is true in the review notes.

## 6. The build

The build is made from `main`, so everything meant to ship is merged first.

```bash
cd mobile
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```

The first build asks for the Apple account once and makes the certificates,
the provisioning profile and the push notification key itself.

- [ ] **owner**: once the app record exists, put its Apple ID (App Store
      Connect → App Information → Apple ID) next to the team id under
      `submit.production.ios` in `mobile/eas.json`, as `ascAppId`, so later
      submissions do not ask for it. The team id (`appleTeamId`) is already
      there, from the developer account's membership page.
- [ ] Tried once on an iPad as well: App Review opens iPhone apps on an iPad,
      and every screen has to work in that window.

- [ ] Installed from TestFlight on a real iPhone and walked through once:
      sign up, the emailed code, a lesson, a profile picture (photo prompt),
      a voice note (microphone prompt, then refuse it once and see the app
      carry on), a post, a report, a block, notifications on, sign out,
      delete account.
- [ ] The same walk with the system text size at its largest, and once in a
      right-to-left language.
- [ ] After the first upload, read App Store Connect's processing email. The
      photo picker's library contains camera code the app never calls; if the
      email asks for a camera purpose string (ITMS-90683), say so and one is
      added before submitting.
- [ ] No in-app purchase products attached to the 1.0.0 submission.

## 7. The day it is approved

- [ ] The website stops saying the apps are coming: the hero line, the status
      line, About's "Coming next", the FAQ's "Is there an app?" and the
      footer's store column (`web/src/i18n/*`, keys `landing.hero.note`,
      `landing.status.app`, `about.next.apps`, `faq.app.a`, `footer.iosSoon`).
- [ ] `ios.appStoreUrl` in `mobile/app.json` is filled in, so "Rate Hevalo"
      appears in Settings and opens the store page; until then the row is not
      shown.

## 8. Google Play (owner, after the iOS build is through)

The same build makes the Android app (`app.hevalo.mobile`). Play asks for
much of what the App Store does, in its own words.

- [ ] A Play Console developer account. Google offers organisation accounts
      to businesses with a D-U-N-S number, checked against the trade-register
      details (`shared/src/provider.ts`), and then shows Zagrosian as the
      developer; ask for the number for the eenmanszaak first. If Google does
      not take it, a personal account names the owner, as on the App Store.
- [ ] **Push on Android**: Android phones get their notification token through
      Firebase. Create a Firebase project for `app.hevalo.mobile`, download its
      `google-services.json`, and add it to the build service as a file
      variable named `GOOGLE_SERVICES_JSON` (visibility: secret), so the build
      reads it without it ever being in this repository (`mobile/app.config.ts`).
      Then upload the Firebase service-account key (FCM V1) under the build
      service's credentials for Android. Without both, Android builds run but
      receive no reminders.
- [ ] **Google sign-in on Android**: the Android OAuth client in the Google
      Cloud project needs the SHA-1 of Play's app-signing key (Play Console →
      Test and release → App integrity), not only the upload key's. Without it
      the Google button fails on every phone that installed from Play.
- [ ] Store listing: name, short description (80), full description (4000),
      in the languages of `listing.md`; the 512 × 512 icon, a 1024 × 500
      feature graphic, and phone screenshots.
- [ ] **Data safety** form, answered from [`privacy.md`](privacy.md): the same
      data, collected for the same purposes, encrypted in transit, none of it
      shared or sold, and deletion offered inside the app.
- [ ] **Account deletion** web address (asked for in the data safety form):
      `https://hevalo.app/privacy`, whose "Your choices" part says how to
      delete an account and what happens in the 14 days after. Anyone can
      also delete it on the website, under Settings, without the app.
- [ ] **Content rating** questionnaire (IARC): user interaction, users can
      share content with each other, no location shared, nothing bought. The
      answers mirror section 2's table.
- [ ] **Target audience**: 13 and over, not designed for children.
- [ ] The privacy policy address, the same as on iOS.
- [ ] A closed test first: Play asks new personal accounts for twelve testers
      over fourteen days before production; an organisation account can go to
      production straight away, but one internal test round on real Android
      phones is still worth it (the walk in section 6).
- [ ] **Payments profile** (only once something is sold): the business's ING
      account, entered by the owner in the Play Console's payments settings.
- [ ] The day it is live: `android.playStoreUrl` in `mobile/app.json` is filled
      in, so "Rate Hevalo" appears on Android, and the website's store column
      lists Google Play.

```bash
cd mobile
npx eas-cli build --platform android --profile production
npx eas-cli submit --platform android --profile production
```

## Selling (Hevalo+ and Zêr), when it is turned on

Nothing is sold in 1.0.0, and the privacy page says so. The phone shows no
avatar, crown or line that only Hevalo+ unlocks to anybody who is not a
member, because nothing in the app sells it. When purchases are added they go
through the store's own purchase sheet only (Guideline 3.1.1), and these are
created in App Store Connect first:

| Product | Type | Reference id | Price |
|---|---|---|---|
| Hevalo+ monthly | auto-renewing subscription | `app.hevalo.plus.monthly` | €3.99 a month, with an introductory offer: first month €0.99 (pay as you go, 1 month) |
| Hevalo+ yearly | auto-renewing subscription, same group | `app.hevalo.plus.yearly` | €29.99 a year |
| 400 Zêr | consumable | `app.hevalo.zer.400` | €0.99 |
| 2,200 Zêr | consumable | `app.hevalo.zer.2200` | €4.99 |
| 4,800 Zêr | consumable | `app.hevalo.zer.4800` | €9.99 |
| 10,400 Zêr | consumable | `app.hevalo.zer.10400` | €19.99 |

Zêr is the one currency: Gewher was folded into it at five Zêr to one. Every
Zêr price in the apps and on the website already shows what it is worth,
"≈ €0.99" for 400 Zêr (shared `zerValue`, from the smallest pack); once the
store's own price for that pack is known on the phone it is said in the
reader's store currency instead.

The paywall must show the price, the period, that it renews until cancelled,
the introductory price and what follows it, and links to the Terms and the
Privacy Policy; it needs a Restore Purchases button; and Settings needs a
"Manage subscription" link to the store's own page. The privacy page's
"Nothing in Hevalo is sold for real money" changes on the same day.
