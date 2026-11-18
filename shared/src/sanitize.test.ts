import { describe, expect, it } from 'vitest';
import { escapeHtml, stripControlChars, stripHiddenChars } from './sanitize.js';
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

describe('stripHiddenChars', () => {
  it('removes the characters a name could hide behind or reverse the line with', () => {
    // A right-to-left override makes "Hevalo\u202Egnp.exe" read as "Hevaloexe.png", and it runs on into the sentence round the name.
    expect(stripHiddenChars('Hevalo\u202Egnp.exe')).toBe('Hevalognp.exe');
    expect(stripHiddenChars('ad\u200Bmin\uFEFF')).toBe('admin');
    expect(stripHiddenChars('\u202Aa\u202Bb\u202Cc\u202Dd\u2066e\u2067f\u2068g\u2069')).toBe('abcdefg');
    expect(stripHiddenChars('a' + String.fromCharCode(7) + 'b')).toBe('ab');
  });

  it('keeps what Soranî spelling and emoji need: the joiners and the direction marks', () => {
    for (const s of ['\u0645\u06CC\u200C\u0646', '\u{1F469}\u200D\u{1F4BB}', 'Hevalo \u200F\u06A9\u0648\u0631\u062F\u06CC', 'Şêrko Bêkes']) {
      expect(stripHiddenChars(s)).toBe(s);
    }
  });
});
