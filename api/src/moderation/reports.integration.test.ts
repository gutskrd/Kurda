/**
 * Filing reports (M1/M2) against real Postgres: one report path for every
 * surface, evidence frozen at report time, one open case per target, the queue
 * that never breaks, and the P0 email.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { HELPLINE_URL, REPORTS_PER_DAY, type CaseDetail, type MyReport, type ReportReceipt } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { FriendService } from '../friends/service.js';
import { GroupService } from '../groups/service.js';
import { bornYearsAgo } from '../test/age.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { resolveTarget } from './evidence.js';
import { ReportsService } from './reports-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('reports (integration)', () => {
  const config = loadConfig({
    DATABASE_URL,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    ADMIN_BASE_URL: 'https://admin.example.test',
  });
  const sent: Array<{ to: string; link: string }> = [];
  let app: FastifyInstance;
  let pool: pg.Pool;
  const kit = moderationKit(() => app, () => pool, 'rp', 141);
  const { call } = kit;
  let reporter: Person, author: Person, other: Person, stranger: Person, minor: Person, admin: Person;
  const userIds: string[] = [];

  const report = (who: Person, body: Record<string, unknown>) => call('POST', '/reports', who.token, body);
  /**
   * A player row, with the seat when the table has that column (the shared
   * lobby rules add it on another branch) — so these tests hold before and
   * after it lands.
   */
  async function addPlayer(db: Pick<pg.Pool, 'query'>, table: string, fk: string, gameId: string, userId: string, seat: number): Promise<void> {
    const hasSeat = (
      await db.query<{ ok: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass($1) AND attname = 'seat' AND NOT attisdropped) AS ok`,
        [table],
      )
    ).rows[0]!.ok;
    await db.query(
      hasSeat
        ? `INSERT INTO ${table} (${fk}, user_id, joined_at, seat) VALUES ($1, $2, now() + make_interval(secs => $3::int), $3::int)`
        : `INSERT INTO ${table} (${fk}, user_id, joined_at) VALUES ($1, $2, now() + make_interval(secs => $3::int))`,
      [gameId, userId, seat],
    );
  }
  const caseOf = async (reportId: string): Promise<string> =>
    (await pool.query<{ case_id: string }>(`SELECT case_id FROM reports WHERE id = $1`, [reportId])).rows[0]!.case_id;
  const detail = async (caseId: string): Promise<CaseDetail> =>
    (await call('GET', `/admin/moderation/cases/${caseId}`, admin.token)).json() as CaseDetail;

  beforeAll(async () => {
    app = buildApp(config, {
      moderation: {
        moderatorCount: async () => 2,
        mailer: { send: async (to, vars) => void sent.push({ to, link: vars.link }) },
      },
    });
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    reporter = await kit.person('reporter');
    author = await kit.person('author');
    other = await kit.person('other');
    stranger = await kit.person('stranger');
    minor = await kit.person('minor', bornYearsAgo(15));
    admin = await kit.admin('admin', ['moderator']);
    userIds.push(reporter.id, author.id, other.id, stranger.id, minor.id, admin.id);
    // established accounts: a report from one under a day old weighs less (tested below)
    await pool.query(`UPDATE users SET created_at = now() - interval '3 days' WHERE id = ANY($1)`, [[reporter.id, other.id, stranger.id, author.id]]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM moderation_cases WHERE subject_user_id = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%_${kit.suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('reports a person, with a snapshot, and answers a repeat with the same receipt', async () => {
    const first = await report(reporter, { targetType: 'user', targetId: author.id, category: 'harassment', note: 'calls me names' });
    expect(first.statusCode).toBe(201);
    const receipt = first.json() as ReportReceipt;
    expect(receipt.deduped).toBe(false);
    expect(receipt.report).toMatchObject({ targetType: 'user', category: 'harassment', status: 'open', targetLabel: `@${author.username}` });
    expect(receipt.help).toBeUndefined();

    const again = await report(reporter, { targetType: 'user', targetId: author.id, category: 'spam', note: 'and again' });
    expect(again.statusCode).toBe(200);
    expect((again.json() as ReportReceipt).deduped).toBe(true);
    expect((again.json() as ReportReceipt).report.id).toBe(receipt.report.id);

    const row = await pool.query<{ evidence: { author: { username: string } }; note: string; reporter_hash: string }>(
      `SELECT evidence, note, reporter_hash FROM reports WHERE id = $1`,
      [receipt.report.id],
    );
    expect(row.rows[0]!.evidence.author.username).toBe(author.username);
    expect(row.rows[0]!.note).toBe('calls me names');
    expect(row.rows[0]!.reporter_hash).toMatch(/^[0-9a-f]{64}$/);

    // a case at once — nobody had to open the queue for it to exist
    const d = await detail(await caseOf(receipt.report.id));
    expect(d.case).toMatchObject({ source: 'report', targetType: 'user', category: 'harassment', priority: 2, reportCount: 1, status: 'open' });
    expect(d.reports[0]!.reporter).toMatchObject({ id: reporter.id, username: reporter.username, age: 'adult' });
    expect(d.reports[0]!.weight).toBe(1);
  });

  it('weighs a day-old account’s report half and one level lower', async () => {
    const fresh = await kit.person('fresh');
    const filed = (await report(fresh, { targetType: 'user', targetId: stranger.id, category: 'harassment' })).json() as ReportReceipt;
    const row = await pool.query<{ priority: number; weight: string }>(`SELECT priority, weight FROM reports WHERE id = $1`, [filed.report.id]);
    expect(row.rows[0]).toEqual({ priority: 3, weight: '0.50' });
  });

  it('refuses yourself and what is not there, and maps the old category names', async () => {
    const self = await report(reporter, { targetType: 'user', targetId: reporter.id, category: 'spam' });
    expect(self.statusCode).toBe(400);
    expect(self.json().code).toBe('SELF_REPORT');

    const ghost = await report(reporter, { targetType: 'library_post', targetId: '00000000-0000-4000-8000-000000000000', category: 'spam' });
    expect(ghost.statusCode).toBe(404);
    expect(ghost.json().code).toBe('TARGET_NOT_FOUND');

    expect((await report(reporter, { targetType: 'user', targetId: other.id, category: 'nonsense' })).statusCode).toBe(400);

    // the web app's old key for self-harm, with no note at all: help comes back at once
    const sh = await report(stranger, { targetType: 'user', targetId: other.id, category: 'selfHarm' });
    expect(sh.statusCode).toBe(201);
    expect((sh.json() as ReportReceipt).report.category).toBe('self_harm');
    expect((sh.json() as ReportReceipt).help).toEqual({ url: HELPLINE_URL });
  });

  it('emails every moderation admin once about a P0 case, with a link and nothing else', async () => {
    // the self-harm report above is P0: its email went out when it was filed
    const caseId = (await pool.query<{ id: string }>(
      `SELECT c.id FROM moderation_cases c WHERE c.source = 'report' AND c.source_ref = $1`,
      [`user:${other.id}`],
    )).rows[0]!.id;
    const mine = sent.filter((s) => s.to === admin.email);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.link).toBe(`https://admin.example.test/#/moderation/${caseId}`);
    const before = sent.length;

    // a second report on the same case is not a second email
    const again = await report(reporter, { targetType: 'user', targetId: other.id, category: 'violence' });
    expect(again.statusCode).toBe(201);
    expect(await caseOf((again.json() as ReportReceipt).report.id)).toBe(caseId);
    expect(sent.length).toBe(before);
    const row = await pool.query<{ alert_sent_at: Date | null; report_count: number; reporter_count: number }>(
      `SELECT alert_sent_at, report_count, reporter_count FROM moderation_cases WHERE id = $1`,
      [caseId],
    );
    expect(row.rows[0]).toMatchObject({ report_count: 2, reporter_count: 2 });
    expect(row.rows[0]!.alert_sent_at).not.toBeNull();
  });

  it('keeps the evidence when the author edits and then deletes the post', async () => {
    const post = (await call('POST', '/library/posts', author.token, { type: 'story', title: 'Rojek', body: 'The words as they were.' })).json() as { id: string };
    const filed = await report(reporter, { targetType: 'library_post', targetId: post.id, category: 'hate', note: 'see the second line' });
    expect(filed.statusCode).toBe(201);
    const caseId = await caseOf((filed.json() as ReportReceipt).report.id);

    expect((await call('PATCH', `/library/posts/${post.id}`, author.token, { body: 'Something harmless now.' })).statusCode).toBe(200);
    expect((await call('DELETE', `/library/posts/${post.id}`, author.token)).statusCode).toBe(200);

    // still in the queue, and the admin reads what was reported, not what is there now
    const page = await call('GET', `/admin/moderation/queue?q=${post.id}`, admin.token);
    expect(page.statusCode).toBe(200);
    expect((page.json() as { cases: Array<{ id: string }> }).cases.map((c) => c.id)).toContain(caseId);
    const d = await detail(caseId);
    expect(d.reports[0]!.evidence).toMatchObject({ title: 'Rojek', text: 'The words as they were.', status: 'published' });
    expect(d.reports[0]!.note).toBe('see the second line');
  });

  it('a gotin report no longer breaks the queue — new or left over from the old table', async () => {
    const gotin = (await call('POST', '/library/posts', author.token, { type: 'gotin', body: 'Gotinek bê nav.' })).json() as { id: string; title: string | null };
    expect(gotin.title ?? null).toBeNull();
    // through the old route, as the phone sends it
    expect((await call('POST', `/library/posts/${gotin.id}/report`, reporter.token, { reason: 'rude' })).statusCode).toBe(200);
    // and a row the old table still holds from before (the one that used to 500 the queue)
    const old = (await call('POST', '/library/posts', author.token, { type: 'gotin', body: 'Gotineke din.' })).json() as { id: string };
    await pool.query(`INSERT INTO library_reports (target_type, target_id, reporter_id, reason) VALUES ('library_post', $1, $2, 'old')`, [old.id, other.id]);

    const res = await call('GET', `/admin/moderation/queue?q=${gotin.id}`, admin.token);
    expect(res.statusCode).toBe(200);
    const [mine] = (res.json() as { cases: Array<{ summary: string; source: string }> }).cases;
    expect(mine!.source).toBe('report');
    expect(mine!.summary).toMatch(/^1 report · Something else · Library post by @/);

    const legacy = await call('GET', `/admin/moderation/queue?q=${old.id}`, admin.token);
    expect(legacy.statusCode).toBe(200);
    const [oldCase] = (legacy.json() as { cases: Array<{ summary: string; source: string }> }).cases;
    expect(oldCase).toMatchObject({ source: 'library_report' });
    expect(oldCase!.summary.length).toBeGreaterThan(5);
  });

  it('a report after the decision opens a new case, and the reporter hears back', async () => {
    const target = await kit.person('rerep');
    userIds.push(target.id);
    const first = (await report(reporter, { targetType: 'user', targetId: target.id, category: 'spam' })).json() as ReportReceipt;
    const firstCase = await caseOf(first.report.id);
    const decided = await call('POST', `/admin/moderation/cases/${firstCase}/decide`, admin.token, {
      outcome: 'no_violation', actions: [], removeContent: false, notifyReporters: true,
    });
    expect(decided.statusCode).toBe(200);

    const mine = (await call('GET', '/me/reports', reporter.token)).json() as { reports: MyReport[] };
    expect(mine.reports.find((r) => r.id === first.report.id)).toMatchObject({ status: 'no_violation', canAppeal: true });
    const inbox = await pool.query<{ data: { kind: string; outcome: string; reportIds: string[] } }>(
      `SELECT data FROM notifications WHERE user_id = $1 AND data->>'kind' = 'report_outcome'`,
      [reporter.id],
    );
    expect(inbox.rows.some((n) => n.data.outcome === 'no_violation' && n.data.reportIds.includes(first.report.id))).toBe(true);

    // a new incident: a new report and a new case (the old key used to swallow it)
    const second = await report(reporter, { targetType: 'user', targetId: target.id, category: 'harassment' });
    expect(second.statusCode).toBe(201);
    const secondCase = await caseOf((second.json() as ReportReceipt).report.id);
    expect(secondCase).not.toBe(firstCase);
    expect((await detail(secondCase)).case.status).toBe('open');
    expect((await detail(firstCase)).case.status).toBe('no_violation');
  });

  it('reports a direct message only from inside the conversation, with the messages around it', async () => {
    const friends = new FriendService(pool);
    await friends.request(author.id, reporter.id);
    await friends.respond(reporter.id, author.id, true);
    const sendDm = async (from: Person, to: Person, body: string) =>
      (await call('POST', `/chat/${to.id}/messages`, from.token, { body })).json() as { id: string };
    await sendDm(author, reporter, 'hello');
    await sendDm(reporter, author, 'hi');
    const bad = await sendDm(author, reporter, 'the one that hurt');
    await sendDm(reporter, author, 'please stop');

    const nosy = await report(stranger, { targetType: 'dm_message', targetId: bad.id, category: 'harassment' });
    expect(nosy.statusCode).toBe(404);

    const filed = await report(reporter, { targetType: 'dm_message', targetId: bad.id, category: 'harassment' });
    expect(filed.statusCode).toBe(201);
    const d = await detail(await caseOf((filed.json() as ReportReceipt).report.id));
    const context = (d.reports[0]!.evidence as { context: Array<{ body: string; reported: boolean; username: string }> }).context;
    expect(context.map((m) => m.body)).toEqual(['hello', 'hi', 'the one that hurt', 'please stop']);
    expect(context.find((m) => m.reported)!.username).toBe(author.username);
    expect(d.subject!.id).toBe(author.id);
  });

  it('reports a group message from inside the group, and a group', async () => {
    const groups = new GroupService(pool);
    const g = await groups.create(author.id, { name: `Kom ${kit.suffix}`, privacy: 'open' });
    await groups.join(reporter.id, g.id);
    const msg = (await call('POST', `/groups/${g.id}/chat`, author.token, { body: 'group message' })).json() as { id: string };

    expect((await report(stranger, { targetType: 'group_message', targetId: msg.id, category: 'spam' })).statusCode).toBe(404);
    const filed = await report(reporter, { targetType: 'group_message', targetId: msg.id, category: 'spam' });
    expect(filed.statusCode).toBe(201);
    const ev = (await detail(await caseOf((filed.json() as ReportReceipt).report.id))).reports[0]!.evidence;
    expect(ev).toMatchObject({ text: 'group message', group: { id: g.id } });

    const grp = await report(stranger, { targetType: 'group', targetId: g.id, category: 'hate' });
    expect(grp.statusCode).toBe(201);
    expect((await detail(await caseOf((grp.json() as ReportReceipt).report.id))).subject!.id).toBe(author.id);
  });

  it('refuses what the reporter cannot see — a draft, removed content, a private group, a minor’s post — as not there', async () => {
    const notThere = (res: { statusCode: number; body: string; json: () => { code: string } }, secret?: string) => {
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('TARGET_NOT_FOUND');
      if (secret) expect(res.body).not.toContain(secret);
    };
    const draft = (await call('POST', '/library/posts', author.token, { type: 'story', title: `Draft ${kit.suffix}`, body: 'x', publish: false })).json() as { id: string };
    notThere(await report(stranger, { targetType: 'library_post', targetId: draft.id, category: 'spam' }), `Draft ${kit.suffix}`);

    const removed = await pool.query<{ id: string }>(
      `INSERT INTO image_posts (author_id, author_role, image_media_id, caption, status) VALUES ($1, 'user', $2, 'gone', 'removed') RETURNING id`,
      [author.id, `image-post/vis_${kit.suffix}.webp`],
    );
    notThere(await report(stranger, { targetType: 'image_post', targetId: removed.rows[0]!.id, category: 'spam' }));

    const published = (await call('POST', '/library/posts', author.token, { type: 'gotin', body: 'Gotin.' })).json() as { id: string };
    const tombstone = await pool.query<{ id: string }>(
      `INSERT INTO library_comments (post_id, author_id, author_role, body, status) VALUES ($1, $2, 'user', NULL, 'removed') RETURNING id`,
      [published.id, author.id],
    );
    notThere(await report(stranger, { targetType: 'library_comment', targetId: tombstone.rows[0]!.id, category: 'spam' }));

    // an invite-only group, only from inside
    const g = await new GroupService(pool).create(author.id, { name: `Hidden ${kit.suffix}`, privacy: 'invite' });
    notThere(await report(stranger, { targetType: 'group', targetId: g.id, category: 'hate' }), `Hidden ${kit.suffix}`);
    await pool.query(`INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`, [g.id, other.id]);
    const inside = await report(other, { targetType: 'group', targetId: g.id, category: 'hate' });
    expect(inside.statusCode).toBe(201);
    expect((inside.json() as ReportReceipt).report.targetLabel).toBe(`Hidden ${kit.suffix}`);

    // a minor's post is for their friends; to a stranger it is not there
    const young = await pool.query<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, status, published_at)
       VALUES ($1, 'user', 'story', $2, 'mine', 'published', now()) RETURNING id`,
      [minor.id, `Young ${kit.suffix}`],
    );
    notThere(await report(stranger, { targetType: 'library_post', targetId: young.rows[0]!.id, category: 'spam' }), `Young ${kit.suffix}`);
  });

  it('reports a game player by seat, mapped to the person on the server', async () => {
    const battle = await pool.query<{ id: string }>(
      `INSERT INTO wordle_battles (created_by, difficulty, target, target_length, status)
       VALUES ($1, 'easy', 'kurda', 5, 'finished') RETURNING id`,
      [reporter.id],
    );
    const id = battle.rows[0]!.id;
    await addPlayer(pool, 'wordle_battle_players', 'battle_id', id, reporter.id, 1);
    await addPlayer(pool, 'wordle_battle_players', 'battle_id', id, author.id, 2);

    const seat = (n: number, who: Person = reporter) =>
      report(who, { targetType: 'game_player', targetId: id, game: 'wordle-battle', seat: n, category: 'harassment' });
    expect((await seat(1)).json().code).toBe('SELF_REPORT');
    expect((await seat(3)).statusCode).toBe(404);
    expect((await seat(2, stranger)).statusCode).toBe(404); // not in that game
    expect((await call('POST', '/reports', reporter.token, { targetType: 'game_player', targetId: id, category: 'spam' })).statusCode).toBe(400);

    const filed = await seat(2);
    expect(filed.statusCode).toBe(201);
    // the receipt never names a player the game may show only as "Player 2"
    expect((filed.json() as ReportReceipt).report.targetLabel).toBeNull();
    const row = await pool.query<{ target_id: string; subject_user_id: string; evidence: { game: { players: Array<{ seat: number; username: string }> } } }>(
      `SELECT target_id, subject_user_id, evidence FROM reports WHERE id = $1`,
      [(filed.json() as ReportReceipt).report.id],
    );
    expect(row.rows[0]!.target_id).toBe(`wordle-battle:${id}:2`);
    expect(row.rows[0]!.subject_user_id).toBe(author.id);
    expect(row.rows[0]!.evidence.game.players.map((p) => p.username)).toEqual([reporter.username, author.username]);
  });

  it('reports a Rhyme Match player by seat, and reads real seats where a game keeps them', async () => {
    const match = await pool.query<{ id: string }>(
      `INSERT INTO rhyme_matches (created_by, prompt, window_ms, status) VALUES ($1, 'dil', 60000, 'finished') RETURNING id`,
      [other.id],
    );
    const id = match.rows[0]!.id;
    await addPlayer(pool, 'rhyme_match_players', 'match_id', id, other.id, 1);
    await addPlayer(pool, 'rhyme_match_players', 'match_id', id, stranger.id, 2);
    const filed = await report(stranger, { targetType: 'game_player', targetId: id, game: 'rhyme-match', seat: 1, category: 'hate' });
    expect(filed.statusCode).toBe(201);
    const row = await pool.query<{ subject_user_id: string; target_id: string }>(
      `SELECT subject_user_id, target_id FROM reports WHERE id = $1`,
      [(filed.json() as ReportReceipt).report.id],
    );
    expect(row.rows[0]).toEqual({ subject_user_id: other.id, target_id: `rhyme-match:${id}:1` });

    // a seat column, when there is one, wins over join order: seat 2 left, and seat 3 is still seat 3
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`ALTER TABLE rhyme_match_players ADD COLUMN IF NOT EXISTS seat smallint`);
      const m2 = (await client.query<{ id: string }>(
        `INSERT INTO rhyme_matches (created_by, prompt, window_ms, status) VALUES ($1, 'av', 60000, 'active') RETURNING id`,
        [reporter.id],
      )).rows[0]!.id;
      await client.query(`INSERT INTO rhyme_match_players (match_id, user_id, seat) VALUES ($1, $2, 1), ($1, $3, 3)`, [m2, reporter.id, author.id]);
      const svc = await resolveTarget(client, 'game_player', m2, { reporterId: reporter.id, game: 'rhyme-match', seat: 3, now: new Date() });
      expect(svc).toMatchObject({ subjectUserId: author.id, targetId: `rhyme-match:${m2}:3` });
      expect(await resolveTarget(client, 'game_player', m2, { reporterId: reporter.id, game: 'rhyme-match', seat: 2, now: new Date() })).toEqual({
        refused: 'bad_seat',
      });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('reports a Stories player once the Stories tables exist, and nothing before', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // shadow (or stand in for) the Stories tables for this transaction only
      await client.query(`CREATE TEMP TABLE story_games (id uuid PRIMARY KEY, status text NOT NULL) ON COMMIT DROP`);
      await client.query(`CREATE TEMP TABLE story_game_players (game_id uuid, user_id uuid, seat smallint) ON COMMIT DROP`);
      const gameId = '00000000-0000-4000-8000-0000000000b1';
      await client.query(`INSERT INTO story_games (id, status) VALUES ($1, 'reveal')`, [gameId]);
      await client.query(`INSERT INTO story_game_players (game_id, user_id, seat) VALUES ($1, $2, 1), ($1, $3, 2)`, [gameId, reporter.id, author.id]);
      const res = await resolveTarget(client, 'game_player', gameId, { reporterId: reporter.id, game: 'stories', seat: 2, now: new Date() });
      expect(res).toMatchObject({
        subjectUserId: author.id,
        evidence: { game: { game: 'stories', status: 'reveal', seat: 2, players: [{ seat: 1, username: reporter.username }, { seat: 2, username: author.username }] } },
      });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    // without them (this branch, before the Stories engine lands) there is no such game
    const exists = (await pool.query<{ ok: boolean }>(`SELECT to_regclass('story_games') IS NOT NULL AS ok`)).rows[0]!.ok;
    if (!exists) {
      const res = await report(reporter, { targetType: 'game_player', targetId: '00000000-0000-4000-8000-0000000000b2', game: 'stories', seat: 1, category: 'spam' });
      expect(res.statusCode).toBe(404);
    }
  });

  it('reports pictures and comments with what they said, and keeps the picture from cleanup', async () => {
    const key = `image-post/rp_${kit.suffix}.webp`;
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status) VALUES ($1, 'image/webp', 1024, now(), 'cleared')`,
      [key],
    );
    const img = (await call('POST', '/images', author.token, { imageMediaId: key, caption: 'a caption' })).json() as { id: string };
    const imgReport = await report(reporter, { targetType: 'image_post', targetId: img.id, category: 'sexual' });
    expect(imgReport.statusCode).toBe(201);
    const ev = (await detail(await caseOf((imgReport.json() as ReportReceipt).report.id))).reports[0]!.evidence;
    expect(ev).toMatchObject({ caption: 'a caption', mediaKeys: [key], author: { id: author.id } });
    const media = await pool.query<{ preserve_evidence: boolean }>(`SELECT preserve_evidence FROM media_uploads WHERE key = $1`, [key]);
    expect(media.rows[0]!.preserve_evidence).toBe(true);

    const imgComment = (await call('POST', `/images/${img.id}/comments`, author.token, { body: 'a picture comment' })).json() as { id: string };
    const c1 = await report(reporter, { targetType: 'image_comment', targetId: imgComment.id, category: 'harassment' });
    expect((await detail(await caseOf((c1.json() as ReportReceipt).report.id))).reports[0]!.evidence).toMatchObject({
      text: 'a picture comment',
      extra: { postId: img.id },
    });

    const post = (await call('POST', '/library/posts', author.token, { type: 'story', title: 'Çîrok', body: 'a story' })).json() as { id: string };
    const libComment = (await call('POST', `/library/posts/${post.id}/comments`, author.token, { body: 'a library comment' })).json() as { id: string };
    const c2 = await report(reporter, { targetType: 'library_comment', targetId: libComment.id, category: 'spam' });
    expect(c2.statusCode).toBe(201);
    // the author deletes it; the case still says what it said
    expect((await call('DELETE', `/library/comments/${libComment.id}`, author.token)).statusCode).toBeLessThan(300);
    expect((await detail(await caseOf((c2.json() as ReportReceipt).report.id))).reports[0]!.evidence).toMatchObject({
      text: 'a library comment',
      status: 'visible',
    });
  });

  it('moves a case with a minor in it up the queue', async () => {
    // an adult reaching a minor with sexual content is P0
    const toMinor = await report(minor, { targetType: 'user', targetId: author.id, category: 'sexual' });
    expect(toMinor.statusCode).toBe(201);
    const priority = await pool.query<{ priority: number; minor_involved: boolean }>(
      `SELECT r.priority, c.minor_involved FROM reports r JOIN moderation_cases c ON c.id = r.case_id WHERE r.id = $1`,
      [(toMinor.json() as ReportReceipt).report.id],
    );
    expect(priority.rows[0]).toEqual({ priority: 0, minor_involved: true });

    // spam about a minor: P3 boosted to P2
    const aboutMinor = await report(other, { targetType: 'user', targetId: minor.id, category: 'spam' });
    const p2 = await pool.query<{ priority: number }>(`SELECT priority FROM reports WHERE id = $1`, [(aboutMinor.json() as ReportReceipt).report.id]);
    expect(p2.rows[0]!.priority).toBe(2);
  });

  it('caps one account at 20 reports a day', async () => {
    const svc = new ReportsService(pool);
    const targets = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username)
       SELECT 'rpcap' || g || '_${kit.suffix}@it.kurda.app', 'rpcap' || g || '${kit.suffix}' FROM generate_series(1, $1) g
       RETURNING id`,
      [REPORTS_PER_DAY + 1],
    );
    const capper = await kit.person('capper');
    for (const t of targets.rows.slice(0, REPORTS_PER_DAY)) {
      await svc.file(capper.id, { targetType: 'user', targetId: t.id, category: 'spam' });
    }
    await expect(svc.file(capper.id, { targetType: 'user', targetId: targets.rows[REPORTS_PER_DAY]!.id, category: 'spam' })).rejects.toMatchObject({
      code: 'REPORT_LIMIT',
      statusCode: 429,
    });
  });

  it('needs an account', async () => {
    expect((await call('POST', '/reports', null, { targetType: 'user', targetId: author.id, category: 'spam' })).statusCode).toBe(401);
    expect((await call('GET', '/me/reports')).statusCode).toBe(401);
  });
});
