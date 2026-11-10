/**
 * Who the economy pays (economy/standing.ts), against real Postgres: the
 * automatic Gem grants skip a closed, banned, confirmed-bot, shadow-flagged
 * or fraud-held account silently, and a confirmed bot or a fraud-held
 * account asking for a reward is told it is paused — while everyone else is
 * paid as before.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { WalletService } from '../wallet/service.js';
import { GemService } from '../gems/service.js';
import { DailyRewardService } from '../rewards/service.js';
import { StreakService } from '../streaks/service.js';
import { DailyQuestService } from '../quests/service.js';
import { questId } from '../quests/daily.js';
import { localDate } from '../streaks/streak-logic.js';
import { QuestService } from '../events/quest-service.js';
import type { EventDef } from '../events/window.js';
import { makeLearner, removeLearners, type TestLearner } from '../test/progress.js';
import { isEconomyBlocked, isEconomyHeld } from './standing.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('who the economy pays (integration)', () => {
  let pool: pg.Pool;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  const p: Record<string, TestLearner> = {};
  const gemRule = `standing_${suffix}`;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    for (const tag of ['fine', 'cheat', 'bot', 'suspect', 'held', 'banned', 'lapsed', 'closed']) {
      p[tag] = await makeLearner(pool, `est${tag}${suffix}`);
    }
    await pool.query(
      `INSERT INTO cheat_reviews (user_id, room_id, flags, evidence, confidence, shadow_flagged)
       VALUES ($1, 'test', '[]'::jsonb, '{}'::jsonb, 1.0, true)`,
      [p.cheat!.id],
    );
    await pool.query(`INSERT INTO bot_scores (user_id, score, tier, flagged, status) VALUES ($1, 0.99, 'flagged', true, 'confirmed')`, [
      p.bot!.id,
    ]);
    // flagged by the scorer and not yet looked at: not a confirmed bot, so still paid
    await pool.query(`INSERT INTO bot_scores (user_id, score, tier, flagged, status) VALUES ($1, 0.91, 'flagged', true, 'active')`, [
      p.suspect!.id,
    ]);
    await pool.query(`INSERT INTO account_holds (user_id, reason) VALUES ($1, 'VELOCITY')`, [p.held!.id]);
    await pool.query(`UPDATE users SET banned_at = now(), banned_until = now() + interval '1 day' WHERE id = $1`, [p.banned!.id]);
    // a suspension that is over is no ban
    await pool.query(`UPDATE users SET banned_at = now() - interval '2 days', banned_until = now() - interval '1 day' WHERE id = $1`, [
      p.lapsed!.id,
    ]);
    await pool.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [p.closed!.id]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM gem_rules WHERE key = $1`, [gemRule]);
    await removeLearners(pool, `est%${suffix}@it.kurda.app`);
    await pool.end();
  });

  it('says who is blocked from being paid, and who is paused from asking', async () => {
    const blocked: Record<string, boolean> = {};
    const held: Record<string, boolean> = {};
    for (const [tag, who] of Object.entries(p)) {
      blocked[tag] = await isEconomyBlocked(pool, who.id);
      held[tag] = await isEconomyHeld(pool, who.id);
    }
    expect(blocked).toEqual({ fine: false, cheat: true, bot: true, suspect: false, held: true, banned: true, lapsed: false, closed: true });
    // only what the owner already knows about is said to them
    expect(held).toEqual({ fine: false, cheat: false, bot: true, suspect: false, held: true, banned: false, lapsed: false, closed: false });
    // somebody who does not exist is never paid
    expect(await isEconomyBlocked(pool, '00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('grants no automatic Gems to a blocked account, silently, and pays everyone else', async () => {
    const gems = new GemService(pool, wallet);
    // a rule of this suite's own, switched on: an account's standing is asked only once a rule would pay
    await gems.upsertRule({ key: gemRule, amount: 15, dailyCap: null, cooldownSeconds: 0, active: true });
    for (const tag of ['cheat', 'bot', 'held', 'banned', 'closed']) {
      const who = p[tag]!;
      expect(await gems.grant(who.id, gemRule, `standing:${who.id}`), tag).toEqual({ granted: 0, cappedBy: 'restricted' });
      expect((await wallet.balances(who.id)).gems, tag).toBe(0);
    }
    for (const tag of ['fine', 'suspect', 'lapsed']) {
      const who = p[tag]!;
      const result = await gems.grant(who.id, gemRule, `standing:${who.id}`);
      expect(result, tag).toEqual({ granted: 15, cappedBy: 'none' });
      expect((await wallet.balances(who.id)).gems, tag).toBe(15);
    }
  });

  it('tells a confirmed bot and a fraud-held account that rewards are paused, and pays them nothing', async () => {
    const now = new Date();
    const day = localDate(now, 'UTC');
    const streaks = new StreakService(pool);
    const rewards = new DailyRewardService(pool, wallet);
    const quests = new DailyQuestService(pool, wallet);
    const event: EventDef = {
      id: `est-${suffix}`,
      key: `est-event-${suffix}`,
      name: 'Standing',
      type: 'cultural',
      startsAt: new Date(Date.now() - 3_600_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      priority: 1,
      theme: 'newroz',
      quests: [{ id: 'xp', type: 'earn_xp', count: 10, reward: { zer: 30 } }],
      rewards: {},
      enabled: true,
    } as EventDef;
    const metrics = { earnedXp: async () => 10, storyQuizzes: async () => 0, lessonsCompleted: async () => 0 };
    const eventQuests = new QuestService(pool, { byKey: async () => event }, wallet, metrics);

    for (const tag of ['bot', 'held', 'fine']) {
      const who = p[tag]!;
      await streaks.recordActivity(who.id, 'UTC', now);
      await pool.query(
        `INSERT INTO user_quests (user_id, day, kind, target, chest, progress, done_at) VALUES ($1, $2, 'lessons', 1, 'common', 1, now())`,
        [who.id, day],
      );
    }
    for (const tag of ['bot', 'held']) {
      const who = p[tag]!;
      const before = await wallet.balances(who.id);
      await expect(rewards.claim(who.id, now)).rejects.toMatchObject({ code: 'REWARDS_PAUSED', statusCode: 403 });
      await expect(quests.claim(who.id, questId(day, 'lessons'), now)).rejects.toMatchObject({ code: 'REWARDS_PAUSED' });
      await expect(eventQuests.claim(who.id, event.key, 'xp')).rejects.toMatchObject({ code: 'REWARDS_PAUSED' });
      expect(await wallet.balances(who.id)).toEqual(before);
    }
    // and an account in good standing claims all three
    const fine = p.fine!;
    await rewards.claim(fine.id, now);
    await quests.claim(fine.id, questId(day, 'lessons'), now);
    expect(await eventQuests.claim(fine.id, event.key, 'xp')).toMatchObject({ ok: true, claimed: true });
    await pool.query(`DELETE FROM event_quest_claims WHERE event_key = $1`, [event.key]);
  });
});
