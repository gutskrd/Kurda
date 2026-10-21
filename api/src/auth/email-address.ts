import { z } from 'zod';

/**
 * What an email address may look like, everywhere the API takes one.
 *
 * zod's practical pattern, with one widening: the top-level domain may also be
 * an internationalised one in its ASCII form (`xn--p1ai` is .рф), which the
 * plain pattern refuses because it allows letters only there. Nothing else is
 * loosened: no spaces, no quotes, no control characters, no line breaks, so an
 * address can never carry a second header into a mail.
 *
 * Plus tags, dots, apostrophes, digits, hyphens, underscores, any letter case,
 * subdomains and long top-level domains all pass, as do Apple's private relay
 * addresses (`…@privaterelay.appleid.com`).
 */
export const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+(?:[A-Za-z]{2,}|xn--[A-Za-z0-9-]{2,})$/;

/** The longest address SMTP can deliver to. */
export const EMAIL_MAX = 254;

/**
 * An email address as a form sends it.
 *
 * Surrounding whitespace is dropped first: phone keyboards and password
 * managers put a space after a suggested address, and that is the same address,
 * not a malformed one. Spaces inside it are still refused.
 *
 * Case is kept as typed. `users.email` is citext, so `Name@iCloud.com` and
 * `name@icloud.com` are one account for sign-up, sign-in and every lookup.
 */
export const emailAddress = z.string().trim().max(EMAIL_MAX).pipe(z.email({ pattern: EMAIL_PATTERN }));
