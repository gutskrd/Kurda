/**
 * Ez kî me?'s curated deck (api/content/games/who-am-i.json), read as the
 * seeder reads it: enough cards at every difficulty and of every kind, each
 * card honest and of its course unit, no two of a kind a player could never
 * tell apart, and deals made from it that a player can win by asking.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_LEVELS,
  GAME_DIALECTS,
  GAME_DIFFICULTIES,
  WHO_AM_I_CANDIDATES,
  WHO_AM_I_CATEGORIES,
  WHO_AM_I_FACTS,
  WHO_AM_I_MAX_SOMETIMES,
  WHO_AM_I_MIN_TEMPLATES,
  fitsDialect,
  learnGame,
  sharedCategory,
  verdictFor,
  type GameDialect,
  type GameDifficulty,
  type WhoAmIIdentity,
  type WhoAmITemplate,
} from '@kurda/shared';
import { WHO_AM_I_DECK_FILE, whoAmIDeck, type WhoAmIDeck } from './who-am-i-deck.js';
import { asTwoAnswerDeal, dealSeat, identitiesAt, tableDifficulties, tellsTilesApart } from './who-am-i.js';

const file = JSON.parse(readFileSync(WHO_AM_I_DECK_FILE, 'utf8')) as {
  identities: Record<GameDialect, Array<{ word: string; category: string; level: number; taught: boolean; meanings: Record<string, string> }>>;
};
const read = whoAmIDeck(file);
const deck = (read.ok ? read.deck : null) as WhoAmIDeck;

/** The course's own words, each at the level of the unit that first teaches it (units 1–2 level 1 … 11–12 level 5). */
const COURSE = JSON.parse(readFileSync(new URL('../../content/lessons/road/plan.json', import.meta.url), 'utf8')) as {
  units: Array<{ number: number; skills: Array<{ lessons: Array<{ new?: Array<{ ku: string; pos?: string }> }> }> }>;
};
const unitLevel = (unit: number): number => (unit <= 2 ? 1 : unit <= 4 ? 2 : unit <= 7 ? 3 : unit <= 10 ? 4 : 5);
const taughtAt = new Map<string, number>();
for (const unit of COURSE.units) {
  for (const skill of unit.skills) for (const lesson of skill.lessons) for (const w of lesson.new ?? []) if (w.pos === 'noun' && !taughtAt.has(w.ku)) taughtAt.set(w.ku, unitLevel(unit.number));
}

/** A dialect's deck as a deal reads it: ids of its own, as the database would give them. */
function pool(dialect: GameDialect): { identities: WhoAmIIdentity[]; templates: WhoAmITemplate[] } {
  const rows = deck.rows[dialect];
  return {
    identities: rows.identities.map((r, i) => ({ id: `${dialect}-i${i}`, key: r.origin, level: r.level, word: r.payload.word, meanings: r.payload.meanings, category: r.payload.category, facts: r.payload.facts })),
    templates: rows.templates.map((r, i) => ({ id: `${dialect}-t${i}`, ku: r.payload.ku, meanings: r.payload.meanings, fact: r.payload.fact })),
  };
}

const difficultyOf = (level: number): GameDifficulty => GAME_DIFFICULTIES.find((d) => (DIFFICULTY_LEVELS[d] as readonly number[]).includes(level))!;

