import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-file-system/legacy', () => ({}));
import type { ApiClient } from '../api/client';
import type { TranslationKey } from '../i18n/translations';
import { describePostError } from './errors';
import { uploadPicture, type UploadDeps } from './upload';

const t = (key: TranslationKey, vars?: Record<string, string | number>) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

function client(tokens: Array<string | null> = ['old']) {
  let i = 0;
  return {
    baseUrl: 'http://api.test',
    getAccessToken: vi.fn(async () => tokens[Math.min(i++, tokens.length - 1)] ?? null),
    get: vi.fn(async () => ({ ok: true, data: {} })),
  } as unknown as ApiClient & { get: ReturnType<typeof vi.fn> };
}

const answer = (status: number, body: unknown): UploadDeps['send'] => async (_url, _uri, _headers, onProgress) => {
  onProgress(50, 100);
  onProgress(100, 100);
  return { status, body: JSON.stringify(body) };
};

describe('uploadPicture', () => {
  it('sends the file to the signed address by default, and reports how far it got', async () => {
    const send = vi.fn(answer(201, { imageMediaId: 'images/x.webp', url: 'https://cdn/x.webp', width: 640, height: 480 }));
    const progress: number[] = [];
    const res = await uploadPicture(client(), { uri: 'file:///x.jpg', contentType: 'image/jpeg', ownWork: true }, t, (f) => progress.push(f), { send });
    expect(res).toEqual({ ok: true, mediaKey: 'images/x.webp', url: 'https://cdn/x.webp', width: 640, height: 480 });
    expect(send.mock.calls[0]![0]).toBe('http://api.test/images/upload');
    expect(send.mock.calls[0]![2]).toEqual({ authorization: 'Bearer old', 'content-type': 'image/jpeg' });
    expect(progress).toEqual([0.5, 1]);
  });

  it('asks for no signature on a picture somebody else made', async () => {
    const send = vi.fn(answer(201, { imageMediaId: 'k' }));
    await uploadPicture(client(), { uri: 'file:///x.heic', contentType: 'image/heic', ownWork: false }, t, () => undefined, { send });
    expect(send.mock.calls[0]![0]).toBe('http://api.test/images/upload?ownWork=false');
    // a type the API's parser does not route is sent as bytes for the server to sniff
    expect(send.mock.calls[0]![2]['content-type']).toBe('application/octet-stream');
  });

  it('refreshes an expired token once and tries again', async () => {
    const c = client(['old', 'new']);
    const send = vi
      .fn<UploadDeps['send']>()
      .mockResolvedValueOnce({ status: 401, body: '{}' })
      .mockResolvedValueOnce({ status: 201, body: JSON.stringify({ imageMediaId: 'k' }) });
    const res = await uploadPicture(c, { uri: 'file:///x.jpg', contentType: 'image/jpeg', ownWork: true }, t, () => undefined, { send });
    expect(res.ok).toBe(true);
    expect(c.get).toHaveBeenCalledWith('/me');
    expect(send.mock.calls[1]![2].authorization).toBe('Bearer new');
  });

  it('says what went wrong in words, by the code', async () => {
    const run = (status: number, body: unknown) =>
      uploadPicture(client(), { uri: 'file:///x.jpg', contentType: 'image/jpeg', ownWork: true }, t, () => undefined, { send: answer(status, body) });
    expect(await run(422, { code: 'IMAGE_REJECTED' })).toEqual({ ok: false, error: 'composer.picture.rejected' });
    expect(await run(415, { code: 'HEIC_UNSUPPORTED' })).toEqual({ ok: false, error: 'composer.picture.notImage' });
    expect(await run(413, { code: 'UPLOAD_TOO_LARGE' })).toEqual({ ok: false, error: 'composer.picture.tooLarge' });
    expect(await run(403, { code: 'MUTED' })).toEqual({ ok: false, error: 'composer.error.paused' });
    expect(await run(429, { code: 'RATE_LIMITED' })).toEqual({ ok: false, error: 'composer.picture.tooMany' });
    expect(await run(500, 'oops')).toEqual({ ok: false, error: 'picture.uploadFailed' });
  });

  it('is offline when the request never arrives', async () => {
    const send = vi.fn<UploadDeps['send']>().mockRejectedValue(new Error('network'));
    expect(await uploadPicture(client(), { uri: 'file:///x.jpg', contentType: 'image/jpeg', ownWork: true }, t, () => undefined, { send })).toEqual({
      ok: false,
      error: 'error.offline',
    });
  });
});

describe('describePostError', () => {
  it('says each refusal the composer can meet in the reader’s words', () => {
    expect(describePostError({ kind: 'client', code: 'TITLE_REQUIRED', message: 'x' }, t)).toBe('composer.error.titleRequired');
    expect(describePostError({ kind: 'client', code: 'MEDIA_IN_USE', message: 'x' }, t)).toBe('composer.error.pictureInUse');
    expect(describePostError({ kind: 'rate_limited', code: 'TRUST_VELOCITY', message: 'x' }, t)).toBe('composer.error.slowDown');
    expect(describePostError({ kind: 'network', message: 'x' }, t)).toBe('error.offline');
  });
});
