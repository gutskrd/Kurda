/** User search + public profiles (KUR-082) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { SocialService } from './service.js';
import { FriendService } from '../friends/service.js';
import { ModerationQueueService } from '../moderation/queue-service.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('user search + profiles (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let social: SocialService;
  let friends: FriendService;
  const suffix = Date.now().toString(36).slice(-6);
  const id: Record<string, string> = {};
  const uname: Record<string, string> = {
    viewer: `viewer${suffix}`,
    diacritic: `şevdar${suffix}`, // folds to "sevdar…"
    friendly: `friendly${suffix}`,
    hidden: `hidden${suffix}`,
    blocked: `blockme${suffix}`,
  };

  const register = async (tag: string, ip: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `soc_${tag}_${suffix}@it.kurda.app`,
        username: uname[tag]!,
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    return res.json().user.id as string;
  };
  const found = (list: Array<{ userId: string }>, uid: string): boolean => list.some((x) => x.userId === uid);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    friends = new FriendService(pool);
    social = new SocialService(pool, friends);
    id.viewer = await register('viewer', '10.82.1.1');
    id.diacritic = await register('diacritic', '10.82.2.1');
    id.friendly = await register('friendly', '10.82.3.1');
    id.hidden = await register('hidden', '10.82.4.1');
    id.blocked = await register('blocked', '10.82.5.1');

    await social.setVisibility(id.friendly!, 'friends');
    await social.setVisibility(id.hidden!, 'nobody');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('prefix search folds Kurdish diacritics (KUR-044 normalization)', async () => {
    const byFolded = await social.search(id.viewer!, 'sevdar');
    const byDiacritic = await social.search(id.viewer!, 'şev');
    expect(found(byFolded, id.diacritic!)).toBe(true);
    expect(found(byDiacritic, id.diacritic!)).toBe(true);
  });

  it('search excludes self, blocked users, and non-searchable (nobody) profiles', async () => {
    expect(found(await social.search(id.viewer!, uname.viewer!.slice(0, 8)), id.viewer!)).toBe(false);
    // hidden = visibility nobody → not searchable
    expect(found(await social.search(id.viewer!, `hidden${suffix}`), id.hidden!)).toBe(false);
    // block → both directions vanish from search
    await friends.block(id.viewer!, id.blocked!);
    expect(found(await social.search(id.viewer!, `blockme${suffix}`), id.blocked!)).toBe(false);
    expect(found(await social.search(id.blocked!, `viewer${suffix}`), id.viewer!)).toBe(false);
  });

  it('an "everyone" profile shows full detail + relationship', async () => {
    const p = await social.profile(id.viewer!, id.diacritic!);
    expect(p).toMatchObject({ private: false, friendStatus: 'none' });
    expect(typeof p.xp).toBe('number');
    expect(typeof p.streak).toBe('number');
  });

  it('a "friends" profile hides detail until you are friends', async () => {
    const before = await social.profile(id.viewer!, id.friendly!);
    expect(before).toMatchObject({ private: true, friendStatus: 'none' });
    expect(before.xp).toBeUndefined();

    await friends.request(id.viewer!, id.friendly!);
    await friends.respond(id.friendly!, id.viewer!, true);
    const after = await social.profile(id.viewer!, id.friendly!);
    expect(after).toMatchObject({ private: false, friendStatus: 'friends' });
    expect(typeof after.xp).toBe('number');
  });

  it('a "nobody" profile is private to others but full to self', async () => {
    expect(await social.profile(id.viewer!, id.hidden!)).toMatchObject({ private: true });
    expect(await social.profile(id.hidden!, id.hidden!)).toMatchObject({ private: false, friendStatus: 'self' });
  });

  /**
   * A profile that shows a level and a country but not who someone knows is a
   * profile of an account rather than of a person. The list carries the
   * profile's own privacy rules rather than rules of its own, so a profile you
   * cannot see the detail of has no friend list either.
   */
  describe('who someone is friends with', () => {
    const friendsOf = (id: string) => app.inject({ method: 'GET', url: `/users/${id}/friends`, remoteAddress: '10.82.9.9' });

    it('lists them for a profile anyone may look at', async () => {
      // 'friendly' accepted the viewer in the test above, so they are a pair.
      // The viewer is the one asked about here, because 'friendly' is
      // friends-only and this request carries no session at all.
      await pool.query(`UPDATE users SET profile_visibility = 'everyone' WHERE id = $1`, [id.viewer!]);
      const res = await friendsOf(id.viewer!);
      expect(res.statusCode).toBe(200);
      expect(res.json().friends.map((f: { userId: string }) => f.userId)).toContain(id.friendly!);
    });

    it('says nothing for a profile whose detail is hidden', async () => {
      const res = await friendsOf(id.hidden!);
      expect(res.statusCode).toBe(200);
      // not an error and not a refusal: the same empty answer a stranger gets
      // for anything else on that profile, which reveals nothing either way
      expect(res.json().friends).toEqual([]);
    });
  });

  /**
   * Reporting a person, which is the half of "make this stop" that a block
   * cannot do: a block ends it for you and tells nobody, so somebody doing the
   * same thing to twenty people looked exactly like somebody nobody had
   * blocked.
   */
  describe('reporting a person', () => {
    const token = async (tag: string, ip: string): Promise<string> => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `soc_${tag}_${suffix}@it.kurda.app`,
          username: `${tag}${suffix}`.slice(0, 30),
          password: 'a-strong-password1',
          acceptTerms: true,
        },
        remoteAddress: ip,
      });
      await activate(app, pool, res);
      return res.json().tokens.accessToken as string;
    };

    const send = (auth: string, target: string, body: unknown) =>
      app.inject({
        method: 'POST',
        url: `/users/${target}/report`,
        headers: { authorization: `Bearer ${auth}` },
        payload: body as object,
        remoteAddress: '10.82.9.9',
      });

    /*
     * Two accounts, because the endpoint allows five reports an hour per user
     * and these tests would otherwise spend them and start getting 429s. `a`
     * files the real report and the duplicate of it; `b` takes every rejection
     * case, none of which need to be the same person.
     */
    let a = '';
    let aId = '';
    let b = '';
    let bId = '';

    const idOf = async (tag: string): Promise<string> => {
      const row = await pool.query<{ id: string }>(`SELECT id FROM users WHERE username = $1`, [
        `${tag}${suffix}`.slice(0, 30),
      ]);
      return row.rows[0]!.id;
    };

    beforeAll(async () => {
      a = await token('repa', '10.82.9.1');
      b = await token('repb', '10.82.9.2');
      aId = await idOf('repa');
      bId = await idOf('repb');
    });

    it('needs an account', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/users/${id.diacritic}/report`,
        payload: { category: 'spam', reason: 'a perfectly long enough reason' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('records a report with its category and words', async () => {
      const res = await send(a, id.diacritic!, {
        category: 'harassment',
        reason: 'Sending the same insult every day after being asked to stop.',
      });
      expect(res.statusCode).toBe(200);

      const row = await pool.query<{ category: string; reason: string; status: string }>(
        `SELECT category, reason, status FROM user_reports WHERE reporter_id = $1 AND reported_user_id = $2`,
        [aId, id.diacritic],
      );
      expect(row.rows[0]).toMatchObject({ category: 'harassment', status: 'open' });
      expect(row.rows[0]!.reason).toContain('asked to stop');
    });

    it('refuses one with nothing in it, because the words are the whole case', async () => {
      const res = await send(b, id.friendly!, { category: 'spam', reason: 'bad' });
      expect(res.statusCode).toBe(400);
    });

    it('refuses a category it does not recognise', async () => {
      const res = await send(b, id.friendly!, { category: 'because-i-say-so', reason: 'a long enough reason here' });
      expect(res.statusCode).toBe(400);
    });

    it('will not let you report yourself', async () => {
      const res = await send(b, bId, { category: 'spam', reason: 'a long enough reason here' });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('SELF_REPORT');
    });

    /**
     * The same answer for a duplicate and for an id that does not exist. Any
     * difference between them is an endpoint that tells you which user ids are
     * real, and whether an account has been reported before.
     */
    it('says the same thing to a second report and to a stranger', async () => {
      const again = await send(a, id.diacritic!, { category: 'spam', reason: 'reporting them a second time' });
      expect(again.statusCode).toBe(200);
      const nobody = await send(b, '00000000-0000-4000-8000-000000000000', {
        category: 'spam',
        reason: 'nobody is behind this id at all',
      });
      expect(nobody.statusCode).toBe(200);

      // and the second one changed nothing: one row, still the first reason
      const rows = await pool.query<{ reason: string }>(
        `SELECT reason FROM user_reports WHERE reporter_id = $1 AND reported_user_id = $2`,
        [aId, id.diacritic],
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0]!.reason).toContain('asked to stop');
    });

    it('reaches the moderation queue as one case for the person', async () => {
      const queue = new ModerationQueueService(pool);
      await queue.sync();
      const row = await pool.query<{ source: string; summary: string; evidence: { reports: number } }>(
        `SELECT source, summary, evidence FROM moderation_cases
          WHERE source = 'user_report' AND source_ref = $1`,
        [`user:${id.diacritic}`],
      );
      expect(row.rowCount).toBe(1);
      expect(row.rows[0]!.summary).toMatch(/Reported by 1/);
      // with no post attached, what the reporter wrote IS the case
      expect(JSON.stringify(row.rows[0]!.evidence)).toContain('asked to stop');
    });
  });

  it('a blocked user is a 404, never revealed', async () => {
    // viewer blocked "blocked" earlier
    await expect(social.profile(id.viewer!, id.blocked!)).rejects.toThrow(/no such user/i);
    await expect(social.profile(id.blocked!, id.viewer!)).rejects.toThrow(/no such user/i);
  });
});
