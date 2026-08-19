/** Anti-cheat accumulation + review logging against real Postgres. KUR-058. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { AntiCheatService } from './anti-cheat-service.js';
import type { PlayerAnswerEvidence } from './engine.js';
import { IMPOSSIBLE_MS } from './anti-cheat.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('anti-cheat (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let svc: AntiCheatService;
  let cheaterId: string;
  let cleanId: string;
  const emails: string[] = [];
  const suffix = Date.now().toString(36);

  async function makeUser(tag: string): Promise<string> {
    const email = `ac_${suffix}_${tag}@it.kurda.app`;
    emails.push(email);
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, username: `ac_${suffix}_${tag}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: `10.24.0.${emails.length}`,
    });
    return reg.json().user.id;
  }

  const evidence = (userId: string, answers: PlayerAnswerEvidence['answers']): PlayerAnswerEvidence => ({
    userId, answers, rttAnomalies: 0,
  });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    svc = new AntiCheatService(pool);
    cheaterId = await makeUser('cheat');
    cleanId = await makeUser('clean');
  });

  afterAll(async () => {
    if (emails.length) await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [emails]);
    await pool.end();
    await app.close();
  });

  it('does not flag or log a normal game', async () => {
    const v = await svc.recordGame('match:clean', evidence(cleanId, [
      { index: 0, elapsedMs: 3000, correct: true },
      { index: 1, elapsedMs: 5000, correct: false },
    ]));
    expect(v.flags).toHaveLength(0);
    const rows = await pool.query(`SELECT 1 FROM cheat_reviews WHERE user_id = $1`, [cleanId]);
    expect(rows.rowCount).toBe(0);
  });

  it('accumulates impossible-timing across games and shadow-flags with evidence', async () => {
    // several games of sub-100ms answers → impossible-timing flag
    for (let g = 0; g < 5; g++) {
      const answers = Array.from({ length: 5 }, (_, i) => ({ index: i, elapsedMs: IMPOSSIBLE_MS - 20, correct: true }));
      await svc.recordGame(`match:c${g}`, evidence(cheaterId, answers));
    }
    const stats = await pool.query<{ impossible_count: number; questions_answered: number }>(
      `SELECT impossible_count, questions_answered FROM cheat_stats WHERE user_id = $1`,
      [cheaterId],
    );
    expect(stats.rows[0]!.impossible_count).toBe(25);

    const review = await pool.query<{ shadow_flagged: boolean; confidence: number; evidence: unknown }>(
      `SELECT shadow_flagged, confidence, evidence FROM cheat_reviews
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [cheaterId],
    );
    expect(review.rowCount).toBeGreaterThan(0);
    expect(review.rows[0]!.shadow_flagged).toBe(true);
    expect(review.rows[0]!.evidence).toBeTruthy(); // full timing evidence stored

    const pending = await svc.pendingReviews();
    expect(pending.some((r) => (r as { user_id: string }).user_id === cheaterId)).toBe(true);
  });
});
