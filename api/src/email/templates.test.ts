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
