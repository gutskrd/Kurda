/**
 * A short round on the Stories' proverbs, made, kept and paid by the solo
 * games' round (games/solo.ts) like any game played alone:
 *
 *   meaning   — a proverb in Kurdish, and three meanings to choose its own from
 *   situation — a little scene where someone would say one, and three Kurdish
 *               proverbs to choose the one that fits
 *   complete  — a Kurdish proverb with its last word missing, and three
 *               Kurdish words to finish it with
 *
 * Five items, each from a different published proverb of the variety, the
 * ones the learner has met least recently first (`game_seen`). The other two
 * options of an item are other proverbs', drawn where they can be from
 * proverbs that share no theme with it, so two sayings about patience are
 * never both offered as the one that fits. A round is in one language: the
 * learner's interface language (`users.locale`) when at least five proverbs
 * are translated into it, else English, so no option stands out by being in
 * another language. A Kurmancî proverb has no Kurmancî translation (it is
 * the original), so a learner whose interface is Kurmancî plays its
 * Kurmancî proverbs in English, and likewise in Soranî.
 *
 * A scene is the translation's own little scene; where it quotes the
 * proverb's rendering in its language, the quotation is replaced with …, so
 * the scene asks the question rather than answering it. The quotation is
 * found as a reader would see it: Arabic's short vowels and its stretching
 * mark (written in some places and not in others) and punctuation are left
 * out on both sides before they are compared.
 *
 * A proverb to finish is the one way of playing that is all in Kurdish, so a
 * learner whose interface is Kurdish has a round in their own language too.
 * The word taken out is the proverb's last word of three letters or more
 * (Mêvan mêvanê Xwedê ye loses Xwedê, not ye). The other two words are other
 * proverbs' missing words in the same variety, the nearest first: ending in
 * the same letter, then as long, so the right one does not stand out by its
 * shape. A word that would make one of the proverb's own variants is never
 * offered beside it: it would be right too. Its correction is in the
 * learner's language where the proverb is translated into it, else English.
 *
 * The answers stay in the round on the server; an item is sent with its
 * options and never its answer, nor the proverb it is about in a scene. What
 * a round pays follows the solo games' rules with this round's own (`rules`):
 * no XP, as no game played alone pays, and the streak and the daily goal when
 * at least half of it was right on the first try. Reading a proverb pays
 * nothing either.
 */
import type pg from 'pg';
import { z } from 'zod';
import {
  GAME_DIALECTS,
  PROVERB_ROUND_GAMES,
  PROVERB_ROUND_ITEMS,
  PROVERB_ROUND_OPTIONS,
  foldForDialect,
  isAppLocale,
  type AppLocale,
  type GameDialect,
  type ProverbRoundAnswer,
  type ProverbRoundCorrection,
  type ProverbRoundGame,
  type ProverbRoundHint,
  type ProverbRoundItemView,
  type ProverbRoundMode,
} from '@kurda/shared';
import { drawFor } from '../games/draw.js';
import { freshestFirst, seenFor } from '../games/seen.js';
import type { RoundAsk, SoloEngine, SoloRules, StoredItem } from '../games/solo.js';
import { publishedProverbs, type Proverb } from './proverbs.js';

/** An item as the server keeps it: what is shown, its options, and which one is right. */
interface ProverbItem extends StoredItem {
  mode: ProverbRoundMode;
  dialect: GameDialect;
  locale: AppLocale;
  slug: string;
  text: string;
  /** the proverb (meaning), the scene (situation), or the proverb with its gap (complete) */
  prompt: string;
  /** a proverb to finish: what stands before and after its gap */
  before?: string;
  after?: string;
  options: string[];
  answer: number;
  translation: string;
  meaning: string;
}

const answerSchema = z.object({ choice: z.number().int().min(0).max(PROVERB_ROUND_OPTIONS - 1) });

/** The fallback language every proverb is first translated into. */
const FALLBACK: AppLocale = 'en';

