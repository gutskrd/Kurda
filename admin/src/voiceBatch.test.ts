// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeLipsync } from '@kurda/shared';
import type { Item } from './lessonAudio';
import { fakeDecoder } from './test/audio';
import {
  TimelineError,
  countByKind,
  fromAlphabet,
  fromLessons,
  needsSpeaker,
  needsTimeline,
  timelineFromUrl,
  type VoiceRecording,
} from './voiceBatch';

afterEach(() => vi.unstubAllGlobals());

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

  it('counts, kind by kind, what has no character and what has one but no timeline', () => {
    const counts = countByKind([rec({}), rec({ speaker: 'hamo' }), rec({ speaker: 'hamo', hasLipsync: true }), rec({ kind: 'alphabet' })]);
    expect(counts).toEqual([
      { kind: 'lesson', recorded: 3, noSpeaker: 1, noTimeline: 1 },
      { kind: 'alphabet', recorded: 1, noSpeaker: 1, noTimeline: 0 },
    ]);
  });
});

describe('a timeline from a stored recording', () => {
  it('downloads the file without the panel’s credentials and times the mouth from it', async () => {
    fakeDecoder({ seconds: 0.9 });
    const get = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', get);
    const data = await timelineFromUrl(rec({ text: 'Silav' }));
    expect(decodeLipsync(data).durationMs).toBe(900);
    expect(get).toHaveBeenCalledWith('https://media.hevalo.app/k.wav', expect.objectContaining({ credentials: 'omit' }));
    expect(new Headers((get.mock.calls[0] as unknown as [string, RequestInit])[1].headers).has('authorization')).toBe(false);
  });

  it('says, naming the host, when the browser is not allowed to read the file from another site', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const err = await timelineFromUrl(rec({})).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TimelineError);
    expect(err).toMatchObject({ reason: 'blocked' });
    expect((err as Error).message).toMatch(/media\.hevalo\.app/);
    expect((err as Error).message).toMatch(/CORS/);
  });

  it('tells a missing file and an unreadable one apart', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    await expect(timelineFromUrl(rec({}))).rejects.toMatchObject({ reason: 'http', message: 'The file could not be downloaded (HTTP 404).' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]))));
    fakeDecoder({ fail: true });
    await expect(timelineFromUrl(rec({}))).rejects.toMatchObject({ reason: 'decode' });
  });

  it('lets a cancel through as it is, not as a failure of the file', async () => {
    const abort = new AbortController();
    abort.abort();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new DOMException('stopped', 'AbortError'))));
    await expect(timelineFromUrl(rec({}), abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