/** The fewest questions that single out every tile, asked one after another with each answer in hand. */
function worstCase(tiles: readonly WhoAmIIdentity[], facts: readonly string[]): number {
  const memo = new Map<string, number>();
  const depth = (set: readonly WhoAmIIdentity[], left: readonly string[]): number => {
    if (set.length <= 1) return 0;
    const key = `${set.map((t) => t.id).join(',')}|${left.join(',')}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let best = Infinity;
    for (const fact of left) {
      const groups = new Map<string, WhoAmIIdentity[]>();
      for (const t of set) groups.set(verdictFor(t, fact), [...(groups.get(verdictFor(t, fact)) ?? []), t]);
      if (groups.size < 2) continue;
      const rest = left.filter((f) => f !== fact);
      best = Math.min(best, 1 + Math.max(...[...groups.values()].map((g) => depth(g, rest))));
    }
    memo.set(key, best);
    return best;
  };
  return depth(tiles, facts);
}

describe('the deck file', () => {
  it('reads whole, every card and question checked as a game reads it', () => {
    expect(read.ok ? [] : read.issues).toEqual([]);
  });

  it('asks every fact once in each variety, in its own script, with meanings in every language and the other variety’s question', () => {
    for (const dialect of GAME_DIALECTS) {
      const templates = deck.rows[dialect].templates;
      expect(templates.map((t) => t.payload.fact).sort()).toEqual(WHO_AM_I_FACTS.map((f) => f.key).sort());
      expect(templates.length).toBeGreaterThanOrEqual(WHO_AM_I_MIN_TEMPLATES);
      const other: GameDialect = dialect === 'kmr' ? 'ckb' : 'kmr';
      for (const t of templates) {
        const m = t.payload.meanings as Record<string, string>;
        for (const locale of ['en', 'de', 'es', 'fr', 'nl', 'tr', 'ar']) expect(m[locale], `${t.payload.fact} ${locale}`).toBeTruthy();
        const otherQuestion = m[other === 'kmr' ? 'ku' : 'ckb']!;
        expect(fitsDialect(otherQuestion, other), otherQuestion).toBe(true);
      }
    }
  });

  it('asks the revised questions, not the old ones', () => {
    const ku = (dialect: GameDialect, fact: string) => deck.rows[dialect].templates.find((t) => t.payload.fact === fact)!.payload.ku;
    // ajal, as the kind label says; a taste, since şîrîn is also "lovely"; four legs as Kurmancî says it
    expect(ku('kmr', 'animal')).toBe('Ew ajalek e?');
    expect(ku('kmr', 'sweet')).toBe('Ew bi tama xwe şîrîn e?');
    expect(ku('kmr', 'four-legs')).toBe('Ew bi çar lingan dimeşe?');
    // tea is drunk at breakfast, never eaten with it
    expect(ku('kmr', 'breakfast')).toBe('Ew di taştê de heye?');
    expect(ku('ckb', 'sweet')).toBe('ئایا تامی شیرینە؟');
    expect(ku('ckb', 'at-home')).toBe('ئایا لە ماڵەوە هەیە؟');
    // green as a colour, not as a vegetable
    expect(ku('ckb', 'green')).toBe('ئایا ڕەنگی سەوزە؟');
  });
});

describe('the cards', () => {
  it('fill every difficulty, and every kind in Kurmancî', () => {
    const kmr = deck.rows.kmr.identities;
    expect(kmr.length).toBeGreaterThanOrEqual(150);
    for (const d of GAME_DIFFICULTIES) expect(kmr.filter((c) => difficultyOf(c.level) === d).length, d).toBeGreaterThanOrEqual(45);
    for (const kind of WHO_AM_I_CATEGORIES) expect(kmr.filter((c) => c.payload.category === kind).length, kind).toBeGreaterThanOrEqual(25);
    const ckb = deck.rows.ckb.identities;
    expect(ckb.length).toBeGreaterThanOrEqual(45);
    for (const d of GAME_DIFFICULTIES) expect(ckb.filter((c) => difficultyOf(c.level) === d).length, d).toBeGreaterThanOrEqual(15);
    // and so the game is offered at every difficulty in both
    for (const dialect of GAME_DIALECTS) expect(tableDifficulties(pool(dialect))).toEqual([...GAME_DIFFICULTIES]);
    expect(learnGame('who-am-i').minimum).toBeLessThanOrEqual(15);
  });

  it('say "sometimes" at most three times each, and give every card all its meanings and the other variety’s word', () => {
    for (const dialect of GAME_DIALECTS) {
      const other: GameDialect = dialect === 'kmr' ? 'ckb' : 'kmr';
      for (const c of deck.rows[dialect].identities) {
        expect(Object.values(c.payload.facts).filter((v) => v === 'sometimes').length, c.payload.word).toBeLessThanOrEqual(WHO_AM_I_MAX_SOMETIMES);
        const m = c.payload.meanings as Record<string, string>;
        for (const locale of ['en', 'de', 'es', 'fr', 'nl', 'tr', 'ar']) expect(m[locale], `${c.payload.word} ${locale}`).toBeTruthy();
        const word = m[other === 'kmr' ? 'ku' : 'ckb']!;
        expect(fitsDialect(word, other), `${c.payload.word}: ${word}`).toBe(true);
        // a card is a bare word: never a form with an article or the definite ending
        expect(c.payload.word, c.payload.word).not.toMatch(/ەکە$|\s/);
        expect(m.en, c.payload.word).not.toMatch(/^(the|a|an)\s/i);
      }
    }
  });

  it('are each filed at the level of the course unit that first teaches the word', () => {
    for (const c of file.identities.kmr.filter((x) => x.taught)) expect(taughtAt.get(c.word), c.word).toBe(c.level);
    // and a word the course does not teach says so, for the review list: bîr is in the course, but as "memory", not the well
    for (const c of file.identities.kmr.filter((x) => !x.taught)) expect(!taughtAt.has(c.word) || c.word === 'bîr', c.word).toBe(true);
  });

  it('answer the wide questions every card of their kind answers', () => {
    for (const dialect of GAME_DIALECTS) {
      for (const c of deck.rows[dialect].identities) {
        const f = c.payload.facts;
        for (const wide of ['alive', 'animal', 'person', 'place']) expect(f[wide], `${c.payload.word} ${wide}`).not.toBeUndefined();
        // the deer is Hevalo, and nobody is asked whether Hevalo is eaten
        if (c.payload.word === 'ask' || c.payload.word === 'ئاسک') expect(f).not.toHaveProperty('edible');
        else expect(f.edible, c.payload.word).not.toBeUndefined();
        if (c.payload.category === 'animal') expect(f).toMatchObject({ alive: true, animal: true, person: false, place: false });
        if (c.payload.category === 'profession') expect(f).toMatchObject({ alive: true, person: true, animal: false, place: false, edible: false });
        if (c.payload.category === 'place') expect(f).toMatchObject({ place: true, alive: false, animal: false, person: false, edible: false });
        if (c.payload.category === 'object') expect(f).toMatchObject({ alive: false, animal: false, person: false, place: false, edible: false });
        // a narrow question is only for the kinds it makes sense for
        if (c.payload.category !== 'profession') for (const job of ['works-with-hands', 'works-with-children', 'sells']) expect(f, c.payload.word).not.toHaveProperty(job);
        if (c.payload.category !== 'food') for (const food of ['drink', 'sweet', 'fruit', 'cooked', 'breakfast']) expect(f, c.payload.word).not.toHaveProperty(food);
        if (c.payload.category !== 'animal') for (const beast of ['wild', 'kept-by-people', 'gives-milk', 'lays-eggs', 'has-feathers']) expect(f, c.payload.word).not.toHaveProperty(beast);
        if (c.payload.category === 'profession') expect(f).not.toHaveProperty('bigger-than-person');
      }
    }
  });

  it('carry the corrections the cards needed', () => {
    const card = (dialect: GameDialect, word: string) => deck.rows[dialect].identities.find((c) => c.payload.word === word)?.payload;
    expect(card('kmr', 'kûçik')!.facts).toMatchObject({ 'at-home': 'sometimes', 'works-outdoors': 'sometimes' });
    expect(card('kmr', 'traktor')!.facts).toMatchObject({ 'works-outdoors': true });
    expect(card('kmr', 'hesp')!.facts).toMatchObject({ 'works-outdoors': 'sometimes' });
    expect(card('kmr', 'çira')!.facts).toMatchObject({ 'uses-electricity': 'sometimes' });
    expect(card('kmr', 'hinar')!.facts).toMatchObject({ sweet: 'sometimes' });
    expect(card('kmr', 'hingiv')!.facts).toMatchObject({ 'helps-sick': 'sometimes' });
    expect(card('ckb', 'هەنگوین')!.facts).toMatchObject({ 'helps-sick': 'sometimes' });
    expect(card('kmr', 'nivîn')!.facts).toMatchObject({ 'bigger-than-person': 'sometimes' });
    expect(card('kmr', 'çay')!.facts).toMatchObject({ drink: true, edible: false, hot: true, breakfast: true });
    expect(card('kmr', 'mirîşk')!.facts).toMatchObject({ 'lays-eggs': true, 'has-feathers': true, 'four-legs': false, 'can-fly': 'sometimes' });
    // the checker kept these as they were
    expect(card('kmr', 'derî')!.facts).toMatchObject({ 'bigger-than-person': true });
    expect(card('kmr', 'mar')!.facts).toMatchObject({ 'lives-in-water': false });
    expect(card('ckb', 'نانەواخانە')).toMatchObject({ meanings: { en: 'bakery' } });
    // the flock is no card, the ram is; a nanny is no nurse; and no card is the course's form of a word
    for (const gone of ['pez', 'aşxaneyê']) expect(card('kmr', gone), gone).toBeUndefined();
    for (const gone of ['دایەن', 'نانەواخانەکە', 'زیندان', 'باروت', 'حەکیم', 'مانگ']) expect(card('ckb', gone), gone).toBeUndefined();
    expect(card('kmr', 'beran')).toBeDefined();
  });

  it('never put more than two cards of a kind that answer every question alike', () => {
    for (const dialect of GAME_DIALECTS) {
      const groups = new Map<string, string[]>();
      for (const c of deck.rows[dialect].identities) {
        const sig = `${c.payload.category}|${WHO_AM_I_FACTS.map((f) => String(c.payload.facts[f.key] ?? '-')).join(',')}`;
        groups.set(sig, [...(groups.get(sig) ?? []), c.payload.word]);
      }
      for (const words of groups.values()) expect(words.length, words.join(' ')).toBeLessThanOrEqual(2);
    }
  });
});

describe('deals from the deck', () => {
  for (const dialect of GAME_DIALECTS) {
    it(`name the kind, can always be solved by asking, and take at most six questions in ${dialect}`, () => {
      const { identities, templates } = pool(dialect);
      for (const difficulty of GAME_DIFFICULTIES) {
        let named = 0;
        let dealt = 0;
        let worst = 0;
        for (const target of identitiesAt(identities, difficulty)) {
          const deal = dealSeat(target, identities, templates, { seed: 'deck', seat: 1, want: WHO_AM_I_CANDIDATES[difficulty] });
          expect(deal, `${target.word} at ${difficulty}`).not.toBeNull();
          dealt++;
          const tiles = deal!.candidates.map((c) => identities.find((i) => i.id === c.id)!);
          if (sharedCategory(target.category, tiles) === target.category) named++;
          expect(tellsTilesApart(deal!, identities), `${target.word}: ${tiles.map((t) => t.word).join(' ')}`).toBe(true);
          worst = Math.max(worst, worstCase(tiles, deal!.questions.map((q) => q.fact)));
          // and a phone from before the four answers is dealt the same card with nothing on it but yes and no
          const old = asTwoAnswerDeal(deal!);
          for (const q of old.questions) expect(typeof old.identity.facts[q.fact], `${target.word} ${q.fact}`).toBe('boolean');
        }
        expect(named / dealt, difficulty).toBeGreaterThanOrEqual(0.7);
        expect(worst, difficulty).toBeLessThanOrEqual(6);
      }
    });
  }
});
