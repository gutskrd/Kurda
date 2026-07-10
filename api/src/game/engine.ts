import { z } from 'zod';
import type { RoomBus } from '../realtime/bus.js';
import type { RealtimeGateway } from '../realtime/gateway.js';
import type { MatchRecord } from './matchmaking.js';
import { selectQuestions, type GameQuestion } from './question-bank.js';
import { questionPoints, rankScores } from './scoring.js';
import { MODE_CONFIG, teamScoreboard, type GameMode } from './modes.js';
import { compensatedElapsed, isRttAnomalous, rttDistribution } from './latency.js';

export type GamePhase = 'lobby' | 'countdown' | 'question' | 'reveal' | 'results';

/**
 * Shared jitter grace (KUR-052): the server accepts answers up to this long
 * after the (cosmetic) question deadline, applied identically to every player
 * so a 50ms network hiccup never loses a fair answer.
 */
export const ANSWER_GRACE_MS = 300;

export interface EngineOptions {
  lobbyMs?: number;
  countdownMs?: number;
  questionMs?: number;
  revealMs?: number;
  questionsPerGame?: number;
  /** Server-side grace after the deadline; default ANSWER_GRACE_MS. */
  answerGraceMs?: number;
  /** Finished sessions stay snapshot-able this long. */
  resultsTtlMs?: number;
  /** Per-game RTT metrics sink for tuning + anomaly flags (KUR-057/058). */
  onGameMetrics?: (metrics: GameMetrics) => void;
}

export interface GameMetrics {
  roomId: string;
  mode: GameMode;
  rtt: { min: number; median: number; p95: number; max: number; count: number };
  /** userIds whose RTT looked implausible (sandbagging → KUR-058) */
  anomalies: string[];
}

interface PlayerState {
  id: string;
  username: string;
  rating: number;
  ready: boolean;
  /** chosen option per question; null = timed out / not answered */
  answers: Array<number | null>;
  /** SERVER receipt time per answer (feeds scoring, #52/#53) */
  answeredAtMs: Array<number | null>;
  /** running speed-weighted score, computed server-side only (#53) */
  points: number;
  /** cumulative answer time across the game (tiebreak) */
  cumulativeMs: number;
  /** last server-measured RTT at answer time (latency compensation, #57) */
  rttMs: number;
  /** RTT samples seen this game (per-game metrics, #57) */
  rttSamples: number[];
}

interface Session {
  roomId: string;
  phase: GamePhase;
  players: Map<string, PlayerState>;
  questions: GameQuestion[];
  questionIndex: number;
  questionOpenedAt: number;
  questionEndsAt: number;
  /** game mode + teams (KUR-055); solo modes are one player per team */
  mode: GameMode;
  teams: string[][];
  timer?: NodeJS.Timeout;
}

const readySchema = z.object({ type: z.literal('ready'), room: z.string().max(80) });
const answerSchema = z.object({
  type: z.literal('answer'),
  room: z.string().max(80),
  index: z.number().int().min(0).max(50),
  choice: z.number().int().min(0).max(3),
});

/**
 * Server-driven 1v1 game session (KUR-051).
 *
 * lobby → countdown → (question → reveal) ×N → results
 *
 * Every transition is server-timed: clients only ever send 'ready' and
 * 'answer'; a player who never sends anything simply times out each
 * question and the game completes for the opponent. The node that made
 * the match owns the session; client messages arriving on other nodes
 * are forwarded over the bus as cmd:{roomId} events.
 */
export class GameEngine {
  private readonly sessions = new Map<string, Session>();
  private readonly lobbyMs: number;
  private readonly countdownMs: number;
  private readonly questionMs: number;
  private readonly revealMs: number;
  private readonly questionsPerGame: number;
  private readonly answerGraceMs: number;
  private readonly resultsTtlMs: number;
  private readonly onGameMetrics?: (metrics: GameMetrics) => void;

