import { describe, expect, it, vi } from 'vitest';
import { registerDevice, removeDevice } from './pushClient.js';
import type { ApiClient } from '../api/client';

function fakeClient() {
  const post = vi.fn(async () => ({ ok: true, data: {} }));
  return { client: { post } as unknown as ApiClient, post };
}

describe('pushClient', () => {
  it('registerDevice posts the token + platform', async () => {
    const { client, post } = fakeClient();
    await registerDevice(client, { token: 'tok', platform: 'ios' });
    expect(post).toHaveBeenCalledWith('/me/devices', { token: 'tok', platform: 'ios' });
  });

  it('removeDevice posts to the remove endpoint', async () => {
    const { client, post } = fakeClient();
    await removeDevice(client, 'tok');
    expect(post).toHaveBeenCalledWith('/me/devices/remove', { token: 'tok' });
  });
});
