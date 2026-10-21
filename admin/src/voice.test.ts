// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeLipsync } from '@kurda/shared';
import { encodeWav } from './audioClip';
import { failure, fakeApi, json, on } from './test/fetch';
import { fakeDecoder, speechPcm } from './test/audio';
import { makeTimeline, rememberSpeaker, rememberedSpeaker, uploadWithVoice, voiceQuery, wavDurationMs } from './voice';

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** What a query string's lipsync says, read back. */
function lipsyncIn(path: string): ReturnType<typeof decodeLipsync> | null {
  const raw = new URLSearchParams(path.split('?')[1]).get('lipsync');
  return raw === null ? null : decodeLipsync(JSON.parse(raw));
}

describe('who says a new recording', () => {
  it('is Hevalo until the editor picks someone, then whoever they picked last', () => {
    expect(rememberedSpeaker()).toBe('hevalo');
    rememberSpeaker('xezo');
    expect(rememberedSpeaker()).toBe('xezo');
    rememberSpeaker(null);
    expect(rememberedSpeaker()).toBeNull();
    localStorage.setItem('kurda_admin_speaker', 'someone');
    expect(rememberedSpeaker()).toBe('hevalo');
  });

  it('falls back to Hevalo where storage is refused, and remembering then costs nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => rememberSpeaker('hamo')).not.toThrow();
    expect(rememberedSpeaker()).toBe('hevalo');
  });
});

describe('a recording’s mouth timeline', () => {
  it('reads a WAV’s length from its header', () => {
    expect(wavDurationMs(encodeWav(new Float32Array(22050)))).toBe(1000);
    expect(wavDurationMs(new Uint8Array([82, 73, 70, 70]))).toBeNull();
  });

  it('is timed from the sound when the browser can decode it, its channels averaged', async () => {
    const { decoded } = fakeDecoder({ seconds: 1.2, channels: 2 });
    const made = await makeTimeline(new ArrayBuffer(8), 'Silav', { durationMs: 1200 });
    expect(decoded).toHaveLength(1);
    expect(made?.from).toBe('sound');
    const timeline = decodeLipsync(made!.lipsync);
    expect(timeline.durationMs).toBe(1200);
    expect(timeline.cues.some((c) => c.viseme !== 'rest')).toBe(true);
  });

  it('is spread over the words when the sound cannot be decoded, and is nothing when neither works', async () => {
    fakeDecoder({ fail: true });
    const made = await makeTimeline(new ArrayBuffer(8), 'Silav', { durationMs: 900 });
    expect(made?.from).toBe('text');
    expect(decodeLipsync(made!.lipsync).durationMs).toBe(900);
    expect(await makeTimeline(new ArrayBuffer(8), 'Silav', { durationMs: null })).toBeNull();
  });

  it('says no one with speaker=none, and leaves the timeline out when there is none', () => {
    expect(voiceQuery(null, null)).toBe('&speaker=none');
    expect(voiceQuery('hamo', { v: 1, d: 500, k: [[0, 0]] })).toBe(`&speaker=hamo&lipsync=${encodeURIComponent('{"v":1,"d":500,"k":[[0,0]]}')}`);
  });
});

describe('uploading a recording with its voice', () => {
  const wav = encodeWav(speechPcm(1.2));

  it('sends who says it and the timeline made from it, and the WAV untouched', async () => {
    const { decoded } = fakeDecoder({ seconds: 1.2 });
    const api = fakeApi(on('PUT', /^\/admin\/lesson-audio\?/, json({ url: 'https://cdn.test/a.wav' })));
    const sent = vi.mocked(fetch);
    await uploadWithVoice('/admin/lesson-audio?text=Silav', wav, { speaker: 'xezo', text: 'Silav' });
    const [call] = api.calls;
    expect(call!.path).toMatch(/^\/admin\/lesson-audio\?text=Silav&speaker=xezo&lipsync=/);
    expect(lipsyncIn(call!.path)!.durationMs).toBe(1200);
    // decoding takes over the buffer it is given, so it is given a copy and the upload keeps the original
    expect(decoded[0]).not.toBe(wav.buffer);
    expect(decoded[0]!.byteLength).toBe(wav.byteLength);
    expect((sent.mock.calls[0]![1] as RequestInit).body).toBe(wav);
  });

  it('saves the recording without a timeline rather than not at all when the server refuses the timeline', async () => {
    fakeDecoder({ seconds: 1.2 });
    const api = fakeApi(
      on('PUT', /&lipsync=/, failure(400, 'LIPSYNC_TOO_LONG', 'the timeline is longer than the recording')),
      on('PUT', '/admin/alphabet/audio?key=kmr%3Asound%3Ab&speaker=hamo', json({ key: 'kmr:sound:b' })),
    );
    const res = await uploadWithVoice<{ key: string }>('/admin/alphabet/audio?key=kmr%3Asound%3Ab', wav, { speaker: 'hamo', text: 'ba', script: 'latin' });
    expect(res.key).toBe('kmr:sound:b');
    expect(api.calls.map((c) => c.path.includes('&lipsync='))).toEqual([true, false]);
  });

  it('passes any other refusal on to the recorder, which keeps the take', async () => {
    fakeDecoder({ seconds: 1.2 });
    fakeApi(on('PUT', /^\/admin\/lesson-audio/, failure(400, 'TOO_LONG', 'keep it under 15 seconds')));
    await expect(uploadWithVoice('/admin/lesson-audio?text=Silav', wav, { speaker: null, text: 'Silav' })).rejects.toMatchObject({ code: 'TOO_LONG' });
  });
});
