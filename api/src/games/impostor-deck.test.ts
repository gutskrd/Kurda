/**
 * Impostor's curated deck (api/content/games/impostor.json) as shipped: every card passes the admin's checks, every
 * dealable round is fair, and the requested review clean-up is done. Reads the file itself, so deck changes are judged
 * before reaching a database.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APP_LOCALE_CODES,
  DIFFICULTY_LEVELS,
  GAME_DIFFICULTIES,
  IMPOSTOR_CATEGORY_MIN,
  IMPOSTOR_GUESS_OPTIONS,
  impostorTooClose,
  type GameDialect,
  type GameDifficulty,
  type WordCardContent,
} from '@kurda/shared';
import { couchDeck, couchOffer } from './couch.js';
import { IMPOSTOR_DECK_FILE, impostorDeckRows, parseImpostorDeck, type ImpostorDeckFile } from './impostor-deck.js';
import { STARTER_CATEGORIES } from './word-categories.js';
import { dealFrom } from '../mp/games/impostor.js';

const parsed = parseImpostorDeck(readFileSync(IMPOSTOR_DECK_FILE, 'utf8'));
if (!parsed.ok) throw new Error(parsed.issues.join('\n'));
const deck: ImpostorDeckFile = parsed.deck;

const band = (level: number): GameDifficulty => GAME_DIFFICULTIES.find((d) => (DIFFICULTY_LEVELS[d] as readonly number[]).includes(level))!;
const cardRows = (dialect: GameDialect) =>
  impostorDeckRows(deck, dialect).rows.filter((r) => r.kind === 'word_card') as Array<{ level: number; payload: WordCardContent }>;
/** Cards by category at one difficulty. */
function categories(dialect: GameDialect, difficulty: GameDifficulty): Map<string, WordCardContent[]> {
  const out = new Map<string, WordCardContent[]>();
  for (const row of cardRows(dialect)) {
    if (band(row.level) !== difficulty) continue;
    out.set(row.payload.category, [...(out.get(row.payload.category) ?? []), row.payload]);
  }
  return out;
}
const dealable = (dialect: GameDialect, difficulty: GameDifficulty) => [...categories(dialect, difficulty)].filter(([, cards]) => cards.length >= IMPOSTOR_CATEGORY_MIN);
const words = (dialect: GameDialect) => new Set(deck[dialect].map((c) => c.word));

