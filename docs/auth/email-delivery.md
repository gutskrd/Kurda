# Transactional email delivery (KUR-098)

The email pipeline — templating, suppression list, queued retry with backoff —
is complete and provider-agnostic. Sends run in the worker's `send-email` job.
The **provider is chosen by configuration**; with nothing set, a no-op stub logs
sends instead of delivering them (fine for dev/test, but verification codes and
password-reset emails won't reach real inboxes).

Selection precedence (`createEmailProvider`): **Resend** → **SMTP** → **stub**.

Set `EMAIL_FROM` for either provider (default `MyKurda <no-reply@mykurda.com>`);
it must be an address on a domain you've verified with the provider.

## Option A — Resend (HTTP API, simplest)

1. Create a [Resend](https://resend.com) account and **verify your sending
   domain** (add the DNS records it gives you).
2. Create an API key.
3. Set:

   ```
   RESEND_API_KEY=re_xxxxxxxx
   EMAIL_FROM=MyKurda <no-reply@yourdomain>
   ```

That's it — no SDK, no SMTP ports.

## Option B — SMTP (works with SES, Postmark, Mailgun, Gmail, …)

Point the SMTP settings at any provider. Either a single connection string:

```
SMTP_URL=smtps://USER:PASS@smtp.provider.com:465
EMAIL_FROM=MyKurda <no-reply@yourdomain>
```

or discrete settings:

```
SMTP_HOST=email-smtp.eu-west-1.amazonaws.com   # e.g. Amazon SES
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_SECURE=false        # true for port 465 (implicit TLS); false uses STARTTLS
EMAIL_FROM=MyKurda <no-reply@yourdomain>
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

## Verify

After configuring, sign up with a real address — the 6-digit verification code
should arrive within seconds. If it doesn't, check the worker logs: a provider
error is logged and the `send-email` job retries with backoff.
