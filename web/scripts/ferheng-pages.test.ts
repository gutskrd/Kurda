import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape';
import { WORDS_PER_PAGE, indexPage, pageKey, paginate, wordsPage, type Word } from './ferheng-pages';

const word = (headword: string, key = headword, definition = 'wate'): Word => ({
  headword,
  key,
  senses: [{ pos: 'noun', definition }],
});

describe('escaping', () => {
  it('closes every way out of text and out of an attribute', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml('" onerror="alert(1)')).toBe('&quot; onerror=&quot;alert(1)');
    expect(escapeHtml("' onload='x")).toBe('&#39; onload=&#39;x');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  /** The ampersand has to go first, or every other escape is re-escaped. */
  it('does not double-escape its own output', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    expect(escapeHtml(escapeHtml('<'))).toBe('&amp;lt;');
  });

  it('leaves ordinary Kurdish alone', () => {
    expect(escapeHtml('sêv, pirtûk û çîrok')).toBe('sêv, pirtûk û çîrok');
    expect(escapeHtml('ڕۆژ باش')).toBe('ڕۆژ باش');
  });
});

/**
 * The definitions are Wiktionary text, so a page is the one place where a
 * stranger's writing reaches a reader's browser. This is the test that would
 * fail if a template ever interpolated one without escaping it.
 */
describe('a page carries no markup it was not given', () => {
  const nasty = '<img src=x onerror="alert(1)">';

  it('escapes a definition', () => {
    const html = wordsPage({ prefix: 'a', words: [word('av', 'av', nasty)] }, null, null);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror="');
    expect(html).toContain('&lt;img');
  });

  it('escapes a headword, which is also somebody else’s text', () => {
    const html = wordsPage({ prefix: 'a', words: [word(nasty, 'a')] }, null, null);
    expect(html).not.toContain('<img');
  });

  it('escapes the id it builds out of a key, and the links around it', () => {
    const html = wordsPage({ prefix: '"x', words: [word('a', '"x')] }, '"p', '"n');
    // the only quotes left are the ones the template itself wrote
    expect(html).not.toContain('id="">');
    expect(html).not.toMatch(/id="[^"]*"[^>]*"/);
    expect(html).toContain('&quot;x');
  });

  /** Nothing executable, by construction — the policy is the second line, not the first. */
  it('contains no script and no inline style', () => {
    const html = wordsPage({ prefix: 'a', words: [word('av')] }, null, null);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/\son\w+=/i); // onclick, onerror, onload…
    expect(html).not.toMatch(/javascript:/i);
  });
});

