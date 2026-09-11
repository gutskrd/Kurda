import { describe, expect, it } from 'vitest';
import { EMAIL_LOCALES, EMAIL_TEMPLATES, renderEmail, emailLocaleFor } from './templates.js';

describe('renderEmail', () => {
  it('interpolates vars in the chosen locale', () => {
    const en = renderEmail('verify-email', 'en', { link: 'https://k/verify?t=1' });
    expect(en.subject).toBe('Verify your email');
    expect(en.text).toContain('https://k/verify?t=1');

    const ku = renderEmail('password-reset', 'ku', { link: 'https://k/reset' });
    expect(ku.subject).toBe('Şîfreya xwe ji nû ve saz bike');
    expect(ku.text).toContain('https://k/reset');
  });

  it('leaves unknown placeholders intact', () => {
    expect(renderEmail('deletion-notice', 'en', {}).text).toContain('{date}');
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
    expect(r.subject).toBe('Your MyKurda verification code');
    expect(r.text).toContain('Welcome to MyKurda!');
    expect(r.text).toContain('952530');
    expect(r.text).toContain('This code is valid for 15 minutes.');
    expect(r.text).toContain('— The MyKurda team');
    expect(r.html).toContain('952530');
    expect(r.html).toContain('Be quick, friend 😄');
    expect(r.html).not.toMatch(/\{[a-z]+\}/); // nothing left uninterpolated
  });

  it('renders the same code email in Kurmancî', () => {
    const r = renderEmail('verify-email-code', 'ku', { code: '952530' });
    expect(r.subject).toBe('Koda piştrastkirinê ya MyKurda');
    expect(r.text).toContain('Bi xêr hatî MyKurda!');
    expect(r.text).toContain('952530');
    expect(r.text).toContain('Ev kod ji bo 15 xulekan derbasdar e.');
    expect(r.text).toContain('— Tîma MyKurda');
    expect(r.html).toContain('Zû be, heval 😄');
  });

  it('renders the reset button linking to the token URL, and the raw link in text', () => {
    const link = 'https://mykurda.com/reset-password?token=abc123';
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
