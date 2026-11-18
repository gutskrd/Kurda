/**
 * The raw uploads that bypass the API client (photoUpload.ts, library/voiceUpload.ts): an expired session is renewed
 * through the client and the bytes sent once more, as for the composer's pictures.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadAsync = vi.fn();
vi.mock('expo-file-system/legacy', () => ({ uploadAsync: (...args: unknown[]) => uploadAsync(...args), FileSystemUploadType: { BINARY_CONTENT: 0 } }));

import type { ApiClient } from '../api/client';
import { uploadVoiceNote } from '../library/voiceUpload';
import { uploadProfilePhoto } from './photoUpload';

const t = (key: string) => key;

/** A client whose token is renewed by any request through it, as the real one renews an expired one. */
function client() {
  let token = 'old';
  const get = vi.fn(async () => {
    token = 'new';
    return { ok: true, data: {} };
  });
  return { client: { baseUrl: 'https://api.test', getAccessToken: async () => token, get } as unknown as ApiClient, get };
}

const sentWith = () => uploadAsync.mock.calls.map((call) => (call[2] as { headers: Record<string, string> }).headers.authorization);

beforeEach(() => uploadAsync.mockReset());

describe('uploads past the client', () => {
  it('renews a session that ran out and sends the photo again', async () => {
    uploadAsync.mockResolvedValueOnce({ status: 401, body: '{}' }).mockResolvedValueOnce({ status: 200, body: JSON.stringify({ profilePhotoUrl: 'https://cdn.test/me.jpg' }) });
    const c = client();
    expect(await uploadProfilePhoto(c.client, { uri: 'file:///me.jpg', contentType: 'image/jpeg' }, t)).toEqual({ ok: true, url: 'https://cdn.test/me.jpg' });
    expect(c.get).toHaveBeenCalledWith('/me');
    expect(sentWith()).toEqual(['Bearer old', 'Bearer new']);
  });

  it('renews a session that ran out and sends the voice note again', async () => {
    uploadAsync.mockResolvedValueOnce({ status: 401, body: '{}' }).mockResolvedValueOnce({ status: 201, body: JSON.stringify({ audioMediaId: 'a1', url: 'https://cdn.test/a1.m4a' }) });
    const c = client();
    expect(await uploadVoiceNote(c.client, { uri: 'file:///note.m4a' }, t)).toEqual({ ok: true, audioMediaId: 'a1', url: 'https://cdn.test/a1.m4a' });
    expect(sentWith()).toEqual(['Bearer old', 'Bearer new']);
  });

  it('sends once when the session is fresh, and says so when there is none', async () => {
    uploadAsync.mockResolvedValueOnce({ status: 200, body: JSON.stringify({ profilePhotoUrl: 'https://cdn.test/me.jpg' }) });
    const c = client();
    await uploadProfilePhoto(c.client, { uri: 'file:///me.jpg', contentType: 'image/jpeg' }, t);
    expect(uploadAsync).toHaveBeenCalledTimes(1);
    expect(c.get).not.toHaveBeenCalled();
    const none = { baseUrl: 'https://api.test', getAccessToken: async () => null, get: vi.fn() } as unknown as ApiClient;
    expect(await uploadProfilePhoto(none, { uri: 'file:///me.jpg', contentType: 'image/jpeg' }, t)).toEqual({ ok: false, error: 'upload.sessionExpired' });
  });
});