  constructor(
    private readonly gateway: RealtimeGateway,
    bus: RoomBus,
    opts: EngineOptions = {},
  ) {
    this.lobbyMs = opts.lobbyMs ?? 10_000;
    this.countdownMs = opts.countdownMs ?? 3_000;
    this.questionMs = opts.questionMs ?? 10_000;
    this.revealMs = opts.revealMs ?? 3_000;
    this.questionsPerGame = opts.questionsPerGame ?? 5;
    this.answerGraceMs = opts.answerGraceMs ?? ANSWER_GRACE_MS;
    this.resultsTtlMs = opts.resultsTtlMs ?? 60_000;
    this.onGameMetrics = opts.onGameMetrics;

    // commands forwarded from other nodes
    bus.onEvent((roomId, event) => {
      if (!roomId.startsWith('cmd:')) return;
      const session = this.sessions.get(roomId.slice(4));
      if (!session) return;
      this.handleCommand(session, event as Record<string, unknown>);
    });

    gateway.onClientMessage('ready', (userId, payload) => {
      const parsed = readySchema.safeParse(payload);
      if (!parsed.success) return;
      void this.forward(parsed.data.room, { type: 'ready', userId });
    });
    gateway.onClientMessage('answer', (userId, payload) => {
      const parsed = answerSchema.safeParse(payload);
      if (!parsed.success) return;
      void this.forward(parsed.data.room, {
        type: 'answer',
        userId,
        index: parsed.data.index,
        choice: parsed.data.choice,
        // receipt timestamp is taken on the receiving node, BEFORE any
        // bus hop, so forwarding latency never penalizes the player
        receivedAtMs: Date.now(),
        // RTT measured server-side on the node holding the connection (#57);
        // never client-supplied, so it can't be forged
        rttMs: gateway.rttFor(userId) ?? 0,
      });
    });

    // mid-question disconnect → auto-wrong for the open question (#57)
    gateway.onDisconnect((userId) => this.handleDisconnect(userId));
  }

  private handleDisconnect(userId: string): void {
    for (const session of this.sessions.values()) {
      const player = session.players.get(userId);
      if (!player || session.phase !== 'question') continue;
      const index = session.questionIndex;
      if (player.answers[index] !== undefined) continue; // already answered/locked
      player.answers[index] = null; // auto-wrong, locked (resume on next, #57)
      player.answeredAtMs[index] = null;
      void this.gateway.publish(session.roomId, { type: 'player_left', userId, index });
    }
  }

  private async forward(roomId: string, command: Record<string, unknown>): Promise<void> {
    const session = this.sessions.get(roomId);
    if (session) {
      this.handleCommand(session, command);
      return;
    }
    await this.gateway.publish(`cmd:${roomId}`, command as never);
  }

  startSession(record: MatchRecord): void {
    const session: Session = {
      roomId: record.roomId,
      phase: 'lobby',
      players: new Map(
        record.players.map((p) => [
          p.id,
          {
            ...p,
            ready: false,
            answers: [],
            answeredAtMs: [],
            points: 0,
            cumulativeMs: 0,
            rttMs: 0,
            rttSamples: [],
          },
        ]),
      ),
      questions: selectQuestions(record.roomId, this.questionsPerGame, record.questionFilter),
      questionIndex: -1,
      questionOpenedAt: 0,
      questionEndsAt: 0,
      mode: record.mode,
      teams: record.teams.length > 0 ? record.teams : record.players.map((p) => [p.id]),
    };
    this.sessions.set(record.roomId, session);

    void this.gateway.publish(record.roomId, {
      type: 'lobby',
      players: [...session.players.values()].map((p) => ({
        id: p.id,
        username: p.username,
        rating: p.rating,
      })),
      questionCount: session.questions.length,
      startsBy: Date.now() + this.lobbyMs,
    });
    session.timer = setTimeout(() => this.beginCountdown(session), this.lobbyMs);
  }

