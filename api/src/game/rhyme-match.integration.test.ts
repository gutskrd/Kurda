/** Rhyme multiplayer (1v1 / FFA) flow against real Postgres (CI job). KUR-299. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { RhymeMatchService } from './rhyme-match-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

// four mutually-rhyming '-ul' words: whichever the server picks as the prompt,
// the other three are valid rhyming submissions.
const RHYMES = ['gul', 'kul', 'pul', 'bul'];

describe.skipIf(!DATABASE_URL)('rhyme match (integration)', () => {
  let pool: pg.Pool;
  const entryIds: string[] = [];
  const userIds: string[] = [];
  const suffix = Math.random().toString(36).slice(2, 8);
  const clock = { t: new Date('2026-08-18T12:00:00Z') };
  const svc = (): RhymeMatchService => new RhymeMatchService(pool, { now: () => clock.t });

  const makeUser = async (): Promise<string> => {
    const n = userIds.length;
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
      [`rm_${n}_${suffix}@it.kurda.app`, `rm_${n}_${suffix}`],
    );
    userIds.push(res.rows[0]!.id);
    return res.rows[0]!.id;
  };
  const promptOf = async (matchId: string): Promise<string> =>
    (await pool.query<{ prompt: string }>(`SELECT prompt FROM rhyme_matches WHERE id = $1`, [matchId])).rows[0]!.prompt;
  const ledgerXp = async (userId: string): Promise<number> =>
    Number((await pool.query<{ sum: string }>(`SELECT COALESCE(SUM(amount),0) sum FROM xp_ledger WHERE user_id = $1 AND source = 'rhyme_match'`, [userId])).rows[0]!.sum);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    for (const w of RHYMES) {
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

  it('runs a full match: shared prompt, live scoreboard, placement + XP by score', async () => {
    clock.t = new Date('2026-08-18T12:00:00Z');
    const host = await makeUser();
    const p2 = await makeUser();
    const created = await svc().create(host, { dialect: 'kurmanci', windowMs: 60_000 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const matchId = created.match.id;
    expect(created.match.prompt).toBeNull(); // hidden in the lobby

    // submit before start → not active
    const early = await svc().submit(matchId, host, RHYMES[0]!);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.reason).toBe('not-active');

    expect((await svc().join(matchId, p2)).ok).toBe(true);
    expect((await svc().start(matchId, p2)).ok).toBe(false); // non-host
    const started = await svc().start(matchId, host);
    expect(started.ok).toBe(true);
    if (started.ok) expect(started.match.prompt).not.toBeNull(); // revealed on start

    // can't join once active
    const late = await makeUser();
    const lateJoin = await svc().join(matchId, late);
    expect(lateJoin.ok).toBe(false);
    if (!lateJoin.ok) expect(lateJoin.reason).toBe('not-open');

    const prompt = await promptOf(matchId);
    const rhymes = RHYMES.filter((w) => w !== prompt); // three valid rhyming words

    // submitting the prompt itself is rejected; a real rhyme scores
    const isPrompt = await svc().submit(matchId, host, prompt);
    expect(isPrompt.ok).toBe(true);
    if (isPrompt.ok) expect(isPrompt.result.reason).toBe('is-prompt');

    // host scores two rhymes; p2 scores one → host leads
    for (const w of rhymes.slice(0, 2)) {
      const r = await svc().submit(matchId, host, w);
      expect(r.ok && r.result.accepted).toBe(true);
    }
    const p2sub = await svc().submit(matchId, p2, rhymes[0]!);
    expect(p2sub.ok && p2sub.result.accepted).toBe(true);

    // a player can't reuse their own accepted word
    const dup = await svc().submit(matchId, host, rhymes[0]!);
    expect(dup.ok).toBe(true);
    if (dup.ok) expect(dup.result.reason).toBe('already-used');

    // live scoreboard is shared (both scores visible)
    const view = await svc().state(matchId, p2);
    expect(view.status).toBe('active');
    const hostScore = view.scoreboard.find((s) => s.userId === host)!;
    expect(hostScore.accepted).toBe(2);

    // window elapses → results finalize: host rank 1, more XP than p2
    clock.t = new Date(clock.t.getTime() + 60_001);
    // BOLA: a non-participant cannot read another match's results
    const outsider = await makeUser();
    expect(await svc().results(matchId, outsider)).toBeNull();
    const results = await svc().results(matchId, host);
    expect(results).toBeTruthy();
    const hostRow = results!.ranking.find((r) => r.userId === host)!;
    const p2Row = results!.ranking.find((r) => r.userId === p2)!;
    expect(hostRow.rank).toBe(1);
    expect(hostRow.score).toBeGreaterThan(p2Row.score);
    expect(hostRow.xpAwarded!).toBeGreaterThan(p2Row.xpAwarded!);

    // XP landed in the ledger and is idempotent (calling results again = no change)
    expect(await ledgerXp(host)).toBe(hostRow.xpAwarded);
    await svc().results(matchId, host);
    expect(await ledgerXp(host)).toBe(hostRow.xpAwarded);
  });

  it('needs two players to start and rejects non-members', async () => {
    clock.t = new Date('2026-08-18T13:00:00Z');
    const host = await makeUser();
    const created = await svc().create(host, {});
    if (!created.ok) return;
    const solo = await svc().start(created.match.id, host);
    expect(solo.ok).toBe(false);
    if (!solo.ok) expect(solo.reason).toBe('need-two');

    const stranger = await makeUser();
    const g = await svc().submit(created.match.id, stranger, RHYMES[0]!);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe('not-active');
  });
});
