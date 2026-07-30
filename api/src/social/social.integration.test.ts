/** User search + public profiles (KUR-082) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { SocialService } from './service.js';
import { FriendService } from '../friends/service.js';

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
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
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

  it('a blocked user is a 404, never revealed', async () => {
    // viewer blocked "blocked" earlier
    await expect(social.profile(id.viewer!, id.blocked!)).rejects.toThrow(/no such user/i);
    await expect(social.profile(id.blocked!, id.viewer!)).rejects.toThrow(/no such user/i);
  });
});
