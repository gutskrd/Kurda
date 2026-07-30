# Optional Phone (SMS) Verification (KUR-297)

A verified phone number is much harder to farm than an email, so it **raises an
account's trust level (#295)** and lowers its risk (#296). It is **optional** —
never required at signup or for normal use — but offered as a strong anti-bot
lever.

## Flow

```
POST /auth/phone/send    { phone }         → SMS a 6-digit code (first send or resend)
POST /auth/phone/verify  { phone, code }   → mark the account's phone verified
GET  /auth/phone                            → { verified, masked }
DELETE /auth/phone                          → remove the verified phone
```

- **Pure OTP core** (`auth/phone-verification.ts`): 10-min code TTL, 5 verify
  attempts per code, 5 sends per session, 60s resend cooldown — all clock-injected.
- **Send = first-or-resend**: the client always re-supplies the number, so a
  resend to the same in-flight number is detected by hash and gated by the pure
  cooldown / send-cap; a different number starts a fresh session.
- **Provider-agnostic** `SmsSender` seam (`auth/sms.ts`) — Twilio / MessageBird /
  SNS drop in by config. `StubSmsSender` (records messages) is used until one is
  configured; **production must supply a real sender.**
- Code sends are **rate-limited** (#010, per user/IP) — the abuse-sensitive step.

## Privacy (#109 / #24)

- The **raw number is never stored.** We keep only a **SHA-256 hash** (uniqueness
  / recycle detection) and a **masked** display string (`+141•••••••32`).
- Included in the **data export** (masked) and **cleared on account deletion**
  (`gdpr/service.ts`).
- Never placed in URLs.

## Exclusivity & recycling

A number verifies **at most one account at a time**: verifying detaches it from
any prior holder. That exclusivity *is* the anti-farm property — a spammer can't
keep many accounts verified on one number — and it cleanly handles number
**recycling** (a real user reclaiming a reassigned number takes it over). SMS-send
volume is bounded by the rate limit rather than a separate per-number cap.

## Effects

- **Trust (#295):** `TrustService.getLevel` reads `phone_verified_at` — a
  phone-verified account reaches `established` at ≥ 1 day (vs 7 days on email
  alone).
- **Risk (#296):** phone verification is post-signup, so its risk effect is
  indirect (via the higher trust level). Requiring phone verification to activate
  a high-risk signup is a future hook on the #296 decision.

## Follow-ups

- Concrete SMS provider adapter (config-only).
- Full libphonenumber region validation behind `normalizeE164`.
- Encrypted-at-rest full number if a display/recovery use-case needs it (today
  we deliberately store none).
- VoIP/disposable-range blocking.
