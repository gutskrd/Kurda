import { describe, expect, it } from 'vitest';
import { EMAIL_LOCALES, EMAIL_TEMPLATES, renderEmail } from './templates.js';

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
    expect(r.subject).toBe('Koda piştrastkirinê ya MyKurda');
    expect(r.text).toContain('Bi xêr hatî MyKurda!');
    expect(r.text).toContain('952530');
    expect(r.text).toContain('Ev kod ji bo 15 deqeyan derbasdar e.');
    expect(r.text).toContain('— Tîma MyKurda');
    expect(r.html).toContain('952530');
    expect(r.html).toContain('Zû be, heval 😄');
    expect(r.html).not.toMatch(/\{[a-z]+\}/); // nothing left uninterpolated
  });

  it('renders the reset button linking to the token URL, and the raw link in text', () => {
    const link = 'https://mykurda.com/reset-password?token=abc123';
    const r = renderEmail('password-reset', 'en', { link });
    expect(r.html).toContain(`href="${link}"`);
    expect(r.html).toContain('Şîfreyê Nû Bike');
    // a client that refuses HTML still gets a usable link
    expect(r.text).toContain(link);
    expect(r.text).not.toContain('<a ');
  });

  // nothing passes a locale today, so 'en' is what actually renders — both
  // locales must carry the same copy or users get the wrong mail
  it('sends the same copy whichever locale is requested', () => {
    for (const tpl of ['verify-email-code', 'password-reset'] as const) {
      expect(renderEmail(tpl, 'ku', { code: '1', link: 'x' })).toEqual(
        renderEmail(tpl, 'en', { code: '1', link: 'x' }),
      );
    }
  });

  it('escapes interpolated values in HTML but not in text', () => {
    const r = renderEmail('verify-email-code', 'en', { code: '<script>alert(1)</script>' });
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.text).toContain('<script>'); // plain text needs no escaping
  });
});
