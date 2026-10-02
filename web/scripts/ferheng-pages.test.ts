import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape';
import { definitionsOf, isInflected, toEntries } from './ferheng-entries';
import {
  STYLE,
  WORDS_PER_PAGE,
  featured,
  indexPage,
  letterPage,
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
    expect(html.length, 'the landing page should stay small').toBeLessThan(6000);
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

  it('keeps every script the corpus actually uses', () => {
    expect(pageKey('sêv')).toBe('sev');
    expect(pageKey('ڕۆژ')).toBe('ڕۆژ');
    expect(pageKey('щрщ')).toBe('щрщ');
  });
});