describe('the Impostor deck', () => {
  it('passes every check a card is held to, in both varieties', () => {
    for (const dialect of ['kmr', 'ckb'] as const) {
      const { rows, issues } = impostorDeckRows(deck, dialect);
      expect(issues, dialect).toEqual([]);
      expect(rows.filter((r) => r.kind === 'word_card')).toHaveLength(deck[dialect].length);
      // one category row for each category its cards use, named as the categories name it
      const used = new Set(deck[dialect].map((c) => c.category));
      expect(rows.filter((r) => r.kind === 'word_category').map((r) => (r.payload as { slug: string }).slug).sort()).toEqual([...used].sort());
    }
  });

  it('means something in every language the apps speak, and in the other Kurdish', () => {
    const wanted = APP_LOCALE_CODES.filter((l) => l !== 'ku' && l !== 'ckb');
    for (const dialect of ['kmr', 'ckb'] as const) {
      const other = dialect === 'kmr' ? 'ckb' : 'ku';
      for (const card of deck[dialect]) {
        for (const locale of [...wanted, other]) expect(card.meanings[locale]?.trim(), `${card.word} ${locale}`).toBeTruthy();
        expect(Object.keys(card.meanings).sort(), card.word).toEqual([...wanted, other].sort());
      }
    }
  });

  it('holds enough Kurmancî to play at every difficulty, each category it deals from with enough cards', () => {
    const kmr = cardRows('kmr');
    expect(kmr.length).toBeGreaterThanOrEqual(700);
    const counts = Object.fromEntries(GAME_DIFFICULTIES.map((d) => [d, kmr.filter((r) => band(r.level) === d).length]));
    expect(counts.beginner).toBeGreaterThanOrEqual(450);
    expect(counts.intermediate).toBeGreaterThanOrEqual(140);
    expect(counts.advanced).toBeGreaterThanOrEqual(70);
    for (const difficulty of GAME_DIFFICULTIES) {
      // in Kurmancî no category is left too small to be dealt from
      for (const [slug, cards] of categories('kmr', difficulty)) expect(cards.length, `${difficulty} ${slug}`).toBeGreaterThanOrEqual(IMPOSTOR_CATEGORY_MIN);
    }
    expect(dealable('kmr', 'beginner').length).toBeGreaterThanOrEqual(25);
    expect(dealable('kmr', 'intermediate').length).toBeGreaterThanOrEqual(6);
    expect(dealable('kmr', 'advanced').length).toBeGreaterThanOrEqual(6);
  });

  it('opens Soranî properly at beginner: seventeen categories or more, each with enough cards', () => {
    const beginner = dealable('ckb', 'beginner');
    expect(beginner.length).toBeGreaterThanOrEqual(17);
    expect(beginner.reduce((n, [, cards]) => n + cards.length, 0)).toBeGreaterThanOrEqual(230);
    // and intermediate too, with the legends and the feelings
    expect(dealable('ckb', 'intermediate').map(([slug]) => slug).sort()).toEqual(['feelings', 'legends']);
  });

  it('gives every beginner card a twin of its own category that is a different thing', () => {
    for (const dialect of ['kmr', 'ckb'] as const) {
      const byWord = new Map(deck[dialect].map((c) => [c.word, c]));
      for (const card of deck[dialect]) {
        if (card.level > 2) continue;
        expect(card.twin, `${card.word} has no twin`).toBeTruthy();
        const twin = byWord.get(card.twin!)!;
        expect(twin.category, card.word).toBe(card.category);
        expect(impostorTooClose(card, twin, dialect), `${card.word} and ${twin.word}`).toBe(false);
      }
    }
  });

  it('deals fair rounds: three rivals of the word’s own category, none the word give or take an ending or another name for it', () => {
    for (const dialect of ['kmr', 'ckb'] as const) {
      for (const difficulty of GAME_DIFFICULTIES) {
        const pool = cardRows(dialect)
          .filter((r) => band(r.level) === difficulty)
          .map((r) => ({ payload: r.payload }));
        if (dealable(dialect, difficulty).length === 0) continue;
        for (let i = 0; i < 60; i++) {
          const deal = dealFrom(pool, dialect, `${dialect}-${difficulty}-${i}`)!;
          expect(deal, `${dialect} ${difficulty} ${i}`).not.toBeNull();
          const category = pool.find((p) => p.payload.word === deal.card.word)!.payload.category;
          const rivals = deal.decoys.map((d) => pool.find((p) => p.payload.word === d)!.payload);
          expect(rivals.every((r) => r.category === category), deal.card.word).toBe(true);
          const all = [{ word: deal.card.word, meanings: deal.card.meanings }, ...rivals];
          for (const [a, b] of all.flatMap((x, j) => all.slice(j + 1).map((y) => [x, y] as const))) {
            expect(impostorTooClose(a, b, dialect), `${a.word} beside ${b.word}`).toBe(false);
          }
        }
      }
    }
  });

  it('offers the room each category it can deal from, and deals an evening from any of them', () => {
    for (const dialect of ['kmr', 'ckb'] as const) {
      const pool = cardRows(dialect).map((r) => ({ level: r.level, payload: r.payload }));
      const offer = couchOffer(pool, dialect);
      for (const { difficulty, categories: offered } of offer.difficulties) {
        expect(offered.map((c) => c.slug).sort()).toEqual(dealable(dialect, difficulty).map(([slug]) => slug).sort());
        for (const { slug } of offered) {
          const cards = couchDeck(pool, dialect, difficulty, slug, 20, `${dialect}-${slug}`)!;
          expect(cards.length, `${dialect} ${difficulty} ${slug}`).toBeGreaterThanOrEqual(Math.min(IMPOSTOR_CATEGORY_MIN, 20));
          for (const c of cards) {
            expect(c.decoys).toHaveLength(IMPOSTOR_GUESS_OPTIONS - 1);
            expect(c.twin, c.word).not.toBeNull();
          }
        }
      }
    }
  });

  it('names its categories as the starter categories do, the animals as ajal', () => {
    const slugs = new Set(STARTER_CATEGORIES.map((c) => c.slug));
    for (const dialect of ['kmr', 'ckb'] as const) for (const c of deck[dialect]) expect(slugs.has(c.category), c.category).toBe(true);
    const animal = cardRows('kmr').find((r) => r.payload.word === 'pisîk')!.payload;
    expect(animal.hint.ku).toBe('ajal');
    expect(cardRows('kmr').find((r) => r.payload.word === 'çay')!.payload.hint.ku).toBe('xwarin û vexwarin');
  });
});

