# Transactional email delivery (KUR-098)

The email pipeline — templating, suppression list, queued retry with backoff —
is complete and provider-agnostic. Sends run in the worker's `send-email` job.
The **provider is chosen by configuration**; with nothing set, a no-op stub logs
sends instead of delivering them (fine for dev/test, but verification codes and
password-reset emails won't reach real inboxes).

Selection precedence (`createEmailProvider`): **Resend** → **SMTP** → **stub**.

Set `EMAIL_FROM` for either provider (default `Hevalo <no-reply@hevalo.app>`);
it must be an address on a domain you've verified with the provider.
`EMAIL_REPLY_TO` (e.g. `support@hevalo.app`) is where an answer to one of
these emails goes; unset, answers go to the no-reply address and are lost.

## Option A — Resend (HTTP API, simplest)

1. Create a [Resend](https://resend.com) account and **verify your sending
   domain** (add the DNS records it gives you).
2. Create an API key. A **sending access** key limited to the From domain is
   enough, and is what to use: a key limited to one domain is refused for
   any other ("This API key is not authorized to send emails from …"), so a
   new sending domain needs a new key — moving to hevalo.app while the key
   was limited to the old domain stopped every verification and reset email.
3. Set:

   ```
   RESEND_API_KEY=re_xxxxxxxx
   EMAIL_FROM=Hevalo <no-reply@yourdomain>
   ```

That's it — no SDK, no SMTP ports.

## Option B — SMTP (works with SES, Postmark, Mailgun, Gmail, …)

Point the SMTP settings at any provider. Either a single connection string:

```
SMTP_URL=smtps://USER:PASS@smtp.provider.com:465
EMAIL_FROM=Hevalo <no-reply@yourdomain>
```

or discrete settings:

```
SMTP_HOST=email-smtp.eu-west-1.amazonaws.com   # e.g. Amazon SES
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_SECURE=false        # true for port 465 (implicit TLS); false uses STARTTLS
EMAIL_FROM=Hevalo <no-reply@yourdomain>
```

Provider notes:
- **Amazon SES** — create SMTP credentials in the SES console; move out of the
  sandbox to send to arbitrary recipients; verify the domain / From address.
- **Postmark / Mailgun** — use the SMTP credentials from their dashboard.

## Where to set these

The config is read from environment variables (there's no `.env` auto-loader in
the app). The **worker** process is what actually sends, so it must have them.

- **Local dev:** export them in your shell (or inline) before starting the
  worker, e.g. `RESEND_API_KEY=… EMAIL_FROM=… npm run worker --workspace api`.
  `api/.env.example` lists the keys.
- **Docker (`docker compose up`):** `docker-compose.yml` already passes these
  through to both the `api` and `worker` services via `${VAR}` substitution —
  put the real values in a **`.env` beside `docker-compose.yml`** (copy the root
  `.env.example`; it's gitignored). Unset values fall back to the stub.
- **Production/staging:** set them as real environment variables (or a mounted
  `.env`) on the host running the container. Never commit the key.

## Bounces & complaints

`POST /webhooks/email` (guarded by `EMAIL_WEBHOOK_SECRET`) adds bounced/complained
addresses to the suppression list, and suppressed addresses are skipped on send.
Wire your provider's bounce/complaint webhook to it when available.

With Resend, `POST /webhooks/resend` does the same for its own
`email.bounced` and `email.complained` events (see below).

## The support inbox (Resend)

Mail sent to the support address can be read and answered in the admin panel
(Email → Support inbox). It needs, in Resend and in the API's environment:

1. **Receiving on the domain**, and its MX record in DNS (Resend → Domains →
   the domain → Receiving). With the MX on the root domain, *all* mail to the
   domain goes to Resend — fine while nothing else receives there.
2. **A webhook** (Resend → Webhooks) to `https://<api>/webhooks/resend` for
   `email.received` (and `email.bounced`, `email.complained`), and its signing
   secret as `RESEND_WEBHOOK_SECRET`. The route refuses everything (503) while
   the secret is unset, and anything not signed with it (401).
3. **`RESEND_INBOX_API_KEY`**: a *full access* key, used only to read the body
   of received mail — the webhook carries who, to whom and the subject, never
   the body, and a sending key may not read mail. Without it the inbox still
   lists what arrived and says to read it in Resend.
4. `SUPPORT_EMAIL_FROM` (default `Hevalo Support <support@hevalo.app>`): who
   the answers are from.

Received mail counts against the same Resend quota as sent mail (on the free
plan, 100 a day and 3,000 a month, sent and received together), so a flood of
mail to the support address could hold up verification codes for the day.

## Verify

After configuring, open the admin panel's **Email** page: it says which
provider sends, from and reply-to which addresses, and how many sends failed
in the last week with the last error; **Send a test email** sends one to your
own account's address at once and shows what the provider answered.

Or sign up with a real address — the 6-digit verification code should arrive
within seconds. If it doesn't, check the worker logs: a provider error is
logged and the `send-email` job retries with backoff.
