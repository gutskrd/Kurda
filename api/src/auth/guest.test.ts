/** The pure parts of guest accounts: the generated name, the device hash, and the account guard. */
import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { generateGuestUsername, guestDeviceHash } from './guest.js';
import { validateUsername } from '../users/username.js';
import { isReservedUsername } from '../users/reserved-usernames.js';
import { requireAccount } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';

describe('generateGuestUsername', () => {
  it('is the stem and seven digits, and passes the username policy', () => {
    for (let i = 0; i < 50; i++) {
      const name = generateGuestUsername();
      expect(name).toMatch(/^heval\d{7}$/);
      expect(validateUsername(name)).toEqual({ ok: true, value: name });
      expect(isReservedUsername(name)).toBe(false);
    }
  });

  it('draws every digit from the random source it is given', () => {
    const drawn: number[] = [];
    const name = generateGuestUsername((max) => {
      expect(max).toBe(10);
      drawn.push(drawn.length % 10);
      return drawn[drawn.length - 1]!;
    });
    expect(name).toBe('heval0123456');
  });

  it('never folds to a reserved name, whatever the digits', () => {
    // all zeros fold to "hevalooooooo", which is not "hevalo"; the loop would
    // otherwise draw again, so the result must still be a valid name
    expect(validateUsername(generateGuestUsername(() => 0)).ok).toBe(true);
  });
});

describe('guestDeviceHash', () => {
  it('is a keyed hash: stable for a device, different per device and per secret', () => {
    const a = guestDeviceHash('secret-one', 'device-a');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(guestDeviceHash('secret-one', 'device-a')).toBe(a);
    expect(guestDeviceHash('secret-one', 'device-b')).not.toBe(a);
    expect(guestDeviceHash('secret-two', 'device-a')).not.toBe(a);
    expect(a).not.toContain('device-a');
  });
});

describe('requireAccount', () => {
  function fakeReply(): { reply: FastifyReply; sent: { status?: number; body?: { code: string } } } {
    const sent: { status?: number; body?: { code: string } } = {};
    const reply = {
      code(status: number) {
        sent.status = status;
        return reply;
      },
      send(body: { code: string }) {
        sent.body = body;
        return reply;
      },
    } as unknown as FastifyReply;
    return { reply, sent };
  }

  it('answers a signed-out request as requireAuth does', async () => {
    const { reply, sent } = fakeReply();
    await requireAccount({ id: 'r1' } as unknown as FastifyRequest, reply);
    expect(sent.status).toBe(401);
    expect(sent.body?.code).toBe('UNAUTHORIZED');
  });

  it('refuses a guest with GUEST_ACCOUNT', async () => {
    const { reply } = fakeReply();
    const req = { id: 'r2', user: { id: 'u', roles: [], emailVerified: true, guest: true } } as unknown as FastifyRequest;
    await expect(requireAccount(req, reply)).rejects.toMatchObject({ code: 'GUEST_ACCOUNT', statusCode: 403 });
    await expect(requireAccount(req, reply)).rejects.toBeInstanceOf(AppError);
  });

  it('lets an account through, including one the hook read before the flag existed', async () => {
    const { reply, sent } = fakeReply();
    await requireAccount({ id: 'r3', user: { id: 'u', roles: [], emailVerified: true, guest: false } } as unknown as FastifyRequest, reply);
    await requireAccount({ id: 'r4', user: { id: 'u', roles: [], emailVerified: true } } as unknown as FastifyRequest, reply);
    expect(sent.status).toBeUndefined();
  });
});