describe('the clean-up the review asked for', () => {
  it('leaves out inflected forms, wrong words, words that mean the category itself and sombre ones', () => {
    const gone = [
      'bizinek', 'aşxaneyê', 'govendê', 'straneke', 'zozanan', 'Taxa', 'hilat', 'eşkere', 'nîşan', 'pûlik', 'azad', 'dor', 'rol', 'kok', 'raz',
      'qelat', 'mêwe', 'kinc', 'zîrekî', 'kes', 'sêwî', 'şînê', 'bixapîne', 'mejiyê', 'bilûra', 'quntara', 'latê', 'ciwaniya', 'kişikê', 'sindanê',
      'zindanê', 'porteqalî ', 'Hinar', 'Şivan', 'Bibore', 'Silav', 'not', 'erebe', 'pîrek', 'mizgeft', 'Helebce', 'heywan',
      'bes', 'bêtir', 'kêm', 'hindik', 'tenê', 'zor', 'sereke', 'wekhev', 'hevpar', 'nediyar', 'êdî', 'car', 'berê', 'paşê', 'piştre', 'carinan',
    ];
    const kmr = words('kmr');
    expect(gone.filter((w) => kmr.has(w))).toEqual([]);
    const ckbGone = ['ساڕێژ', 'پوولەکە', 'هەتیو', 'شیوەن', 'مێشکی', 'ئەنگوستیلەیەک', 'مێرگەکە', 'ڕازەکە', 'سندانەکە', 'نانەواخانەکە', 'کۆڵەپشتەکەم', 'مزگەوت', 'هەڵەبجە', 'مانگ', 'زمان'];
    const ckb = words('ckb');
    expect(ckbGone.filter((w) => ckb.has(w))).toEqual([]);
  });

  it('keeps the corrected words, each where it belongs', () => {
    const at = (dialect: GameDialect, word: string) => deck[dialect].find((c) => c.word === word);
    const kmr = (word: string) => at('kmr', word);
    expect(kmr('mejî')).toMatchObject({ category: 'body', meanings: { en: 'brain' } });
    expect(kmr('simbil')).toMatchObject({ category: 'village', meanings: { en: 'ear of wheat' } });
    expect(kmr('bilûr')?.meanings.en).toBe('shepherd’s flute');
    expect(kmr('kanî')?.category).toBe('nature');
    expect(kmr('zinar')?.category).toBe('nature');
    expect(kmr('zindan')?.category).toBe('stories');
    expect(kmr('porteqal')).toMatchObject({ category: 'fruit', meanings: { en: 'orange (the fruit)' } });
    expect(kmr('porteqalî')?.category).toBe('colours');
    expect(kmr('bêpere')).toMatchObject({ category: 'money', meanings: { en: 'free (of charge)' } });
    expect(kmr('dilgermî')?.category).toBe('feelings');
    expect(kmr('poşman')?.category).toBe('feelings');
    expect(kmr('name')).toMatchObject({ category: 'things', meanings: { en: 'letter (that you post)' } });
    expect(kmr('pênûs')?.meanings.en).toBe('pen');
    expect(kmr('pîrozbahî')?.meanings.en).toBe('congratulations');
    expect(kmr('pîrejin')?.meanings.en).toBe('old woman');
    expect(kmr('nod')?.meanings.en).toBe('ninety');
    expect(kmr('heftê')?.meanings.en).toBe('seventy');
    expect(kmr('trimbêl')?.meanings.en).toBe('car');
    expect(kmr('gog')?.meanings.en).toBe('ball');
    expect(kmr('hezkirin')?.meanings.en).toBe('love');
    for (const w of ['hinar', 'şivan', 'bibore', 'silav', 'reh', 'nehênî', 'kela']) expect(kmr(w), w).toBeDefined();
    const ckb = (word: string) => at('ckb', word);
    expect(ckb('مێشک')?.meanings.en).toBe('brain');
    expect(ckb('ئەنگوستیلە')?.meanings.en).toBe('ring (worn on the finger)');
    expect(ckb('کانی')?.category).toBe('nature');
    expect(ckb('پەشیمان')?.category).toBe('feelings');
    expect(ckb('زیندان')?.category).toBe('stories');
    for (const w of ['مێرگ', 'ڕاز', 'سندان', 'نانەواخانە', 'کۆڵەپشت']) expect(ckb(w), w).toBeDefined();
  });

  it('writes common words in lower case, and only names with a capital', () => {
    const named = new Set(['kurdistan', 'legends']);
    for (const dialect of ['kmr'] as const) {
      for (const c of deck[dialect]) {
        if (named.has(c.category) || c.category === 'time' || c.category === 'celebrations') continue;
        expect(c.word, c.category).toBe(c.word.toLocaleLowerCase('ku'));
      }
    }
  });

  it('has the new places and legends in both varieties', () => {
    for (const dialect of ['kmr', 'ckb'] as const) {
      expect(deck[dialect].filter((c) => c.category === 'kurdistan').length, dialect).toBeGreaterThanOrEqual(17);
      expect(deck[dialect].filter((c) => c.category === 'legends').length, dialect).toBe(14);
    }
  });
});

