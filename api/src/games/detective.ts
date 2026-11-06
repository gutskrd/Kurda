/**
 * Kurdish Detective: a round is one case, solved from Kurdish evidence.
 *
 * The cases are published `case_file` rows (approved by a reviewer, in one
 * variety). Each holds suspects, evidence cards whose Kurdish was picked from
 * published lessons and stories in the admin panel (never typed again), the
 * deduction steps, the culprit and a solution that walks back through the
 * evidence. A round takes one case at the levels of the difficulty chosen,
 * one never met first; its items are the deduction steps and, last, the
 * accusation (shared detective/rules.ts).
 *
 * The board — the case, its suspects and its cards — is sent with the round
 * (`board`), but what a card means stays here until the player has found it:
 * by making a deduction it proves (the correction brings the meanings, and
 * the notebook keeps the deduction), or by spending a hint on it. A hint can
 * instead read the case's next written hint. Each hint spent takes
 * DETECTIVE_HINT_XP off what the case pays at the finish (`deduction`). An
 * overheard remark plays in the voice it was recorded in (games/spoken.ts).
 *
 * Hints are not free for a round given up. A round of a case left unfinished
 * (replaced by a new round, or expired) keeps what its hints showed, and the
 * next round of the same case within GAME_REPEAT_XP_DAYS starts with them
 * spent (`carriedHints`): the cards it translated already translated, the
 * hints it read already read, and their cost taken off that round's pay — so
 * a case cannot be opened up with hints, dropped, and played again for free.
 *
 * A wrong first try is answered with the cards to read again, never the
 * answer; once an item is done, the right answer and the cards it rests on
 * with what they mean, and for the accusation the culprit and the solution,
 * every deduction walked back through.
 */
import type pg from 'pg';
import { z } from 'zod';
import {
  DETECTIVE_HINTS,
  DETECTIVE_HINT_XP,
  DIFFICULTY_LEVELS,
  GAME_REPEAT_XP_DAYS,
  accusationEvidence,
  suspectPortrait,
  type DetectiveAnswer,
  type DetectiveBoardView,
  type DetectiveCorrection,
  type DetectiveHint,
  type DetectiveItemView,
  type GameLevel,
  type Meanings,
  type NotebookEntry,
  type SoloItemState,
} from '@kurda/shared';
import { drawFor } from './draw.js';
import { AppError } from '../plugins/errors.js';
import { freshestFirst, seenFor } from './seen.js';
import { spokenAudio, spokenKeys } from './spoken.js';
import type { TrustedSources } from './sources.js';
import type { RoundAsk, SoloEngine, StoredItem } from './solo.js';

export const DETECTIVE = 'detective' as const;

/** A card's id and what it means, once found. */
interface Found {
  id: string;
  meanings: Meanings;
}

export type CaseItem = StepItem | AccuseItem;

/** A deduction step as the round keeps it, answer and all. */
export interface StepItem extends StoredItem {
  kind: 'step';
  step: number;
  prompt: Meanings;
  options: Meanings[];
  /** the options as shown, by their place: each one's place in `options` */
  shown: number[];
  correctIndex: number;
  evidence: Found[];
}

/** The accusation as the round keeps it: the solution, and every deduction it walks back through. */
export interface AccuseItem extends StoredItem {
  kind: 'accuse';
  suspects: string[];
  culprit: string;
  solution: Meanings;
  walk: NotebookEntry[];
  evidence: Found[];
}

/** What a round of a case decided, kept with it: the board as dealt and the hints spent. */
interface CaseMeta {
  caseId: string;
  board: Omit<DetectiveBoardView, 'hintsLeft' | 'hintsUsed' | 'hints' | 'moreHints' | 'notebook'> & { written: Meanings[] };
  spent: { used: number; read: number; translated: string[] };
}

const answerSchema: z.ZodType<DetectiveAnswer> = z.object({ choice: z.number().int().min(0).max(5) });
const hintAsk = z.object({ evidence: z.string().regex(/^[a-z0-9-]{2,40}$/).optional() }).strict();

function metaOf(meta: Record<string, unknown>): CaseMeta | null {
  const m = meta as Partial<CaseMeta>;
  return m.board && m.spent ? (m as CaseMeta) : null;
}

/**
 * The hints already spent on this case in the learner's last round of it,
 * when that round was left unfinished (given up for another, or expired)
 * within the repeat window: what the next round of the case starts with.
 * Nothing when the last round of it was finished — its hints were paid for.
 */
