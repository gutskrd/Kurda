/**
 * A short round on the Stories' proverbs, made, kept and paid by the solo
 * games' round (games/solo.ts) like any game played alone:
 *
 *   meaning   — a proverb in Kurdish, and three meanings to choose its own from
 *   situation — a little scene where someone would say one, and three Kurdish
 *               proverbs to choose the one that fits
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
 * the scene asks the question rather than answering it.
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
  /** the proverb (meaning) or the scene (situation) */
  prompt: string;
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

/** The scene with the proverb's own rendering taken out of it, wherever it is quoted. */
export function sceneWithout(scene: string, rendering: string): string {
  const needle = rendering.trim().replace(/[.!?。]+$/u, '');
  if (needle.length < 4) return scene;
  const at = scene.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  return at < 0 ? scene : `${scene.slice(0, at)}…${scene.slice(at + needle.length)}`;
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
