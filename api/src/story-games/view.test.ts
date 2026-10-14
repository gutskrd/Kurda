import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { StoryGameStatus } from '@kurda/shared';
import { planQuestion, type PlannedQuestion } from './plan.js';
import { mayShowIdentity, renderView, type GameRow, type ViewAnswer, type ViewPlayer } from './view.js';

const T = new Date('2026-10-12T12:00:00Z');
const at = (s: number) => new Date(T.getTime() + s * 1000);

const plan: PlannedQuestion[] = [0, 1, 2].map((i) =>
  planQuestion('g', {
    id: randomUUID(),
    position: i,
    kind: i === 2 ? 'gist' : 'detail',
    prompt: `p${i}`,
    promptEn: `q${i}`,
    options: ['a', 'b', 'c'],
    correctIndex: 1,
    explanation: 'e',
    explanationEn: 'e',
    evidenceParagraph: i === 2 ? null : i,
    evidenceSentence: null,
  }),
);

function gameRow(over: Partial<GameRow> = {}): GameRow {
  return {
    id: randomUUID(),
    code: 'ABC234',
    mode: 'group',
    host_id: null,
    story_id: randomUUID(),
    dialect: 'kurmanci',
    level: 1,
    length: 'short',
    question_count: 3,
    timer_seconds: 30,
    text_during: 'visible',
    access: 'friends',
    chat_group_id: null,
    rated: false,
    rated_state: null,
    status: 'lobby',
    current_index: 0,
    phase_started_at: T,
    phase_ends_at: at(30),
    reading_soft_cap_at: at(60),
    reading_hard_cap_at: at(180),
    version: 4,
    plan,
    story_snapshot: null,
    next_game_id: null,
    created_at: T,
    updated_at: T,
    started_at: T,
    finished_at: null,
    ...over,
  };
}

function playerRow(seat: number, over: Partial<ViewPlayer> = {}): ViewPlayer {
  return {
    user_id: randomUUID(),
    seat,
    joined_at: at(seat),
    last_seen_at: T,
    done_reading_at: null,
    continued_index: null,
    extra_time: false,
    left_at: null,
    removed: false,
    score: 100 * seat,
    correct: seat,
    answered: seat,
    correct_ms: '1000',
    xp_awarded: 0,
    learning_counted: false,
    displayName: `name ${seat}`,
    avatarUrl: `https://img/${seat}`,
    friend: false,
    blocked: false,
    deleted: false,
    away: false,
    awayAt: T.getTime() + 45_000,
    ...over,
  };
}

const STATUSES: StoryGameStatus[] = ['lobby', 'reading', 'question', 'reveal', 'finished', 'cancelled'];

