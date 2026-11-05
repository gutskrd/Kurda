/**
 * What Would You Say?: a round of scenes, each a moment from a published
 * conversation, to answer the way the conversation really went.
 *
 * The scenes are published `scenario` rows (approved by a reviewer, in one
 * variety): the situation in the interface languages, the place and who is
 * speaking, the line heard, the reply that really came next and two to four
 * real lines from other conversations that do not fit. A round is eight of
 * them at the levels of the difficulty chosen, never-met scenes first.
 *
 * Beginner and intermediate choose the reply from three or four real lines;
 * advanced builds it from its own words as tiles, with a few words from the
 * wrong replies among them (a reply too short or too long for tiles is chosen
 * instead). A choice is graded by its place, tiles as a translation is, with
 * `checkAnswer` against the reply.
 *
 * A wrong first try is answered with the option ruled out and what it means,
 * or for tiles the first word out of place — never the reply. Once an item is
 * done the correction gives the line and every option with what it means and
 * why it fits or does not, and the real reply's recording when there is one.
 * The line heard plays in the voice it was recorded in (games/spoken.ts).
 */
import type pg from 'pg';
import { z } from 'zod';
import {
  DIFFICULTY_LEVELS,
  MAX_TILES,
  SCENARIO_CHOICES,
  SCENARIO_DECOYS,
  SOLO_ROUND_ITEMS,
  buildsFromTiles,
  firstMisplaced,
  foldForDialect,
  gameWords,
  type GameDialect,
  type GameLevel,
  type Meanings,
  type ScenarioAnswer,
  type ScenarioContent,
  type ScenarioCorrection,
  type ScenarioHint,
  type ScenePlace,
  type SpeakerId,
  type SpokenAudio,
  type WhatWouldYouSayItemView,
} from '@kurda/shared';
import { checkAnswer } from '../content/exercises.js';
import { drawFor } from './draw.js';
import { freshestFirst, seenFor } from './seen.js';
import { spokenAudio, spokenKeys } from './spoken.js';
import type { PublishedContent, TrustedSources } from './sources.js';
import type { RoundAsk, SoloEngine, StoredItem } from './solo.js';

export const WHAT_WOULD_YOU_SAY = 'what-would-you-say' as const;

/** A reply as a round keeps it. */
interface KeptReply {
  ku: string;
  meanings: Meanings;
  why: Meanings | null;
}

/** A scene as a round keeps it, answer and all. */
export interface ScenarioItem extends StoredItem {
  situation: Meanings;
  place: ScenePlace | null;
  speaker: SpeakerId | null;
  line: { ku: string; meanings: Meanings; audio: SpokenAudio | null };
  reply: KeptReply & { audio: SpokenAudio | null };
  others: KeptReply[];
  mode: 'choose' | 'tiles';
  /** choose: what each option shown is, by its place: -1 the reply, else its place among `others` */
  shown: number[];
  /** tiles: the reply's words and the decoys, shuffled */
  tiles: string[];
}

const answerSchema: z.ZodType<ScenarioAnswer> = z.union([
  z.object({ choice: z.number().int().min(0).max(4) }),
  z.object({ order: z.array(z.number().int().min(0).max(MAX_TILES - 1)).min(1).max(MAX_TILES) }),
]);

/** The words a line of tiles says, or null when it repeats a tile or names one that is not there. */
function laid(item: Pick<ScenarioItem, 'tiles'>, answer: ScenarioAnswer): string[] | null {
  if (!('order' in answer)) return null;
  if (new Set(answer.order).size !== answer.order.length) return null;
  const words = answer.order.map((i) => item.tiles[i]);
  return words.every((w): w is string => typeof w === 'string') ? words : null;
}

const reply = (r: ScenarioContent['reply']): KeptReply => ({ ku: r.ku, meanings: r.meanings, why: r.why ?? null });

export class WhatWouldYouSayGame implements SoloEngine<ScenarioItem, WhatWouldYouSayItemView, ScenarioAnswer, ScenarioHint, ScenarioCorrection> {
  readonly game = WHAT_WOULD_YOU_SAY;
  readonly answer = answerSchema;