export async function carriedHints(db: Pick<pg.Pool, 'query'>, userId: string, dialect: string, caseId: string): Promise<CaseMeta['spent'] | null> {
  const res = await db.query<{ spent: CaseMeta['spent'] | null; finished: boolean }>(
    `SELECT meta->'spent' AS spent, finished_at IS NOT NULL AS finished FROM game_sessions
      WHERE user_id = $1 AND game = $2 AND dialect = $3 AND meta->>'caseId' = $4
        AND created_at > now() - make_interval(days => $5)
      ORDER BY created_at DESC LIMIT 1`,
    [userId, DETECTIVE, dialect, caseId, GAME_REPEAT_XP_DAYS],
  );
  const last = res.rows[0];
  if (!last || last.finished || !last.spent || typeof last.spent.used !== 'number') return null;
  return {
    used: Math.min(DETECTIVE_HINTS, Math.max(0, last.spent.used)),
    read: Math.max(0, Number(last.spent.read) || 0),
    translated: Array.isArray(last.spent.translated) ? last.spent.translated.filter((t): t is string => typeof t === 'string') : [],
  };
}

/** A step's deduction, as the notebook keeps it. */
function entryOf(item: StepItem): NotebookEntry {
  return { step: item.step, prompt: item.prompt, answer: item.options[item.correctIndex]!, evidence: item.evidence.map((e) => e.id) };
}

export class DetectiveGame implements SoloEngine<CaseItem, DetectiveItemView, DetectiveAnswer, DetectiveHint, DetectiveCorrection> {
  readonly game = DETECTIVE;
  readonly answer = answerSchema;
  readonly hintAsk = hintAsk;

  constructor(private readonly sources: TrustedSources) {}

  async build(ask: RoundAsk, db: Pick<pg.Pool, 'query'>): Promise<{ items: CaseItem[]; meta: Record<string, unknown> } | null> {
    const levels: readonly number[] = DIFFICULTY_LEVELS[ask.difficulty];
    const [rows, seen] = await Promise.all([this.sources.content('case_file', ask.dialect), seenFor(db, ask.userId, DETECTIVE)]);
    // a case is met when its accusation was: never met first, then the longest ago
    const cases = rows.filter((r) => levels.includes(r.level)).map((row) => ({ key: `${row.key}:accuse`, row }));
    const picked = freshestFirst(drawFor(`${ask.seed}:case`).shuffle(cases), seen)[0];
    if (!picked) return null;
    const { row } = picked;
    const c = row.payload;
    const [audio, carried] = await Promise.all([
      spokenAudio(
        db,
        c.evidence.map((e) => ({ keys: spokenKeys(e.recording, e.ku), text: e.ku, speaker: e.speaker ?? null })),
      ),
      carriedHints(db, ask.userId, ask.dialect, row.id),
    ]);
    const meanings = new Map(c.evidence.map((e) => [e.id, e.meanings]));
    const found = (ids: readonly string[]): Found[] => ids.map((id) => ({ id, meanings: meanings.get(id)! }));

    const steps = c.steps.map((s, step): StepItem => {
      const key = `${row.key}:step:${step}`;
      return {
        key,
        level: row.level,
        repeat: seen.get(key)?.recent === true,
        kind: 'step',
        step,
        prompt: s.prompt,
        options: s.options,
        shown: drawFor(`${ask.seed}:${step}:options`).shuffle(s.options.map((_, i) => i)),
        correctIndex: s.correctIndex,
        evidence: found(s.evidence),
      };
    });
    const accuse: AccuseItem = {
      key: picked.key,
      level: row.level,
      repeat: seen.get(picked.key)?.recent === true,
      kind: 'accuse',
      suspects: c.suspects.map((s) => s.id),
      culprit: c.culprit,
      solution: c.solution,
      walk: steps.map(entryOf),
      evidence: found(accusationEvidence(c)),
    };
    const meta: CaseMeta = {
      caseId: row.id,
      board: {
        title: c.title,
        intro: c.intro,
        suspects: c.suspects.map((s) => ({ id: s.id, name: s.name, about: s.about, portrait: suspectPortrait(s) })),
        evidence: c.evidence.map((e, i) => ({
          id: e.id,
          kind: e.kind,
          ku: e.ku,
          meanings: e.meanings,
          speaker: e.speaker ?? null,
          from: e.from ?? null,
          audio: audio[i] ?? null,
        })),
        steps: c.steps.length,
        level: row.level as GameLevel,
        written: c.hints,
      },
      // what a round of this case given up showed with its hints, already spent here
      spent: carried
        ? { used: carried.used, read: Math.min(carried.read, c.hints.length), translated: carried.translated.filter((id) => c.evidence.some((e) => e.id === id)) }
        : { used: 0, read: 0, translated: [] },
    };
    return { items: [...steps, accuse], meta: meta as unknown as Record<string, unknown> };
  }

