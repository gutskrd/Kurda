/**
 * Pictures are checked before anyone else sees them, end to end against real Postgres with an in-memory bucket and a
 * stub checker told what to find: clear pictures go public, uncertain ones wait privately for a person on the Picture
 * checks page, clearly bad ones are refused with a reason their owner can ask about, child-safety hits are kept as
 * evidence and decided only from their case, and approvals, removals, appeals and reports all go one way.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { PICTURE_IMAGE_PATH, isPictureRejection, type PictureCaseList } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { MediaService } from '../media/service.js';
import { memoryStorage } from '../test/media.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { seatInGroup } from '../test/groups.js';
import { StubImageScanner } from './image-scanner.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** A picture of its own colour, so every call stores different bytes. */
let shade = Math.floor(Math.random() * 100_000);
const photo = async (): Promise<Buffer> => {
  shade++;
  return sharp({ create: { width: 640, height: 420, channels: 3, background: { r: (shade * 37) % 256, g: (shade * 91) % 256, b: (shade * 53) % 256 } } })
    .composite([{ input: Buffer.from(`<svg width="200" height="120"><circle cx="${40 + (shade % 100)}" cy="60" r="40" fill="#fff"/></svg>`), left: 60, top: 60 }])
    .png()
    .toBuffer();
};