describe('splitting the dictionary into pages', () => {
  const many = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => word(`${prefix}${i}`, `${prefix}${String(i).padStart(4, 'x')}`));

  it('keeps a small group on one page', () => {
    const pages = paginate([word('av'), word('ar'), word('as')]);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.prefix).toBe('a');
    expect(pages[0]!.words).toHaveLength(3);
  });

  it('takes another letter when a page would be too long', () => {
    const pages = paginate([...many('a', WORDS_PER_PAGE + 10)]);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) expect(p.prefix.length).toBeGreaterThan(1);
  });

  it('never loses or duplicates a word', () => {
    const words = [...many('a', 400), ...many('b', 20), word('c')];
    const pages = paginate(words);
    const seen = pages.flatMap((p) => p.words.map((w) => w.key));
    expect(seen).toHaveLength(words.length);
    expect(new Set(seen).size).toBe(words.length);
  });

  /**
   * Words whose whole key is identical cannot be split apart by taking another
   * letter. Recursing on them would never terminate; the page is kept whole
   * instead, oversized and addressable, which is the lesser of the two.
   */
  it('stops rather than recursing forever on identical keys', () => {
    const identical = Array.from({ length: WORDS_PER_PAGE + 5 }, (_, i) => word(`av${i}`, 'av'));
    const pages = paginate(identical);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.words).toHaveLength(identical.length);
  });

  it('gives every page a distinct prefix, because the prefix is the URL', () => {
    const pages = paginate([...many('a', 500), ...many('s', 500)]);
    const prefixes = pages.map((p) => p.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  /**
   * The expensive mistake, and the one the first version made: splitting "a"
   * because it is too big also splits every rare prefix under it into a page of
   * four words. On the real corpus that was 17,652 pages against a 20,000-file
   * deployment limit. Merging the small ones back took it to 3,446.
   */
  it('merges the small pages a split leaves behind', () => {
    // one crowded prefix and a long tail of rare ones, which is the real shape
    const words = [
      ...many('aa', 300),
      ...'bcdefghijklmnop'.split('').map((c) => word(`a${c}x`, `a${c}x`)),
    ];
    const pages = paginate(words);
    const tail = pages.filter((p) => !p.prefix.startsWith('aa'));
    expect(tail.length, 'fifteen rare prefixes should not be fifteen pages').toBeLessThan(5);
    for (const p of pages) expect(p.words.length).toBeLessThanOrEqual(WORDS_PER_PAGE);
  });

  it('names a merged page for the range it covers, in one piece', () => {
    const words = [...many('aa', 300), ...'bcdefghij'.split('').map((c) => word(`a${c}x`, `a${c}x`))];
    const merged = paginate(words).filter((p) => p.prefix.includes('-'));
    expect(merged.length).toBeGreaterThan(0);
    for (const p of merged) {
      const [from, to, ...rest] = p.prefix.split('-');
      expect(rest, 'a range is widened once, not repeatedly').toHaveLength(0);
      expect(from! < to!, `${p.prefix} should read low to high`).toBe(true);
    }
  });

  /** A merged name is still one segment, so it is still one directory. */
  it('never builds a prefix that would nest a directory', () => {
    const pages = paginate([...many('a', 400), ...many('b', 9), ...many('c', 9)]);
    for (const p of pages) expect(p.prefix).not.toContain('/');
  });

  /**
   * Coalescing runs at every depth, so a page being merged may already be a
   * range. Widening then has to read `-` as "to" and not as a separator. The
   * real corpus produced `a-ab-abb` — three bounds for a thing that has two —
   * and no test built from a tidy fixture had shown it.
   */
  it('widens a range that is already a range, without stacking bounds', () => {
    const deep = Array.from({ length: 900 }, (_, i) =>
      word(`w${i}`, `a${String(i).padStart(5, '0')}`),
    );
    const scattered = 'bcdefghijklmnopqrstuv'.split('').map((c) => word(`a${c}`, `a${c}`));
    for (const p of paginate([...deep, ...scattered])) {
      expect(p.prefix.split('-').length, `${p.prefix} has more than two bounds`).toBeLessThanOrEqual(2);
    }
  });
});

describe('what a page tells a search engine', () => {
  it('points at its own address', () => {
    const html = wordsPage({ prefix: 'ab', words: [word('abc')] }, null, null);
    expect(html).toContain('<link rel="canonical" href="https://hevalo.app/ferheng/ab/">');
  });

  it('links forward and back, so a crawler can walk the whole set', () => {
    const html = wordsPage({ prefix: 'ab', words: [word('abc')] }, 'aa', 'ac');
    expect(html).toContain('href="/ferheng/aa/"');
    expect(html).toContain('href="/ferheng/ac/"');
  });

  it('describes itself with words rather than with the site blurb', () => {
    const html = wordsPage({ prefix: 'ab', words: [word('abc'), word('abz')] }, null, null);
    expect(html).toMatch(/<meta name="description" content="2 peyvên kurdî ji abc heta abz/);
  });

  it('indexes every page from the A–Z', () => {
    const pages = paginate([word('av'), word('ba'), word('ci')]);
    const html = indexPage(pages, 3);
    for (const p of pages) expect(html).toContain(`href="/ferheng/${p.prefix}/"`);
    expect(html).toContain('<link rel="canonical" href="https://hevalo.app/ferheng/">');
  });
});

describe('what a word is filed under', () => {
  /**
   * `dictionaryKey` keeps anything Unicode calls a letter, and the *modifier*
   * letters are letters. A headword beginning with Arabic tatweel — a
   * typographic elongation, not a sound — sorted ahead of the whole Latin
   * alphabet and opened the A–Z with a section named after it.
   */
  it('files a word under its first real letter, not a stretch', () => {
    expect(pageKey('ـrojname')).toBe('rojname');
    expect(pageKey('roـj')).toBe('roj');
  });

  it('gives nothing back for a headword that is only stretches', () => {
    expect(pageKey('ـ')).toBe('');
    expect(pageKey('ــ')).toBe('');
    expect(pageKey('123')).toBe('');
  });

  it('keeps every script the corpus actually uses', () => {
    expect(pageKey('sêv')).toBe('sev');
    expect(pageKey('ڕۆژ')).toBe('ڕۆژ');
    expect(pageKey('щрщ')).toBe('щрщ');
  });
});
