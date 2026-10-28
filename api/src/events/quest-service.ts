import type pg from 'pg';
import type { WalletService } from '../wallet/service.js';
import type { EventDef } from './window.js';
import {
  claimBlock,
  claimDeadline,
  evaluateQuest,
  parseQuests,
  type ClaimBlock,
  type QuestProgress,
  type QuestType,
} from './quest-logic.js';

/** Where quest progress is measured from — the existing ledgers, windowed. */
export interface QuestMetrics {
  earnedXp(userId: string, fromIso: string, toIso: string): Promise<number>;
  storyQuizzes(userId: string, fromIso: string, toIso: string): Promise<number>;
  lessonsCompleted(userId: string, fromIso: string, toIso: string): Promise<number>;
}

/** The subset of EventService quest claims needs. */
export interface EventLookup {
  byKey(key: string): Promise<EventDef | null>;
}

export interface QuestView extends QuestProgress {
  claimed: boolean;
  claimable: boolean;
}

export interface EventQuestsView {
  eventKey: string;
  name: string;
  endsAt: string;
  claimDeadline: string;
  quests: QuestView[];
}

export type ClaimResult =
  | { ok: true; claimed: boolean; reward: { zer?: number; gems?: number } }
  | { ok: false; code: 'NO_EVENT' | 'NO_QUEST' | ClaimBlock };

/**
 * Reads XP/games/lessons from the canonical ledgers, scoped to the event
 * window. Progress therefore always reflects the window, not when it was read —
 * final-second progress counts, and there's no per-action counter to drift.
 */
export class DbQuestMetrics implements QuestMetrics {
  constructor(private readonly pool: pg.Pool) {}

  async earnedXp(userId: string, fromIso: string, toIso: string): Promise<number> {
    const res = await this.pool.query<{ sum: string }>(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS sum FROM xp_ledger
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
      [userId, fromIso, toIso],
    );
    return Number(res.rows[0]?.sum ?? 0);
  }

  async storyQuizzes(userId: string, fromIso: string, toIso: string): Promise<number> {
    // story games finished in the window that counted as learning for this
    // player — the same test that paid them XP, so a quiz left half-answered
    // does not count here either
    const res = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM story_game_players p JOIN story_games g ON g.id = p.game_id
       WHERE p.user_id = $1 AND p.learning_counted AND g.finished_at >= $2 AND g.finished_at < $3`,
      [userId, fromIso, toIso],
    );
    return Number(res.rows[0]?.count ?? 0);
  }

  async lessonsCompleted(userId: string, fromIso: string, toIso: string): Promise<number> {
    const res = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM lesson_sessions
       WHERE user_id = $1 AND completed_at IS NOT NULL
         AND completed_at >= $2 AND completed_at < $3`,
      [userId, fromIso, toIso],
    );
    return Number(res.rows[0]?.count ?? 0);
  }
}

/**
 * Event quests + explicit reward claims (KUR-091). Progress is derived; only the
 * claim is stored. A claim pays Zêr/Gems in the same transaction as the claim
 * row insert, and the (user, event, quest) unique constraint makes paying twice
 * impossible even under a double-tap. Rewards remain claimable for a 72h grace
 * period after the event ends.
 */
export class QuestService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly events: EventLookup,
    private readonly wallet: WalletService,
    private readonly metrics: QuestMetrics,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private metric(type: QuestType, userId: string, from: string, to: string): Promise<number> {
    switch (type) {
      case 'earn_xp':
        return this.metrics.earnedXp(userId, from, to);
      case 'story_quizzes':
        return this.metrics.storyQuizzes(userId, from, to);
      case 'complete_lessons':
        return this.metrics.lessonsCompleted(userId, from, to);
    }
  }

  private async claimedIds(userId: string, eventKey: string): Promise<Set<string>> {
    const res = await this.pool.query<{ quest_id: string }>(
      `SELECT quest_id FROM event_quest_claims WHERE user_id = $1 AND event_key = $2`,
      [userId, eventKey],
    );
    return new Set(res.rows.map((r) => r.quest_id));
  }

  /** Progress + claim state for every quest of an event. */
  async progress(userId: string, eventKey: string): Promise<EventQuestsView | null> {
    const event = await this.events.byKey(eventKey);
    if (!event) return null;
    const defs = parseQuests(event.quests);
    const claimed = await this.claimedIds(userId, eventKey);
    const nowMs = this.now().getTime();
    const endsMs = Date.parse(event.endsAt);

    // quests of one kind (more XP, more lessons) differ only in their target:
    // each kind is counted once for all of them
    const counted = new Map<QuestType, Promise<number>>();
    const metricOf = (type: QuestType): Promise<number> => {
      let m = counted.get(type);
      if (!m) {
        m = this.metric(type, userId, event.startsAt, event.endsAt);
        counted.set(type, m);
      }
      return m;
    };
    const quests: QuestView[] = [];
    for (const def of defs) {
      const metric = await metricOf(def.type);
      const prog = evaluateQuest(def, metric);
      const isClaimed = claimed.has(def.id);
      quests.push({
        ...prog,
        claimed: isClaimed,
        claimable: !isClaimed && claimBlock(prog.complete, endsMs, nowMs) === null,
      });
    }

    return {
      eventKey: event.key,
      name: event.name,
      endsAt: event.endsAt,
      claimDeadline: new Date(claimDeadline(endsMs)).toISOString(),
      quests,
    };
  }

  /** Explicitly claim one quest's reward. Idempotent per (user, event, quest). */
  async claim(userId: string, eventKey: string, questId: string): Promise<ClaimResult> {
    const event = await this.events.byKey(eventKey);
    if (!event) return { ok: false, code: 'NO_EVENT' };
    const def = parseQuests(event.quests).find((q) => q.id === questId);
    if (!def) return { ok: false, code: 'NO_QUEST' };

    const metric = await this.metric(def.type, userId, event.startsAt, event.endsAt);
    const prog = evaluateQuest(def, metric);
    const block = claimBlock(prog.complete, Date.parse(event.endsAt), this.now().getTime());
    if (block) return { ok: false, code: block };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO event_quest_claims (user_id, event_key, quest_id, reward)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (user_id, event_key, quest_id) DO NOTHING
         RETURNING id`,
        [userId, eventKey, questId, JSON.stringify(def.reward)],
      );
      if (inserted.rowCount === 0) {
        // already claimed — pay nothing again
        await client.query('ROLLBACK');
        return { ok: true, claimed: false, reward: def.reward };
      }
      for (const currency of ['zer', 'gems'] as const) {
        const amount = def.reward[currency];
        if (amount && amount > 0) {
          await this.wallet.creditWithin(client, {
            userId,
            currency,
            amount,
            reason: 'event_quest',
            refId: `${eventKey}:${questId}`,
            idempotencyKey: `quest:${eventKey}:${questId}:${userId}:${currency}`,
          });
        }
      }
      await client.query('COMMIT');
      return { ok: true, claimed: true, reward: def.reward };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
