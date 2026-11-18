/**
 * Who provides Hevalo and how to reach them, read by the Terms, the About page, /copyright and the copyright emails.
 * Dutch law (Art. 3:15d BW) asks for the name, address, email, KvK and VAT numbers; the EU Digital Services Act for
 * contact points for authorities (Art. 11) and users (Art. 12) with their languages; the US DMCA for a registered copyright
 * agent. Until the DMCA agent is registered its fields hold [placeholders] and /copyright leaves the section out
 * (`isProviderPlaceholder`).
 */

export interface ProviderIdentity {
  /** the brand people see */
  brand: string;
  /** the trade name the provider uses for Hevalo, shown as "trading as" after the registered name */
  tradingName: string;
  /** the name registered with the KvK, which the pages name the provider by */
  legalName: string;
  /** The establishment address registered with the KvK; a PO box is not enough. If it is ever shielded, the public postal address. */
  address: string;
  /** Kamer van Koophandel number */
  kvk: string;
  /** btw-identificatienummer (NL, nine digits, B, two digits), not the omzetbelastingnummer; left out until issued, so no VAT line shows. */
  vat?: string;
  /** the general email address */
  email: string;
  /** the business telephone number as registered with the KvK, written internationally */
  phone: string;
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

/* An eenmanszaak registered with the KvK, Hevalo being one of its trade names; the details are those on its registration. */
export const PROVIDER: ProviderIdentity = {
  brand: 'Hevalo',
  tradingName: 'Hevalo',
  legalName: 'Zagrosian',
  address: 'Westerengstraat 7, 6669 BE Dodewaard, Nederland',
  kvk: '42217689',
  email: 'contact@zagrosian.com',
  phone: '+31 6 38066158',
  userContact: { email: 'support@hevalo.app', languages: ['English', 'Nederlands', 'Kurmancî'] },
  authorityContact: { email: 'contact@zagrosian.com', languages: ['English', 'Nederlands'] },
  copyrightEmail: 'contact@zagrosian.com',
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