describe.skipIf(!DATABASE_URL)('pictures are checked before anyone else sees them (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  const stub = new StubImageScanner();
  const storage = memoryStorage();
  let app: FastifyInstance;
  let pool: pg.Pool;
  const kit = moderationKit(() => app, () => pool, 'pcx', 171);
  const people: Person[] = [];
  let admin: Person;
  let second: Person;

  const person = async (tag: string): Promise<Person> => {
    const p = await kit.person(tag);
    people.push(p);
    return p;
  };
  const raw = (url: string, token: string, bytes: Buffer) =>
    app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' }, payload: bytes, remoteAddress: kit.ip() });
  const upload = (token: string, bytes: Buffer) => raw('/images/upload', token, bytes);
  const caseOf = async (key: string) =>
    (
      await pool.query<{ id: string; status: string; priority: number; category: string | null; subject_user_id: string | null; evidence: Record<string, unknown> }>(
        `SELECT id, status, priority, category, subject_user_id, evidence FROM moderation_cases
          WHERE source = 'image_flag' AND evidence->>'mediaKey' = $1 ORDER BY created_at DESC LIMIT 1`,
        [key],
      )
    ).rows[0]!;
  const media = async (key: string) =>
    (
      await pool.query<{ scan_status: string; private_key: string | null; preserve_evidence: boolean; uploader_id: string | null; kind: string | null; content_sha256: string | null }>(
        `SELECT scan_status, private_key, preserve_evidence, uploader_id, kind, content_sha256 FROM media_uploads WHERE key = $1`,
        [key],
      )
    ).rows[0];
  const notices = async (userId: string) =>
    (await pool.query<{ data: Record<string, unknown> }>(`SELECT data FROM notifications WHERE user_id = $1 ORDER BY created_at`, [userId])).rows.map((r) => r.data);
  const pictures = async (view: string, token = admin.token) => (await kit.call('GET', `/admin/pictures?view=${view}`, token)).json() as PictureCaseList;

  beforeAll(async () => {
    app = buildApp(config, {
      moderation: { imageScanner: stub, moderatorCount: async () => 2, mailer: { send: async () => undefined } },
    });
    app.decorate('storage', storage);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    admin = await kit.admin('adm', ['moderator']);
    second = await kit.admin('adm2', ['moderator']);
    people.push(admin, second);
  });

  afterAll(async () => {
    const ids = people.map((p) => p.id);
    const keys = (await pool.query<{ key: string }>(`SELECT key FROM media_uploads WHERE uploader_id = ANY($1::uuid[])`, [ids])).rows.map((r) => r.key);
    await pool.query(`DELETE FROM moderation_cases WHERE source = 'image_flag' AND evidence->>'mediaKey' = ANY($1::text[])`, [keys]);
    await pool.query(`DELETE FROM moderation_cases WHERE subject_user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM image_scans WHERE media_key = ANY($1::text[])`, [keys]);
    await pool.query(`DELETE FROM reports WHERE reporter_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM appeals WHERE user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM sanctions WHERE user_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM groups WHERE owner_id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM media_uploads WHERE key = ANY($1::text[])`, [keys]);
    await pool.end();
    await app.close();
  });

  it('puts a clear picture on the public bucket at once', async () => {
    const me = await person('clear');
    const res = await upload(me.token, await photo());
    expect(res.statusCode).toBe(201);
    const { imageMediaId, url, review } = res.json();
    expect(review).toBe('clear');
    expect(url).toBe(`https://cdn.test/${imageMediaId}`);
    expect(storage.objects.has(imageMediaId)).toBe(true);
    expect(await media(imageMediaId)).toMatchObject({ scan_status: 'cleared', private_key: null, uploader_id: me.id, kind: 'image-post' });
  });

  it('holds an uncertain picture privately, lets only its owner see the post, and publishes it once approved', async () => {
    const me = await person('held');
    const other = await person('heldother');
    stub.queue({ suggestive: 'possible' });
    const up = await upload(me.token, await photo());
    expect(up.statusCode).toBe(201);
    const { imageMediaId: key, url, review } = up.json();
    expect(review).toBe('held');
    expect(url).toMatch(/^https:\/\/signed\.test\/evidence\/quarantine\//);
    // never written to the public bucket, only to private storage
    expect(storage.objects.has(key)).toBe(false);
    const row = await media(key);
    expect(row).toMatchObject({ scan_status: 'held', uploader_id: me.id });
    expect(storage.evidence.has(row!.private_key!)).toBe(true);
    const waiting = await caseOf(key);
    expect(waiting).toMatchObject({ status: 'open', priority: 1, subject_user_id: me.id });

    const post = await kit.call('POST', '/images', me.token, { imageMediaId: key, caption: 'Li çiyê', category: 'image' });
    expect(post.statusCode).toBe(201);
    expect(post.json()).toMatchObject({ status: 'held', review: 'held' });
    expect(post.json().imageUrl).toMatch(/^https:\/\/signed\.test\/evidence\//);
    const postId = post.json().id as string;
    expect((await kit.call('GET', `/images/${postId}`, other.token)).statusCode).toBe(404);
    expect((await kit.call('GET', `/images/${postId}`, null)).statusCode).toBe(404);
    expect((await kit.call('GET', `/images/${postId}`, me.token)).json()).toMatchObject({ review: 'held' });
    const theirs = (await kit.call('GET', `/images?authorId=${me.id}`, other.token)).json().posts as Array<{ id: string }>;
    expect(theirs.map((p) => p.id)).not.toContain(postId);
    const mine = (await kit.call('GET', `/images?authorId=${me.id}`, me.token)).json().posts as Array<{ id: string; review?: string }>;
    expect(mine.find((p) => p.id === postId)?.review).toBe('held');

    const list = await pictures('waiting');
    const item = list.items.find((i) => i.caseId === waiting.id)!;
    expect(item).toMatchObject({
      surface: 'post',
      origin: 'held',
      checkedBy: 'auto',
      context: { text: 'Li çiyê', groupName: null },
      sensitive: false,
      reportCategory: null,
      owner: { id: me.id, minor: false },
      decided: null,
    });
    expect(item.levels?.suggestive).toBe('possible');
    expect(list.counts.waiting).toBeGreaterThanOrEqual(1);
    const summary = (await kit.call('GET', '/admin/moderation/summary', admin.token)).json();
    expect(summary.picturesWaiting).toBeGreaterThanOrEqual(1);

    // the picture itself, as bytes for the console, never cached, every fetch audited
    const image = await kit.call('GET', PICTURE_IMAGE_PATH(waiting.id), admin.token);
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cache-control']).toBe('no-store');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(image.rawPayload.length).toBeGreaterThan(100);
    const audited = await pool.query(`SELECT 1 FROM admin_audit_log WHERE admin_id = $1 AND target_id = $2 AND action LIKE 'GET /admin/pictures/%'`, [
      admin.id,
      waiting.id,
    ]);
    expect(audited.rowCount).toBe(1);
    // nobody but a moderator, and not the picture's owner
    expect([403, 404]).toContain((await kit.call('GET', PICTURE_IMAGE_PATH(waiting.id), me.token)).statusCode);

    const approved = await kit.call('POST', `/admin/pictures/${waiting.id}/decide`, admin.token, { decision: 'approve', note: 'a beach' });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toEqual({ ok: true });
    expect(storage.objects.has(key)).toBe(true);
    expect(await media(key)).toMatchObject({ scan_status: 'cleared', private_key: null });
    expect((await kit.call('GET', `/images/${postId}`, other.token)).json()).toMatchObject({ status: 'published', imageUrl: `https://cdn.test/${key}` });
    expect(await notices(me.id)).toContainEqual({
      kind: 'picture_review',
      outcome: 'approved',
      surface: 'post',
      asked: false,
      target: { type: 'image_post', id: postId },
    });
    const again = await kit.call('POST', `/admin/pictures/${waiting.id}/decide`, admin.token, { decision: 'approve' });
    expect([again.statusCode, again.json().code]).toEqual([409, 'ALREADY_DECIDED']);
    expect((await pictures('decided')).items.find((i) => i.caseId === waiting.id)?.decided?.outcome).toBe('approved');
  });

  it('refuses a clearly sexual picture with a reason its owner can ask a person about, and refuses the same bytes again', async () => {
    const me = await person('refused');
    const other = await person('refusedother');
    const bytes = await photo();
    stub.queue({ sexual: 'likely' });
    const publicBefore = storage.objects.size;
    const res = await upload(me.token, bytes);
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(isPictureRejection(body)).toBe(true);
    expect(body).toMatchObject({ code: 'IMAGE_REJECTED', reason: 'sexual' });
    expect(body.reviewId).toMatch(/^[0-9a-f-]{36}$/);
    // kept privately for the window to ask and appeal, never public
    expect(storage.objects.size).toBe(publicBefore);

    // the same bytes, as a post picture or a profile photo, are refused without asking the checker, with nothing to ask
    const calls = stub.calls;
    const twice = await upload(me.token, bytes);
    expect(twice.json()).toMatchObject({ code: 'IMAGE_REJECTED', reason: 'sexual', reviewId: null });
    const asPhoto = await raw('/me/profile-picture', me.token, bytes);
    expect([asPhoto.statusCode, asPhoto.json().code, asPhoto.json().reviewId]).toEqual([422, 'PHOTO_REJECTED', null]);
    expect(stub.calls).toBe(calls);

    expect((await kit.call('POST', `/me/picture-reviews/${body.reviewId}`, other.token, {})).statusCode).toBe(404);
    expect((await kit.call('POST', '/me/picture-reviews/not-an-id', me.token, {})).statusCode).toBe(404);
    const ask = await kit.call('POST', `/me/picture-reviews/${body.reviewId}`, me.token, { note: 'It is a painting from a museum.' });
    expect([ask.statusCode, ask.json()]).toEqual([202, { ok: true }]);
    const twiceAsked = await kit.call('POST', `/me/picture-reviews/${body.reviewId}`, me.token, {});
    expect([twiceAsked.statusCode, twiceAsked.json().code]).toEqual([409, 'REVIEW_ALREADY_ASKED']);

    const asked = (await pictures('asked')).items.find((i) => i.owner?.id === me.id)!;
    expect(asked).toMatchObject({ origin: 'asked', note: 'It is a painting from a museum.', surface: 'post' });
    const upheld = await kit.call('POST', `/admin/pictures/${asked.caseId}/decide`, admin.token, { decision: 'remove', policy: 'sexual' });
    expect(upheld.statusCode).toBe(200);
    expect(await notices(me.id)).toContainEqual({ kind: 'picture_review', outcome: 'upheld', surface: 'post', asked: true, target: null });
    // upholding a refusal is no sanction
    expect((await pool.query(`SELECT 1 FROM sanctions WHERE user_id = $1`, [me.id])).rowCount).toBe(0);
  });

  it('keeps a possible child-safety hit as evidence, urgently, and decides it only from its case', async () => {
    const me = await person('child');
    stub.queue({ minor_safety: 'possible' });
    const res = await upload(me.token, await photo());
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'IMAGE_REJECTED', reason: 'other', reviewId: null });
    const row = (await pool.query<{ key: string }>(`SELECT key FROM media_uploads WHERE uploader_id = $1`, [me.id])).rows[0]!;
    expect(await media(row.key)).toMatchObject({ scan_status: 'refused', preserve_evidence: true });
    expect(storage.objects.has(row.key)).toBe(false);
    const hit = await caseOf(row.key);
    expect(hit).toMatchObject({ priority: 0, category: 'child_safety', subject_user_id: me.id });
    const item = (await pictures('waiting')).items.find((i) => i.caseId === hit.id)!;
    expect(item).toMatchObject({ origin: 'child_safety', sensitive: true });
    expect((await kit.call('GET', '/admin/moderation/summary', admin.token)).json().picturesUrgent).toBeGreaterThanOrEqual(1);
    const refused = await kit.call('POST', `/admin/pictures/${hit.id}/decide`, admin.token, { decision: 'approve' });
    expect([refused.statusCode, refused.json().code]).toEqual([403, 'SENSITIVE_CASE']);

    // a moderator who finds it innocent clears it from the case itself, and its owner is told they can share it
    const cleared = await kit.call('POST', `/admin/moderation/cases/${hit.id}/decide`, admin.token, { outcome: 'no_violation', notifyReporters: false });
    expect(cleared.statusCode).toBe(200);
    expect(await media(row.key)).toMatchObject({ scan_status: 'cleared' });
    expect(storage.objects.has(row.key)).toBe(true);
  });

  it('holds a new profile photo beside the old one, and an overturned removal puts it on the profile', async () => {
    const me = await person('photo');
    const other = await person('photoother');
    const first = await raw('/me/profile-picture', me.token, await photo());
    expect(first.json()).toMatchObject({ review: 'clear' });
    const live = first.json().profilePhotoUrl as string;

    stub.queue({ suggestive: 'likely' });
    const held = await raw('/me/profile-picture', me.token, await photo());
    expect(held.statusCode, held.body).toBe(200);
    expect(held.json()).toMatchObject({ review: 'held', profilePhotoUrl: live });
    expect(held.json().profilePhotoPending.url).toMatch(/^https:\/\/signed\.test\/evidence\//);
    const pendingKey = (await pool.query<{ k: string }>(`SELECT pending_profile_photo_key AS k FROM users WHERE id = $1`, [me.id])).rows[0]!.k;
    expect(await media(pendingKey)).toMatchObject({ uploader_id: me.id, kind: 'profile-photo', scan_status: 'held' });
    expect((await media(pendingKey))!.content_sha256).toMatch(/^[a-f0-9]{64}$/);

    const own = (await kit.call('GET', '/me', me.token)).json().user;
    expect(own.profilePhotoUrl).toBe(live);
    expect(own.profilePhotoPending.url).toMatch(/^https:\/\/signed\.test\/evidence\//);
    expect((await kit.call('GET', `/users/${me.id}`, me.token)).json().profilePhotoPending).not.toBeNull();
    expect((await kit.call('GET', `/users/${me.id}`, other.token)).json()).not.toHaveProperty('profilePhotoPending');

    const waiting = await caseOf(pendingKey);
    const removed = await kit.call('POST', `/admin/pictures/${waiting.id}/decide`, admin.token, { decision: 'remove', policy: 'sexual', note: 'underwear' });
    expect(removed.statusCode).toBe(200);
    const sanction = (await pool.query<{ id: string; kind: string; policy: string }>(`SELECT id, kind, policy FROM sanctions WHERE user_id = $1`, [me.id])).rows[0]!;
    expect(sanction).toMatchObject({ kind: 'content_removal', policy: 'sexual' });
    expect((await kit.call('GET', '/me', me.token)).json().user.profilePhotoPending).toBeNull();
    expect(await media(pendingKey)).toMatchObject({ scan_status: 'blocked' });

    const standing = (await kit.call('GET', '/me/standing', me.token)).json();
    const removal = [...standing.active, ...standing.past].find((s: { id: string }) => s.id === sanction.id);
    expect(removal.picture.url).toMatch(/^https:\/\/signed\.test\/evidence\//);

    const appeal = await kit.call('POST', '/me/appeals', me.token, { sanctionId: sanction.id, text: 'It is a swimsuit at the sea.' });
    expect(appeal.statusCode).toBe(201);
    const listed = (await kit.call('GET', '/admin/appeals', second.token)).json().appeals.find((a: { id: string }) => a.id === appeal.json().id);
    expect(listed.picture).toEqual({ caseId: waiting.id, sensitive: false });
    const decided = await kit.call('POST', `/admin/appeals/${appeal.json().id}/decide`, second.token, { outcome: 'overturned', note: 'Fine after all.' });
    expect(decided.statusCode).toBe(200);
    expect(await media(pendingKey)).toMatchObject({ scan_status: 'cleared' });
    expect(storage.objects.has(pendingKey)).toBe(true);
    expect((await kit.call('GET', '/me', me.token)).json().user.profilePhotoUrl).toBe(`https://cdn.test/${pendingKey}`);
  });

  it('holds a new group picture for whoever put it up and the admins, while members keep the old one', async () => {
    const owner = await person('gowner');
    const member = await person('gmember');
    const made = await kit.call('POST', '/groups', owner.token, { name: `Pictures ${kit.suffix}` });
    expect(made.statusCode).toBeLessThan(300);
    const gid = made.json().id as string;
    await seatInGroup(pool, gid, member.id);
    stub.queue({ violence: 'possible' });
    const up = await raw(`/groups/${gid}/photo`, owner.token, await photo());
    expect(up.statusCode).toBe(200);
    expect(up.json()).toMatchObject({ review: 'held', photoUrl: null });
    expect(up.json().photoPending.url).toMatch(/^https:\/\/signed\.test\/evidence\//);
    expect((await kit.call('GET', `/groups/${gid}`, owner.token)).json().photoPending.url).toMatch(/^https:\/\/signed/);
    const seen = (await kit.call('GET', `/groups/${gid}`, member.token)).json();
    expect(seen.photoUrl).toBeNull();
    expect(seen).not.toHaveProperty('photoPending');

    const key = (await pool.query<{ k: string }>(`SELECT pending_photo_key AS k FROM groups WHERE id = $1`, [gid])).rows[0]!.k;
    const waiting = await caseOf(key);
    expect((await pictures('waiting')).items.find((i) => i.caseId === waiting.id)?.context.groupName).toBe(`Pictures ${kit.suffix}`);
    await kit.call('POST', `/admin/pictures/${waiting.id}/decide`, admin.token, { decision: 'approve' });
    expect((await kit.call('GET', `/groups/${gid}`, member.token)).json().photoUrl).toBe(`https://cdn.test/${key}`);
    expect(await notices(owner.id)).toContainEqual({ kind: 'picture_review', outcome: 'approved', surface: 'group_photo', asked: false, target: { type: 'group', id: gid } });
  });

  it('holds a picture when the checker cannot be reached, and releases it when a second look finds it clear', async () => {
    const me = await person('outage');
    stub.queue('unavailable');
    const up = await upload(me.token, await photo());
    expect(up.json().review).toBe('held');
    const key = up.json().imageMediaId as string;
    const waiting = await caseOf(key);
    expect(waiting.evidence.checkedBy).toBe('checker_unavailable');
    expect((await pictures('waiting')).items.find((i) => i.caseId === waiting.id)?.levels).toBeNull();

    expect(await app.pictures.recheckUnavailable()).toBeGreaterThanOrEqual(1);
    expect(await media(key)).toMatchObject({ scan_status: 'cleared' });
    expect(storage.objects.has(key)).toBe(true);
    expect((await caseOf(key)).status).toBe('no_violation');
  });

  it('hides a live picture from others once enough people report it, until a person decides', async () => {
    const author = await person('reported');
    const up = await upload(author.token, await photo());
    const key = up.json().imageMediaId as string;
    const post = await kit.call('POST', '/images', author.token, { imageMediaId: key, category: 'image' });
    const postId = post.json().id as string;
    const reporters = [await person('rep1'), await person('rep2'), await person('rep3')];
    // reports from accounts under a day old do not count toward hiding
    await pool.query(`UPDATE users SET created_at = now() - interval '3 days' WHERE id = ANY($1::uuid[])`, [reporters.map((r) => r.id)]);
    for (const [i, r] of reporters.entries()) {
      const filed = await kit.call('POST', '/reports', r.token, { targetType: 'image_post', targetId: postId, category: 'sexual' });
      expect(filed.statusCode).toBeLessThan(300);
      const status = (await pool.query<{ status: string }>(`SELECT status FROM image_posts WHERE id = $1`, [postId])).rows[0]!.status;
      expect(status).toBe(i < 2 ? 'published' : 'held');
    }
    expect(storage.objects.has(key)).toBe(false);
    expect((await kit.call('GET', `/images/${postId}`, reporters[0]!.token)).statusCode).toBe(404);
    const item = (await pictures('reported')).items.find((i) => i.owner?.id === author.id)!;
    expect(item).toMatchObject({ origin: 'reported', reportCategory: 'sexual', reportCount: 3 });

    await kit.call('POST', `/admin/pictures/${item.caseId}/decide`, admin.token, { decision: 'approve' });
    expect((await pool.query<{ status: string }>(`SELECT status FROM image_posts WHERE id = $1`, [postId])).rows[0]!.status).toBe('published');
    expect(storage.objects.has(key)).toBe(true);
  });

  it('takes a picture down through the same removal when staff delete someone else’s post', async () => {
    const author = await person('staffdel');
    const staff = await kit.admin('staff', ['admin']);
    people.push(staff);
    const original = await photo();
    const up = await upload(author.token, original);
    const key = up.json().imageMediaId as string;
    const postId = (await kit.call('POST', '/images', author.token, { imageMediaId: key, category: 'image' })).json().id as string;
    const del = await kit.call('DELETE', `/images/${postId}`, staff.token);
    expect(del.statusCode).toBe(200);
    expect(del.json().status).toBe('removed');
    expect(await media(key)).toMatchObject({ scan_status: 'blocked', preserve_evidence: true });
    expect(storage.objects.has(key)).toBe(false);
    expect((await pool.query(`SELECT 1 FROM sanctions WHERE user_id = $1 AND kind = 'content_removal'`, [author.id])).rowCount).toBe(1);
    // and the same bytes cannot come back under a new upload
    expect((await upload(author.token, original)).json()).toMatchObject({ code: 'IMAGE_REJECTED', reviewId: null });
    expect((await raw('/me/profile-picture', author.token, original)).json()).toMatchObject({ code: 'PHOTO_REJECTED', reviewId: null });
  });

  it('never pays twice for the same picture: what the check found is reused on every kind', async () => {
    const me = await person('reuse');
    const original = await photo();
    stub.queue({ suggestive: 'possible' });
    expect((await upload(me.token, original)).json().review).toBe('held');
    const calls = stub.calls;
    // the same file as a profile photo, resized its own way, keeps the findings without a second call
    const asPhoto = await raw('/me/profile-picture', me.token, original);
    expect(asPhoto.json()).toMatchObject({ review: 'held' });
    expect(stub.calls).toBe(calls);
    const reused = await pool.query<{ model_version: string }>(
      `SELECT s.model_version FROM image_scans s WHERE s.uploader_id = $1 AND s.surface = 'profile_photo'`,
      [me.id],
    );
    expect(reused.rows[0]!.model_version).toMatch(/\(reused\)$/);
  });

  it('never lets the orphan sweep take a picture waiting for a person', async () => {
    const me = await person('sweep');
    stub.queue({ drugs: 'likely' });
    const key = (await upload(me.token, await photo())).json().imageMediaId as string;
    await new MediaService(pool, storage).cleanupOrphans(new Date(Date.now() + 30 * 86_400_000));
    expect(await media(key)).toMatchObject({ scan_status: 'held' });
  });

  it('holds every picture for a person in people mode', async () => {
    const { ImageModerationService } = await import('./image-moderation-service.js');
    const people = new ImageModerationService(pool, { scanner: stub, mode: 'people' });
    const before = stub.calls;
    expect(await people.check(await photo(), 'post')).toMatchObject({ outcome: { state: 'held' }, checkedBy: 'people_only', levels: null });
    const none = new ImageModerationService(pool, { scanner: null });
    expect(await none.check(await photo(), 'profile_photo')).toMatchObject({ outcome: { state: 'held' }, checkedBy: 'people_only' });
    const capped = new ImageModerationService(pool, { scanner: stub, dailyLimit: 0 });
    expect(await capped.check(await photo(), 'post')).toMatchObject({ outcome: { state: 'held' }, checkedBy: 'people_only' });
    expect(stub.calls).toBe(before);
  });
});
