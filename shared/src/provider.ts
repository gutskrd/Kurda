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
 * The DMCA agent is still in [square brackets]: it is only a US registration,
 * and until it is made /copyright leaves its section out rather than showing
 * the brackets (`isProviderPlaceholder`).
 */

export interface ProviderIdentity {
  /** the brand people see */
  brand: string;
  /** the trade name the provider uses for Hevalo, shown as "trading as" after the registered name */
  tradingName: string;
  /** the name registered with the KvK that the pages name the provider by: the business, Zagrosian */
  legalName: string;
  /**
   * The establishment address as registered with the KvK (a PO box is not enough
   * for the provider itself). If it is ever shielded in the Handelsregister, the
   * public postal address registered instead goes here.
   */
  address: string;
  /** Kamer van Koophandel number */
  kvk: string;
  /**
   * btw-identificatienummer (NL + nine digits + B + two digits), not the
   * omzetbelastingnummer. Left out until the Belastingdienst has issued it: the
   * pages then show no VAT line rather than a blank one.
   */
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

/*
 * Zagrosian is an eenmanszaak registered with the KvK; Hevalo is one of its two
 * trade names (handelsnamen) under the same registration. The details are the
 * ones on the KvK's registration notice, as the owner chose to show them: the
 * registered name and trade name, the establishment address, the KvK number,
 * the registered email and telephone number.
 */
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
