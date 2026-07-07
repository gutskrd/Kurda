import { z } from 'zod';
import type { RoomBus } from '../realtime/bus.js';
import type { RealtimeGateway } from '../realtime/gateway.js';
import type { MatchRecord } from './matchmaking.js';
import { selectQuestions, type GameQuestion } from './question-bank.js';

export type GamePhase = 'lobby' | 'countdown' | 'question' | 'reveal' | 'results';

export interface EngineOptions {
  lobbyMs?: number;
  countdownMs?: number;
  questionMs?: number;
  revealMs?: number;
  questionsPerGame?: number;
  /** Finished sessions stay snapshot-able this long. */
  resultsTtlMs?: number;
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
}

interface Session {
  roomId: string;
  phase: GamePhase;
  players: Map<string, PlayerState>;
  questions: GameQuestion[];
  questionIndex: number;
  questionOpenedAt: number;
  questionEndsAt: number;
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
  private readonly resultsTtlMs: number;

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
    this.resultsTtlMs = opts.resultsTtlMs ?? 60_000;

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
      });
    });
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
          },
        ]),
      ),
      questions: selectQuestions(record.roomId, this.questionsPerGame),
      questionIndex: -1,
      questionOpenedAt: 0,
      questionEndsAt: 0,
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

    if (command.type === 'answer' && session.phase === 'question') {
      const player = session.players.get(command.userId as string);
      const index = command.index as number;
      if (!player || index !== session.questionIndex) return;
      if (player.answers[index] !== undefined && player.answers[index] !== null) return;
      const receivedAtMs = (command.receivedAtMs as number) ?? Date.now();
      // window enforcement is server-side; late answers are dropped
      // (#52 adds the shared jitter grace on top of this line)
      if (receivedAtMs > session.questionEndsAt) return;

      player.answers[index] = command.choice as number;
      player.answeredAtMs[index] = receivedAtMs;
      void this.gateway.publish(session.roomId, {
        type: 'player_answered',
        userId: player.id,
        index,
      });
      const everyoneAnswered = [...session.players.values()].every(
        (p) => p.answers[index] !== undefined && p.answers[index] !== null,
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
    session.timer = setTimeout(() => this.closeQuestion(session), this.questionMs);
  }

  private closeQuestion(session: Session): void {
    if (session.phase !== 'question') return;
    clearTimeout(session.timer);
    session.phase = 'reveal';
    const index = session.questionIndex;
    const question = session.questions[index] as GameQuestion;
    for (const player of session.players.values()) {
      if (player.answers[index] === undefined) {
        player.answers[index] = null; // timed out
        player.answeredAtMs[index] = null;
      }
    }
    void this.gateway.publish(session.roomId, {
      type: 'reveal',
      index,
      correctIndex: question.correctIndex,
      answers: Object.fromEntries(
        [...session.players.values()].map((p) => [p.id, p.answers[index]]),
      ),
    });
    const isLast = index + 1 >= session.questions.length;
    session.timer = setTimeout(
      () => (isLast ? this.finish(session) : this.openQuestion(session, index + 1)),
      this.revealMs,
    );
  }

  private finish(session: Session): void {
    session.phase = 'results';
    const scores = [...session.players.values()].map((player) => ({
      userId: player.id,
      username: player.username,
      correct: session.questions.filter((q, i) => player.answers[i] === q.correctIndex).length,
    }));
    void this.gateway.publish(session.roomId, {
      type: 'results',
      // point scoring (speed bonuses, ratings) is the scoring engine's
      // job (#53); these are raw correct-counts
      provisional: true,
      scores,
    });
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
      return {
        ...base,
        scores: [...session.players.values()].map((player) => ({
          userId: player.id,
          correct: session.questions.filter((q, i) => player.answers[i] === q.correctIndex).length,
        })),
      };
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
