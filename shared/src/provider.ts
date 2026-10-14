/**
 * Who provides Hevalo, and how to reach them — the one place to fill in.
 *
 * Dutch law (Art. 3:15d BW) wants the provider's name, address, email, KvK and
 * VAT numbers easy to find and always available; the EU Digital Services Act
 * wants one contact point for authorities (Art. 11) and one for users (Art. 12),
 * each saying which languages it accepts; the US DMCA wants a designated agent
 * for copyright notices, registered with the Copyright Office. The Terms, the
 * About page, the /copyright page and the copyright emails all read them from
 * here, so changing a detail is one edit.
 *
 * OWNER: replace every value in [square brackets] before launch. While one is
 * still a placeholder the pages show it as it is, so a missing detail is
 * visible rather than silently left out (`isProviderPlaceholder`).
 */

export interface ProviderIdentity {
  /** the brand people see */
  brand: string;
  /** the trading name the About page already names */
  tradingName: string;
  /** the legal name registered with the KvK (for an eenmanszaak, the owner's name and the trading name) */
  legalName: string;
  /** a street address (a PO box is not enough for the provider itself) */
  address: string;
  /** Kamer van Koophandel number */
  kvk: string;
  /** btw-identificatienummer */
  vat: string;
  /** the general email address */
  email: string;
  /** DSA Art. 12: where members write */
  userContact: { email: string; languages: readonly string[] };
  /** DSA Art. 11: where authorities write */
  authorityContact: { email: string; languages: readonly string[] };
  /** where copyright notices go besides the form */
  copyrightEmail: string;
  /** DMCA §512(c)(2): the agent as registered at copyright.gov/dmca-directory */
  dmcaAgent: { name: string; address: string; email: string; phone: string };
  /** the law the Terms are under */
  governingLaw: string;
}

export const PROVIDER: ProviderIdentity = {
  brand: 'Hevalo',
  tradingName: 'Zagrosian',
  legalName: '[Legal name as registered with the KvK]',
  address: '[Street and number, postcode, city, the Netherlands]',
  kvk: '[KvK number]',
  vat: '[VAT number (btw-id)]',
  email: '[hello@your-domain]',
  userContact: { email: '[support@your-domain]', languages: ['English', 'Nederlands', 'Kurmancî'] },
  authorityContact: { email: '[legal@your-domain]', languages: ['English', 'Nederlands'] },
  copyrightEmail: '[copyright@your-domain]',
  dmcaAgent: {
    name: '[DMCA designated agent — name]',
    address: '[DMCA designated agent — postal address]',
    email: '[copyright@your-domain]',
    phone: '[DMCA designated agent — phone]',
  },
  governingLaw: 'the Netherlands',
};

/** True while a detail still holds the placeholder text instead of the real value. */
export function isProviderPlaceholder(value: string): boolean {
  return /^\[.*\]$/.test(value.trim());
}
