import type pg from 'pg';
import type { WalletService } from '../wallet/service.js';
import { assertEconomyNotHeld } from '../economy/standing.js';
import { earnWithin, earnsZer } from '../earn/service.js';
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
  /** the quests pay Zêr, which only members earn, so for this viewer their Zêr is left out */
  zerForMembers: boolean;
}

export type ClaimResult =
  | { ok: true; claimed: boolean; reward: { zer?: number } }
  | { ok: false; code: 'NO_EVENT' | 'NO_QUEST' | ClaimBlock };

/** Reads XP, games and lessons from their ledgers over the event window, so there is no per-action counter to drift. */
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
    // Story games finished in the window that counted as learning, by the same test that paid them XP.
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
 * Event quests and reward claims. Progress is derived; only the claim is stored. A claim pays earned Zêr, under the daily
 * cap, in the same transaction as its row, and the (user, event, quest) unique constraint makes paying twice impossible
 * even on a double tap. Rewards stay claimable for 72 hours after the event ends.
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

    // Quests of one kind differ only in their target, so each kind is counted once.
    const counted = new Map<QuestType, Promise<number>>();
    const metricOf = (type: QuestType): Promise<number> => {
      let m = counted.get(type);
      if (!m) {
        m = this.metric(type, userId, event.startsAt, event.endsAt);
        counted.set(type, m);
      }
      return m;
    };
    const member = await earnsZer(this.pool, userId, this.now());
    let zerForMembers = false;
    const quests: QuestView[] = [];
    for (const def of defs) {
      const metric = await metricOf(def.type);
      const prog = evaluateQuest(def, metric);
      const isClaimed = claimed.has(def.id);
      // a reward nobody but a member can have is not shown to anyone else as theirs to win
      const zer = (prog.reward.zer ?? 0) > 0;
      if (zer && !member) zerForMembers = true;
      quests.push({
        ...prog,
        reward: zer && !member ? {} : prog.reward,
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
      zerForMembers,
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
    // a confirmed bot or a payment-fraud hold is paid nothing (economy/standing.ts)
    await assertEconomyNotHeld(this.pool, userId, 'rewards');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
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
      let reward = def.reward;
      if (def.reward.zer && def.reward.zer > 0) {
        const paid = await earnWithin(client, this.wallet, {
          userId,
          amount: def.reward.zer,
          reason: 'event_quest',
          refId: `${eventKey}:${questId}`,
          idempotencyKey: `quest:${eventKey}:${questId}:${userId}:zer`,
          now: this.now(),
        });
        // the claim records what was paid, which the daily cap can make less than the quest offers
        if (paid.granted !== def.reward.zer) {
          reward = paid.granted > 0 ? { zer: paid.granted } : {};
          await client.query(`UPDATE event_quest_claims SET reward = $2::jsonb WHERE id = $1`, [inserted.rows[0]!.id, JSON.stringify(reward)]);
        }
      }
      await client.query('COMMIT');
      return { ok: true, claimed: true, reward };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
