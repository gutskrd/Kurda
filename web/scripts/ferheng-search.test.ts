import { afterEach, describe, expect, it, vi } from 'vitest';
import { COPY } from './ferheng-copy';
import { formOf } from './ferheng-entries';
import { pageKey, paginate, wordsPage, type Word } from './ferheng-pages';
import { LIMIT, fileName, rowOf, searchKey, searchScript, shard, shardFile, shorten } from './ferheng-search';

/** a, b, … z, ba, bb, …: distinct words of letters only, as page keys keep only letters */
const letters = (i: number): string => {
  let out = '';
  do {
    out = String.fromCharCode(97 + (i % 26)) + out;
    i = Math.floor(i / 26);
  } while (i > 0);
  return out.padStart(3, 'a');
};

const word = (headword: string, definition = 'wate', pos = 'Navdêr'): Word => ({
  headword,
  key: pageKey(headword),
  senses: [{ pos, definition }],
  synonyms: [],
  sorani: [],
  arabic: [],
});

describe('finding the word a form belongs to', () => {
  it('reads the base out of the source’s own description', () => {
    expect(formOf('Rewşa îzafeyî ya yekjimar a binavkirî ya dadan.')).toBe('dadan');
    expect(formOf('Rewşa çemandî ya mê a pirjimar a nebinavkirî ya sêv')).toBe('sêv');
    expect(formOf('Kesê yekem yekjimar dema niha ji lêkera dan derzîkirin.')).toBe('dan derzîkirin');
    expect(formOf('Kesê sêyem yekjimar dema niha ji lêkera zarî kirin (tewandin).')).toBe('zarî kirin');
    expect(formOf('kesê sêyem yekjimar dema bê neyînî ji lêker bi rê kirin')).toBe('bi rê kirin');
  });

  it('says nothing rather than guess', () => {
    expect(formOf('Pirjimariya peyvê')).toBeNull();
  });
});

describe('the search files', () => {
  it('matches without the marks most keyboards cannot type', () => {
    expect(searchKey('Sêv')).toBe('sev');
    expect(searchKey('çav')).toBe('cav');
    expect(searchKey('şîr')).toBe('sir');
    // Soranî variants fold the way the pages fold them
    expect(searchKey('كتێب')).toBe(searchKey('کتێب'));
  });

  it('puts every word in exactly one file, none of them too big', () => {
    const words = [
      ...Array.from({ length: LIMIT + 300 }, (_, i) => word(`ser${letters(i)}`)),
      word('ser'),
      word('sêv'),
      word('av'),
    ];
    const files = shard(paginate(words));
    const all = [...files.values()].flat();
    expect(all).toHaveLength(words.length);
    expect(new Set(all.map((r) => r[0])).size).toBe(words.length);
    for (const rows of files.values()) expect(rows.length).toBeLessThanOrEqual(LIMIT);
    // the prefix that split keeps its exact word in a file of its own
    expect(files.get('ser.')?.map((r) => r[0])).toEqual(['ser']);
  });

  it('says what a form is a form of, and shortens a long meaning', () => {
    const form = word('dadana', 'Rewşa îzafeyî ya yekjimar a binavkirî ya dadan.', 'Formeke navdêrê');
    expect(rowOf(form, 'da')).toEqual(['dadana', 'da', '→ dadan']);
    expect(shorten('a '.repeat(80)).length).toBeLessThanOrEqual(73);
  });

  it('writes data, never markup', () => {
    const body = shardFile('se', [['<img src=x onerror=alert(1)>', 'se', '</script>']]);
    expect(body).not.toContain('<');
    expect(body.startsWith('__hevaloSearch("se",')).toBe(true);
    expect(fileName('şe.')).toBe('15f-65-x.js');
  });
});

describe('the search box, in a browser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as { __hevaloSearch?: unknown }).__hevaloSearch;
  });

  /** A page with the box, the script run over it, and file loads answered from `files`. */
  function open(words: Word[]) {
    const pages = paginate(words);
    const files = shard(pages);
    const html = wordsPage(pages[0]!, null, null, new Map(), COPY.en, words.length);
    document.documentElement.innerHTML = new DOMParser().parseFromString(html, 'text/html').documentElement.innerHTML;
    const loaded: string[] = [];
    const append = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      if (node instanceof HTMLScriptElement) {
        const name = node.src.split('/').pop()!;
        loaded.push(name);
        const id = [...files.keys()].find((k) => fileName(k) === name);
        queueMicrotask(() => (window as unknown as { __hevaloSearch: (id: string, rows: unknown) => void }).__hevaloSearch(id ?? '', id ? files.get(id) : []));
        return node;
      }
      return append(node);
    });
    new Function(searchScript([...files.keys()]))();
    const form = document.querySelector<HTMLFormElement>('form.search')!;
    const input = form.querySelector('input')!;
    const type = async (text: string): Promise<string[]> => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      await new Promise((r) => setTimeout(r, 100));
      return [...form.querySelectorAll('.search-list .search-word')].map((el) => el.textContent ?? '');
    };
    return { form, input, type, loaded };
  }

  it('shows itself only once the script runs', () => {
    const html = wordsPage({ prefix: 'a', words: [word('av')] }, null, null, new Map(), COPY.en, 1);
    expect(html).toMatch(/<form class="search"[^>]*hidden>/);
    const { form } = open([word('av')]);
    expect(form.hidden).toBe(false);
  });

  it('finds sêv from "sev", and links to its entry', async () => {
    const { type, form } = open([word('sêv', 'Fêkiyek.'), word('sev', 'Tiştek din.'), word('seva'), word('av')]);
    const found = await type('sev');
    expect(found).toEqual(['sev', 'sêv', 'seva']);
    const first = form.querySelector<HTMLAnchorElement>('.search-list a')!;
    expect(first.getAttribute('href')).toBe('/dictionary/s/#sev');
    // typed with the mark, the marked word comes first
    expect((await type('sêv'))[0]).toBe('sêv');
  });

  it('loads only the file the query falls in', async () => {
    const words = [...Array.from({ length: LIMIT + 10 }, (_, i) => word(`ser${letters(i)}`)), word('av')];
    const { type, loaded } = open(words);
    await type('seraab');
    expect(loaded).toHaveLength(1);
  });

  it('offers the letter for one letter, and says so when nothing matches', async () => {
    const { type, form } = open([word('av'), word('sêv')]);
    await type('s');
    const letter = form.querySelector<HTMLElement>('[data-msg="letter"]')!;
    expect(letter.hidden).toBe(false);
    expect(letter.querySelector('a')!.getAttribute('href')).toBe('/dictionary/s/');
    expect(await type('zzz')).toEqual([]);
    expect(form.querySelector<HTMLElement>('[data-msg="none"]')!.hidden).toBe(false);
  });

  it('moves through suggestions with the arrows', async () => {
    const { type, input, form } = open([word('sêv'), word('sev'), word('seva')]);
    await type('se');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    const selected = form.querySelectorAll('[aria-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(input.getAttribute('aria-activedescendant')).toBe(selected[0]!.id);
  });
});
