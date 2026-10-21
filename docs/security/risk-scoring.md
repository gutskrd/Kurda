# Signup & Login Risk Scoring (KUR-296)

The risk engine is the **decision layer** that ties Kurda's anti-abuse controls
together. It does not replace CAPTCHA (#025), email verification (#017), phone
verification (#297), or the new-account velocity limits (#295) — it decides
*when* each is demanded, so honest users get a smooth path and only suspicious
behavior meets friction.

## Pipeline

```
signup / login
  → gather signals  (risk/service.ts)
  → score 0–100     (risk/score.ts, pure)
  → band + action   (low / medium / high)
  → enforce + log   (auth/routes.ts → risk_decisions)
```

### Signals (`RiskSignals`)

| Signal | Source | Notes |
| --- | --- | --- |
| IP reputation | `IpReputationProvider` (pluggable) | datacenter/VPN/abuse lists; **degrades to neutral** on provider error |
| Device known-good | `risk_decisions` ⋈ `users` | a verified account was created from this device → **−25** |
| Accounts from device (window) | `risk_decisions` | full weight even on shared networks |
| Accounts from network (window) | `risk_decisions.net_hash` | an IPv4 address or an IPv6 /64; **discounted ×0.25** on shared networks |
| Disposable email | `auth/disposable-domains.ts` (#025) | |
| Request velocity/min | Redis minute bucket, per network | 0 when Redis absent |
| Geo/timezone mismatch | (follow-up: login-history geo) | |
| Shared network | reputation provider, or > 5 established accounts seen on the network in 30 days | campus/café/carrier-NAT get the shared cap |

"IP" here is the caller's **network** as [network-identity.md](network-identity.md)
defines it: the client's own address read past Cloudflare (not the edge's), an
IPv4 address as itself and an IPv6 address as its /64, so rotating through
one's own /64 resets nothing. It is stored as a **keyed hash** (HMAC with the
server secret) — a plain SHA-256 of an IPv4 address can be reversed by trying
all 2^32. Device ids are hashed (SHA-256) before storage. Raw values are never
persisted and never placed in URLs. Decisions are retention-bounded
(`RiskService.prune`, 90 days, #109), run daily in the API process together with
the network sightings.

### Band → action

| Band | Score | Action | What the boundary does |
| --- | --- | --- | --- |
| low | `< 30` | `proceed` | no added friction |
| medium | `30–59` | `step_up` | CAPTCHA (#025, already baseline at signup) / email verify (#017) |
| high | `≥ 60` | `verify_or_block` | phone verify (#297) or soft-block + review |

A **per-device/network account-creation cap breach** (`exceedsSignupCap`:
>3/device, >10/network, >50/shared network within the window) **hard-blocks** regardless
of score. A malicious IP *alone* is only 45 → **medium**, so a VPN or
privacy-conscious user gets a solvable step-up and is **never hard-blocked on IP
alone** — signals must compound (e.g. malicious IP + disposable email = 70) to
reach high.

## Recommended Kurda default

1. **Turnstile CAPTCHA at signup** (#025) — the baseline step-up.
2. **Email verification before chat/post** (#017 + trust levels #295).
3. **Per-IP / per-device signup caps** (this engine) + rate limits (#010).
4. **New-user velocity limits + auto-suspend on obvious bot behavior** (#295).
5. **Phone verification** (#297) reserved for the high band / cap breaches.

## Wiring & enforcement

- **Signup** (`POST /auth/register`): disposable-email + CAPTCHA gate first, then
  `assessSignup`. A cap breach → the same generic `SIGNUP_REJECTED` (never
  reveals which control fired, #025). Lower bands proceed on the CAPTCHA
  baseline. The created user is attached to the decision for audit.
- **Login** (`POST /auth/login`): `assessLogin` runs **before** authentication so
  a high-risk attempt mints no session (`LOGIN_VERIFICATION_REQUIRED`, 403).
  Clean traffic scores low and proceeds unchanged.

Every assessment is written to `risk_decisions` (score, band, action, contributing
signals) for tuning and audit (#104). Thresholds/weights are config constants in
`risk/score.ts`.

## Follow-ups

- IP-reputation provider adapter (external API / maintained CIDR list) — the
  interface and safe fallback are in place; only a concrete provider remains.
- Geo/timezone-mismatch signal from login history.
- Device-fingerprint extraction from client analytics (#105/#110) feeding the
  `x-device-id` header.
