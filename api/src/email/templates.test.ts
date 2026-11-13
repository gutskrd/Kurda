import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EMAIL_PICTURES } from '@kurda/shared';
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
      ['ku', 'Şîfreyê nû bike'],
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

/**
 * Every email is drawn from its own text (layout.ts): the same words, one
 * picture, and the link or the code as the one thing to act on. These hold
 * for all of them, so a template added later is held to them too.
 */
describe('every email, designed', () => {
  const VARS = {
    username: 'rojda',
    link: 'https://hevalo.app/verify?token=abc123',
    code: '482915',
    previous: 'rojda_amed',
    time: '12 November 2026, 08:14 UTC',
    holdDays: '60',
    cooldownDays: '30',
    graceDays: '30',
    reference: 'CR-2026-0042',
    contact: 'contact@zagrosian.com',
    headline: 'An old session key was used again',
    list: '• one thing\n• another thing',
    name: 'A. Example',
    address: '1 Example Street',
    phone: '+31 6 00000000',
    email: 'person@example.org',
    statement: 'I made it myself.\nIt was removed by mistake.',
    signature: 'A. Example',
    restoreDate: '26 November 2026',
  };
  /** The words of an HTML email, as a reader gets them. */
  const words = (html: string): string =>
    html
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<br>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');

  it('has a designed version in both languages, with its picture, its heading and nothing left unfilled', () => {
    for (const template of EMAIL_TEMPLATES) {
      for (const locale of EMAIL_LOCALES) {
        const r = renderEmail(template, locale, VARS);
        const where = `${template} ${locale}`;
        expect(r.html, where).toMatch(/^<!doctype html><html lang="(en|ku)" dir="ltr">/);
        // its picture as a loop, and the moment it rests on for a reader who wants less motion
        expect(r.html, where).toMatch(/<img class="loop" src="https:\/\/hevalo\.app\/email\/([a-z]+)\.gif" width="168" height="168" alt=""[^>]*><img class="still" src="https:\/\/hevalo\.app\/email\/\1\.png" width="168" height="168" alt="" style="display:none;/);
        expect(r.html, where).toContain('<h1 ');
        expect(r.html, where).not.toMatch(/\{[a-zA-Z]+\}/);
        // the page asks nothing of the reader's program but to draw it
        expect(r.html, where).not.toMatch(/<script|<link|<form|<iframe|\son[a-z]+=|javascript:/i);
      }
    }
  });

  it('says in the designed version everything the text says', () => {
    for (const template of EMAIL_TEMPLATES) {
      for (const locale of EMAIL_LOCALES) {
        const r = renderEmail(template, locale, VARS);
        // the link is the button and the line under it, or a link inside its sentence: compared without it
        const shown = words(r.html).replaceAll(VARS.link, '').replace(/\s+/g, ' ');
        for (const paragraph of r.text.split(/\n{2,}/)) {
          // the dash before the signature is the footer's rule
          const said = paragraph.replace(VARS.link, '').replace(/^—\s*/, '').replace(/\s+/g, ' ').trim();
          if (said) expect(shown, `${template} ${locale}: ${said.slice(0, 50)}`).toContain(said);
        }
      }
    }
  });

  it('makes the link the one button, worded for what it does, with the address again underneath', () => {
    for (const [template, en, ku] of [
      ['verify-email', 'Confirm your email', 'E-nameya xwe piştrast bike'],
      ['password-reset', 'Update password', 'Şîfreyê nû bike'],
      ['oauth-no-password', 'Set a password', 'Şîfreyekê saz bike'],
      ['moderation-urgent', 'Open the report', 'Raporê veke'],
      ['security-alert', 'Open the security log', 'Tomara ewlehiyê veke'],
    ] as const) {
      for (const [locale, label] of [['en', en], ['ku', ku]] as const) {
        const r = renderEmail(template, locale, VARS);
        const buttons = r.html.match(/<a href="[^"]*" class="btn"[^>]*>[^<]*<\/a>/g) ?? [];
        expect(buttons, `${template} ${locale}`).toHaveLength(1);
        expect(buttons[0], `${template} ${locale}`).toContain(`href="${VARS.link}"`);
        expect(buttons[0], `${template} ${locale}`).toContain(`>${label}</a>`);
        expect(words(r.html), `${template} ${locale}`).toContain(VARS.link);
      }
    }
  });

  it('shows the code large, and no button beside it', () => {
    const r = renderEmail('verify-email-code', 'en', VARS);
    expect(r.html).toMatch(/letter-spacing:8px[^>]*>482915</);
    expect(r.html).not.toContain('class="btn"');
  });

  it('never makes a link of an address somebody else wrote into an email', () => {
    // a copyright notice names the page it is about: only a page on Hevalo itself is linked
    const own = renderEmail('copyright-received', 'en', { ...VARS, link: 'https://hevalo.app/app/post/8842' });
    expect(own.html).toContain('<a href="https://hevalo.app/app/post/8842"');
    const elsewhere = renderEmail('copyright-received', 'en', { ...VARS, link: 'https://evil.example/app/post/8842' });
    expect(elsewhere.html).not.toContain('href="https://evil.example');
    expect(words(elsewhere.html)).toContain('https://evil.example/app/post/8842');
    // and what a person wrote in a statement is words, with its line breaks, whatever it looks like
    const notice = renderEmail('copyright-counter-notice', 'en', { ...VARS, statement: 'See https://evil.example/x\n<a href="https://evil.example">here</a>' });
    expect(notice.html).not.toContain('href="https://evil.example');
    expect(notice.html).toContain('See https://evil.example/x<br>&lt;a href=&quot;https://evil.example&quot;&gt;here&lt;/a&gt;');
  });

  it('draws no button for a link that is not a web address', () => {
    for (const link of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'not a link']) {
      const r = renderEmail('password-reset', 'en', { ...VARS, link });
      expect(r.html, link).not.toContain('class="btn"');
      expect(r.html, link).not.toMatch(/href="(javascript|data):/i);
    }
  });

  it('sets a short email in the middle and a long one from the edge', () => {
    expect(renderEmail('verify-email-code', 'en', VARS).html).toMatch(/<td align="center" style="padding:0 0 14px;"><p class="ink2"/);
    expect(renderEmail('copyright-counter-notice', 'en', VARS).html).toMatch(/<td align="left" style="padding:0 0 14px;"><p class="ink2"/);
  });

  it('has a loop and a still in the website’s public folder for every picture an email shows', () => {
    const folder = fileURLToPath(new URL('../../../web/public/email/', import.meta.url));
    for (const picture of EMAIL_PICTURES) {
      for (const kind of ['gif', 'png']) expect(existsSync(`${folder}${picture}.${kind}`), `${picture}.${kind}: run npm run email:art --workspace api`).toBe(true);
    }
  });

  it('gives each email the picture of what it is about', () => {
    const shown = (template: (typeof EMAIL_TEMPLATES)[number]) => /\/email\/([a-z]+)\.gif/.exec(renderEmail(template, 'en', VARS).html)?.[1];
    expect(shown('verify-email')).toBe('letter');
    expect(shown('verify-email-code')).toBe('code');
    expect(shown('password-reset')).toBe('key');
    expect(shown('password-changed')).toBe('lock');
    expect(shown('username-changed')).toBe('badge');
    expect(shown('new-sign-in')).toBe('device');
    expect(shown('sign-in-attempts')).toBe('shield');
    expect(shown('security-alert')).toBe('bell');
    expect(shown('deletion-notice')).toBe('hourglass');
    expect(shown('moderation-urgent')).toBe('flag');
    expect(shown('copyright-received')).toBe('document');
    expect(shown('copyright-kept')).toBe('scales');
  });
});
