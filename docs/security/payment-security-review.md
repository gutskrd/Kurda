# Payment Security Review & PCI Scope Minimization (KUR-112)

**Status:** Baseline complete · **Owner:** Platform/Security · **Depends on:** KUR-072 (IAP)
**Last reviewed:** 2026-07-10

This document is the security review of Kurda's purchase path. It (1) verifies
that **no cardholder data ever touches Kurda servers**, and (2) threat-models
the purchase path with each item **tested** or **ticketed**.

---

## 1. PCI scope: no card data on Kurda servers

Kurda sells two things and **neither** exposes us to cardholder data:

| Purchase type | Money flow | What Kurda stores | Card data? |
|---|---|---|---|
| **Gem packs** (real money) | Apple StoreKit / Google Play Billing collect and process payment entirely on-device / on-store. | A validated **store receipt** (`iap_receipts`): transaction id, product id, environment, gem amount. | **None.** |
| **Shop items** (in-app currency) | Spends `zer`/`gems` from the internal double-entry wallet. | Ledger rows only. | **None.** |

Consequences:

- Kurda **never** sees a PAN, CVV, expiry, or bank token. All card handling is
  Apple's/Google's. Our PCI DSS exposure is therefore **SAQ-A-equivalent / out of
  scope** — we are a merchant of digital goods via the app stores, not a card
  processor.
- The only "payment" artifacts we persist are opaque **store transaction ids**
  and receipts, which are not cardholder data.
- **Web payments (Stripe) are explicitly out of scope** for this review. Adding
  a web payment rail is a gated follow-up epic that MUST re-open this review,
  because it would bring PCI SAQ-A (hosted fields) obligations.

**Verification (code):**
- `api/src/iap/service.ts` — the redeem path takes only a store `receipt` token +
  `productId`; it validates server-to-server and stores `transaction_id` only.
- `api/src/iap/verifier.ts` — `VerifiedReceipt` carries no financial fields.
- Grep guard: there is no `card`, `pan`, `cvv`, or payment-instrument column in
  any migration under `api/migrations/`.

---

## 2. Threat model — purchase path

Legend: ✅ tested (automated), 🛡️ enforced in code, 🎫 ticketed follow-up.

### 2.1 Receipt **replay** (reuse a valid receipt to mint gems repeatedly)
- 🛡️ `iap_receipts` has a **unique `(platform, transaction_id)`** constraint;
  redeem inserts `ON CONFLICT DO NOTHING`. A given store transaction can grant
  **exactly once**, ever.
- 🛡️ The wallet grant is keyed with idempotency `iap:{platform}:{transactionId}`,
  a second independent guard on the ledger.
- ✅ `api/src/iap/iap.integration.test.ts` — "a duplicate transaction never
  grants twice" and the restore-purchases path.

### 2.2 Receipt **reuse across accounts** (one purchase, many accounts)
- 🛡️ A different account submitting an already-redeemed transaction is caught in
  the unique-constraint conflict and routed to fraud as `RECEIPT_REUSE`
  (`api/src/fraud/*`), which **holds** the purchase for review.
- 🛡️ Apple **family-shared** receipts (`in_app_ownership_type`) are exempt so
  legitimate family sharing is not flagged.
- ✅ `api/src/fraud/fraud.integration.test.ts` — reuse flagged, family-shared not.

### 2.3 Receipt **tamper / forgery** (fake or edited receipt)
- 🛡️ Receipts are validated **server-to-server** via `ReceiptVerifier` before any
  grant; a client-asserted receipt is never trusted.
- 🛡️ `createReceiptVerifier` **hard-errors in production** if no real store
  verifier is configured, so we can never silently accept unverified receipts.
- 🎫 Real `AppleReceiptVerifier` (App Store Server API) / `GoogleReceiptVerifier`
  (Play Developer API) implementations — **KUR-072 follow-up**, needs store
  credentials to integration-test.

### 2.4 **Environment confusion** (sandbox receipt on production)
- 🛡️ `redeem` rejects a `sandbox` receipt when `NODE_ENV === production`
  (`WRONG_ENVIRONMENT`).
- ✅ Verifier carries `environment`; unit-tested in `verifier.test.ts`.

### 2.5 **Refund abuse** (buy → spend → refund, keep the goods)
- 🛡️ Refund webhook claws back gems, **capped at the remaining balance** so a
  malicious refund can't drive a negative wallet; the shortfall is recorded in
  `iap_receipts.clawed_back`.
- 🛡️ Repeat/refund-after-spend patterns raise `REFUND_ABUSE` and hold the
  account (`api/src/fraud/rules.ts`).
- ✅ `iap.integration.test.ts` — clawback + idempotent re-delivery + balance
  floor; `fraud.integration.test.ts` — hold + admin review.

### 2.6 Webhook **spoofing** (forged refund/clawback calls)
- 🛡️ The refund webhook is authenticated with a **constant-time** shared-secret
  check (`api/src/iap/webhook-auth.ts`, `safeEqual` via `timingSafeEqual`) and
  **fails closed** (503) when unconfigured — no open clawback endpoint.
- ✅ `webhook-auth.test.ts` — correct/incorrect/missing/unconfigured secret.
- 🎫 **Provider-signature verification** (Apple ASSN V2 signed JWS chain; Google
  RTDN Pub/Sub OIDC token) plugs in behind `WebhookVerifier`. Ticketed as the
  production upgrade from the shared secret — needs provider certs/keys.

### 2.7 **Dropped grant response** (charged, client never hears back)
- 🛡️ Grants are idempotent; the client re-submits via **restore-purchases** and
  `GET /me/iap/receipts` reconciles. No double charge, no lost grant.
- ✅ `iap.integration.test.ts` duplicate/restore path.

### 2.8 **Purchase velocity / card-testing style abuse**
- 🛡️ `VELOCITY` rule holds accounts exceeding the hourly cap; held purchases are
  reviewed, **never auto-banned** (`api/src/fraud/*`).
- ✅ `fraud.integration.test.ts` velocity → hold → admin clear.

### 2.9 Ledger **integrity**
- 🛡️ `wallet_ledger` is **append-only** (DB trigger blocks UPDATE/DELETE except a
  transaction-scoped admin flag), so balances can't be silently rewritten.
- ✅ `wallet.integration.test.ts` append-only enforcement.

---

## 3. Open follow-ups (tickets)

| Item | Where | Ticket |
|---|---|---|
| Real Apple/Google server-to-server receipt verifiers | `iap/verifier.ts` | KUR-072 follow-up |
| Provider webhook **signature** verification (JWS / RTDN) | `iap/webhook-auth.ts` | KUR-112 follow-up |
| Web payments (Stripe) security review + SAQ-A | — | gated new epic (out of scope) |

## 4. Sign-off checklist

- [x] No cardholder data persisted or logged anywhere in the purchase path.
- [x] Server-to-server receipt validation is mandatory before any grant (prod fails closed).
- [x] Each store transaction grants exactly once (replay/reuse/dup covered + tested).
- [x] Refund clawback cannot create a negative balance; refund abuse is held for review.
- [x] Webhook authenticated (constant-time), fails closed; provider-signature upgrade ticketed.
- [x] Ledger is append-only and auditable.
