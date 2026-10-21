// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeLipsync } from '@kurda/shared';
import { ApiError, setToken } from './api';
import type { Item } from './lessonAudio';
import { fakeDecoder } from './test/audio';
import { failure, fakeApi, json, on } from './test/fetch';
import {
  TimelineError,
  countByKind,
  dictionaryPage,
  failureLine,
  fromAlphabet,
  fromDictionary,
  fromLessons,
  needsSpeaker,
  needsTimeline,
  retryAfterMs,
  timelineFromFile,
  type VoiceRecording,
} from './voiceBatch';

beforeEach(() => setToken('tok'));
afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
});

function item(text: string, over: Partial<Item> = {}): Item {
  return {
    key: text.toLowerCase(),
    text,
    recorded: true,
    url: `https://media.hevalo.app/${text}.wav`,
    durationMs: 900,
    updatedAt: '2026-10-01T10:00:00.000Z',
    speaker: null,
    hasLipsync: false,
    usedIn: [],
    unused: true,
    ...over,
  };
}

function rec(over: Partial<VoiceRecording>): VoiceRecording {
  return { kind: 'lesson', key: 'k', text: 'Silav', url: 'https://media.hevalo.app/k.wav', durationMs: 900, speaker: null, hasLipsync: false, ...over };
}

describe('every recording, as the Characters page sees it', () => {
  it('lists what is recorded, a lesson’s by its text and a sound by what is said for it', () => {
    const lessons = fromLessons([item('Silav', { speaker: 'hamo', hasLipsync: true }), item('Spas', { recorded: false, url: null })]);
    expect(lessons).toEqual([
      { kind: 'lesson', key: 'silav', text: 'Silav', url: 'https://media.hevalo.app/Silav.wav', durationMs: 900, speaker: 'hamo', hasLipsync: true },
    ]);
    const sounds = fromAlphabet([
      { key: 'kmr:sound:b', url: 'https://media.hevalo.app/b.wav', durationMs: 700, updatedAt: '', speaker: 'xezo', hasLipsync: false },
      { key: 'ckb:sound:eyn', url: 'https://media.hevalo.app/eyn.wav', durationMs: 800, updatedAt: '' },
      { key: 'gone:key', url: 'https://media.hevalo.app/x.wav', durationMs: 800, updatedAt: '' },
    ]);
    expect(sounds).toEqual([
      expect.objectContaining({ kind: 'alphabet', key: 'kmr:sound:b', text: 'ba', script: 'latin', speaker: 'xezo' }),
      expect.objectContaining({ kind: 'alphabet', key: 'ckb:sound:eyn', text: 'عا', script: 'arabic', speaker: null, hasLipsync: false }),
    ]);
  });

  it('gives a character only to what has none, of the kind asked for', () => {
    const none = rec({ speaker: null });
    const some = rec({ speaker: 'hevalo' });
    const letter = rec({ kind: 'alphabet', speaker: null });
    expect([none, some, letter].filter((r) => needsSpeaker(r, 'all'))).toEqual([none, letter]);
    expect([none, some, letter].filter((r) => needsSpeaker(r, 'alphabet'))).toEqual([letter]);
  });

  it('makes timelines only for recordings with a character, and replaces one only when asked', () => {
    const missing = rec({ speaker: 'hamo', hasLipsync: false });
    const has = rec({ speaker: 'hamo', hasLipsync: true });
    const noOne = rec({ speaker: null, hasLipsync: false });
    expect([missing, has, noOne].filter((r) => needsTimeline(r, 'all', false))).toEqual([missing]);
    expect([missing, has, noOne].filter((r) => needsTimeline(r, 'all', true))).toEqual([missing, has]);
    expect([missing, has].filter((r) => needsTimeline(r, 'alphabet', true))).toEqual([]);
  });

  it('counts, kind by kind, what has no character and what has one but no timeline, the dictionary as its list counts it', () => {
    const counts = countByKind([rec({}), rec({ speaker: 'hamo' }), rec({ speaker: 'hamo', hasLipsync: true }), rec({ kind: 'alphabet' })], {
      total: 40,
      noSpeaker: 30,
      speakerNoTimeline: 6,
    });
    expect(counts).toEqual([
      { kind: 'lesson', recorded: 3, noSpeaker: 1, noTimeline: 1 },
      { kind: 'alphabet', recorded: 1, noSpeaker: 1, noTimeline: 0 },
      { kind: 'dictionary', recorded: 40, noSpeaker: 30, noTimeline: 6 },
    ]);
  });

  it('reads a pronunciation as saying its headword, and asks for a page of them by filter and cursor', async () => {
    expect(
      fromDictionary({ id: 'p-1', entryId: 'e-1', headword: 'sêv', dialect: 'kurmanji', url: 'https://upload.wikimedia.org/s.ogg', speaker: 'hamo', hasLipsync: false, lipsync: null }),
    ).toEqual({ kind: 'dictionary', key: 'p-1', text: 'sêv', url: 'https://upload.wikimedia.org/s.ogg', durationMs: null, speaker: 'hamo', hasLipsync: false });
    const api = fakeApi(on('GET', /^\/admin\/dictionary\/audio\?/, json({ items: [], nextCursor: null, counts: { total: 0, noSpeaker: 0, speakerNoTimeline: 0 } })));
    await dictionaryPage({ speaker: 'any', lipsync: 'missing', q: ' sê ' }, 'abc', { limit: 200 });
    expect(api.calls[0]!.path).toBe('/admin/dictionary/audio?speaker=any&lipsync=missing&q=s%C3%AA&cursor=abc&limit=200');
  });
});

