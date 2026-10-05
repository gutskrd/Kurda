import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape';
import { HAWAR, SORANI, alphabetOf, compareKeys } from './ferheng-alphabet';
import { COPY, ferhengLocaleFor } from './ferheng-copy';
import { definitionsOf, isInflected, toEntries } from './ferheng-entries';
import {
  STYLE,
  WORDS_PER_PAGE,
  alphabetName,
  featured,
  indexPage,
  letterOf,
  letterPage,
  notFoundPage,
  pageKey,
  paginate,
  wordsPage,
  type Word,
} from './ferheng-pages';

const word = (headword: string, key = headword, definition = 'wate'): Word => ({
  headword,
  key,
  senses: [{ pos: 'Navdêr', definition }],
  synonyms: [],
  sorani: [],
  arabic: [],
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

  /**
   * The shell has an `<img>` of its own — the deer in the brand — so "the page
   * contains no img tag" stopped being the question. The question is whether
   * the *attacker's* tag survived, which is what `src=x` asks.
   */
  const injected = /<img[^>]*src=x/;

  it('escapes a definition', () => {
    const html = wordsPage({ prefix: 'a', words: [word('av', 'av', nasty)] }, null, null);
    expect(html).not.toMatch(injected);
    expect(html).not.toContain('onerror="');
    expect(html).toContain('&lt;img');
  });

  it('escapes a headword, which is also somebody else’s text', () => {
    const html = wordsPage({ prefix: 'a', words: [word(nasty, 'a')] }, null, null);
    expect(html).not.toMatch(injected);
    expect(html).not.toContain('onerror="');
    expect(html).toContain('&lt;img');
  });

  it('escapes the id it builds out of a key, and the links around it', () => {
    const html = wordsPage({ prefix: '"x', words: [word('a', '"x')] }, '"p', '"n');
    expect(html).toContain('id="&quot;x"');
    // no attribute value is closed early by a quote that came from the data
    expect(html).not.toMatch(/id="[^"]*"[^\s>]/);
  });

  /** A synonym is a link built from a word, so its href is a value too. */
  it('escapes a synonym on both sides of the link it becomes', () => {
    const pageOf = new Map([['xy', 'x-y']]);
    const w: Word = { ...word('av'), synonyms: ['"><b>boom</b>'] };
    const html = wordsPage({ prefix: 'a', words: [w] }, null, null, pageOf);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });

  /**
   * Nothing executable but our own file, by construction — the policy is the
   * second line, not the first. The one script is chrome.js, which relabels
   * the bar; it is empty-bodied and named by path, and nothing else may be.
   */
  it('runs no script but its own chrome file, and no inline style', () => {
    const html = wordsPage({ prefix: 'a', words: [word('av')] }, null, null);
    expect(html.match(/<script/gi)).toHaveLength(1);
    expect(html).toContain('<script src="/ferheng/chrome.js"></script>');
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

  /**
   * Three levels, because one was too many words on one page: the A–Z lists
   * letters, a letter lists its ranges, a range lists the words. The old
   * single index listed all 3,413 ranges and came to 145 KB.
   */
  it('lists letters from the A–Z, not every range', () => {
    const html = indexPage([{ letter: 'a', words: 120 }, { letter: 'b', words: 40 }], 160, 4, [], new Map());
    expect(html).toContain('href="/ferheng/a/"');
    expect(html).toContain('href="/ferheng/b/"');
    expect(html).toContain('<link rel="canonical" href="https://hevalo.app/ferheng/">');
    // what this guards is the INDEX, not the chrome: listing every range put
    // this page at 145 KB once. The app's nav and footer are a fixed ~4.5 KB
    // that every page carries so that none of them looks like a different site
    // — the labels in them are marked for chrome.js, which is the last 0.5 KB.
    expect(html.length, 'the landing page should not list every range').toBeLessThan(11_000);
  });

  /**
   * The front page used to be 53 bordered boxes with a letter in each: a table
   * of contents pretending to be a page, with nothing on it to read and no
   * reason to be there except to leave.
   */
  it('opens the dictionary with words, not only with letters', () => {
    const sev: Word = { ...word('sêv', 'sev', 'Fêkiyeke sor an kesk e, ji dara sêvê.'), sorani: ['سێو'] };
    const html = indexPage([{ letter: 's', words: 1 }], 1, 1, featured([sev], 4), new Map());
    expect(html).toContain('>sêv</a>');
    expect(html).toContain('Fêkiyeke sor an kesk e, ji dara sêvê.');
    expect(html).toContain('سێو');
  });

  /** A spread across the alphabet, and the same spread on every build. */
  it('picks the fullest entry each letter has, not the first one', () => {
    const long = 'Wateyeke têra xwe dirêj a vê peyvê ye, bi rastî ne kurt e.';
    const thin: Word = { ...word('aaa', 'aaa', long), synonyms: ['yek'] };
    const full: Word = { ...word('azz', 'azz', long), sorani: ['ئاز'], arabic: ['از'], synonyms: ['yek'] };
    expect(featured([thin, full], 4).map((w) => w.headword)).toEqual(['azz']);
  });

  /**
   * The first run featured a, b, c, d and e: the corpus does gloss the letters
   * of the alphabet, and they sort first.
   */
  it('does not feature a letter of the alphabet as though it were a word', () => {
    const letter: Word = { ...word('a', 'a', 'Yekem tîpa alfabeya kurdî ye û nîşana dengekî dirêj e.'), arabic: ['ا'] };
    const stub: Word = { ...word('bbb', 'bbb', 'kurt'), arabic: ['ب'] };
    const inflected: Word = {
      ...word('ccc', 'ccc', 'x'),
      senses: [{ pos: 'Formeke navdêrê', definition: 'Rewşa çemandî ya pirjimar a binavkirî ya cc.' }],
      arabic: ['ج'],
    };
    expect(featured([letter, stub, inflected], 4)).toEqual([]);
  });

  /**
   * Kurdish is written in two alphabets and a reader of one often cannot read
   * the other, so an index running A…Z straight into ئ, ب, پ is not one
   * alphabet with an odd tail. Hawar is the Latin alphabet from Celadet Alî
   * Bedirxan's journal; Soranî is the Arabic-script one.
   */
  it('names the two alphabets instead of running them together', () => {
    const html = indexPage(
      [{ letter: 'a', words: 120 }, { letter: 'ب', words: 40 }],
      160,
      4,
      [],
      new Map(),
    );
    expect(html).toContain('Alfabeya Hawarê');
    expect(html).toContain('Alfabeya Soranî');
    // each letter sits under its own heading, in the order the alphabets are listed
    expect(html.indexOf('Alfabeya Hawarê')).toBeLessThan(html.indexOf('Alfabeya Soranî'));
    expect(html.indexOf('/ferheng/a/')).toBeLessThan(html.indexOf('Alfabeya Soranî'));
    expect(html.indexOf('Alfabeya Soranî')).toBeLessThan(html.indexOf('/ferheng/ب/'));
  });

  it('leaves out an alphabet the corpus has no letters in', () => {
    const html = indexPage([{ letter: 'a', words: 120 }], 120, 1, [], new Map());
    expect(html).toContain('Alfabeya Hawarê');
    expect(html).not.toContain('Alfabeya Soranî');
    expect(html).not.toContain('Tîpên din');
  });

  /**
   * By membership of the two alphabets, not by Unicode script. `Ḧ` is Latin
   * and `ط` is Arabic, and neither is one of the 31 or the 33 — calling them
   * Hawar and Soranî would be wrong in a dictionary, and hiding them would lose
   * the 250 words that begin with `ḧ`.
   */
  it('sorts a letter by which alphabet it is actually in', () => {
    expect(alphabetOf('a')).toBe('hawar');
    expect(alphabetOf('ş')).toBe('hawar');
    expect(alphabetOf('ḧ')).toBe('other');
    expect(alphabetOf('ڕ')).toBe('sorani');
    expect(alphabetOf('ط')).toBe('other');
    expect(alphabetOf('щ')).toBe('other');
    // one letter written two ways still belongs to its alphabet
    expect(alphabetOf('ك')).toBe('sorani');
    expect(alphabetName('s')).toBe('Alfabeya Hawarê');
    expect(alphabetName('ش')).toBe('Alfabeya Soranî');
  });

  /** The orders are the standard ones, and complete. */
  it('knows all 31 Hawar letters and all 33 Soranî ones', () => {
    expect(HAWAR).toHaveLength(31);
    expect(HAWAR.join('')).toBe('abcçdeêfghiîjklmnopqrsştuûvwxyz');
    expect(SORANI).toHaveLength(33);
    expect(SORANI[0]).toBe('ا');
    expect(SORANI.at(-1)).toBe('ێ');
    // every letter appears once
    expect(new Set([...HAWAR, ...SORANI]).size).toBe(64);
  });

  /**
   * The point the whole change turns on: Ş is a letter, not a decoration on S,
   * so it sorts after S and before T rather than wherever folding put it.
   */
  it('puts a diacritic letter in its own place, not beside its base', () => {
    const order = ['sal', 'sor', 'şal', 'şor', 'tar'];
    expect([...order].reverse().sort(compareKeys)).toEqual(order);
    expect(compareKeys('ş', 's')).toBeGreaterThan(0);
    expect(compareKeys('ş', 't')).toBeLessThan(0);
    expect(compareKeys('ç', 'c')).toBeGreaterThan(0);
    expect(compareKeys('ç', 'd')).toBeLessThan(0);
  });

  /**
   * Merging by size alone produced `چە-ح`: 93 ح words on a page named for چ,
   * so `letterOf` filed them under چ and ح had no section in the index at all.
   * Thirteen letters went missing that way.
   */
  it('never merges a page across two letters', () => {
    const words = [
      ...['sal', 'sar', 'sor'].map((w) => word(w)),
      ...['şal', 'şar'].map((w) => word(w)),
      ...['tar'].map((w) => word(w)),
    ];
    const pages = paginate(words);
    for (const p of pages) {
      const letters = new Set(p.words.map((w) => [...w.key][0]));
      expect([...letters], `page ${p.prefix} spans ${[...letters].join('')}`).toHaveLength(1);
    }
    // and so every letter present keeps a page of its own to be indexed under
    expect(new Set(pages.map((p) => letterOf(p.prefix)))).toEqual(new Set(['s', 'ş', 't']));
  });

  /** Anything in neither alphabet sorts after everything that is in one. */
  it('puts a letter from neither alphabet last', () => {
    expect(compareKeys('ḧa', 'za')).toBeGreaterThan(0);
    expect(compareKeys('ḧa', 'ا')).toBeGreaterThan(0);
  });

  it('names the alphabet on a letter’s own page too', () => {
    const latin = letterPage('s', paginate([word('sêv', 'sev')]), 1);
    expect(latin).toContain('Alfabeya Hawarê');
    const arabic = letterPage('ش', paginate([word('شار', 'شار')]), 1);
    expect(arabic).toContain('Alfabeya Soranî');
  });

  it('lists a letter’s ranges from its own page', () => {
    const pages = paginate([word('av'), word('ar'), word('as')]);
    const html = letterPage('a', pages, 3);
    for (const p of pages) expect(html).toContain(`href="/ferheng/${p.prefix}/"`);
    expect(html).toContain('<link rel="canonical" href="https://hevalo.app/ferheng/a/">');
  });

  /** A trail a search engine prints as hevalo.app › Ferheng › S. */
  it('carries a breadcrumb a search engine can read', () => {
    const html = wordsPage({ prefix: 'se', words: [word('sev')] }, null, null);
    expect(html).toContain('https://schema.org/BreadcrumbList');
    expect(html).toContain('https://schema.org/ListItem');
    expect(html).toContain('itemprop="position" content="1"');
  });

  it('marks up each entry as a defined term', () => {
    const html = wordsPage({ prefix: 'se', words: [word('sev')] }, null, null);
    expect(html).toContain('https://schema.org/DefinedTermSet');
    expect(html).toContain('https://schema.org/DefinedTerm');
    expect(html).toContain('<a href="#sev">sev</a>');
    expect(html).toContain('itemprop="name"');
    expect(html).toContain('itemprop="description"');
  });
});

describe('how an entry reads', () => {
  it('groups senses by part of speech and numbers them', () => {
    const w: Word = {
      ...word('ser'),
      senses: [
        { pos: 'Navdêr', definition: 'serî' },
        { pos: 'Lêker', definition: 'serî kirin' },
        { pos: 'Navdêr', definition: 'jor' },
      ],
    };
    const html = wordsPage({ prefix: 'ser', words: [w] }, null, null);
    // two parts of speech, not three undifferentiated lines
    expect(html.match(/class="row sense"/g)).toHaveLength(2);
    expect(html).toMatch(/Navdêr<\/span><ol><li[^>]*>serî<\/li><li[^>]*>jor<\/li><\/ol>/);
  });

  /**
   * Half the corpus is inflected forms, and the source's own label is the only
   * thing that says which. `sabatan` is not a noun; it is the oblique plural
   * of one, and it must not be set as though it were a word of its own.
   */
  it('sets an inflected form apart from a word in its own right', () => {
    const form: Word = {
      ...word('sabatan'),
      senses: [{ pos: 'Formeke navdêrê', definition: 'Rewşa çemandî ya pirjimar a binavkirî ya sabat.' }],
    };
    const html = wordsPage({ prefix: 'sa', words: [form, word('sabat')] }, null, null);
    expect(html).toContain('class="row sense form"');
    expect(html.match(/class="row sense"/g)).toHaveLength(1);
  });

  it('says a thing once, however many times the source said it', () => {
    const w: Word = {
      ...word('av'),
      senses: [
        { pos: 'Navdêr', definition: 'ava' },
        { pos: 'Navdêr', definition: 'ava' },
      ],
    };
    const html = wordsPage({ prefix: 'av', words: [w] }, null, null);
    expect(html.match(/>ava</g)).toHaveLength(1);
  });

  /**
   * Links come from the source's own synonym list, not from reading the prose,
   * so a cross-reference is something the corpus stated rather than a guess at
   * what a definition meant.
   */
  it('links a synonym to the page that holds it', () => {
    const w: Word = { ...word('mezin'), synonyms: ['gir'] };
    const html = wordsPage({ prefix: 'me', words: [w] }, null, null, new Map([['gir', 'gi-gq']]));
    expect(html).toContain('<a href="/ferheng/gi-gq/#gir">gir</a>');
  });

  /** A link to a page that does not exist is worse than no link. */
  it('prints a synonym it cannot place, without linking it', () => {
    const w: Word = { ...word('mezin'), synonyms: ['nowhere'] };
    const html = wordsPage({ prefix: 'me', words: [w] }, null, null, new Map());
    expect(html).toContain('nowhere');
    expect(html).not.toContain('href="/ferheng/undefined');
  });
});

describe('reading the corpus', () => {
  const row = (over: Record<string, unknown>) => ({ word: 'x', pos_title: 'Navdêr', glosses: ['wate'], ...over });

  /**
   * 4% of the corpus is Wiktionary asking a reader to write the meaning. A word
   * whose only gloss is that has nothing to print, and ~15,000 pages saying so
   * tell a search engine the site is mostly empty.
   */
  it('drops a word whose only meaning is a request to write one', () => {
    const entries = toEntries([
      row({ word: 'sabûn di ser dan', glosses: ['Maneya vê madeyê hê nehatiye nivîsîn. Heke hûn maneya wê bizanin, kerem bikin binivîsin.'] }),
      row({ word: 'sabûn', glosses: ['Maddeyek kefdar e.'] }),
    ]);
    expect(entries.map((e) => e.headword)).toEqual(['sabûn']);
  });

  /** One row in 39,397 says something real before the boilerplate. */
  it('keeps what was written when only part of a gloss is boilerplate', () => {
    expect(definitionsOf('Gotineke pêşiyan a kurdî. Maneya vê madeyê hê nehatiye nivîsîn.')).toEqual([
      'Gotineke pêşiyan a kurdî.',
    ]);
  });

  /** The extraction flattened lists into newlines; they were separate statements. */
  it('splits a gloss that holds more than one statement', () => {
    expect(definitionsOf('12 meh, 365 roj\n bihar û havîn')).toEqual(['12 meh, 365 roj', 'bihar û havîn']);
  });

  it('merges the rows of one word and keeps the source label for each', () => {
    const entries = toEntries([
      row({ word: 'salane', pos_title: 'Rengdêr', glosses: ['her sal'] }),
      row({ word: 'salane', pos_title: 'Navdêr', glosses: ['tiştê salê'] }),
      row({ word: 'salane', pos_title: 'Navdêr', glosses: ['tiştê salê'] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.senses).toEqual([
      { pos: 'Navdêr', definition: 'tiştê salê' },
      { pos: 'Rengdêr', definition: 'her sal' },
    ]);
  });

  /** A word that is also a form of another word leads with what it is itself. */
  it('puts a word in its own right before a form of one', () => {
    const entries = toEntries([
      row({ word: 'sal', pos_title: 'Formeke navdêrê', glosses: ['Rewşa çemandî ya sala.'] }),
      row({ word: 'sal', pos_title: 'Navdêr', glosses: ['12 meh'] }),
    ]);
    expect(entries[0]!.senses.map((s) => s.pos)).toEqual(['Navdêr', 'Formeke navdêrê']);
    expect(isInflected('Formeke navdêrê')).toBe(true);
    expect(isInflected('Navdêr')).toBe(false);
  });

  it('carries the Soranî and Arabic the importer throws away', () => {
    const entries = toEntries([
      row({ word: 'sal', sorani_equivalents: ['ساڵ'], arabic_equivalents: ['سَنَة'], synonyms: ['sal', 'bihar'] }),
    ]);
    expect(entries[0]).toMatchObject({ sorani: ['ساڵ'], arabic: ['سَنَة'], synonyms: ['bihar'] });
  });

  /**
   * 25 cross-reference values in 5,208 are a lone comma, a bracket or "(2)" —
   * the wreckage of whatever split the source's prose into a list. Printed as
   * written, `îsot` listed a comma among its synonyms.
   */
  it('drops a cross-reference that is punctuation rather than a word', () => {
    const entries = toEntries([row({ word: 'îsot', synonyms: ['filfil', ',', '(2)', '..', 'bîber'] })]);
    expect(entries[0]!.synonyms).toEqual(['filfil', 'bîber']);
  });

  it('ignores a row whose fields are not what they claim to be', () => {
    expect(toEntries([row({ word: 42 }), row({ word: 'ok', glosses: 'not an array' })])).toEqual([]);
    expect(toEntries([row({ word: 'ok', synonyms: [1, null, 'yek'] })])[0]!.synonyms).toEqual(['yek']);
  });
});

describe('an address with no page behind it', () => {
  /**
   * It has to be a file in here rather than the app's own not-found screen:
   * Cloudflare answers an unmatched path with the SPA shell, and `_headers`
   * applies this directory's policy by URL, so the shell arrived under
   * `default-src 'none'` and its own bundle was refused. The reader got a
   * blank page.
   */
  it('is a page of its own, and needs no script to say so', () => {
    const html = notFoundPage();
    expect(html).toContain('nehat dîtin');
    expect(html).toContain('href="/ferheng/"');
    // only the bar's relabelling, which every page carries; nothing of the app's
    expect(html.match(/<script[^>]*>/gi)).toEqual(['<script src="/ferheng/chrome.js">']);
  });

  /** The letters are the one thing a re-import never moves. */
  it('sends a reader somewhere that still exists', () => {
    expect(notFoundPage()).toContain('Here ferhengê');
    expect(notFoundPage()).toContain('<link rel="canonical" href="https://hevalo.app/ferheng/">');
  });
});

/**
 * The dictionary copies the app's tokens and shell rules rather than importing
 * them, because these pages load no bundle — that is what makes them free to
 * serve. The cost is that the copy can drift, and it did, twice, in ways a
 * reader could see but not name: `.eyebrow` at 0.78rem against the app's 12px,
 * and the nav's 1440px cap missing entirely, so clicking Ferheng made the
 * navigation visibly narrower than everywhere else.
 *
 * Reading the app's own CSS and comparing is what turns the next drift into a
 * failing test instead of a judgement call.
 */
describe('what the dictionary copies from the app', () => {
  /*
   * Resolved from the workspace root rather than from `import.meta.url`, which
   * vitest rewrites — the first version of this silently read the test file
   * itself, and a looser assertion would have passed against it and proved
   * nothing. The guard is the point: a test that reads the wrong file must
   * fail, not quietly succeed.
   */
  const read = (p: string): string => {
    // vitest may be rooted at the workspace or at the repo, and `import.meta.url`
    // is rewritten under it — the first version of this silently read the test
    // file itself, which a looser assertion would have passed against.
    const candidates = ['src/styles', 'web/src/styles'].map((d) => resolve(process.cwd(), d, p));
    const found = candidates.find((f) => existsSync(f));
    if (!found) throw new Error(`cannot find ${p}; looked in ${candidates.join(', ')}`);
    const css = readFileSync(found, 'utf8');
    if (!css.includes('{')) throw new Error(`${found} does not look like CSS`);
    return css;
  };

  /** Every `--name: value` declared in a file's `:root`. */
  const tokensOf = (css: string): Map<string, string> => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
    const out = new Map<string, string>();
    for (const m of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
    return out;
  };

  it('gives every token it declares the app’s own value', () => {
    const app = tokensOf(read('tokens.css'));
    const mine = tokensOf(STYLE);
    expect(mine.size).toBeGreaterThan(10);
    const wrong: string[] = [];
    for (const [name, value] of mine) {
      const theirs = app.get(name);
      // the dictionary copies a subset; what it does copy must match
      if (theirs !== undefined && theirs !== value) wrong.push(`${name}: ${value} ≠ ${theirs}`);
    }
    expect(wrong).toEqual([]);
  });

  /**
   * The bar is not a column of text and does not take a column of text's cap.
   * Missing this one rule is what "the navbar becomes less wide" was.
   */
  it('lets the bar run wider than the content column, as the app does', () => {
    expect(read('layout.css')).toMatch(/min-width:\s*1180px[\s\S]{0,120}max-width:\s*1440px/);
    expect(STYLE).toMatch(/min-width:\s*1180px[\s\S]{0,120}max-width:\s*1440px/);
  });

  /** The value one declaration has in the first rule for `selector` — the base rule, ahead of any media query. */
  const declOf = (css: string, selector: string, prop: string): string | undefined => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
    return block ? new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`).exec(block)?.[1]?.trim() : undefined;
  };

  /**
   * Clicking Dictionary used to move the bar: the dictionary had a copy of the
   * app's nav from before the app's changed, so the links were dimmer, the
   * page you were on lost its highlight, and Log in and Get started sat 28px
   * apart instead of 14 on slightly smaller buttons. The copy has to keep up.
   */
  it('draws the bar with the app’s own measurements', () => {
    const layout = read('layout.css');
    const ui = read('ui.css');
    const pairs: Array<[string, string, string]> = [
      [layout, '.nav-inner', 'gap'],
      [layout, '.nav-links', 'gap'],
      [layout, '.nav-link', 'height'],
      [layout, '.nav-link', 'padding'],
      [layout, '.nav-link', 'font-size'],
      [layout, '.nav-link', 'color'],
      [layout, '.nav-link.active', 'background'],
      [layout, '.nav-link', 'font-weight'],
      [layout, '.nav-link-icon', 'color'],
      [layout, '.nav-actions', 'gap'],
      [ui, '.btn-sm', 'height'],
      [ui, '.btn-sm', 'padding'],
      [ui, '.btn-sm', 'font-size'],
    ];
    const wrong = pairs
      .map(([css, sel, prop]) => [sel, prop, declOf(css, sel, prop), declOf(STYLE, sel, prop)] as const)
      .filter(([, , app, mine]) => app === undefined || app !== mine)
      .map(([sel, prop, app, mine]) => `${sel} ${prop}: ${mine} ≠ ${app}`);
    expect(wrong).toEqual([]);
    // the page you are on is not bolder: a wider link moves every link after it
    for (const css of [layout, STYLE]) expect(declOf(css, '.nav-link.active', 'font-weight')).toBeUndefined();
  });

  /** Headings in the display serif is most of why a page looks like Hevalo. */
  it('sets headings in the same family the app sets them in', () => {
    expect(read('base.css')).toMatch(/h1,\s*h2,\s*h3,\s*h4\s*\{[^}]*--font-display/);
    expect(STYLE).toMatch(/h1,\s*h2,\s*h3,\s*h4\s*\{[^}]*--font-display/);
  });
});

/**
 * Clicking Dictionary in an app set to English turned the whole screen
 * Kurmancî. The words are Kurdish and always will be — that is the dictionary —
 * but the bar, the footer and the labels belong to whoever is reading.
 */
describe('the language around the words', () => {
  const sev: Word = { ...word('sêv', 'sev', 'Fêkiyeke sor e.'), sorani: ['سێو'] };
  const pages = paginate([sev]);

  it('publishes the chrome in English without touching the words', () => {
    const html = wordsPage(pages[0]!, null, null, new Map(), COPY.en);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('>Home<');
    expect(html).toContain('>Dictionary<');
    expect(html).toContain('1 words');
    // the entry itself is untouched
    expect(html).toContain('sêv');
    expect(html).toContain('Fêkiyeke sor e.');
    // and none of the Kurmancî chrome survives
    expect(html).not.toContain('>Mal<');
    expect(html).not.toContain('peyv</p>');
  });

  it('keeps the Kurmancî set Kurmancî', () => {
    const html = wordsPage(pages[0]!, null, null, new Map(), COPY.ku);
    expect(html).toContain('<html lang="ku">');
    expect(html).toContain('>Mal<');
    expect(html).toContain('1 peyv');
  });

  /** Sibling paths: `ku` and `en` are both plausible range names. */
  it('gives each language its own path, and never nests one under the other', () => {
    expect(COPY.ku.base).toBe('ferheng');
    expect(COPY.en.base).toBe('dictionary');
    expect(wordsPage(pages[0]!, null, null, new Map(), COPY.en)).toContain('href="/dictionary/');
    expect(indexPage([{ letter: 's', words: 1 }], 1, 1, [], new Map(), COPY.en)).toContain(
      '<link rel="canonical" href="https://hevalo.app/dictionary/">',
    );
  });

  /** Each names the other, so the pair is one page in two languages. */
  it('points each language at the other for a search engine', () => {
    for (const c of [COPY.ku, COPY.en]) {
      const html = indexPage([{ letter: 's', words: 1 }], 1, 1, [], new Map(), c);
      expect(html).toContain('<link rel="alternate" hreflang="ku" href="https://hevalo.app/ferheng/">');
      expect(html).toContain('<link rel="alternate" hreflang="en" href="https://hevalo.app/dictionary/">');
    }
  });

  /** The same rule the API already uses for email. */
  it('sends a reader of anything but Kurmancî to the English set', () => {
    expect(ferhengLocaleFor('ku')).toBe('ku');
    for (const l of ['en', 'ckb', 'de', 'tr', 'ar', null, undefined]) expect(ferhengLocaleFor(l)).toBe('en');
  });

  it('names both alphabets in whichever language is being read', () => {
    expect(alphabetName('s', COPY.en)).toBe('Hawar alphabet');
    expect(alphabetName('ش', COPY.en)).toBe('Sorani alphabet');
    expect(alphabetName('s', COPY.ku)).toBe('Alfabeya Hawarê');
  });

  /**
   * The part of speech was the last Kurmancî left on an English page, sitting
   * in the margin of every entry. The corpus writes it; the English set turns
   * it over, and anything unlisted falls through as written rather than being
   * guessed at.
   */
  it('turns the part of speech over too, and passes through what it cannot', () => {
    const w: Word = {
      ...word('sal'),
      senses: [
        { pos: 'Navdêr', definition: '12 meh' },
        { pos: 'Formeke navdêrê', definition: 'Rewşa çemandî ya sal.' },
        { pos: 'Tiştekî nenas', definition: 'x' },
      ],
    };
    const html = wordsPage({ prefix: 'sa', words: [w] }, null, null, new Map(), COPY.en);
    expect(html).toContain('>Noun<');
    expect(html).toContain('>Noun form<');
    expect(html).toContain('>Tiştekî nenas<');
    expect(html).not.toContain('>Navdêr<');

    // and the rows that are ours rather than the corpus's
    const rich: Word = { ...word('sal'), sorani: ['ساڵ'], arabic: ['سَنَة'], synonyms: ['bihar'] };
    const rows = wordsPage({ prefix: 'sa', words: [rich] }, null, null, new Map(), COPY.en);
    expect(rows).toContain('>Synonyms<');
    expect(rows).toContain('>Arabic<');
    expect(rows).not.toContain('>Hevmane<');
    expect(rows).not.toContain('>Erebî<');
    // the dialect's name, spelled the way the alphabet heading spells it
    expect(rows).toContain('>Sorani<');
    expect(alphabetName('ش', COPY.en)).toContain('Sorani');

    const ku = wordsPage({ prefix: 'sa', words: [w] }, null, null, new Map(), COPY.ku);
    expect(ku).toContain('>Navdêr<');
  });

  it('answers a dead address in the language it was asked in', () => {
    expect(notFoundPage(COPY.en)).toContain('This page was not found.');
    expect(notFoundPage(COPY.en)).toContain('href="/dictionary/"');
    expect(notFoundPage(COPY.ku)).toContain('nehat dîtin');
  });
});

describe('the stylesheet', () => {
  /**
   * `bab` lists thirty synonyms. Joined by a bare "·" with no whitespace they
   * are one token a browser cannot break, so the row measured 2,296px inside a
   * 625px page and the whole dictionary scrolled sideways. Inline margins are
   * not break opportunities; wrapping flex items need none.
   */
  it('lets a long list of cross-references wrap', () => {
    expect(STYLE).toMatch(/\.vals\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  /** Clip and not hidden: `hidden` on body turns every anchor jump into a
      scroll container, and these pages are nothing but anchors. */
  it('keeps a backstop against sideways drift that does not break anchors', () => {
    expect(STYLE).toMatch(/overflow-x:\s*clip/);
    expect(STYLE).not.toMatch(/overflow-x:\s*hidden/);
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

  /**
   * The diacritics stay. `dictionaryKey` folds them so a search for "sev"
   * finds "sêv"; an index must not, or five of Kurmancî's letters have no
   * section and `şev` is filed under S.
   */
  it('keeps a word’s own letters', () => {
    expect(pageKey('sêv')).toBe('sêv');
    expect(pageKey('şev')).toBe('şev');
    expect(pageKey('ÇÛN')).toBe('çûn');
    expect(pageKey('ڕۆژ')).toBe('ڕۆژ');
    expect(pageKey('щрщ')).toBe('щрщ');
  });

  /**
   * One letter written two ways is still one letter. The corpus proves each of
   * these: it holds `هات` beside `ھاتن` — the same verb — and `كابانی` beside
   * `کا`. Unfolded, every one of them split a letter in two down the index.
   */
  it('folds the Arabic letters that are one letter in Kurdish', () => {
    expect(pageKey('كا')).toBe(pageKey('کا'));
    expect(pageKey('يا')).toBe(pageKey('یا'));
    expect(pageKey('هات')).toBe(pageKey('ھات'));
    // and the presentation forms NFKC turns back into ordinary letters
    expect(pageKey('ﻛا')).toBe(pageKey('کا'));
  });

  /**
   * Hawar has i and î and no dotless ı, so in Kurmancî it is a slip of a
   * Turkish keyboard. It also uppercases to `I`, so leaving it out of the
   * alphabet put a letter in the leftover block that a reader could not tell
   * apart from Hawar's own I.
   */
  it('folds the Turkish dotless i, which Hawar does not have', () => {
    expect(pageKey('ısot')).toBe('isot');
    expect(alphabetOf('ı')).toBe('hawar');
  });
});
