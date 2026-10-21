/**
 * The mail providers people sign up with, by domain, and one domain of their
 * own (a subdomain under a long top-level domain). Shared by the unit tests of
 * the address rules and the sign-up integration test, so both prove the same
 * list.
 */
export const PROVIDER_DOMAINS = [
  // Apple, including the relay addresses Sign in with Apple hands out
  'icloud.com',
  'me.com',
  'mac.com',
  'privaterelay.appleid.com',
  // Google
  'gmail.com',
  'googlemail.com',
  // Microsoft
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'msn.com',
  // Yahoo
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  // Proton
  'proton.me',
  'protonmail.com',
  'pm.me',
  // German providers
  'gmx.de',
  'gmx.net',
  'web.de',
  't-online.de',
  // and the rest of the world
  'yandex.ru',
  'mail.ru',
  'aol.com',
  'zoho.com',
  'fastmail.com',
  'hey.com',
  'tutanota.com',
  'orange.fr',
  'free.fr',
  'libero.it',
  'qq.com',
  '163.com',
  'naver.com',
  // a domain of one's own
  'mail.heval-family.photography',
] as const;

/** Real disposable-mail services, which sign-up does refuse. */
export const DISPOSABLE_DOMAINS_SAMPLE = [
  'mailinator.com',
  'yopmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'temp-mail.org',
  'sharklasers.com',
] as const;
