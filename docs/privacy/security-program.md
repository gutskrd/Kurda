# Information security program

The written program the US children’s privacy rule asks of any service that holds children’s information (COPPA,
16 CFR 312.8, as amended in 2025), and the GDPR’s “appropriate technical and organisational measures” (art. 32) for
everyone’s data. It describes what Hevalo does today; when something here stops being true, change the code or this
page the same day.

## 1. Who is responsible

The owner of Zagrosian is responsible for this program: for the yearly review, for who has access, and for answering
an incident. Anyone given staff access to the admin console or the hosting accounts reads this page first.

## 2. What is protected, and the main risks

Account data (email addresses, birth months, sign-in records), what people post and send each other, children’s
profiles, and moderation evidence. The main risks: someone taking over an account or a staff account, a leaked
database or backup, a flaw in the code that shows one person’s data to another, a provider being breached, and data
being kept longer than needed. The risks are re-assessed at each yearly review and whenever a feature changes what is
collected.

## 3. Safeguards in place

**Access**
- Staff use the admin console with roles (`api/src/admin/roles.ts`) and a second factor (TOTP); every staff action
  is recorded in the audit log.
- Hosting, database, storage, email and store accounts are held by the owner, and each must have two-factor
  sign-in turned on.
- The database accepts connections only from listed addresses.

**Letters and private messages**
- Staff read a letter or a direct or group message only in three cases. Someone in the conversation reports it: its
  case shows it with the few letters or messages around it, the reported one marked. An automatic check flags it: its
  case shows the flagged one alone. Or a safety review.
- An automatic check puts a letter or private message before a moderator only for something serious: sexual words
  or slurs from the word filter, sexual, hateful or self-harm content from the text classifier, a held drawing, or
  anything sent to a minor (a letter in a teen band, a message to a minor, a group with one in it). Plain swearing
  between adults only counts against its writer. A flag is kept as long as its case’s evidence, a year after the decision,
  and goes with its writer’s account when that is deleted.
- Only a superadmin opens a safety review: for one named account, read by one staff member who moderates and who
  writes with the account nowhere a review reads (a correspondence, a letter at either one’s window, direct messages,
  a group either is in, left or wrote in), checked again on every read. The reason comes from a fixed list (child
  safety, a threat to someone’s life or safety, a legal request from the authorities, a report that needs more
  context) with a note; a report that needs more context names an open case about the account and opens only that
  case’s conversation. A review is read-only and lasts exactly 24 hours unless ended sooner, as the database itself
  sets; a superadmin opens at most five a day. It opens one conversation at a time, a page at a time, at most 120
  pages an hour per reader, counted in the database; there is no search across accounts and nothing to export. A
  message someone deleted shows only that it was. Nobody reviews their own messages, and a child’s profile, which
  writes to nobody, cannot be reviewed.
- Every grant, early end and reading, and every case about a letter or private message a moderator opens (its
  drawing too), goes to the Access log, the admin audit trail and the security log (under the staff member): who,
  whose, when, why, which kind of conversation and how many messages, never what they say. Every admin reads the
  Access log; the note behind a review and the case it names are for superadmins, since a case id would tie a
  reporter to the person they reported. The Access log, the reviews, the audit trail and the security log cannot be
  changed or emptied, and nothing leaves them early. Opening a review is a warning on the security log’s “Needs attention” list, so another
  superadmin sees each one.
- The person under review is not told. If they ask to see these records, the owner decides case by case, within the
  limits art. 23 of the GDPR and art. 41 of the Dutch implementation act (UAVG) allow for preventing crime and
  protecting others.
- The rules live in `api/src/message-access`, `api/src/moderation/service.ts` and migrations `1751000870000` to
  `1751000872000`, and are tested in `api/src/message-access/message-access.integration.test.ts`.

**Accounts**
- Passwords are hashed with Argon2id; failed sign-ins are rate limited and accounts lock after repeated failures.
- Sessions are short-lived tokens with refresh, and can be signed out per device.
- Secrets the server must read back (other services’ tokens) are encrypted at rest with AES-256-GCM
  (`api/src/security/at-rest.ts`); phone numbers are stored only hashed.

**In transit and on the web**
- HTTPS everywhere, with HSTS and strict security headers (`api/src/plugins/security-headers.ts`).
- Uploads are checked for their real type and stripped of hidden content; pictures are checked before anyone else
  sees them.

**Data kept small**
- Only what a feature needs is collected (see the privacy page and `docs/privacy/children.md`); children give no
  contact details and no internet address is kept from their sign-ins.
- Retention jobs delete sign-in records, devices, refused pictures, expired child profiles and deleted accounts on
  the schedule the privacy page states.

**Code**
- Every change runs lint, type checks, unit and database tests, a dependency audit that blocks high and critical
  vulnerabilities, and a secret scan (`.github/workflows/ci.yml`).
- Changes reach production only through pull requests to `main` that pass these checks.
- Integration tests prove the age rules and that a child is refused across every social route.

**Providers**
- Only providers that bind themselves to process data on our instructions, keep it secure and help with requests are
  used: hosting and database, website delivery and file storage, email, phone notifications, and picture checking.
  Each has a data processing agreement with standard contractual clauses or Data Privacy Framework certification; a
  copy of each is kept with the business records.

## 4. Testing and monitoring

- Server errors and suspicious sign-ins are logged; an urgent report (a child at risk, possible self-harm, a threat)
  emails every moderation admin at once (`api/src/moderation/alerts.ts`).
- The owner tries restoring the database from a backup at least once a year.
- A security review of the code is run before each release that changes accounts, uploads, payments or children’s
  features.

## 5. If something goes wrong

1. Stop the leak: rotate secrets, sign out sessions, take the affected feature offline.
2. Find out what data and whose was affected.
3. Within 72 hours of learning of a breach that puts people at risk, tell the Dutch data protection authority
   (Autoriteit Persoonsgegevens); tell the people affected without delay when the risk is high, and the parents of
   any child affected.
4. Write down what happened, what was done, and what changes so it cannot happen again.

## 6. Yearly review

Every year, and after any incident: re-read this page and `docs/privacy/children.md`, check that each safeguard still
holds, read the Access log and check that every safety review had a reason that holds, check the providers’ terms, and
write the date and anything changed here.

| Date | By | Changes |
|---|---|---|
| | | |
