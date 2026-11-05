import { describe, expect, it } from 'vitest';
import { EMAIL_LOCALES, EMAIL_TEMPLATES, renderEmail, emailLocaleFor } from './templates.js';

describe('renderEmail', () => {
  it('interpolates vars in the chosen locale', () => {
    const en = renderEmail('verify-email', 'en', { link: 'https://k/verify?t=1' });
    expect(en.subject).toBe('Confirm your email');
    expect(en.text).toContain('https://k/verify?t=1');

    const ku = renderEmail('password-reset', 'ku', { link: 'https://k/reset' });
    expect(ku.subject).toBe('Şîfreya xwe ji nû ve saz bike');
    expect(ku.text).toContain('https://k/reset');
  });

  it('leaves unknown placeholders intact', () => {
    expect(renderEmail('deletion-notice', 'en', {}).text).toContain('{graceDays}');
  });

  /**
   * The deletion notice asked for `{date}` while the sender passes the
   * account's name and the number of days left, so every notice went out
   * reading "will be deleted on {date}". It is written for the variables
   * the sender has, in both languages.
   */
  it('fills the deletion notice from what the sender passes', () => {
    for (const locale of EMAIL_LOCALES) {
      const r = renderEmail('deletion-notice', locale, { username: 'dilan', graceDays: '14' });
      expect(r.text, locale).toContain('14');
      expect(r.text, locale).toContain('dilan');
      expect(r.text, locale).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  // account and security mail is calm: no jokes, no emoji, and the action is to sign in
  it('keeps every account email free of emoji and of log in', () => {
    for (const template of EMAIL_TEMPLATES) {
      for (const locale of EMAIL_LOCALES) {
        const r = renderEmail(template, locale);
        const all = `${r.subject}\n${r.text}\n${r.html ?? ''}`;
        expect(all, `${template}/${locale}`).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(all, `${template}/${locale}`).not.toMatch(/log ?in\b/i);
      }
    }
  });

  it('says how long each emailed link or code works', () => {
    expect(renderEmail('verify-email', 'en').text).toContain('24 hours');
    expect(renderEmail('verify-email-code', 'en').text).toContain('15 minutes');
    expect(renderEmail('password-reset', 'en').text).toContain('one hour');
    expect(renderEmail('oauth-no-password', 'en').text).toContain('one hour');
  });

  it('every template has a subject + text in every locale', () => {
    for (const template of EMAIL_TEMPLATES) {
      for (const locale of EMAIL_LOCALES) {
        const r = renderEmail(template, locale);
        expect(r.subject.length, `${template}/${locale}`).toBeGreaterThan(0);
        expect(r.text.length, `${template}/${locale}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('branded auth emails', () => {
  it('renders the verification code in both the HTML and the text fallback', () => {
    const r = renderEmail('verify-email-code', 'en', { code: '952530' });
    expect(r.subject).toBe('Your Hevalo verification code');
    expect(r.text).toContain('Welcome to Hevalo!');
    expect(r.text).toContain('952530');
    expect(r.text).toContain('This code is valid for 15 minutes.');
    expect(r.text).toContain('— The Hevalo team');
    expect(r.html).toContain('952530');
    expect(r.html).toContain('This code is valid for 15 minutes.');
    expect(r.html).not.toMatch(/\{[a-z]+\}/); // nothing left uninterpolated
  });

  it('renders the same code email in Kurmancî', () => {
    const r = renderEmail('verify-email-code', 'ku', { code: '952530' });
    expect(r.subject).toBe('Koda piştrastkirinê ya Hevalo');
    expect(r.text).toContain('Bi xêr hatî Hevalo!');
    expect(r.text).toContain('952530');
    expect(r.text).toContain('Ev kod ji bo 15 xulekan derbasdar e.');
    expect(r.text).toContain('— Tîma Hevalo');
    expect(r.html).toContain('Ev kod ji bo 15 xulekan derbasdar e.');
  });

  it('renders the reset button linking to the token URL, and the raw link in text', () => {
    const link = 'https://hevalo.app/reset-password?token=abc123';
    for (const [locale, button] of [
      ['en', 'Update password'],
      ['ku', 'Şîfreyê Nû Bike'],
    ] as const) {
      const r = renderEmail('password-reset', locale, { link });
      expect(r.html, locale).toContain(`href="${link}"`);
      expect(r.html, locale).toContain(button);
      // a client that refuses HTML still gets a usable link
      expect(r.text, locale).toContain(link);
      expect(r.text, locale).not.toContain('<a ');
    }
  });

  /**
   * These two used to carry the Kurmancî copy in the `en` slot as well, byte for
   * byte, because nothing passed a locale and `en` was what everyone got — so
   * duplicating it was how Kurdish readers got Kurdish mail. It also sent
   * Kurmancî to everyone else, in the two messages you cannot finish signing up
   * or recover an account without. Callers pass the account's locale now.
   */
  it('sends each language its own copy', () => {
    for (const tpl of ['verify-email-code', 'password-reset'] as const) {
      const en = renderEmail(tpl, 'en', { code: '1', link: 'x' });
      const ku = renderEmail(tpl, 'ku', { code: '1', link: 'x' });
      expect(en, `${tpl} still sends the same text to both`).not.toEqual(ku);
      // the letters Kurmancî needs and English does not — a cheap way to catch
      // the Kurdish text reappearing in the English slot
      expect(en.subject + en.text + (en.html ?? ''), `${tpl} en`).not.toMatch(/[îûêşçÎÛÊŞÇ]/);
      expect(ku.subject + ku.text, `${tpl} ku`).toMatch(/[îûêşç]/);
    }
  });

  it('gives Kurmancî readers Kurmancî and everyone else English', () => {
    // ckb is deliberately English: there is no Soranî copy yet, and Kurmancî in
    // a script a Soranî reader may not read is worse than English
    expect(emailLocaleFor('ku')).toBe('ku');
    for (const other of ['en', 'ckb', 'de', 'fr', 'nl', 'ar', 'tr', 'es', '', null, undefined]) {
      expect(emailLocaleFor(other), `${other} should get English`).toBe('en');
    }
  });

  it('escapes interpolated values in HTML but not in text', () => {
    const r = renderEmail('verify-email-code', 'en', { code: '<script>alert(1)</script>' });
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.text).toContain('<script>'); // plain text needs no escaping
  });
});

describe('the urgent-report email to moderators', () => {
  it('carries a link and nothing from the report', () => {
    for (const locale of EMAIL_LOCALES) {
      const r = renderEmail('moderation-urgent', locale, { link: 'https://admin.example/#/moderation/abc' });
      expect(r.text, locale).toContain('https://admin.example/#/moderation/abc');
      expect(r.text, locale).not.toMatch(/\{[a-z]+\}/);
    }
    expect(renderEmail('moderation-urgent', 'en').subject).toBe('A new urgent report needs review');
  });
});