  constructor(private readonly sources: TrustedSources) {}

  async build(ask: RoundAsk, db: Pick<pg.Pool, 'query'>): Promise<{ items: ScenarioItem[]; meta: Record<string, unknown> } | null> {
    const levels: readonly number[] = DIFFICULTY_LEVELS[ask.difficulty];
    const [rows, seen] = await Promise.all([this.sources.content('scenario', ask.dialect), seenFor(db, ask.userId, WHAT_WOULD_YOU_SAY)]);
    const pool = rows.filter((r) => levels.includes(r.level));
    if (pool.length < SOLO_ROUND_ITEMS) return null;
    const round = freshestFirst(drawFor(`${ask.seed}:scenes`).shuffle(pool), seen).slice(0, SOLO_ROUND_ITEMS);

    // the line heard and the real reply, recorded or not, in one query for the round
    const audio = await spokenAudio(
      db,
      round.flatMap((r) => [
        { keys: spokenKeys(r.payload.line.recording, r.payload.line.ku), text: r.payload.line.ku, speaker: r.payload.speaker ?? null },
        { keys: spokenKeys(r.payload.reply.recording, r.payload.reply.ku), text: r.payload.reply.ku, speaker: null },
      ]),
    );
    const spelling = this.spellings(pool, ask.dialect);
    const items = round.map((row, i) => this.item(row, i, ask, seen.get(row.key)?.recent === true, audio[i * 2] ?? null, audio[i * 2 + 1] ?? null, spelling));
    return { items, meta: {} };
  }

  private item(
    row: PublishedContent<'scenario'>,
    i: number,
    ask: RoundAsk,
    repeat: boolean,
    lineAudio: SpokenAudio | null,
    replyAudio: SpokenAudio | null,
    spelling: ReadonlyMap<string, string>,
  ): ScenarioItem {
    const p = row.payload;
    const others = p.others.map(reply);
    const base = {
      key: row.key,
      level: row.level,
      repeat,
      situation: p.situation,
      place: p.place ?? null,
      speaker: p.speaker ?? null,
      line: { ku: p.line.ku, meanings: p.line.meanings, audio: lineAudio },
      reply: { ...reply(p.reply), audio: replyAudio },
      others,
    };
    if (!buildsFromTiles(ask.difficulty, p.reply.ku)) {
      const wrong = drawFor(`${ask.seed}:${i}:others`)
        .shuffle(others.map((_, j) => j))
        .slice(0, SCENARIO_CHOICES[ask.difficulty] - 1);
      return { ...base, mode: 'choose', shown: drawFor(`${ask.seed}:${i}:shown`).shuffle([-1, ...wrong]), tiles: [] };
    }
    // the reply's words, spelled the way the pool writes them most plainly, and a few words of the lines that do not fit
    const words = gameWords(p.reply.ku).map((w) => spelling.get(foldForDialect(w, ask.dialect)) ?? w);
    const taken = new Set(words.flatMap((w) => [foldForDialect(w, ask.dialect), foldForDialect(w, ask.dialect, true)]));
    const decoys: string[] = [];
    const want = Math.max(0, Math.min(SCENARIO_DECOYS, MAX_TILES - words.length));
    const from = others.flatMap((o) => gameWords(o.ku)).map((w) => spelling.get(foldForDialect(w, ask.dialect)) ?? w);
    for (const w of drawFor(`${ask.seed}:${i}:decoys`).order(from)) {
      if (decoys.length >= want) break;
      const strict = foldForDialect(w, ask.dialect);
      const lenient = foldForDialect(w, ask.dialect, true);
      if (taken.has(strict) || taken.has(lenient)) continue;
      taken.add(strict);
      taken.add(lenient);
      decoys.push(w);
    }
    let tiles = drawFor(`${ask.seed}:${i}:bank`).shuffle([...words, ...decoys]);
    // never hand the reply over already in order
    const places = tiles.map((t, j) => (decoys.includes(t) ? -1 : j)).filter((j) => j >= 0);
    if (places.length > 1 && places.every((at, j) => tiles[at] === words[j])) {
      const other = places.find((at) => tiles[at] !== tiles[places[0]!]);
      if (other !== undefined) {
        tiles = [...tiles];
        [tiles[places[0]!], tiles[other]] = [tiles[other]!, tiles[places[0]!]!];
      }
    }
    return { ...base, mode: 'tiles', shown: [], tiles };
  }

