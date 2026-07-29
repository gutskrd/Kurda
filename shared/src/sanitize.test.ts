import { describe, expect, it } from 'vitest';
import { escapeHtml, hasHtmlSpecialChars, stripControlChars } from './sanitize.js';
import { XSS_PAYLOADS } from './xss-corpus.js';

describe('escapeHtml vs the XSS corpus', () => {
  it('neutralizes every payload — no executable HTML survives', () => {
    for (const payload of XSS_PAYLOADS) {
      const escaped = escapeHtml(payload);
      // With no raw angle brackets or quotes, the string cannot break out of an
      // HTML text/attribute context to form a tag — so it is inert even though
      // substrings like "onerror=" survive as literal, non-executable text.
      expect(escaped, payload).not.toMatch(/[<>"']/);
    }
  });

  it('encodes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});

describe('Kurdish text survives sanitization intact (edge case)', () => {
  const samples = [
    'Newroz pîroz be',
    'jîyan bi kurdî xweştire',
    'Kurdî: ê î û ç ş',
    'Nûroź', // trailing combining acute accent
    'کوردی', // Sorani (Arabic script)
  ];

  it('escapeHtml leaves letters and combining marks byte-for-byte unchanged', () => {
    for (const s of samples) {
      expect(escapeHtml(s)).toBe(s); // none contain &<>"' so nothing changes
    }
  });

  it('stripControlChars keeps diacritics + newlines/tabs but drops control chars', () => {
    expect(stripControlChars('Nûroź')).toBe('Nûroź'); // combining mark kept
    // NUL, BEL, DEL — constructed to keep this source file plain text
    const withControls = 'a' + String.fromCharCode(0) + 'b' + String.fromCharCode(7) + 'c' + String.fromCharCode(127);
    expect(stripControlChars(withControls)).toBe('abc');
    expect(stripControlChars('line1\nline2\tx')).toBe('line1\nline2\tx'); // tab + newline kept
  });
});

describe('hasHtmlSpecialChars', () => {
  it('detects HTML-significant characters', () => {
    expect(hasHtmlSpecialChars('plain kurdî ê')).toBe(false);
    expect(hasHtmlSpecialChars('<b>')).toBe(true);
  });
});
