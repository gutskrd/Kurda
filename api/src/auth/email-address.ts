import { z } from 'zod';

/**
 * What an email address may look like everywhere the API takes one.
 *
 * zod's practical pattern, widened only to allow internationalised top-level domains in ASCII form (`xn--p1ai` is .рф).
 * No spaces, quotes, control characters or line breaks, so an address can never inject a mail header. Plus tags, dots,
 * apostrophes, digits, hyphens, underscores, any case, subdomains, long TLDs and Apple private relay addresses all
 * pass.
 */
export const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+(?:[A-Za-z]{2,}|xn--[A-Za-z0-9-]{2,})$/;

/** The longest address SMTP can deliver to. */
export const EMAIL_MAX = 254;

/**
 * An email address as a form sends it. Surrounding whitespace is dropped (keyboards and password managers add a
 * trailing space); inner spaces are refused. Case is kept as typed; `users.email` is citext, so different cases are one
 * account everywhere.
 */
export const emailAddress = z.string().trim().max(EMAIL_MAX).pipe(z.email({ pattern: EMAIL_PATTERN }));
