import { describe, expect, it } from 'vitest';
import { GAME_CONTENT_KINDS, checkGameContent, contentHeadline, gameContentSchema, kurdishTexts, meaningIn, sameWords } from './content.js';
import { LEARN_GAMES, gameOfKind } from './registry.js';

const en = (text: string) => ({ en: text });

describe('the content kinds', () => {
  it('each belongs to exactly one game', () => {
    for (const kind of GAME_CONTENT_KINDS) {
      expect(LEARN_GAMES.filter((g) => g.contentKinds.includes(kind)), kind).toHaveLength(1);
      expect(gameOfKind(kind)).not.toBeNull();
      expect(gameContentSchema(kind)).toBeDefined();
    }
  });
});

describe('checkGameContent', () => {
  it('stores a sentence with its other orders, trimmed and with defaults filled', () => {
    const res = checkGameContent('sentence', 'kmr', { ku: ' Ez diçim malê. ', meanings: en('I am going home.'), orders: ['Malê ez diçim'] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.ku).toBe('Ez diçim malê.');
      expect(res.payload.glosses).toEqual([]);
    }
  });

  it('refuses another order that is not the same words', () => {
    const res = checkGameContent('sentence', 'kmr', { ku: 'Ez diçim malê.', meanings: en('I am going home.'), orders: ['Ez diçim bazarê'] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.map((i) => i.path)).toEqual(['orders.0']);
  });

  it('refuses a sentence too short or too long for the tiles', () => {
    expect(checkGameContent('sentence', 'kmr', { ku: 'Silav!', meanings: en('Hello!') }).ok).toBe(false);
    const long = Array.from({ length: 11 }, () => 'gelek').join(' ');
    expect(checkGameContent('sentence', 'kmr', { ku: long, meanings: en('very') }).ok).toBe(false);
  });

  it('refuses Kurdish in the other variety’s script, so dialects never mix', () => {
    const soraniInKurmanci = checkGameContent('sentence', 'kmr', { ku: 'من دەچمە ماڵەوە', meanings: en('I am going home.') });
    expect(soraniInKurmanci.ok).toBe(false);
    if (!soraniInKurmanci.ok) expect(soraniInKurmanci.issues[0]!.path).toBe('ku');
    expect(checkGameContent('sentence', 'ckb', { ku: 'من دەچمە ماڵەوە', meanings: en('I am going home.') }).ok).toBe(true);
    expect(checkGameContent('sentence', 'ckb', { ku: 'Ez diçim malê', meanings: en('I am going home.') }).ok).toBe(false);
  });

  it('needs English for every meaning, and refuses an unknown language or field', () => {
    expect(checkGameContent('word_category', 'kmr', { slug: 'animals', ku: 'Heywan', meanings: { de: 'Tiere' } }).ok).toBe(false);
    expect(checkGameContent('word_category', 'kmr', { slug: 'animals', ku: 'Heywan', meanings: { en: 'Animals', xx: 'no' } }).ok).toBe(false);
    expect(checkGameContent('word_category', 'kmr', { slug: 'animals', ku: 'Heywan', meanings: { en: 'Animals' }, extra: 1 }).ok).toBe(false);
    expect(checkGameContent('word_category', 'kmr', { slug: 'animals', ku: 'Heywan', meanings: { en: 'Animals', de: 'Tiere' } }).ok).toBe(true);
  });

  it('checks a passage’s hidden words are in its text', () => {
    const base = { text: 'Rovî çû gund. Wî mirîşkek dît.', hidden: [{ term: 'gund', meanings: en('village') }, { term: 'mirîşkek', meanings: en('a hen') }] };
    expect(checkGameContent('passage', 'kmr', base).ok).toBe(true);
    const off = { ...base, hidden: [...base.hidden, { term: 'çiya', meanings: en('mountain') }] };
    const res = checkGameContent('passage', 'kmr', off);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0]!.path).toBe('hidden.2.term');
  });

  it('checks a case file’s ids hang together', () => {
    const evidence = (id: string) => ({ id, kind: 'statement', ku: 'Ez li malê bûm.', meanings: en('I was at home.') });
    const good = {
      title: en('The missing key'),
      intro: en('Someone took the key.'),
      suspects: [
        { id: 'hamo', name: 'Hamo', about: en('the neighbour') },
        { id: 'xezo', name: 'Xezo', about: en('the cousin') },
      ],
      evidence: [evidence('e1'), evidence('e2'), evidence('e3')],
      steps: [{ prompt: en('Who was at home?'), options: [en('Hamo'), en('Xezo')], correctIndex: 0, evidence: ['e1'] }],
      culprit: 'xezo',
      solution: en('Xezo was not at home.'),
    };
    expect(checkGameContent('case_file', 'kmr', good).ok).toBe(true);
    expect(checkGameContent('case_file', 'kmr', { ...good, culprit: 'nobody' }).ok).toBe(false);
    expect(checkGameContent('case_file', 'kmr', { ...good, steps: [{ ...good.steps[0], evidence: ['e9'] }] }).ok).toBe(false);
  });

  it('does not let the word to describe be one of its forbidden words', () => {
    const card = { target: 'pisîk', meanings: en('cat'), forbidden: ['mişk', 'şîr', 'pisîk'] };
    expect(checkGameContent('taboo_card', 'kmr', card).ok).toBe(false);
    expect(checkGameContent('taboo_card', 'kmr', { ...card, forbidden: ['mişk', 'şîr', 'dû'] }).ok).toBe(true);
  });

  it('lists every Kurdish text of a row with its path', () => {
    const res = checkGameContent('scenario', 'kmr', {
      situation: en('At the market'),
      line: { ku: 'Fermo!', meanings: en('Here you are!') },
      reply: { ku: 'Spas.', meanings: en('Thanks.') },
      others: [
        { ku: 'Şev baş.', meanings: en('Good night.') },
        { ku: 'Ez birçî me.', meanings: en('I am hungry.') },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(kurdishTexts('scenario', res.payload).map((t) => t.path)).toEqual(['line.ku', 'reply.ku', 'others.0.ku', 'others.1.ku']);
    if (res.ok) expect(contentHeadline('scenario', res.payload)).toBe('Fermo!');
  });
});

describe('sameWords and meaningIn', () => {
  it('compares words in any order, punctuation aside', () => {
    expect(sameWords('Ez diçim malê.', 'malê ez diçim', 'kmr')).toBe(true);
    expect(sameWords('Ez diçim malê.', 'Ez diçim mal', 'kmr')).toBe(false);
  });

  it('falls back to English, and says nothing when there is nothing', () => {
    expect(meaningIn({ en: 'cat', de: 'Katze' }, 'de')).toBe('Katze');
    expect(meaningIn({ en: 'cat' }, 'tr')).toBe('cat');
    expect(meaningIn(null, 'en')).toBeNull();
  });
});