  /**
   * One spelling per word of the pool's Kurdish: the lower-case one wherever
   * the word is also written so, so a capital does not say which tile starts
   * the reply (a name, never written in lower case, keeps its capital).
   */
  private spellings(pool: ReadonlyArray<PublishedContent<'scenario'>>, dialect: GameDialect): Map<string, string> {
    const byKey = new Map<string, string>();
    for (const row of pool) {
      const p = row.payload;
      for (const text of [p.line.ku, p.reply.ku, ...p.others.map((o) => o.ku)]) {
        for (const w of gameWords(text)) {
          const key = foldForDialect(w, dialect);
          const had = byKey.get(key);
          if (!had || (had !== had.toLowerCase() && w === w.toLowerCase())) byKey.set(key, w);
        }
      }
    }
    return byKey;
  }

  view(item: ScenarioItem, index: number): WhatWouldYouSayItemView {
    return {
      index,
      situation: item.situation,
      place: item.place,
      speaker: item.speaker,
      line: { ku: item.line.ku, audio: item.line.audio },
      options: item.mode === 'choose' ? item.shown.map((s) => (s < 0 ? item.reply.ku : item.others[s]!.ku)) : null,
      tiles: item.mode === 'tiles' ? item.tiles : null,
      level: item.level as GameLevel,
    };
  }

  grade(item: ScenarioItem, answer: ScenarioAnswer): boolean {
    if (item.mode === 'choose') return 'choice' in answer && item.shown[answer.choice] === -1;
    const words = laid(item, answer);
    if (!words) return false;
    return checkAnswer('translate', { prompt: item.reply.meanings.en, accepted: [item.reply.ku] }, { text: words.join(' ') }, '').accepted;
  }

  hint(item: ScenarioItem, answer: ScenarioAnswer, dialect: GameDialect): ScenarioHint {
    if (item.mode === 'choose') {
      const at = 'choice' in answer ? answer.choice : -1;
      const other = item.others[item.shown[at] ?? -1];
      return { ruledOut: other ? at : null, meanings: other?.meanings ?? null, firstWrong: null };
    }
    const words = laid(item, answer);
    return { ruledOut: null, meanings: null, firstWrong: words ? firstMisplaced(words, [item.reply.ku], dialect) : 0 };
  }

  correction(item: ScenarioItem, last: ScenarioAnswer | null, dialect: GameDialect): ScenarioCorrection {
    const right = { ku: item.reply.ku, meanings: item.reply.meanings, why: item.reply.why, fits: true };
    const wrong = (o: KeptReply) => ({ ku: o.ku, meanings: o.meanings, why: o.why, fits: false });
    const options = item.mode === 'choose' ? item.shown.map((s) => (s < 0 ? right : wrong(item.others[s]!))) : [right, ...item.others.map(wrong)];
    const words = item.mode === 'tiles' && last ? laid(item, last) : null;
    const solved = last !== null && this.grade(item, last);
    return {
      line: { ku: item.line.ku, meanings: item.line.meanings },
      reply: { ku: item.reply.ku, meanings: item.reply.meanings, why: item.reply.why, audio: item.reply.audio },
      options,
      chosen: item.mode === 'choose' && last && 'choice' in last ? last.choice : null,
      firstWrong: item.mode === 'tiles' && !solved ? (words ? firstMisplaced(words, [item.reply.ku], dialect) : 0) : null,
    };
  }

  why(): string {
    return 'reply';
  }
}