  private handleCommand(session: Session, command: Record<string, unknown>): void {
    if (command.type === 'ready' && session.phase === 'lobby') {
      const player = session.players.get(command.userId as string);
      if (!player || player.ready) return;
      player.ready = true;
      void this.gateway.publish(session.roomId, { type: 'player_ready', userId: player.id });
      if ([...session.players.values()].every((p) => p.ready)) {
        this.beginCountdown(session);
      }
      return;
    }

    if (command.type === 'answer') {
      const player = session.players.get(command.userId as string);
      const index = command.index as number;
      if (!player || index !== session.questionIndex) return; // stale/unknown question
      const receivedAtMs = (command.receivedAtMs as number) ?? Date.now();

      // Window enforcement is server-side (the client timer is cosmetic). The
      // shared jitter grace is added to the deadline identically for everyone;
      // beyond it — or once the question has closed — the answer is rejected
      // with a specific code rather than silently dropped (KUR-052). Checked
      // before the lock so a closed-question answer is always rejected.
      const cutoff = session.questionEndsAt + this.answerGraceMs;
      if (session.phase !== 'question' || receivedAtMs > cutoff) {
        void this.gateway.notifyUser(player.id, { type: 'answer_rejected', index, code: 'ANSWER_TOO_LATE' });
        return;
      }

      // in-window: once anything is recorded (a choice or a disconnect
      // auto-wrong) the slot is locked — no re-answer (#57)
      if (player.answers[index] !== undefined) return;

      // capture server-measured RTT for latency compensation + metrics (#57)
      const rtt = (command.rttMs as number) ?? 0;
      player.rttMs = rtt;
      if (rtt > 0) player.rttSamples.push(rtt);
      player.answers[index] = command.choice as number;
      player.answeredAtMs[index] = receivedAtMs;
      void this.gateway.publish(session.roomId, {
        type: 'player_answered',
        userId: player.id,
        index,
      });
      // a disconnected (auto-wrong) player counts as done for early advance
      const everyoneAnswered = [...session.players.values()].every(
        (p) => p.answers[index] !== undefined,
      );
      if (everyoneAnswered) this.closeQuestion(session); // early advance
    }
  }

  private beginCountdown(session: Session): void {
    if (session.phase !== 'lobby') return;
    clearTimeout(session.timer);
    session.phase = 'countdown';
    void this.gateway.publish(session.roomId, {
      type: 'countdown',
      startsAt: Date.now() + this.countdownMs,
    });
    session.timer = setTimeout(() => this.openQuestion(session, 0), this.countdownMs);
  }

  private openQuestion(session: Session, index: number): void {
    session.phase = 'question';
    session.questionIndex = index;
    session.questionOpenedAt = Date.now();
    session.questionEndsAt = session.questionOpenedAt + this.questionMs;
    const question = session.questions[index] as GameQuestion;
    void this.gateway.publish(session.roomId, {
      type: 'question',
      index,
      total: session.questions.length,
      prompt: question.prompt,
      options: question.options,
      endsAt: session.questionEndsAt,
      // correctIndex deliberately absent until reveal
    });
    // hold the question open through the shared grace so within-grace answers
    // are still accepted while the phase is 'question' (KUR-052)
    session.timer = setTimeout(() => this.closeQuestion(session), this.questionMs + this.answerGraceMs);
  }

