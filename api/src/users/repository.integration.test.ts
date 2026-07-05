/**
 * Integration tests — require a migrated Postgres via DATABASE_URL.
 * Skipped in the plain unit-test CI job; executed in the `migrations`
 * CI job right after `migrate:up`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  EmailTakenError,
  InvalidUsernameError,
  UsernameTakenError,
  UsersRepository,
} from './repository.js';

const DATABASE_URL = process.env.DATABASE_URL;
const E_CIRC_DECOMPOSED = 'e' + String.fromCharCode(0x302);

describe.skipIf(!DATABASE_URL)('UsersRepository (integration)', () => {
  let pool: pg.Pool;
  let repo: UsersRepository;
  const suffix = Date.now().toString(36);
  const email = (n: string) => `${n}_${suffix}@test.kurda.app`;
  const name = (n: string) => `${n}_${suffix}`;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new UsersRepository(pool);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@test.kurda.app'`);
    await pool.end();
  });

  it('creates a user with Kurdish username and finds it back', async () => {
    const created = await repo.create({ email: email('şêrîn'), username: name('şêrîn') });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    const found = await repo.findByUsername(name('şêrîn'));
    expect(found?.id).toBe(created.id);
  });

  it('rejects duplicate email case-insensitively', async () => {
    await repo.create({ email: email('dup'), username: name('dupa') });
    await expect(
      repo.create({ email: email('DUP').toUpperCase(), username: name('dupb') }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('rejects duplicate username case-insensitively', async () => {
    await repo.create({ email: email('ucase1'), username: name('Rojda') });
    await expect(
      repo.create({ email: email('ucase2'), username: name('ROJDA') }),
    ).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it('treats decomposed and precomposed usernames as the same name (NFC)', async () => {
    await repo.create({ email: email('nfc1'), username: name('sêro') });
    const decomposed = name(`s${E_CIRC_DECOMPOSED}ro`);
    await expect(repo.create({ email: email('nfc2'), username: decomposed })).rejects.toBeInstanceOf(
      UsernameTakenError,
    );
  });

  it('rejects invalid usernames before hitting the DB', async () => {
    await expect(repo.create({ email: email('bad'), username: 'no way!' })).rejects.toBeInstanceOf(
      InvalidUsernameError,
    );
  });

  it('soft delete hides the user and frees the username', async () => {
    const u = await repo.create({ email: email('gone'), username: name('gone') });
    expect(await repo.softDelete(u.id)).toBe(true);
    expect(await repo.findById(u.id)).toBeNull();
    expect(await repo.findByUsername(name('gone'))).toBeNull();
    // same username can be registered again by a new account
    const again = await repo.create({ email: email('gone2'), username: name('gone') });
    expect(again.id).not.toBe(u.id);
  });

  it('updated_at advances on update (trigger)', async () => {
    const u = await repo.create({ email: email('touch'), username: name('touch') });
    await new Promise((r) => setTimeout(r, 10));
    await pool.query(`UPDATE users SET display_name = 'x' WHERE id = $1`, [u.id]);
    const after = await repo.findById(u.id);
    expect(after && after.updated_at.getTime()).toBeGreaterThan(u.updated_at.getTime());
  });
});
