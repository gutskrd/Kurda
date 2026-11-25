# Hevalo+ and Zêr: the money model

Hevalo stays free to learn. Hevalo+ sells comfort, looks, family and hosting, never learning itself: no hearts, no
limits on review, no ads anywhere, nothing that wins a quiz. Everything is sold in the phone app only, through the
phone stores. The website shows what people own and what things are worth, and sells nothing.

## One currency: Zêr

Gewher is retired. Zêr is the only currency: earned by Hevalo+ members through learning, bought in packs by anyone,
spent on looks and gifts.

- **What a Zêr is worth.** 100 Zêr is one unit of the store's currency: €1, or $1 in the US store, as the big games
  price their coins. Every price in Zêr is shown with its real-money value next to it ("300 Zêr · ≈ €3", "250 Zêr ·
  ≈ €2.50"), in the store's own currency when the phone has the store's price for the smallest pack and in euros
  otherwise. This follows the price-disclosure rule in the proposed EU Digital Fairness Act.
- **Packs** (phone stores only, nothing sold yet; shared `ZER_PACKS`). The bigger packs carry bonus Zêr, shown apart
  from the pack's own, so a Zêr keeps one price:

  | Pack | Bonus | Lands | Price | Store id |
  |---|---|---|---|---|
  | 100 Zêr | | 100 | €0.99 | `app.hevalo.zer.100` |
  | 500 Zêr | | 500 | €4.99 | `app.hevalo.zer.500` |
  | 1,000 Zêr | + 100 | 1,100 | €9.99 | `app.hevalo.zer.1100` |
  | 2,000 Zêr | + 400 | 2,400 | €19.99 | `app.hevalo.zer.2400` |
  | 5,000 Zêr | + 1,500 | 6,500 | €49.99 | `app.hevalo.zer.6500` |

- **The switch from Gewher.** Each Gewher held becomes 5 Zêr. What was priced or paid in Gewher is set at the new rate:
  league promotion pays 25 Zêr (was 10 Gewher), a tournament win 125 Zêr (was 50 Gewher).
- **The move to 100 Zêr to the euro.** Every Zêr price and earning was halved and rounded to a tidy 5. Balances were
  not: nobody's number went down, and what early learners saved buys twice as much, as a thank-you.
- **Nothing random is sold.** No paid chests, wheels or packs with unknown contents. Free rewards may vary in size.
- **Looks only.** Zêr never buys XP, answers, streak protection, league places or quiz advantages.

## Earning

Only Hevalo+ members earn Zêr (a family plan counts; a child's profile never earns). Anyone else keeps the Zêr they
have, spends it and can buy more; where the apps would show earned Zêr to them, they say once that it comes with
Hevalo+.

| Source | Hevalo+ member |
|---|---|
| Daily Zêr (the 7-day cycle) | 5, 10, 10, 15, 15, 20, 50 |
| Members' box, once each paid month | 250 Zêr, 3 free gifts, that month's members-only icon or background |
| Daily quest chests | common 6–10, rare 10–20, epic 20–35 |
| Tree harvest | 15 |
| Streak milestones: 7, 14, 30, 60, 100, 200, 365 days | 40, 60, 120, 150, 250, 400, 800 |
| Wins against other people (online games and quiz nights, rooms of 2+ accounts) | 10 a win, 3 paid wins a day |
| Quiz night podium (rooms of 4+ accounts) | 30 / 20 / 10 |
| League promotion | 25 |
| Tournament win | 125 |
| Newroz event quests | 75, 100 and 175, and 250 for the event |

- A streak milestone pays again only when a new streak reaches it at least 60 days after it last paid.
- Paid wins skip pairs that look like one person (same device or network, per the existing ban-evasion signals).
- Earned Zêr is capped at 1,000 a day (purchases and the members' box are not), so nothing can be farmed.

## Spending

| What | Zêr |
|---|---|
| Backgrounds | 200–300 |
| Icons | 300–450 |
| Frames | 600–1,000 |
| Trees | 400–1,100 |
| Changing the letter bird | 250 |
| The Kurdish tag | 250 |
| Gift stickers | 20, 50, 150 |

Streak restore is no longer bought: a member gets one free restore a month (as today), and anyone wins a broken streak
back by finishing three lessons or practice sessions in one day within the three-day window. A price of 500 Zêr or
more needs a second admin's approval.

## Gifts

- Shop items as today, plus gift stickers: the app's icon pictures as small gifts at 20, 50 and 150 Zêr. A free gift
  from the members' box pays for one gift of up to 150 Zêr.
- Sent to one to seven friends (in a chat) or onto a post. A post shows its gifts as a small row with a count; its
  author is told. Gifts onto a post come only from the author's friends of a day or more, or from anyone when both
  people are known adults.
- The existing limits stay (10 sent a day, 3 a day to one friend, 10 received a day). Gifts are never currency and
  are never turned into money.

## Hevalo+

| Plan | Price | Store id |
|---|---|---|
| Monthly | €3.99 (first month €0.99) | `app.hevalo.plus.monthly` |
| Yearly | €29.99 | `app.hevalo.plus.yearly` |
| Family monthly, up to 6 people | €6.99 | `app.hevalo.family.monthly` |
| Family yearly, up to 6 people | €59.99 | `app.hevalo.family.yearly` |

Members get: Zêr from learning and playing (only members earn it), the daily Zêr and the members' box; members-only
icons and backgrounds to wear; two streak freezes and a free restore a month; bigger quiz rooms (up to 50 players,
others 8); lessons and audio downloaded for offline use; new culture-library collections first. Paying is through the
phone stores (renewal terms, restore and manage links on the paywall). The server checks every store receipt and every
renewal or refund notice; the apps never decide who is a member.

## Families and children

- A **family** is an adult owner plus up to five people: adults invited by code, teens of 13 to 17 already linked by
  the parental controls, and children under 13. A family plan makes everyone in it a member while it lasts.
- A **child profile** (under 13) is made by a parent, never by the child. It has a first name or nickname, a birth
  month and year, and a preset avatar: no email, password, phone number or photo. The parent's creation records their
  consent, and the parent gets an email confirming it with a link to delete the profile.
- A child signs in on the parent's phone (a profile switch; going back to the parent needs the family PIN) or on
  their own phone with a short pairing code the parent shows. The parent sees and removes the child's devices.
- A child can learn: lessons, practice, stories read aloud, riddles, proverbs, the alphabet, the dictionary, the
  tree, streaks, XP, badges, earned looks and one-phone games, and later family quiz rooms. A child cannot chat, add
  friends, post, write letters, play online with anyone outside the family, appear on rankings or be found by
  others. Nothing about a child is shown outside the family.
- **Purchases are off on child profiles.** A child can ask; the parent approves on their own phone and pays there,
  and the Zêr or plan lands on the child. Teens follow the existing parental purchases switch.
- The parent sets the daily time and bedtime as for teens, sees each week's learning, downloads the child's data,
  and deletes the profile at once. At 13 the parent is told and can turn the profile into a teen account linked to
  them.
- Before child profiles are released: the privacy policy gains a children's section, Google Play's target audience
  is updated, and a privacy lawyer checks consent and data handling for the EU, the UK and the US.

## Quiz nights

A host (any account) opens a room; players join by code or link. Free hosts seat 8, members 50. The host's phone shows
the question and the scores; players answer on their own phones. Players without an account join with a nickname
(filtered) and earn nothing; there is no chat. Question packs cover the language, culture, history and Newroz, with
native review; hosts may write their own questions, filtered like posts. Children join only rooms hosted by their
family.

## Offline

Members download a unit's lessons and audio to the phone; answers given offline are sent when the phone is back
online, as today.

## Culture library

Folk tales read aloud for children, recipes and the history of the dengbêj tradition, written fresh or used with
permission, in every app language with native review of the Kurdish. Members get new collections first; what is free
today stays free.
