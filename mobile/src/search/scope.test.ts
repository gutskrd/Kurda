import { describe, expect, it } from 'vitest';
import { GAMES, SCOPES, SCOPE_LABEL, filterByLabel, matches, readyForServer, scopesToRun } from './scope';

describe('matches', () => {
  /*
   * The whole reason this is not `includes`.
   *
   * Kurmanjî has five letters a phone keyboard does not offer without a long
   * press — ê î û ç ş — and nobody searching for a word types them. Folding
   * both sides means the query and the text meet in the middle.
   */
  it('finds a word through its diacritics', () => {
    expect(matches('sê', 'se')).toBe(true);
    expect(matches('şev', 'sev')).toBe(true);
    expect(matches('çûn', 'cun')).toBe(true);
    // and the other way round, for somebody who does type them
    expect(matches('sev', 'şev')).toBe(true);
  });

  it('ignores case', () => {
    expect(matches('Typing Race', 'race')).toBe(true);
    expect(matches('typing race', 'RACE')).toBe(true);
  });

  it('matches inside a word, not only at the start', () => {
    expect(matches('Kurdish Wordle', 'word')).toBe(true);
  });

  /*
   * An empty field shows nothing.
   *
   * `''.includes('')` is true, so the obvious implementation returns every row
   * in the app the moment the screen opens and again every time the field is
   * cleared.
   */
  it('matches nothing on an empty query', () => {
    expect(matches('anything', '')).toBe(false);
    expect(matches('anything', '   ')).toBe(false);
  });
});

describe('filterByLabel', () => {
  const rows = [{ n: 'Rhyming Words' }, { n: 'Typing Race' }, { n: 'Wordle Battle' }];

  it('keeps the list in its own order', () => {
    expect(filterByLabel(rows, (r) => r.n, 'r').map((r) => r.n)).toEqual([
      'Rhyming Words',
      'Typing Race',
      'Wordle Battle',
    ]);
  });

  it('returns nothing when nothing answers', () => {
    expect(filterByLabel(rows, (r) => r.n, 'zzz')).toEqual([]);
  });
});

describe('scopesToRun', () => {
  it('expands all into every other scope', () => {
    expect(scopesToRun('all')).toEqual(['people', 'words', 'lessons', 'games']);
  });

  it('runs one scope on its own', () => {
    expect(scopesToRun('words')).toEqual(['words']);
  });

  /* `all` is the only one that expands, so every other scope must be reachable. */
  it('covers every scope in SCOPES', () => {
    const reached = new Set(SCOPES.flatMap((s) => scopesToRun(s)));
    expect([...reached].sort()).toEqual(['games', 'lessons', 'people', 'words']);
  });
});

describe('readyForServer', () => {
  /*
   * `/users/search` allows thirty calls a minute and a single letter matches
   * most of the table. Two characters is where a search starts being one.
   */
  it('waits for a second character', () => {
    expect(readyForServer('')).toBe(false);
    expect(readyForServer('a')).toBe(false);
    expect(readyForServer('ab')).toBe(true);
  });

  it('does not count whitespace', () => {
    expect(readyForServer('  a  ')).toBe(false);
  });
});

describe('the registries', () => {
  it('gives every scope a label', () => {
    for (const s of SCOPES) expect(SCOPE_LABEL[s]).toBeTruthy();
  });

  it('gives every game a distinct key and a route', () => {
    expect(new Set(GAMES.map((g) => g.key)).size).toBe(GAMES.length);
    for (const g of GAMES) expect(g.route).toMatch(/^[A-Z]/);
  });
});
