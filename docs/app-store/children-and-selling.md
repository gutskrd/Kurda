# Store answers for the version with child profiles and Hevalo+

What to change in App Store Connect and the Google Play Console when the version with child profiles, families and
Hevalo+ goes to review. Everything not named here stays as in [`launch.md`](launch.md). The reasons behind the
children’s answers are in [`../privacy/children.md`](../privacy/children.md). Fill these in on the day that version is
submitted, not before: the answers must describe the build under review.

## App Store Connect

### Age rating (App Information → Age Rating → Edit)

| Question | Answer | Why |
|---|---|---|
| Parental controls | **Yes** | parents link teens and manage child profiles: daily time, bedtime, what a teen may use |
| Age assurance | No | the birth month is declared, not checked |
| Unrestricted web access | No | |
| User-generated content | Yes | posts, comments, pictures, voice notes |
| Social media | Yes | the feed |
| Social media disabled for users under 13 | No | Apple means its age-range check, which this version does not make; child profiles have no social features all the same |
| Messaging and chat | Yes | direct messages and groups (never for child profiles) |
| Shared location | No | |
| Advertising | No | |
| Profanity, horror, alcohol, drugs, medical, wellness, sexuality, guns | None | |
| Cartoon or fantasy violence | None | |
| Realistic violence | Infrequent | the legends and the history behind them tell of killings and of Halabja, in words |
| Dating and relationships | No | |
| Gambling | No | Zêr can never be turned into money |
| Simulated gambling | None | |
| Contests | None | leagues and quiz nights reward Zêr, never money or goods |
| Loot boxes | No | nothing random is sold; quest chests are earned |

The result stays **13+**: social media and the history put it there. Do not choose “Made for Kids” and do not
override the rating. What this means for families: a child can use Hevalo on a parent’s phone at any time; on a
child’s own iPhone, a parent who limits apps by age in Screen Time allows 13+ apps or allows Hevalo by name.

### App Privacy (App Privacy → Edit)

No change: every type is already declared in [`privacy.md`](privacy.md), including Purchases → Purchase History.
Child profiles add no new type (a nickname is Name, the birth month is Other Data, learning is Product Interaction).
“Data used to track you”: still none.

### In-App Purchases and Subscriptions

Created from the list that comes with the purchase build (the plans and Zêr packs in
[`../money/hevalo-plus.md`](../money/hevalo-plus.md)). The Paid Apps agreement, with bank and tax details, must be
active first (`launch.md`, section 1).

### App Review Information

- Keep the two demo accounts, and add to demo account 1 a child profile, with the family PIN written in the notes.
- Add to the notes:

  > Children under 13 cannot make an account. A parent can make a child profile (ages 6 to 12) in Settings → Family;
  > the parent consents on that screen and gets a confirmation email. A child profile is learning only: no chat,
  > posts, friends, letters, online play outside the family, rankings, uploads or purchases. Switch to it from
  > Settings → Family → the child; the family PIN in these notes returns to the parent. Hevalo has no ads and no
  > third-party analytics, and children’s data is used only to run their learning.

### Availability

Unchanged: still without the United States and Brazil until the age-range check is built (`launch.md`, section 0).

## Google Play Console (Policy → App content)

### Target audience and content

- Target age groups: **6–8, 9–12, 13–15, 16–17, 18 and over**. Not “5 and under”.
- This puts Hevalo under the **Families policy** as an app for children and older people. What it asks, and how
  Hevalo meets it:
  - a neutral age question: sign-up asks the age and month with nothing chosen beforehand, and anyone under 13 is
    sent to a parent;
  - no advertising id or device identifiers sent from children: the advertising-id permission is blocked in the
    build, and Hevalo uses no advertising or analytics libraries;
  - no ads: none anywhere;
  - children’s data disclosed and handled lawfully: the privacy page’s “Children” part;
  - no anonymous chat for children: children cannot chat at all, and chat is never anonymous.
- Tick the box agreeing to the Families policy. Leave “Teacher Approved” alone.

### Ads

“No, my app does not contain ads.”

### Content rating (IARC questionnaire)

Category **Reference, News, or Educational**. Answers:

- Violence: only described in words, in a historical or folk-tale setting; nothing shown.
- Sexuality, language, drugs, gambling, crude humour: none.
- Users can interact or exchange content: **yes** (messages, posts, groups).
- Shares the user’s location with others: no.
- Allows purchases of digital goods: **yes** (Hevalo+ and Zêr).
- Random items bought with real money: no.

### Data safety

As in [`privacy.md`](privacy.md), with these lines added or confirmed:

- Financial info → **Purchase history**: collected, not shared, optional (only when someone buys), for App
  functionality.
- Personal info → Name, Email address, User IDs; Other info (birth month and year): unchanged.
- Data is encrypted in transit: yes.
- People can ask for their data to be deleted: yes, in the app, and at `https://hevalo.app/privacy#rights`.
- Account deletion web address: `https://hevalo.app/privacy#rights`.

### Monetisation

Products created in the Play Console from the same list as on iOS; the payments profile with the business’s bank
account must be set up first (`launch.md`, section 8).

## Before pressing Submit on either store

- [ ] The privacy page with its “Children” part is live on hevalo.app.
- [ ] The data processing agreement of each provider is downloaded and kept (hosting, website and storage, email,
      notifications, picture checks); most are part of their terms.
- [ ] The checklist at the end of [`../privacy/children.md`](../privacy/children.md) is ticked.
