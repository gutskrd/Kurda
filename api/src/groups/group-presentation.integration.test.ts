/**
 * How a group presents itself — its name, description and picture — and who
 * may change them, against real Postgres. The picture's storage is a stand-in
 * that keeps what was put and deleted; everything else is the real thing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { GroupService } from './service.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { mediaLimits } from '../media/mediaLimits.js';
import type { MediaStorage } from '../media/storage.js';
import type { ProfilePhotoDeps } from '../media/profilePhoto.js';
import { clearGroupPhoto, setGroupPhoto } from '../media/groupPhoto.js';

const DATABASE_URL = process.env.DATABASE_URL;

const png = (r: number, g: number, b: number) => sharp({ create: { width: 64, height: 64, channels: 3, background: { r, g, b } } }).png().toBuffer();

describe.skipIf(!DATABASE_URL)('group name, description and picture (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let groups: GroupService;
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};
  const token: Record<string, string> = {};
  const put = new Set<string>();
  const deleted: string[] = [];
  const storage = {
    put: async (key: string) => void put.add(key),
    delete: async (key: string) => void deleted.push(key),
    publicUrl: (key: string) => `https://cdn.test/${key}`,
  } as unknown as MediaStorage;
  const deps = (): ProfilePhotoDeps => ({
    pool,
    storage,
    usage: new MediaUsageService(pool, null),
    // the scan's own rules are tested with it; here every picture is cleared
    moderation: { scan: async (key: string) => (await pool.query(`UPDATE media_uploads SET scan_status = 'cleared' WHERE key = $1`, [key]), { scanStatus: 'cleared' }) },
    limits: mediaLimits(config),
    log: { warn: () => undefined, error: () => undefined },
  });
  const confirmed = async (key: string): Promise<boolean> =>
    (await pool.query<{ c: boolean }>(`SELECT confirmed_at IS NOT NULL AS c FROM media_uploads WHERE key = $1`, [key])).rows[0]?.c ?? false;
  const photoKey = async (gid: string): Promise<string | null> => (await pool.query<{ k: string | null }>(`SELECT photo_key AS k FROM groups WHERE id = $1`, [gid])).rows[0]!.k;

  const register = async (tag: string, ip: string): Promise<void> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `gpres_${tag}_${suffix}@it.kurda.app`,
        username: `gpres_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    id[tag] = res.json().user.id as string;
    token[tag] = res.json().tokens.accessToken as string;
    // an account that has confirmed its email, a few days old
    await pool.query(`UPDATE users SET email_verified_at = now(), created_at = now() - interval '3 days' WHERE id = $1`, [id[tag]]);
  };
  const patch = (tag: string, gid: string, payload: object) =>
    app.inject({ method: 'PATCH', url: `/groups/${gid}`, headers: { authorization: `Bearer ${token[tag]}` }, payload });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    groups = new GroupService(pool);
    // (the accounts are made below, after the pool they are activated through)
    await register('owner', '10.85.1.1');
    await register('admin', '10.85.2.1');
    await register('member', '10.85.3.1');
    await register('outsider', '10.85.4.1');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM groups WHERE name LIKE $1 OR name LIKE $2`, [`%${suffix}%`, 'Renamed%']);
    await pool.query(`DELETE FROM media_uploads WHERE key = ANY($1)`, [[...put]]);
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  const makeGroup = async (name: string): Promise<string> => {
    const { id: gid } = await groups.create(id.owner!, { name: `${name} ${suffix}`, privacy: 'open' });
    await groups.join(id.admin!, gid);
    await groups.join(id.member!, gid);
    await groups.setRole(id.owner!, gid, id.admin!, 'moderator');
    return gid;
  };

  it('lets the owner and the admins rename it and change its description, and nobody else', async () => {
    const gid = await makeGroup('Edit');
    const renamed = await patch('owner', gid, { name: `  Renamed ${suffix}​  ` });
    expect(renamed.statusCode).toBe(200);
    // cleaned as it is when a group is made: trimmed, invisible characters gone
    expect(renamed.json().name).toBe(`Renamed ${suffix}`);
    // nor can a name hide behind a character that turns it back to front
    expect((await patch('owner', gid, { name: `\u202eRenamed ${suffix}` })).json().name).toBe(`Renamed ${suffix}`);

    const described = await patch('admin', gid, { description: 'Em her êvar bi kurdî diaxivin.' });
    expect(described.statusCode).toBe(200);
    const row = (await pool.query(`SELECT name, description, edited_by FROM groups WHERE id = $1`, [gid])).rows[0];
    expect(row).toEqual({ name: `Renamed ${suffix}`, description: 'Em her êvar bi kurdî diaxivin.', edited_by: id.admin });

    // an empty description clears it
    expect((await patch('admin', gid, { description: '' })).json().description).toBeNull();

    expect((await patch('member', gid, { name: 'Mine now' })).json().code).toBe('NOT_GROUP_ADMIN');
    expect((await patch('outsider', gid, { name: 'Mine now' })).statusCode).toBe(403);
    expect((await pool.query(`SELECT name FROM groups WHERE id = $1`, [gid])).rows[0].name).toBe(`Renamed ${suffix}`);
  });

  it('holds a new name to the same rules as a new group, and refuses words the chat would mask', async () => {
    const gid = await makeGroup('Rules');
    expect((await patch('owner', gid, { name: 'a' })).statusCode).toBe(400);
    expect((await patch('owner', gid, { name: 'x'.repeat(61) })).statusCode).toBe(400);
    expect((await patch('owner', gid, {})).statusCode).toBe(400);
    const rude = await patch('owner', gid, { name: 'fuck this group' });
    expect(rude.statusCode).toBe(422);
    expect(rude.json().code).toBe('GROUP_TEXT_REJECTED');
    // and making a group with one is refused the same way
    const made = await app.inject({ method: 'POST', url: '/groups', headers: { authorization: `Bearer ${token.owner}` }, payload: { name: 'shit club' } });
    expect(made.statusCode).toBe(422);
  });

  it('puts up a picture for the owner or an admin only, and shows it wherever the group is listed', async () => {
    const gid = await makeGroup('Picture');
    const refused = await setGroupPhoto(deps(), gid, id.member!, await png(200, 40, 40));
    expect(refused).toMatchObject({ ok: false, code: 'NOT_GROUP_ADMIN' });
    expect(await photoKey(gid)).toBeNull();

    const first = await setGroupPhoto(deps(), gid, id.admin!, await png(30, 120, 200));
    expect(first.ok).toBe(true);
    const key = (await photoKey(gid))!;
    expect(key).toMatch(/^group-photo\/[0-9a-f]{64}\.webp$/);
    expect(await confirmed(key)).toBe(true);
    expect((await pool.query(`SELECT photo_set_by FROM groups WHERE id = $1`, [gid])).rows[0].photo_set_by).toBe(id.admin);

    const url = `https://cdn.test/${key}`;
    expect((await groups.get(gid, id.outsider!, (k) => `https://cdn.test/${k}`)).photoUrl).toBe(url);
    expect((await groups.myGroups(id.member!, (k) => `https://cdn.test/${k}`)).find((g) => g.id === gid)?.photoUrl).toBe(url);
    const listed = (await groups.discover(id.outsider!, 200, (k) => `https://cdn.test/${k}`)).find((g) => g.id === gid);
    expect(listed).toMatchObject({ photoUrl: url, joined: false });
    expect((await groups.discover(id.member!, 200)).find((g) => g.id === gid)?.joined).toBe(true);

    // a new picture replaces it: the old one leaves the storage total and the bucket
    await setGroupPhoto(deps(), gid, id.owner!, await png(250, 200, 30));
    expect(await photoKey(gid)).not.toBe(key);
    expect(await confirmed(key)).toBe(false);
    expect(deleted).toContain(key);
  });

  it('keeps a picture another group still shows, and lets go of it when the last one does', async () => {
    const one = await makeGroup('Twin A');
    const two = await makeGroup('Twin B');
    const same = await png(90, 160, 90);
    await setGroupPhoto(deps(), one, id.owner!, same);
    await setGroupPhoto(deps(), two, id.owner!, same);
    const key = (await photoKey(one))!;
    expect(await photoKey(two)).toBe(key);

    deleted.length = 0;
    expect(await clearGroupPhoto(deps(), one, id.admin!)).toEqual({ ok: true, photoUrl: null });
    expect(await photoKey(one)).toBeNull();
    expect(await confirmed(key)).toBe(true);
    expect(deleted).not.toContain(key);

    // the last group that showed it is deleted: its picture goes to the orphan job
    await groups.deleteGroup(id.owner!, two);
    expect(await confirmed(key)).toBe(false);
  });

  it('takes nothing from a member, and nothing from a group that has been archived', async () => {
    const gid = await makeGroup('Archived');
    await setGroupPhoto(deps(), gid, id.owner!, await png(10, 10, 10));
    expect(await clearGroupPhoto(deps(), gid, id.member!)).toMatchObject({ ok: false, code: 'NOT_GROUP_ADMIN' });
    await pool.query(`UPDATE groups SET archived_at = now() WHERE id = $1`, [gid]);
    expect(await setGroupPhoto(deps(), gid, id.owner!, await png(20, 20, 20))).toMatchObject({ ok: false, code: 'GROUP_NOT_FOUND' });
    expect((await patch('owner', gid, { name: `Late ${suffix}` })).statusCode).toBe(404);
  });

  it('keeps the picture and who changed the group with a report about it', async () => {
    const gid = await makeGroup('Reported');
    await setGroupPhoto(deps(), gid, id.admin!, await png(140, 60, 160));
    await patch('admin', gid, { name: `Reported again ${suffix}` });
    const res = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: { authorization: `Bearer ${token.outsider}` },
      payload: { targetType: 'group', targetId: gid, category: 'spam' },
    });
    expect(res.statusCode).toBe(201);
    const evidence = (
      await pool.query<{ evidence: { mediaKeys: string[]; group: { editedBy: { id: string }; photoSetBy: { id: string } } } }>(
        `SELECT evidence FROM reports WHERE target_type = 'group' AND target_id = $1`,
        [gid],
      )
    ).rows[0]!.evidence;
    expect(evidence.mediaKeys).toEqual([await photoKey(gid)]);
    expect(evidence.group.editedBy.id).toBe(id.admin);
    expect(evidence.group.photoSetBy.id).toBe(id.admin);
  });
});
