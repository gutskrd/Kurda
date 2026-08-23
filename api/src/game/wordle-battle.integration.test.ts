/** Wordle Battle multiplayer flow against real Postgres (CI job). KUR-306. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { WordleBattleService } from './wordle-battle-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

// 5-letter words for the medium pool + valid guesses
const MEDIUM = ['malan', 'kurdi', 'rojan', 'zarok', 'aveji', 'bajar', 'welat', 'zanik'];

describe.skipIf(!DATABASE_URL)('wordle battle (integration)', () => {
  let pool: pg.Pool;
  let svc: WordleBattleService;
  const entryIds: string[] = [];
  const userIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);

  const makeUser = async (): Promise<string> => {
    const n = userIds.length;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
      [`wb_${n}_${suffix}@it.kurda.app`, `wb_${n}_${suffix}`],
    );
    userIds.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  };
  const targetOf = async (battleId: string): Promise<string> =>
    (await pool.query<{ target: string }>(`SELECT target FROM wordle_battles WHERE id = $1`, [battleId])).rows[0]!.target;
  const ledgerXp = async (userId: string): Promise<number> =>
    Number((await pool.query<{ sum: string }>(`SELECT COALESCE(SUM(amount),0) sum FROM xp_ledger WHERE user_id = $1 AND source = 'wordle_battle'`, [userId])).rows[0]!.sum);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    svc = new WordleBattleService(pool);
    for (const w of MEDIUM) {
      const r = await pool.query<{ id: string }>(
        `INSERT INTO dict_entries (headword, headword_normalized, dialect) VALUES ($1,$1,'kurmanji') RETURNING id`,
        [w],
      );
      entryIds.push(r.rows[0]!.id);
    }
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await pool.end();
  });

  it('runs a full match: same word, hidden opponents, placement + XP', async () => {
    const host = await makeUser();
    const p2 = await makeUser();
    const created = await svc.create(host, { difficulty: 'medium' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const battleId = created.battle.id;

    // can't guess before start
    const early = await svc.guess(battleId, host, MEDIUM[0]!);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.reason).toBe('not-active');

    // join + start
    expect((await svc.join(battleId, p2)).ok).toBe(true);
    // a non-host can't start; then the host starts
    expect((await svc.start(battleId, p2)).ok).toBe(false);
    expect((await svc.start(battleId, host)).ok).toBe(true);

    // can't join once active
    const late = await makeUser();
    const lateJoin = await svc.join(battleId, late);
    expect(lateJoin.ok).toBe(false);
    if (!lateJoin.ok) expect(lateJoin.reason).toBe('not-open');

    const target = await targetOf(battleId);

    // host solves in one guess
    const win = await svc.guess(battleId, host, target);
    expect(win.ok).toBe(true);
    if (win.ok) {
      expect(win.battle.me!.solved).toBe(true);
      // opponents expose progress/finish only — never their letters
      const opp = win.battle.opponents.find((o) => o.userId === p2)!;
      expect(opp).toBeTruthy();
      expect(opp).not.toHaveProperty('guesses');
      // target still hidden — the match isn't over (p2 still playing)
      expect(win.battle.target).toBeNull();
    }

    // p2 exhausts six wrong guesses → lost; that finalises the match
    const wrongs = MEDIUM.filter((w) => w !== target).slice(0, 6);
    for (const w of wrongs) await svc.guess(battleId, p2, w);
    const p2state = await svc.state(battleId, p2);
    expect(p2state.status).toBe('finished');
    expect(p2state.target).toBe(target); // revealed post-match

    // BOLA: a non-participant cannot read another battle's results
    const outsider = await makeUser();
    expect(await svc.results(battleId, outsider)).toBeNull();

    // results: host wins (rank 1) with more XP than the non-solver
    const results = await svc.results(battleId, host);
    expect(results).toBeTruthy();
    const hostRow = results!.ranking.find((r) => r.userId === host)!;
    const p2Row = results!.ranking.find((r) => r.userId === p2)!;
    expect(hostRow.rank).toBe(1);
    expect(hostRow.solved).toBe(true);
    expect(p2Row.solved).toBe(false);
    expect(hostRow.guesses.length).toBe(1); // full history revealed
    expect(hostRow.xpAwarded!).toBeGreaterThan(p2Row.xpAwarded!);

    // XP actually landed in the ledger, and is idempotent (no double-award)
    expect(await ledgerXp(host)).toBe(hostRow.xpAwarded);
    expect(await ledgerXp(p2)).toBe(p2Row.xpAwarded);
  });

  it('rejects guesses from a non-member and needs two players to start', async () => {
    const host = await makeUser();
    const created = await svc.create(host, { difficulty: 'medium' });
    if (!created.ok) return;
    // solo can't start
    const start = await svc.start(created.battle.id, host);
    expect(start.ok).toBe(false);
    if (!start.ok) expect(start.reason).toBe('need-two');

    const stranger = await makeUser();
    const g = await svc.guess(created.battle.id, stranger, MEDIUM[0]!);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe('not-active'); // not started yet
  });
});
