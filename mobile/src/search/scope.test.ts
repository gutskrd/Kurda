import { describe, expect, it } from 'vitest';
import { GAME_CARDS, learnGameCard } from '../games/gameCards';
import { GAMES, SCOPES, SCOPE_LABEL, filterByLabel, gameDestinations, matches, peopleQuery, readyForServer, scopesToRun, wayWord } from './scope';

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
    expect(matches('Peyvok Battle', 'vok')).toBe(true);
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
  const rows = [{ n: 'Rhyming Words' }, { n: 'Typing Race' }, { n: 'Peyvok Battle' }];

  it('keeps the list in its own order', () => {
    expect(filterByLabel(rows, (r) => r.n, 'y').map((r) => r.n)).toEqual([
      'Rhyming Words',
      'Typing Race',
      'Peyvok Battle',
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

  /*
   * Search kept a list of its own, five ways into three games, and the games
   * added after it could not be found by name. It reads the cards the Games
   * screen shows now, so a way into a game is a row in a search or the test
   * says so.
   */
  it('finds every way into every game that has a card', () => {
    expect(GAMES.map((g) => g.key)).toEqual(GAME_CARDS.flatMap((c) => c.ways.map((w) => w.key)));
    expect(GAMES.map((g) => g.route)).toEqual(['Wordle', 'WordleBattle', 'Rhyme', 'RhymeMatch', 'Race']);
  });

  it('keeps the name a way into a game is known by, and the game’s own for the rest', () => {
    const name = (key: string) => GAMES.find((g) => g.key === key)?.labelKey;
    expect(name('wordle')).toBe('games.wordle.name');
    expect(name('battle')).toBe('games.battle.name');
    expect(name('rhymeMatch')).toBe('games.rhymeMatch.name');
    expect(name('race')).toBe('games.race.name');
  });

  it('lists a learning game once it can be played, a row for each of its ways, and not before', () => {
    const impostor = learnGameCard({ id: 'impostor', route: 'Impostor', name: 'games.impostor.name', line: 'games.invite.blurb.impostor', mode: 'friends', ready: true });
    const whoAmI = learnGameCard({
      id: 'who-am-i',
      route: 'WhoAmI',
      name: 'games.whoAmI.name',
      line: 'games.card.whoAmI',
      mode: 'both',
      ready: true,
      ways: [
        { key: 'who-am-i-phone', label: 'games.whoAmI.onePhone', way: 'phone' },
        { key: 'who-am-i-friends', label: 'games.mode.friends', way: 'friends' },
      ],
    });
    const soon = learnGameCard({ id: 'detective', route: 'Detective', name: 'games.detective.name', line: 'games.card.detective', mode: 'solo', ready: false });
    const found = gameDestinations([impostor, whoAmI, soon]);
    expect(found.map((g) => [g.key, g.route, g.params?.way ?? null])).toEqual([
      ['impostor', 'Impostor', null],
      ['who-am-i-phone', 'WhoAmI', 'phone'],
      ['who-am-i-friends', 'WhoAmI', 'friends'],
    ]);
    // two rows under one name are told apart by the word on the card's button; a game with one way needs none
    expect(wayWord([impostor, whoAmI], 'who-am-i-phone')).toBe('games.whoAmI.onePhone');
    expect(wayWord([impostor, whoAmI], 'impostor')).toBeNull();
    // and a way with a name of its own says it in its name
    expect(wayWord(GAME_CARDS, 'battle')).toBeNull();
    expect(wayWord(GAME_CARDS, 'wordle')).toBe('games.mode.solo');
  });
});

describe('peopleQuery', () => {
  /* The app writes a handle as "@dilan", and that is how it is copied and typed back. */
  it('looks for the name without the "@" before it', () => {
    expect(peopleQuery('@dilan')).toBe('dilan');
    expect(peopleQuery('  @@dilan ')).toBe('dilan');
    expect(peopleQuery('dilan')).toBe('dilan');
  });

  it('leaves an "@" inside what was typed alone', () => {
    expect(peopleQuery('a@b')).toBe('a@b');
  });
});