describe('a deck that is wrong', () => {
  const card = (word: string, category = 'animals', more: object = {}) => ({ word, category, level: 1, meanings: { en: word }, ...more });

  it('is refused with what is wrong with it: a word twice, a category nobody has, a twin of another category, the wrong script', () => {
    const bad: ImpostorDeckFile = {
      version: 2,
      kmr: [card('pisîk'), card('pisîk'), card('xwîn', 'nowhere'), card('kûçik', 'animals', { twin: 'sêv' }), card('sêv', 'fruit'), card('پشیلە')],
      ckb: [],
    };
    const { issues } = impostorDeckRows(bad, 'kmr');
    expect(issues.some((i) => i.startsWith('pisîk: the deck has this word twice'))).toBe(true);
    expect(issues.some((i) => i.startsWith('xwîn: no category'))).toBe(true);
    expect(issues.some((i) => i.startsWith('kûçik: its twin sêv'))).toBe(true);
    expect(issues.some((i) => i.startsWith('پشیلە:'))).toBe(true);
  });

  it('is not read at all when it is not the file the seeder knows', () => {
    expect(parseImpostorDeck('not json').ok).toBe(false);
    expect(parseImpostorDeck(JSON.stringify({ version: 1, kmr: [], ckb: [] })).ok).toBe(false);
    expect(parseImpostorDeck(JSON.stringify({ version: 2, kmr: [{ word: 'x' }], ckb: [] })).ok).toBe(false);
  });
});