  private closeQuestion(session: Session): void {
    if (session.phase !== 'question') return;
    clearTimeout(session.timer);
    session.phase = 'reveal';
    const index = session.questionIndex;
    const question = session.questions[index] as GameQuestion;
    // score this question server-side, then tally the running scoreboard (#53)
    for (const player of session.players.values()) {
      if (player.answers[index] === undefined) {
        player.answers[index] = null; // timed out
        player.answeredAtMs[index] = null;
      }
      const at = player.answeredAtMs[index];
      const raw =
        at == null ? this.questionMs : Math.min(this.questionMs, Math.max(0, at - session.questionOpenedAt));
      // credit back a capped RTT/2 so latency doesn't cost the speed bonus (#57)
      const elapsed = at == null ? raw : compensatedElapsed(raw, player.rttMs);
      const correct = player.answers[index] === question.correctIndex;
      player.points += questionPoints({ correct, elapsedMs: elapsed, windowMs: this.questionMs });
      player.cumulativeMs += elapsed;
    }
    void this.gateway.publish(session.roomId, {
      type: 'reveal',
      index,
      correctIndex: question.correctIndex,
      answers: Object.fromEntries(
        [...session.players.values()].map((p) => [p.id, p.answers[index]]),
      ),
    });
    // running scoreboard pushed after every reveal (#53); team totals too (#55)
    void this.gateway.publish(session.roomId, {
      type: 'scoreboard',
      index,
      scores: this.scoreboard(session),
      teams: this.teamBoard(session),
    });
    const isLast = index + 1 >= session.questions.length;
    session.timer = setTimeout(
      () => (isLast ? this.finish(session) : this.openQuestion(session, index + 1)),
      this.revealMs,
    );
  }

  /** Ranked speed-weighted per-player scoreboard, most points first (tie → faster). */
  private scoreboard(session: Session): unknown[] {
    return rankScores(this.playerLines(session));
  }

  private playerLines(session: Session): Array<{
    userId: string; username: string; points: number; cumulativeMs: number; correct: number;
  }> {
    return [...session.players.values()].map((p) => ({
      userId: p.id,
      username: p.username,
      points: p.points,
      cumulativeMs: p.cumulativeMs,
      correct: session.questions.filter((q, i) => p.answers[i] === q.correctIndex).length,
    }));
  }

  /** Ranked team totals for team modes (KUR-055); null for solo/FFA. */
  private teamBoard(session: Session): unknown[] | null {
    if (MODE_CONFIG[session.mode].teamSize <= 1) return null;
    return teamScoreboard(this.playerLines(session), session.teams);
  }

  private finish(session: Session): void {
    session.phase = 'results';
    void this.gateway.publish(session.roomId, {
      type: 'results',
      // final, authoritative speed-weighted scores (#53) + team totals (#55)
      provisional: false,
      mode: session.mode,
      scores: this.scoreboard(session),
      teams: this.teamBoard(session),
    });

    // per-game RTT distribution + sandbagging flags for tuning (#57/#58)
    if (this.onGameMetrics) {
      const players = [...session.players.values()];
      const samples = players.flatMap((p) => p.rttSamples);
      const anomalies = players.filter((p) => isRttAnomalous(p.rttMs)).map((p) => p.id);
      this.onGameMetrics({ roomId: session.roomId, mode: session.mode, rtt: rttDistribution(samples), anomalies });
    }
    session.timer = setTimeout(() => this.sessions.delete(session.roomId), this.resultsTtlMs);
  }

  /** Reconnect snapshot — never leaks the open question's answer. */
  getSnapshot(roomId: string, userId: string): Record<string, unknown> | null {
    const session = this.sessions.get(roomId);
    if (!session || !session.players.has(userId)) return null;
    const base = {
      roomId,
      phase: session.phase,
      questionIndex: session.questionIndex,
      questionCount: session.questions.length,
      players: [...session.players.values()].map((p) => ({
        id: p.id,
        username: p.username,
        rating: p.rating,
        ready: p.ready,
        answeredCurrent:
          session.questionIndex >= 0 ? p.answers[session.questionIndex] != null : false,
      })),
    };
    if (session.phase === 'question') {
      const question = session.questions[session.questionIndex] as GameQuestion;
      return {
        ...base,
        currentQuestion: {
          index: session.questionIndex,
          prompt: question.prompt,
          options: question.options,
          endsAt: session.questionEndsAt,
        },
      };
    }
    if (session.phase === 'results') {
      return { ...base, scores: this.scoreboard(session) };
    }
    return base;
  }

  /** Test/ops hook. */
  activeSessions(): number {
    return this.sessions.size;
  }

  stopAll(): void {
    for (const session of this.sessions.values()) clearTimeout(session.timer);
    this.sessions.clear();
  }
}