/** Text compared as a reader would: case and spacing aside. */
const plainKey = (s: string): string => s.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

/** Arabic's short vowels, its dagger alef and its stretching mark: written in some places and not others. */
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/u;
/** Marks that end or break up a sentence, compared as nothing. */
const PUNCTUATION = /[\p{P}\p{S}]/u;

/** A text as a reader compares it, with where each of its characters came from in the original. */
function readerKey(text: string): { key: string; at: number[] } {
  let key = '';
  const at: number[] = [];
  const chars = Array.from(text.normalize('NFC'));
  let offset = 0;
  let space = false;
  for (const ch of chars) {
    const here = offset;
    offset += ch.length;
    if (ARABIC_MARKS.test(ch) || PUNCTUATION.test(ch)) continue;
    if (/\s/u.test(ch)) {
      space = key.length > 0;
      continue;
    }
    if (space) {
      key += ' ';
      at.push(here);
      space = false;
    }
    for (const unit of ch.toLocaleLowerCase()) {
      key += unit;
      at.push(here);
    }
  }
  return { key, at };
}

/**
 * The scene with the proverb's own rendering taken out of it, wherever it is
 * quoted: compared as a reader would see them (`readerKey`), and cut from the
 * scene as it is written.
 */
export function sceneWithout(scene: string, rendering: string): string {
  const needle = readerKey(rendering).key.trim();
  if (needle.length < 4) return scene;
  const original = scene.normalize('NFC');
  const hay = readerKey(original);
  const at = hay.key.indexOf(needle);
  if (at < 0) return scene;
  const start = hay.at[at]!;
  const lastChar = hay.at[at + needle.length - 1]!;
  // the whole of the last character, and any marks written on it
  let end = lastChar + Array.from(original.slice(lastChar))[0]!.length;
  while (end < original.length && ARABIC_MARKS.test(original[end]!)) end++;
  return `${original.slice(0, start)}…${original.slice(end)}`;
}

/** A proverb with a word taken out: what stands before and after it, and the word. */
export interface ProverbGap {
  before: string;
  word: string;
  after: string;
}

/** The shortest word a proverb to finish may lose: a shorter last word is a little word like ye or e. */
const GAP_MIN_LETTERS = 3;

/**
 * Where a proverb is to be finished (pure, for the tests): its last word of
 * three letters or more, with the text before it and after it as written.
 * Null when it has no such word.
 */