describe('a timeline from a stored recording', () => {
  it('reads the file through the API, signed in, and times the mouth from it', async () => {
    fakeDecoder({ seconds: 0.9 });
    const api = fakeApi(on('GET', '/admin/audio/alphabet/file?key=kmr%3Asound%3Ab', json('bytes')));
    const abort = new AbortController();
    const data = await timelineFromFile(rec({ kind: 'alphabet', key: 'kmr:sound:b', text: 'ba', script: 'latin' }), abort.signal);
    expect(decodeLipsync(data).durationMs).toBe(900);
    expect(api.calls.map((c) => c.path)).toEqual(['/admin/audio/alphabet/file?key=kmr%3Asound%3Ab']);
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok');
    expect(init.signal).toBe(abort.signal);
  });

  it('says what the server could not do, in words an editor can act on, naming the site where it helps', async () => {
    const said = async (reply: ReturnType<typeof failure>): Promise<string> => {
      fakeApi(on('GET', /\/file\?/, reply));
      return failureLine(await timelineFromFile(rec({ kind: 'dictionary', key: 'p-1' })).catch((e: unknown) => e));
    };
    expect(await said(failure(502, 'AUDIO_UNREACHABLE', 'upload.wikimedia.org answered 404', { reason: 'status' }))).toBe(
      'Could not get the file: upload.wikimedia.org answered 404.',
    );
    expect(await said(failure(502, 'AUDIO_UNREACHABLE', 'upload.wikimedia.org did not answer in time', { reason: 'timeout' }))).toBe(
      'Could not get the file: upload.wikimedia.org did not answer in time.',
    );
    expect(await said(failure(502, 'AUDIO_UNREACHABLE', 'the recording could not be read from storage', { reason: 'storage' }))).toBe(
      'The file could not be read from media storage.',
    );
    expect(await said(failure(502, 'AUDIO_UNREACHABLE', 'the file there is not a recording', { reason: 'not_audio' }))).toBe('The file at its address is not a recording.');
    expect(await said(failure(422, 'AUDIO_HOST_NOT_ALLOWED', 'old.example.net is not a host recordings are fetched from', { reason: 'host' }))).toBe(
      'The server will not fetch it: old.example.net is not a host recordings are fetched from.',
    );
    expect(await said(failure(422, 'AUDIO_HOST_NOT_ALLOWED', 'x.test leads to an address that is not on the public internet', { reason: 'address' }))).toBe(
      'The server will not fetch it: x.test leads to an address that is not on the public internet.',
    );
    expect(await said(failure(503, 'MEDIA_UNAVAILABLE', 'media storage is not configured'))).toBe('The server has no media storage set up, so the file cannot be read.');
    expect(await said(failure(404, 'NOT_FOUND', 'no dictionary recording has that id'))).toMatch(/^It is gone/);
  });

  it('tells a file the browser cannot decode apart from one it could not get', async () => {
    fakeApi(on('GET', /\/file\?/, json('bytes')));
    fakeDecoder({ fail: true });
    const err = await timelineFromFile(rec({})).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TimelineError);
    expect(failureLine(err)).toBe('The browser could not read the sound in this file.');
  });

  it('lets a cancel through as it is, not as a failure of the file', async () => {
    const abort = new AbortController();
    abort.abort();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new DOMException('stopped', 'AbortError'))));
    await expect(timelineFromFile(rec({}), abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('waits as long as the server asks when it says to slow down, and not for any other refusal', () => {
    expect(retryAfterMs(new ApiError(429, 'RATE_LIMITED', 'slow down', undefined, {}, 7))).toBe(7000);
    expect(retryAfterMs(new ApiError(429, 'RATE_LIMITED', 'slow down'))).toBe(30_000);
    expect(retryAfterMs(new ApiError(502, 'AUDIO_UNREACHABLE', 'x'))).toBeNull();
    expect(retryAfterMs(new TypeError('Failed to fetch'))).toBeNull();
  });
});

