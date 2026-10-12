import {
  type GameAccess,
  type QuestionCount,
  type StoryDialect,
  type StoryGameMode,
  type StoryGamePlayer,
  type StoryGameResults,
  type StoryGameReveal,
  type StoryGameReviewItem,
  type StoryGameStatus,
  type StoryGameView,
  type StoryLength,
  type StoryLevel,
  type TextDuring,
  type TimerSeconds,
} from '@kurda/shared';
import type { PlannedQuestion, StorySnapshot } from './plan.js';
import { controllerOf, placesOf, questionDeadline, type PhaseGame, type PhasePlayer } from './logic.js';

/** A story_games row. */
export interface GameRow {
  id: string;
  code: string | null;
  mode: StoryGameMode;
  host_id: string | null;
  story_id: string;
  dialect: StoryDialect;
  level: StoryLevel;
  length: StoryLength;
  question_count: QuestionCount;
  timer_seconds: TimerSeconds;
  text_during: TextDuring;
  access: GameAccess;
  chat_group_id: string | null;
  status: StoryGameStatus;
  current_index: number;
  phase_started_at: Date | null;
  phase_ends_at: Date | null;
  reading_soft_cap_at: Date | null;
  reading_hard_cap_at: Date | null;
  version: number;
  plan: PlannedQuestion[] | null;
  story_snapshot: StorySnapshot | null;
  next_game_id: string | null;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

/** A story_game_players row. */
export interface PlayerRow {
  user_id: string;
  seat: number;
  joined_at: Date;
  last_seen_at: Date | null;
  done_reading_at: Date | null;
  continued_index: number | null;
  extra_time: boolean;
  left_at: Date | null;
  removed: boolean;
  score: number;
  correct: number;
  answered: number;
  /** bigint, as pg returns it */
  correct_ms: string | number;
  xp_awarded: number;
  learning_counted: boolean;
}

export function phaseGame(g: GameRow): PhaseGame {
  return {
    mode: g.mode,
    status: g.status,
    currentIndex: g.current_index,
    questionCount: g.question_count,
    timerSeconds: g.timer_seconds,
    phaseStartedAt: g.phase_started_at?.getTime() ?? null,
    phaseEndsAt: g.phase_ends_at?.getTime() ?? null,
    readingHardCapAt: g.reading_hard_cap_at?.getTime() ?? null,
    updatedAt: g.updated_at.getTime(),
  };
}

/** A player as a viewer's view is built from: the row, what the viewer may see of them, and presence. */
export interface ViewPlayer extends PlayerRow {
  displayName: string | null;
  avatarUrl: string | null;
  /** an accepted friend of the viewer */
  friend: boolean;
  /** a block between them and the viewer, either way */
  blocked: boolean;
  /** their account is closed */
  deleted: boolean;
  away: boolean;
  awayAt: number;
}

export interface ViewAnswer {
  user_id: string;
  question_index: number;
  choice: number;
  correct: boolean;
}

export interface ViewInput {
  game: GameRow;
  /** the story's title and slug, from the snapshot or (before one) the story itself */
  storyTitle: string;
  storySlug: string;
  players: ViewPlayer[];
  viewerId: string;
  /** every answer to the current question, and every answer the viewer gave */
  answers: ViewAnswer[];
  now: Date;
}

/**
 * Whether the viewer may see this player's name and picture: themselves, an
 * accepted friend, or — in an open game, where every member is a known adult —
 * anyone they have no block with. Everyone else is "Player {seat}": in a
 * friends game a missing name means "not my friend", and says nothing about
 * age (a rule keyed on age would be a way to find the children in a game).
 */
export function mayShowIdentity(access: GameAccess, p: Pick<ViewPlayer, 'friend' | 'blocked' | 'deleted'>, isMe: boolean): boolean {
  if (isMe) return true;
  if (p.deleted || p.blocked) return false;
  return p.friend || access === 'open';
}

function phasePlayer(p: ViewPlayer, answeredNow: boolean): PhasePlayer {
  return {
    userId: p.user_id,
    seat: p.seat,
    joinedAt: p.joined_at.getTime(),
    left: p.left_at !== null,
    removed: p.removed,
    away: p.away,
    awayAt: p.awayAt,
    extraTime: p.extra_time,
    doneReading: p.done_reading_at !== null,
    continuedIndex: p.continued_index,
    answered: answeredNow,
  };
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/**
 * One viewer's view of a game. Pure: everything it needs is in `input`.
 *
 * It never carries another member's user id — seats are the only handle —
 * and never anything that tells who is doing what: reading, answering and
 * continuing are counts. Scores are the totals as of the last reveal (they
 * only move then), and the right answer appears only once a question is
 * revealed.
 */
export function renderView(input: ViewInput): StoryGameView {
  const { game, viewerId, now } = input;
  const plan = game.plan ?? [];
  const inGame = input.players.filter((p) => !p.removed);
  const me = inGame.find((p) => p.user_id === viewerId) ?? null;
  const currentAnswers = input.answers.filter((a) => a.question_index === game.current_index);
  const answeredIds = new Set(currentAnswers.map((a) => a.user_id));
  const phasePlayers = inGame.map((p) => phasePlayer(p, answeredIds.has(p.user_id)));
  const active = phasePlayers.filter((p) => !p.left && !p.away);
  const myAnswers = new Map(
    input.answers.filter((a) => a.user_id === viewerId).map((a) => [a.question_index, a] as const),
  );

  const status = game.status;
  const asking = status === 'question' || status === 'reveal';
  const planned = asking ? plan[game.current_index] : undefined;
  const myCurrent = myAnswers.get(game.current_index);
  const finishedResults = game.finished_at !== null && (status === 'finished' || status === 'reveal');

  const players: StoryGamePlayer[] = inGame.map((p) => {
    const isMe = p.user_id === viewerId;
    const shown = mayShowIdentity(game.access, p, isMe);
    return {
      seat: p.seat,
      name: shown ? p.displayName : null,
      avatarUrl: shown ? p.avatarUrl : null,
      isHost: p.user_id === game.host_id,
      isMe,
      away: p.left_at === null && p.away,
      gone: p.left_at !== null,
      score: p.score,
      correct: p.correct,
    };
  });

  let phaseEndsAt: string | null = null;
  if (status === 'question') {
    const deadline = questionDeadline(phaseGame(game), me?.extra_time ?? false);
    phaseEndsAt = deadline === null ? null : new Date(deadline).toISOString();
  }

  let reveal: StoryGameReveal | null = null;
  if (status === 'reveal' && planned) {
    reveal = {
      index: game.current_index,
      correctIndex: planned.correctIndex,
      explanation: planned.explanation,
      explanationEn: planned.explanationEn,
      evidenceParagraph: planned.evidenceParagraph,
      evidenceSentence: planned.evidenceSentence,
      answeredCount: currentAnswers.length,
      correctCount: currentAnswers.filter((a) => a.correct).length,
      myChoice: myCurrent?.choice ?? null,
      myCorrect: myCurrent ? myCurrent.correct : null,
    };
  }

  let results: StoryGameResults | null = null;
  if (finishedResults) {
    const places = placesOf(
      inGame.map((p) => ({ key: p.user_id, score: p.score, correctMs: Number(p.correct_ms) })),
    );
    const standings = inGame
      .map((p) => {
        const isMe = p.user_id === viewerId;
        const shown = mayShowIdentity(game.access, p, isMe);
        return {
          seat: p.seat,
          name: shown ? p.displayName : null,
          avatarUrl: shown ? p.avatarUrl : null,
          isMe,
          score: p.score,
          correct: p.correct,
          place: places.get(p.user_id)!,
        };
      })
      .sort((a, b) => a.place - b.place || a.seat - b.seat);
    const review: StoryGameReviewItem[] = plan.map((q, index) => ({
      index,
      kind: q.kind,
      prompt: q.prompt,
      promptEn: q.promptEn,
      options: q.options,
      correctIndex: q.correctIndex,
      myChoice: myAnswers.get(index)?.choice ?? null,
      explanation: q.explanation,
      explanationEn: q.explanationEn,
      evidenceParagraph: q.evidenceParagraph,
      evidenceSentence: q.evidenceSentence,
    }));
    results = {
      standings,
      me: me
        ? {
            place: places.get(me.user_id)!,
            score: me.score,
            correct: me.correct,
            answered: me.answered,
            total: game.question_count,
            xp: me.xp_awarded,
            learningCounted: me.learning_counted,
          }
        : null,
      review,
    };
  }

  const joinable = game.mode !== 'solo' && (status === 'lobby' || status === 'reading');
  return {
    id: game.id,
    code: joinable ? game.code : null,
    mode: game.mode,
    status,
    version: game.version,
    serverNow: now.toISOString(),
    phaseEndsAt,
    readingSoftCapAt: status === 'reading' ? iso(game.reading_soft_cap_at) : null,
    readingHardCapAt: status === 'reading' ? iso(game.reading_hard_cap_at) : null,
    settings: {
      storyId: game.story_id,
      storyTitle: input.storyTitle,
      storySlug: input.storySlug,
      dialect: game.dialect,
      level: game.level,
      length: game.length,
      questionCount: game.question_count,
      timerSeconds: game.timer_seconds,
      textDuring: game.text_during,
      access: game.access,
    },
    isHost: controllerOf(game.host_id, phasePlayers) === viewerId,
    extraTime: me?.extra_time ?? false,
    players,
    activeCount: active.length,
    readingDoneCount: status === 'reading' ? active.filter((p) => p.doneReading).length : 0,
    answeredCount: asking ? active.filter((p) => p.answered).length : 0,
    continuedCount: status === 'reveal' ? active.filter((p) => p.continuedIndex === game.current_index).length : 0,
    meDoneReading: me?.done_reading_at != null,
    meContinued: status === 'reveal' && me?.continued_index === game.current_index,
    question: planned
      ? {
          index: game.current_index,
          total: game.question_count,
          kind: planned.kind,
          prompt: planned.prompt,
          promptEn: planned.promptEn,
          options: planned.options,
          myChoice: myCurrent?.choice ?? null,
        }
      : null,
    reveal,
    results,
    nextGameId: game.next_game_id,
  };
}
