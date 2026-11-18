/** Disposable email domains, matched by suffix so subdomains are caught too. */
const DISPOSABLE_DOMAINS = [
  '10minutemail.com',
  '20minutemail.com',
  '33mail.com',
  'anonbox.net',
  'burnermail.io',
  'byom.de',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'inboxkitten.com',
  'incognitomail.com',
  'mail-temp.com',
  'mail.tm',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mailsac.com',
  'minuteinbox.com',
  'mohmal.com',
  'mytemp.email',
  'sharklasers.com',
  'spamgourmet.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempinbox.com',
  'tempmail.dev',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'trash-mail.com',
  'trashmail.com',
  'yopmail.com',
  'yopmail.fr',
];

export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return DISPOSABLE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}
