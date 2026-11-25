# Children’s data in Hevalo: assessment and rules

Hevalo is not a children’s app, but a parent can make a profile for a child of 6 to 12, and teens of 13 to 17 have
their own accounts. This page is the record of how children’s data is handled: the data protection impact assessment
the GDPR asks for (art. 35, and the UK Age Appropriate Design Code), the retention policy and consent method the US
children’s privacy rule asks for (COPPA, 16 CFR 312, as amended in 2025), and what to do with a parent’s request. The
public version is the “Children” part of hevalo.app/privacy; the two must say the same thing. Review this page once a
year and whenever a feature reaches children.

## 1. What is processed, and why

| Data | Why | Kept |
|---|---|---|
| First name or nickname, birth month and year, preset avatar | to greet the child, apply the age rules, show the profile to the family | while the profile exists |
| Lessons, answers, XP, streaks, badges, tree | the learning itself and the parent’s week view | while the profile exists |
| Minutes in the app per day | the parent’s daily limit and bedtime | while the profile exists |
| Devices signed in (random id, last use) | keep the child signed in; let the parent sign a device out | 180 days after last use |
| Notification token, only if the parent allows reminders | learning reminders | until reminders are off or the device is signed out |
| Consent record (parent, time, notice version, created or deleted) | proof of the parent’s consent | 3 years, without the child’s name or birth date |

Never collected from a child: email address, phone number, photo, voice, location, contacts, internet address,
advertising or analytics identifiers, anything typed for others to read. Nothing is used for advertising, profiling
for marketing, or sold.

**Legal basis.** The parent’s consent (GDPR art. 6(1)(a) with art. 8) and our agreement with the parent to provide
the learning they asked for (art. 6(1)(b)). Under COPPA the data is used only to provide the service and for its
internal operations, and is disclosed to no third party beyond service providers acting for us.

## 2. Consent

- Only an adult account with a confirmed email address in good standing can make a child profile.
- Before the profile is made, the add-a-child screen gives the direct notice: what is collected (the table above), why,
  that it is never shown outside the family, never used for ads or sold, which kinds of service providers handle it,
  the parent’s rights, and a link to hevalo.app/privacy#children. The parent ticks a consent box and confirms.
- Right after, a confirmation email goes to the parent with the same notice, the date, and a one-tap link to delete the
  profile. This is the confirmatory step of the “email plus” method, which COPPA allows when, as here, a child’s
  information is used only internally and not disclosed.
- If Hevalo ever discloses children’s information to a third party for its own use, or adds features where a child can
  make information public, the consent method must be raised to one COPPA accepts for disclosure, and separate consent
  asked. Today neither happens.

## 3. Risks and what reduces them

| Risk | Likelihood before | Measures | Remaining |
|---|---|---|---|
| A stranger contacts a child | high on a social app | children cannot chat, post, add friends, write letters, play online outside the family, appear in rankings or be found; enforced on the server for every route | low |
| A child’s data is seen outside the family | medium | no public profile, name never shown outside the family, family boards visible only to members | low |
| A child spends money or is pushed to | medium | nothing can be bought on a child profile; a parent approves and pays; no ads; no paid random rewards | low |
| A child is nudged to over-use the app | medium | the parent’s daily limit and bedtime; no streak repairs sold; reminders only if the parent allows | low |
| Someone who is not the parent makes a profile | low | only confirmed adult accounts; confirmation email to that account; the profile lives under the parent’s account | low |
| Data kept longer than needed | medium | 12 months of no use deletes the profile (the parent is emailed a month before); deletion is immediate and complete | low |
| A breach exposes children’s data | low | the security program (security-program.md); little data held; no contact details for children | low |
| Data leaves the EEA (servers in the United States) | certain | standard contractual clauses or the EU–U.S. Data Privacy Framework with every provider; data minimised | low; lower still if the servers move to an EU region |

The child is told, in words they can follow, inside child mode: “A grown-up in your family made this profile for you.
They can see how much you learn and for how long. Nobody else can see you here.”

## 4. Retention and deletion (the written retention policy)

- A child profile is kept while the parent keeps it. Unused for 12 months, it is deleted, after the parent is
  emailed at 11 months with a link to keep it.
- When the parent deletes the profile, or deletes their own account (at the end of its 14-day grace period), or
  the profile expires, everything about the child is deleted at once: profile, learning, devices, tokens, purchases
  requests. No anonymous learning history is kept for children.
- What remains: the consent record without the child’s name or birth date, for three years, to show consent was
  given and withdrawn. Copies in the hosting company’s backups are overwritten within 7 days.
- At 13 the parent is told and may turn the profile into a teen account linked to them; the teen account then follows
  the rules for teens.

## 5. A parent’s request

Requests come in the app (see, download, delete) or by email to the address on the privacy page.

1. Confirm the request comes from the parent: it must come from the email address of the parent’s Hevalo account,
   or the parent must sign in.
2. See or copy: send the download from the app, or make it for them, within a month.
3. Delete: delete in the admin console (the same complete deletion as the app) and reply when done.
4. Record the request and the answer in the support log, without the child’s details.

## 6. Who handles children’s data for us

The hosting company (servers and database, United States), the company that delivers the website and stores files,
the email company (emails go only to the parent), and the services that deliver notifications. None may use the data
for anything but providing their service to Hevalo. Children never upload pictures, so the picture-checking service
never receives anything from a child.

## 7. Before release, and every year

- [ ] The privacy page’s “Children” part matches this page and the code.
- [ ] `CURRENT_POLICY_VERSION` (`api/src/gdpr/consent.ts`) is moved to the release date, so everyone agrees to the
      new policy again.
- [ ] Every provider above has a data processing agreement with standard contractual clauses (most are part of their
      terms; download and keep a copy of each).
- [ ] The store answers in docs/app-store/children-and-selling.md are filled in.
- [ ] Integration tests that a child is refused across every social route pass.
- [ ] Yearly: re-read this page, the security program, and the providers’ terms; note the date here.
