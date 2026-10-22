import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { AdminAccess, type AccessConfig } from './owner-access.js';

const account = (over: Partial<{ email: string | null; email_verified_at: Date | null; roles: string[]; deleted_at: Date | null; banned_at: Date | null }> = {}) => ({
  email: 'owner@example.test',
  email_verified_at: new Date(),
  roles: ['admin', 'superadmin'],
  deleted_at: null,
  banned_at: null,
  ...over,
});

const noPool = {} as pg.Pool;
const config = (over: Partial<AccessConfig>): AccessConfig => ({ ADMIN_ACCESS_EMAILS: '', BOOTSTRAP_ADMIN_EMAILS: '', NODE_ENV: 'production', ...over });

describe('who may use the admin console', () => {
  it('is the listed, confirmed, staff account, the address compared without regard to case', () => {
    const access = new AdminAccess(noPool, config({ ADMIN_ACCESS_EMAILS: ' Owner@Example.test ' }));
    expect(access.allowsAccount(account())).toBe(true);
    expect(access.allowsAccount(account({ email: 'OWNER@example.TEST' }))).toBe(true);
  });

  it('is no one else, whatever their roles, and not the owner unconfirmed, deleted, banned or without a staff role', () => {
    const access = new AdminAccess(noPool, config({ ADMIN_ACCESS_EMAILS: 'owner@example.test' }));
    expect(access.allowsAccount(account({ email: 'moderator@example.test' }))).toBe(false);
    expect(access.allowsAccount(account({ email_verified_at: null }))).toBe(false);
    expect(access.allowsAccount(account({ deleted_at: new Date() }))).toBe(false);
    expect(access.allowsAccount(account({ banned_at: new Date() }))).toBe(false);
    expect(access.allowsAccount(account({ roles: [] }))).toBe(false);
    expect(access.allowsAccount(account({ email: null }))).toBe(false);
  });

  it('falls back to the bootstrap list when no access list is set', () => {
    const access = new AdminAccess(noPool, config({ BOOTSTRAP_ADMIN_EMAILS: 'owner@example.test,second@example.test' }));
    expect(access.allowsAccount(account())).toBe(true);
    expect(access.allowsAccount(account({ email: 'second@example.test' }))).toBe(true);
    expect(access.allowsAccount(account({ email: 'third@example.test' }))).toBe(false);
  });

  it('prefers the access list to the bootstrap list when both are set', () => {
    const access = new AdminAccess(noPool, config({ ADMIN_ACCESS_EMAILS: 'owner@example.test', BOOTSTRAP_ADMIN_EMAILS: 'second@example.test' }));
    expect(access.allowsAccount(account({ email: 'second@example.test' }))).toBe(false);
  });

  it('is shut to everyone in production with no list at all, and left to roles elsewhere', () => {
    const prod = new AdminAccess(noPool, config({}));
    expect(prod.shut).toBe(true);
    expect(prod.allowsAccount(account())).toBe(false);
    const dev = new AdminAccess(noPool, config({ NODE_ENV: 'development' }));
    expect(dev.shut).toBe(false);
    expect(dev.allowsAccount(account({ email: 'anyone@example.test' }))).toBe(true);
    expect(dev.allowsAccount(account({ roles: [] }))).toBe(false);
  });

  it('asks the database on every request, so a revoked role or a grant takes effect at once', async () => {
    let roles = ['admin'];
    let reads = 0;
    const pool = {
      query: async () => {
        reads += 1;
        return { rows: [account({ roles })] };
      },
    } as unknown as pg.Pool;
    const access = new AdminAccess(pool, config({ ADMIN_ACCESS_EMAILS: 'owner@example.test' }));
    expect(await access.allows('u1')).toBe(true);
    roles = [];
    expect(await access.allows('u1')).toBe(false);
    roles = ['admin'];
    expect(await access.allows('u1')).toBe(true);
    expect(reads).toBe(3);
  });

  it('refuses an account that is not there', async () => {
    const access = new AdminAccess({ query: async () => ({ rows: [] }) } as unknown as pg.Pool, config({ NODE_ENV: 'development' }));
    expect(await access.allows('gone')).toBe(false);
  });
});