describe('renderView', () => {
  it('never carries another member’s user id, in any phase, to any viewer', () => {
    const players = [playerRow(1), playerRow(2, { friend: true }), playerRow(3, { left_at: T }), playerRow(4, { removed: true })];
    for (const status of STATUSES) {
      for (const access of ['friends', 'open'] as const) {
        const game = gameRow({
          status,
          access,
          host_id: players[0]!.user_id,
          finished_at: status === 'finished' ? T : null,
          next_game_id: randomUUID(),
        });
        const answers: ViewAnswer[] = players.map((p) => ({ user_id: p.user_id, question_index: 0, choice: 1, correct: true }));
        for (const viewer of players.filter((p) => !p.removed)) {
          const json = JSON.stringify(
            renderView({ game, storyTitle: 't', storySlug: 's', players, viewerId: viewer.user_id, answers, now: T }),
          );
          for (const other of players) {
            if (other.user_id !== viewer.user_id) expect(json, `${status}/${access}`).not.toContain(other.user_id);
          }
        }
      }
    }
  });

  it('says what players are doing only as counts', () => {
    const players = [
      playerRow(1, { done_reading_at: T }),
      playerRow(2, { done_reading_at: T }),
      playerRow(3),
      playerRow(4, { away: true, done_reading_at: T }),
    ];
    const v = renderView({
      game: gameRow({ status: 'reading' }),
      storyTitle: 't',
      storySlug: 's',
      players,
      viewerId: players[2]!.user_id,
      answers: [],
      now: T,
    });
    // the away player is not counted, done or not
    expect(v.activeCount).toBe(3);
    expect(v.readingDoneCount).toBe(2);
    expect(v.meDoneReading).toBe(false);
    for (const p of v.players) {
      expect(Object.keys(p).sort()).toEqual(['avatarUrl', 'away', 'correct', 'gone', 'isHost', 'isMe', 'name', 'score', 'seat']);
    }
  });

  it('keeps the right answer out of an open question, and the scores where the last reveal left them', () => {
    const players = [playerRow(1), playerRow(2)];
    const answers: ViewAnswer[] = [{ user_id: players[0]!.user_id, question_index: 1, choice: plan[1]!.correctIndex, correct: true }];
    const v = renderView({
      game: gameRow({ status: 'question', current_index: 1 }),
      storyTitle: 't',
      storySlug: 's',
      players,
      viewerId: players[0]!.user_id,
      answers,
      now: T,
    });
    expect(v.question).toMatchObject({ index: 1, total: 3, myChoice: plan[1]!.correctIndex });
    expect(JSON.stringify(v.question)).not.toContain('correct');
    expect(v.reveal).toBeNull();
    expect(v.answeredCount).toBe(1);
    expect(v.players.map((p) => p.score)).toEqual([100, 200]);
  });

  it('reveals the answer, the evidence and how many got it, once the question is closed', () => {
    const players = [playerRow(1), playerRow(2), playerRow(3)];
    const answers: ViewAnswer[] = [
      { user_id: players[0]!.user_id, question_index: 0, choice: plan[0]!.correctIndex, correct: true },
      { user_id: players[1]!.user_id, question_index: 0, choice: (plan[0]!.correctIndex + 1) % 3, correct: false },
    ];
    const v = renderView({
      game: gameRow({ status: 'reveal', phase_ends_at: at(15) }),
      storyTitle: 't',
      storySlug: 's',
      players,
      viewerId: players[1]!.user_id,
      answers,
      now: T,
    });
    expect(v.reveal).toMatchObject({
      index: 0,
      correctIndex: plan[0]!.correctIndex,
      evidenceParagraph: 0,
      answeredCount: 2,
      correctCount: 1,
      myCorrect: false,
    });
    expect(v.question!.index).toBe(0);
    expect(v.results).toBeNull();
    expect(v.phaseEndsAt).toBeNull();
  });

  it('gives each viewer their own countdown: double for extra time; the untimed cap for "closes soon"', () => {
    const players = [playerRow(1), playerRow(2, { extra_time: true })];
    const game = gameRow({ status: 'question' });
    const view = (i: number, g = game) =>
      renderView({ game: g, storyTitle: 't', storySlug: 's', players, viewerId: players[i]!.user_id, answers: [], now: T });
    expect(view(0).phaseEndsAt).toBe(at(30).toISOString());
    expect(view(1).phaseEndsAt).toBe(at(60).toISOString());
    expect(view(1).extraTime).toBe(true);
    const untimed = gameRow({ status: 'question', timer_seconds: 0, phase_ends_at: at(180) });
    expect(view(0, untimed).phaseEndsAt).toBe(at(180).toISOString());
    expect(view(0, gameRow({ status: 'reading' })).phaseEndsAt).toBeNull();
  });

  it('shows the join code only while people can join, and never for solo', () => {
    const players = [playerRow(1)];
    const code = (status: StoryGameStatus, mode: 'solo' | 'group' = 'group') =>
      renderView({
        game: gameRow({ status, mode }),
        storyTitle: 't',
        storySlug: 's',
        players,
        viewerId: players[0]!.user_id,
        answers: [],
        now: T,
      }).code;
    expect(code('lobby')).toBe('ABC234');
    expect(code('reading')).toBe('ABC234');
    expect(code('question')).toBeNull();
    expect(code('reading', 'solo')).toBeNull();
  });

  it('carries results with the last reveal and after, never for a cancelled game, and no review once the plan is gone', () => {
    const players = [playerRow(1, { xp_awarded: 15, learning_counted: true }), playerRow(2), playerRow(3, { left_at: T })];
    const render = (over: Partial<GameRow>) =>
      renderView({
        game: gameRow({ current_index: 2, ...over }),
        storyTitle: 't',
        storySlug: 's',
        players,
        viewerId: players[0]!.user_id,
        answers: [],
        now: T,
      });
    const final = render({ status: 'reveal', finished_at: T });
    expect(final.results!.standings.map((s) => [s.seat, s.place])).toEqual([
      [3, 1],
      [2, 2],
      [1, 3],
    ]);
    expect(final.results!.me).toMatchObject({ place: 3, score: 100, xp: 15, learningCounted: true, total: 3 });
    expect(final.results!.review).toHaveLength(3);
    expect(render({ status: 'finished', finished_at: T, plan: null }).results!.review).toEqual([]);
    expect(render({ status: 'cancelled' }).results).toBeNull();
    expect(render({ status: 'reveal' }).results).toBeNull();
  });

  it('gives the host controls to the stand-in while the host is away', () => {
    const host = playerRow(1, { away: true });
    const players = [host, playerRow(2), playerRow(3)];
    const game = gameRow({ host_id: host.user_id });
    const asSeat = (i: number) =>
      renderView({ game, storyTitle: 't', storySlug: 's', players, viewerId: players[i]!.user_id, answers: [], now: T });
    expect(asSeat(1).isHost).toBe(true);
    expect(asSeat(2).isHost).toBe(false);
    expect(asSeat(0).isHost).toBe(false);
    expect(asSeat(1).players[0]).toMatchObject({ isHost: true, away: true });
  });
});

describe('mayShowIdentity', () => {
  const p = (over: Partial<ViewPlayer> = {}) => ({ friend: false, blocked: false, deleted: false, ...over });
  it('self, friends, and in an open game anyone without a block — and never a closed account', () => {
    expect(mayShowIdentity('friends', p(), true)).toBe(true);
    expect(mayShowIdentity('friends', p({ friend: true }), false)).toBe(true);
    expect(mayShowIdentity('friends', p(), false)).toBe(false);
    expect(mayShowIdentity('open', p(), false)).toBe(true);
    expect(mayShowIdentity('open', p({ blocked: true }), false)).toBe(false);
    expect(mayShowIdentity('friends', p({ friend: true, blocked: true }), false)).toBe(false);
    expect(mayShowIdentity('open', p({ deleted: true }), false)).toBe(false);
  });
});
