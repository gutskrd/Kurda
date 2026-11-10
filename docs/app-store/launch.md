# Submitting Hevalo to the App Store

What has to be true, and what has to be filled in, before the iOS build is sent
for review. The code side is checked against the review guidelines in this
repository's tests and audits; this page is the part that lives outside the
code: App Store Connect, the server's settings, and the content.

Tick each line before pressing Submit. A line marked **owner** can only be done
by the account holder.

## 1. Accounts and agreements (owner)

- [ ] Apple Developer Program membership is active for the business
      (Zagrosian, KvK 42217689).
- [ ] App Store Connect → Business: the **Paid Apps** agreement is signed, with
      bank and tax details. It is needed before anything can be sold, and takes
      a few days to go through. The free agreement is enough for a first
      release that sells nothing.
- [ ] App Store Connect → the app → App Information → **Digital Services Act**:
      trader status declared, with the address, telephone number and email
      from the trade register (they are in `shared/src/provider.ts`). Apple
      shows these on the product page in the EU. Without it the app is not
      offered in the EU.

## 2. The app record

- [ ] Name `Hevalo`, bundle id `app.hevalo.mobile`, primary category Education.
- [ ] Version `1.0.0` (matches `mobile/app.json`).
- [ ] **Privacy Policy URL** `https://hevalo.app/privacy`, **Support URL**
      `https://hevalo.app/faq`, Marketing URL `https://hevalo.app`. All three
      must be live from the production branch before review.
- [ ] **App Privacy** answers copied from [`privacy.md`](privacy.md), row for
      row. "Data used to track you": none.
- [ ] **Age rating** questionnaire: user-generated content yes, messaging and
      chat yes, unrestricted web access no, gambling no, contests no. The app
      asks for a birth month and refuses under 13, so it is not in the Kids
      category.
- [ ] Export compliance: the build already declares
      `ITSAppUsesNonExemptEncryption = false`.
- [ ] Screenshots for 6.9" and 6.5" iPhone. iPad screenshots are not needed
      (`supportsTablet` is false).

## 3. What the reviewer needs (App Review Information)

Most of the app sits behind an account, and a new account waits for an emailed
code. A reviewer cannot receive that code, so give them accounts that are
already through it.

- [ ] **Demo account 1**: an adult account, email confirmed, with at least one
      friend, one group, a few posts in its feed, and some Zêr to spend in the
      shop.
- [ ] **Demo account 2**: the friend, so that chat, gifts and a game against a
      person can be tried. Put both sign-ins in the notes.
- [ ] Notes for the reviewer, in these words or close to them:

  > Hevalo is a Kurdish-learning app with a community. Guest mode ("Try Hevalo
  > first, no account needed" on the first screen) opens lessons, the
  > dictionary and solo games.
  > Community features need an account; two are provided above.
  >
  > User-generated content (Guideline 1.2):
  > - Report: the "…" menu on any post, comment, message, group or profile →
  >   Report.
  > - Block: a profile's "…" menu → Block; the list is in Settings → Blocked.
  > - Text is filtered for objectionable words when it is posted; reported
  >   content is reviewed by a person within 24 hours and removed, and the
  >   account that posted it is restricted or closed.
  > - Terms are agreed to at sign-up; they are in Settings → About Hevalo.
  > - Contact: support@hevalo.app, also in Settings → About Hevalo.
  >
  > Account deletion (Guideline 5.1.1(v)): Settings → Delete account. It is
  > also offered on the email-code screen of a new account.
  >
  > Sign in with Apple is offered wherever Google is.
  > The app has no advertising and no third-party analytics.

  Do not say that pictures are scanned automatically unless a scanner has been
  connected (section 5).

## 4. Server settings (owner, on the hosting dashboard)

- [ ] `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`: the Sign in with
      Apple key. Without them a deleted account's Apple sign-in is not revoked
      with Apple, which the deletion guideline asks for.
- [ ] `APPLE_CLIENT_IDS` contains `app.hevalo.mobile`.
- [ ] `GOOGLE_CLIENT_IDS` contains the web, iOS and Android client ids, and the
      build has `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and
      `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Without them the Google button is
      hidden, which is allowed, but it should be a choice.
- [ ] `IAP_PURCHASES_OFF=true` for as long as nothing is sold.
- [ ] The evidence bucket (`S3_EVIDENCE_BUCKET`) is writable, so data exports
      and report evidence are kept off the public bucket.
- [ ] The server's plan does not sleep: a reviewer who meets a cold start of
      half a minute on the first screen reports the app as not loading.

## 5. Content and moderation

- [ ] Lessons are published (the course is all drafts until each lesson is
      reviewed and published in the admin).
- [ ] At least a few stories are published, and the games that are listed have
      their content approved. The phone lists a game only once it can be
      played, so nothing in the build says "coming soon".
- [ ] Somebody reads the report queue in the admin every day from the day of
      launch. The promise in the review notes is 24 hours.
- [ ] Pictures: the build posts them at once and relies on reports. Guideline
      1.2 asks for a way to filter objectionable material. Text is filtered by
      a word list; for pictures either connect an image-scanning service (the
      server has the place for one, `moderation/image-scanner.ts`) or decide
      to hold new members' first pictures for approval. Decide before launch,
      and say only what is true in the review notes.

## 6. The build

```bash
cd mobile
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```

- [ ] Installed from TestFlight on a real iPhone and walked through once:
      sign up, the emailed code, a lesson with a speaking exercise (microphone
      prompt, then refuse it once and see the app carry on), a profile picture
      (photo prompt), a post, a report, a block, notifications on, sign out,
      delete account.
- [ ] The same walk with the system text size at its largest, and once in a
      right-to-left language.

## 7. The day it is approved

- [ ] The website stops saying the apps are coming: the hero line, the status
      line, About's "Coming next", the FAQ's "Is there an app?" and the
      footer's store column (`web/src/i18n/*`, keys `landing.hero.note`,
      `landing.status.app`, `about.next.apps`, `faq.app.a`, `footer.iosSoon`).
- [ ] `ios.appStoreUrl` in `mobile/app.json` is filled in, so "Rate Hevalo"
      opens the store page.

## Selling (Hevalo+ and Gewher), when it is turned on

Nothing is sold in 1.0.0, and the privacy page says so. When purchases are
added they go through the store's own purchase sheet only (Guideline 3.1.1),
and these are created in App Store Connect first:

| Product | Type | Reference id | Price |
|---|---|---|---|
| Hevalo+ monthly | auto-renewing subscription | `app.hevalo.plus.monthly` | €3.99 a month, with an introductory offer: first month €0.99 (pay as you go, 1 month) |
| Hevalo+ yearly | auto-renewing subscription, same group | `app.hevalo.plus.yearly` | €29.99 a year |
| Gewher, small | consumable | `app.hevalo.gems.60` | €0.99 |
| Gewher, medium | consumable | `app.hevalo.gems.350` | €4.99 |
| Gewher, large | consumable | `app.hevalo.gems.800` | €9.99 |

The paywall must show the price, the period, that it renews until cancelled,
the introductory price and what follows it, and links to the Terms and the
Privacy Policy; it needs a Restore Purchases button; and Settings needs a
"Manage subscription" link to the store's own page. The privacy page's
"Nothing in Hevalo is sold for real money" changes on the same day.