export function proverbGap(text: string): ProverbGap | null {
  const words = [...text.matchAll(/[\p{L}\p{M}’']+/gu)];
  for (let i = words.length - 1; i >= 0; i--) {
    const m = words[i]!;
    const word = m[0].replace(/[’']+$/u, '');
    if (Array.from(word.replace(/\p{M}/gu, '')).length < GAP_MIN_LETTERS) continue;
    const start = m.index!;
    return { before: text.slice(0, start).trimEnd(), word, after: text.slice(start + word.length) };
  }
  return null;
}

export class ProverbRound implements SoloEngine<ProverbItem, ProverbRoundItemView, ProverbRoundAnswer, ProverbRoundHint, ProverbRoundCorrection> {
  readonly game: ProverbRoundGame;
  readonly answer = answerSchema;
  /** not one of the registry's games: played in both varieties, and paying no XP */
  readonly rules: SoloRules = { dialects: GAME_DIALECTS, source: null };

  constructor(private readonly mode: ProverbRoundMode) {
    this.game = PROVERB_ROUND_GAMES[mode];
  }

  async build(ask: RoundAsk, db: Pick<pg.Pool, 'query'>): Promise<{ items: ProverbItem[]; meta: Record<string, unknown> } | null> {
    if (this.mode === 'complete') return this.buildComplete(ask, db);
    const [proverbs, seen, user] = await Promise.all([
      publishedProverbs(db, { dialect: ask.dialect }),
      seenFor(db, ask.userId, this.game),
      db.query<{ locale: string | null }>(`SELECT locale FROM users WHERE id = $1`, [ask.userId]),
    ]);
    const wanted = user.rows[0]?.locale;
    const enough = (locale: AppLocale) => proverbs.filter((p) => p.translations[locale]).length >= Math.max(PROVERB_ROUND_ITEMS, PROVERB_ROUND_OPTIONS);
    const locale = isAppLocale(wanted) && enough(wanted) ? wanted : enough(FALLBACK) ? FALLBACK : null;
    if (!locale) return null;
    const pool = proverbs.filter((p) => p.translations[locale]);

    const draw = drawFor(`${ask.seed}:proverbs`);
    const ordered = freshestFirst(
      draw.shuffle(pool).map((p) => ({ key: p.id, p })),
      seen,
    );
    const items = ordered.slice(0, PROVERB_ROUND_ITEMS).map(({ p }, i) => this.item(p, pool, locale, `${ask.seed}:${i}`, seen.get(p.id)?.recent === true));
    if (items.some((it) => it === null)) return null;
    return { items: items as ProverbItem[], meta: { mode: this.mode, locale } };
  }

  /** A round of proverbs to finish: five that each have a word to take out and two near words to offer beside it. */
  private async buildComplete(ask: RoundAsk, db: Pick<pg.Pool, 'query'>): Promise<{ items: ProverbItem[]; meta: Record<string, unknown> } | null> {
    const [proverbs, seen, user] = await Promise.all([
      publishedProverbs(db, { dialect: ask.dialect }),
      seenFor(db, ask.userId, this.game),
      db.query<{ locale: string | null }>(`SELECT locale FROM users WHERE id = $1`, [ask.userId]),
    ]);
    const wanted = user.rows[0]?.locale;
    const locale: AppLocale = isAppLocale(wanted) ? wanted : FALLBACK;
    const gaps = new Map(proverbs.map((p) => [p.id, proverbGap(p.payload.text)] as const));
    const words = proverbs.flatMap((p) => {
      const g = gaps.get(p.id);
      return g ? [g.word] : [];
    });
    const draw = drawFor(`${ask.seed}:proverbs`);
    const ordered = freshestFirst(
      draw.shuffle(proverbs).map((p) => ({ key: p.id, p })),
      seen,
    );
    const items: ProverbItem[] = [];
    for (const { p } of ordered) {
      if (items.length === PROVERB_ROUND_ITEMS) break;
      const gap = gaps.get(p.id);
      if (!gap) continue;
      const item = this.completeItem(p, gap, words, locale, `${ask.seed}:${items.length}`, seen.get(p.id)?.recent === true);
      if (item) items.push(item);
    }
    if (items.length < PROVERB_ROUND_ITEMS) return null;
    return { items, meta: { mode: this.mode, locale } };
  }

  /** One proverb to finish: its own word and the two nearest other proverbs' words, in a drawn order. */
  private completeItem(p: Proverb, gap: ProverbGap, words: readonly string[], locale: AppLocale, seed: string, repeat: boolean): ProverbItem | null {
    const key = (w: string) => foldForDialect(w, p.dialect);
    const own = key(gap.word);
    const letters = (w: string) => Array.from(key(w)).length;
    const lastOf = (w: string) => Array.from(key(w)).at(-1);
    // a word that turns this proverb into one of its own variants would be right too
    const variants = new Set(
      (p.payload.variants ?? []).filter((v) => v.dialect === p.dialect).map((v) => key(v.text)),
    );
    const makesVariant = (w: string) => variants.has(key(`${gap.before} ${w}${gap.after}`));
    const seen = new Set([own]);
    const candidates: string[] = [];
    for (const w of words) {
      const k = key(w);
      if (seen.has(k) || makesVariant(w)) continue;
      seen.add(k);
      candidates.push(w);
    }
    const draw = drawFor(`${seed}:options`);
    const rank = (w: string) => (lastOf(w) === lastOf(gap.word) ? 0 : 2) + (letters(w) === letters(gap.word) ? 0 : 1);
    const picked = draw
      .shuffle(candidates)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, PROVERB_ROUND_OPTIONS - 1);
    if (picked.length < PROVERB_ROUND_OPTIONS - 1) return null;
    const options = draw.shuffle([gap.word, ...picked]);
    const t = p.translations[locale] ?? p.translations[FALLBACK];
    return {
      key: p.id,
      level: p.level,
      repeat,
      mode: this.mode,
      dialect: p.dialect,
      locale: p.translations[locale] ? locale : FALLBACK,
      slug: p.payload.slug,
      text: p.payload.text,
      prompt: `${gap.before} …${gap.after}`,
      before: gap.before,
      after: gap.after,
      options,
      answer: options.indexOf(gap.word),
      translation: t?.translation ?? '',
      meaning: t?.meaning ?? '',
    };
  }

  /** One item: the proverb, two other proverbs' options beside its own, in a drawn order. */
  private item(p: Proverb, pool: readonly Proverb[], locale: AppLocale, seed: string, repeat: boolean): ProverbItem | null {
    const t = p.translations[locale]!;
    const optionOf = (q: Proverb): string => (this.mode === 'meaning' ? q.translations[locale]!.meaning : q.payload.text);
    const own = optionOf(p);
    const themes = new Set(p.payload.themes);
    const draw = drawFor(`${seed}:options`);
    const others = pool.filter((q) => q.id !== p.id && plainKey(optionOf(q)) !== plainKey(own));
    // proverbs about something else first, so the right one is the only one that fits
    const apart = others.filter((q) => !q.payload.themes.some((th) => themes.has(th)));
    const near = others.filter((q) => q.payload.themes.some((th) => themes.has(th)));
    const picked: string[] = [];
    for (const q of [...draw.shuffle(apart), ...draw.shuffle(near)]) {
      const option = optionOf(q);
      if (picked.some((o) => plainKey(o) === plainKey(option))) continue;
      picked.push(option);
      if (picked.length === PROVERB_ROUND_OPTIONS - 1) break;
    }
    if (picked.length < PROVERB_ROUND_OPTIONS - 1) return null;
    const options = draw.shuffle([own, ...picked]);
    return {
      key: p.id,
      level: p.level,
      repeat,
      mode: this.mode,
      dialect: p.dialect,
      locale,
      slug: p.payload.slug,
      text: p.payload.text,
      prompt: this.mode === 'meaning' ? p.payload.text : sceneWithout(t.example, t.translation),
      options,
      answer: options.indexOf(own),
      translation: t.translation,
      meaning: t.meaning,
    };
  }

  view(item: ProverbItem, index: number): ProverbRoundItemView {
    if (item.mode === 'complete') {
      return {
        index,
        mode: 'complete',
        dialect: item.dialect,
        proverb: item.prompt,
        before: item.before ?? '',
        after: item.after ?? '',
        locale: item.locale,
        options: item.options,
      };
    }
    return item.mode === 'meaning'
      ? { index, mode: 'meaning', dialect: item.dialect, proverb: item.prompt, locale: item.locale, options: item.options }
      : { index, mode: 'situation', dialect: item.dialect, scene: item.prompt, locale: item.locale, options: item.options };
  }

  grade(item: ProverbItem, answer: ProverbRoundAnswer): boolean {
    return answer.choice === item.answer;
  }

  hint(_item: ProverbItem, answer: ProverbRoundAnswer): ProverbRoundHint {
    return { struck: answer.choice };
  }

  correction(item: ProverbItem): ProverbRoundCorrection {
    return { choice: item.answer, slug: item.slug, text: item.text, locale: item.locale, translation: item.translation, meaning: item.meaning };
  }

  why(item: ProverbItem): string {
    return item.mode;
  }
}
