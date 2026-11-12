import { describe, expect, it } from 'vitest';
import { renderEmailHtml, safeHref, type EmailDesign } from './layout.js';
import { answerHtml } from './support-inbox.js';

/**
 * The email layout, as a program that draws email needs it: every style on
 * the element, images with their size, colours for the night, and nothing
 * that was filled in ever read as markup.
 */

const design = (over: Partial<EmailDesign> = {}): EmailDesign => ({
  brand: 'hevalo',
  lang: 'en',
  title: 'A subject',
  blocks: [{ kind: 'text', parts: ['Hello.'] }],
  align: 'center',
  ...over,
});

describe('the email layout', () => {
  it('is one table-built page with its styles on the elements, and colours for the night', () => {
    const html = renderEmailHtml(design({ heading: 'A heading', picture: 'key', preheader: 'Shown beside the subject' }));
    expect(html).toMatch(/^<!doctype html><html lang="en" dir="ltr">/);
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain('@media (prefers-color-scheme:dark)');
    expect(html).toContain('<table role="presentation"');
    expect(html).toContain('<title>A subject</title>');
    // the line an inbox shows beside the subject is in the page and out of sight
    expect(html).toMatch(/<div style="display:none;[^"]*">Shown beside the subject<\/div>/);
    // every image says its size, so the page does not jump, and is decoration to a screen reader
    for (const img of html.match(/<img [^>]*>/g) ?? []) expect(img).toMatch(/width="\d+" height="\d+" alt=""/);
    expect(html).toContain('<img src="https://hevalo.app/email/key.png" width="168" height="168"');
  });

  it('wears the sender’s own mark: Hevalo’s, or Zagrosian’s', () => {
    const hevalo = renderEmailHtml(design());
    expect(hevalo).toContain('<a href="https://hevalo.app"');
    expect(hevalo).toContain('src="https://hevalo.app/logo.png"');
    expect(hevalo).toMatch(/>Hevalo<\/span>/);
    const zagrosian = renderEmailHtml(design({ brand: 'zagrosian' }));
    expect(zagrosian).toContain('<a href="https://zagrosian.com"');
    expect(zagrosian).toMatch(/>Zagrosian<\/span>/);
    expect(zagrosian).not.toMatch(/>Hevalo<\/span>/);
    // who the sender is, in both: the registered name, address and number
    for (const html of [hevalo, zagrosian]) expect(html).toMatch(/Zagrosian, .+ · KvK \d+/);
  });

  it('never reads what was filled in as markup', () => {
    const nasty = '<img src=x onerror=alert(1)>"\'&';
    const html = renderEmailHtml(
      design({
        title: nasty,
        heading: nasty,
        preheader: nasty,
        signoff: nasty,
        blocks: [
          { kind: 'text', parts: [nasty, { link: nasty }, { mailto: nasty }] },
          { kind: 'code', code: nasty },
          { kind: 'details', lines: [nasty] },
          { kind: 'quote', caption: nasty, text: nasty },
          { kind: 'button', label: nasty, href: 'https://hevalo.app/x' },
        ],
      }),
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/onerror=alert\(1\)>/);
    // each of the twelve places it was filled into shows it as the words it is
    expect(html.split('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;').length - 1).toBe(12);
  });

  it('opens only web addresses from a button, and links a sentence only to Hevalo’s own pages', () => {
    expect(safeHref('https://hevalo.app/reset?token=a&b=c')).toBe('https://hevalo.app/reset?token=a&b=c');
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' data:text/html,x', 'vbscript:x', 'mailto:a@b.c', 'hevalo.app/reset', '']) expect(safeHref(bad), bad).toBeNull();

    const button = renderEmailHtml(design({ blocks: [{ kind: 'button', label: 'Go', href: 'javascript:alert(1)' }] }));
    expect(button).not.toContain('class="btn"');
    expect(button).not.toContain('href="javascript:');

    const sentence = (link: string) => renderEmailHtml(design({ blocks: [{ kind: 'text', parts: ['About ', { link }] }] }));
    expect(sentence('https://hevalo.app/app/post/1')).toContain('<a href="https://hevalo.app/app/post/1"');
    for (const other of ['https://hevalo.app.evil.example/x', 'https://evil.example/hevalo.app', 'http://evilhevalo.app/x']) {
      expect(sentence(other), other).not.toMatch(/<a href="[^"]*evil/);
    }
    // an address to write to is a link only when it is an address
    const write = (mailto: string) => renderEmailHtml(design({ blocks: [{ kind: 'text', parts: [{ mailto }] }] }));
    expect(write('support@hevalo.app')).toContain('<a href="mailto:support@hevalo.app"');
    expect(write('support@hevalo.app?bcc=x@evil.example"')).not.toContain('<a href="mailto:support@hevalo.app?bcc');
  });

  it('gives the button’s address again as words only when there is a button to fail', () => {
    const withButton = renderEmailHtml(design({ fallback: 'If the button doesn’t work, copy this link:', blocks: [{ kind: 'button', label: 'Go', href: 'https://hevalo.app/x?y=1' }] }));
    expect(withButton).toContain('If the button doesn’t work, copy this link:');
    expect(withButton).toContain('>https://hevalo.app/x?y=1</a>');
    expect(renderEmailHtml(design({ fallback: 'If the button doesn’t work, copy this link:' }))).not.toContain('copy this link');
  });
});

describe('an answer from the support inbox, designed', () => {
  const quoted = { caption: 'On Wed, 11 Nov 2026, Rojda <rojda@example.org> wrote:', text: 'My streak is gone.\n<b>Help</b>' };

  it('keeps the paragraphs and line breaks of what was written, and quotes the mail it answers', () => {
    const html = answerHtml({ brand: 'hevalo', subject: 'Re: My streak', body: 'Hello Rojda,\n\nIt is back.\nNothing else changed.\n\nHamude', quoted });
    expect(html.match(/<p class="ink2"/g)).toHaveLength(3);
    expect(html).toContain('It is back.<br>Nothing else changed.');
    expect(html).toContain('On Wed, 11 Nov 2026, Rojda &lt;rojda@example.org&gt; wrote:');
    expect(html).toContain('My streak is gone.<br>&lt;b&gt;Help&lt;/b&gt;');
    // a letter, not a notice: no picture and no heading
    expect(html).not.toContain('/email/');
    expect(html).not.toContain('<h1');
  });

  it('wears Zagrosian’s mark when it answers for the business', () => {
    expect(answerHtml({ brand: 'zagrosian', subject: 'Re: Hello', body: 'Thank you.' })).toMatch(/>Zagrosian<\/span>/);
  });

  it('quotes a very long mail only in part, so the answer stays the answer', () => {
    const html = answerHtml({ brand: 'hevalo', subject: 'Re: Long', body: 'Thank you.', quoted: { caption: 'They wrote:', text: 'x'.repeat(9000) } });
    expect(html).toContain(`${'x'.repeat(4000)}…`);
    expect(html).not.toContain('x'.repeat(4001));
  });
});