  /** The cards whose meaning the player has: those of every item done, and those a hint translated. */
  private known(items: readonly CaseItem[], states: readonly SoloItemState[], spent: CaseMeta['spent']): Set<string> {
    const out = new Set(spent.translated);
    items.forEach((item, i) => {
      if (states[i]?.done) for (const e of item.evidence) out.add(e.id);
    });
    return out;
  }

  board(items: CaseItem[], raw: Record<string, unknown>, states: SoloItemState[]): DetectiveBoardView | null {
    const meta = metaOf(raw);
    if (!meta) return null;
    const { written, ...board } = meta.board;
    const known = this.known(items, states, meta.spent);
    return {
      ...board,
      evidence: board.evidence.map((e) => ({ ...e, meanings: known.has(e.id) ? e.meanings : null })),
      hintsLeft: Math.max(0, DETECTIVE_HINTS - meta.spent.used),
      hintsUsed: meta.spent.used,
      hints: written.slice(0, meta.spent.read),
      moreHints: meta.spent.read < written.length,
      notebook: items.flatMap((item, i) => (item.kind === 'step' && states[i]?.done ? [entryOf(item)] : [])),
    };
  }

  spendHint(round: { items: CaseItem[]; meta: Record<string, unknown>; states: SoloItemState[] }, raw: unknown): Record<string, unknown> {
    const meta = metaOf(round.meta);
    if (!meta) throw new AppError('NO_HINTS', 409, 'this round has no hints to spend');
    const ask = raw as z.infer<typeof hintAsk>;
    const spent = { ...meta.spent, translated: [...meta.spent.translated] };
    if (spent.used >= DETECTIVE_HINTS) throw new AppError('NO_HINTS_LEFT', 409, 'every hint of this case is spent');
    if (ask.evidence !== undefined) {
      if (!meta.board.evidence.some((e) => e.id === ask.evidence)) throw new AppError('BAD_REQUEST', 400, 'no such card on this board');
      if (this.known(round.items, round.states, spent).has(ask.evidence)) throw new AppError('ALREADY_FOUND', 409, 'what this card means is already found');
      spent.translated.push(ask.evidence);
    } else {
      if (spent.read >= meta.board.written.length) throw new AppError('NO_HINTS_LEFT', 409, 'no written hint is left: spend it on a card instead');
      spent.read++;
    }
    spent.used++;
    return { ...meta, spent } as unknown as Record<string, unknown>;
  }

  deduction(raw: Record<string, unknown>): number {
    return (metaOf(raw)?.spent.used ?? 0) * DETECTIVE_HINT_XP;
  }

  view(item: CaseItem, index: number): DetectiveItemView {
    if (item.kind === 'accuse') return { index, kind: 'accuse', suspects: item.suspects };
    return { index, kind: 'step', prompt: item.prompt, options: item.shown.map((i) => item.options[i]!) };
  }

  grade(item: CaseItem, answer: DetectiveAnswer): boolean {
    if (item.kind === 'accuse') return item.suspects[answer.choice] === item.culprit;
    return item.shown[answer.choice] === item.correctIndex;
  }

  hint(item: CaseItem): DetectiveHint {
    return { look: item.evidence.map((e) => e.id) };
  }

  correction(item: CaseItem): DetectiveCorrection {
    if (item.kind === 'accuse') {
      return {
        kind: 'accuse',
        correctIndex: item.suspects.indexOf(item.culprit),
        entry: null,
        evidence: item.evidence,
        culprit: item.culprit,
        solution: item.solution,
        walk: item.walk,
      };
    }
    return {
      kind: 'step',
      correctIndex: item.shown.indexOf(item.correctIndex),
      entry: entryOf(item),
      evidence: item.evidence,
      culprit: null,
      solution: null,
      walk: null,
    };
  }

  why(item: CaseItem): string {
    return item.kind;
  }
}

