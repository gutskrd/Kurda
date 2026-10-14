import { describe, expect, it, vi } from 'vitest';
import { allowMicHowTo, micPlatform, micProblem, pickMimeType, startCapture } from './micCapture';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';

describe('the microphone, on the phones an editor holds', () => {
  it('asks each browser for a format it can write', () => {
    // Chrome and Android: webm/opus
    expect(pickMimeType((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    // Safari: mp4
    expect(pickMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    // a browser that cannot say: its own default
    expect(pickMimeType(undefined)).toBeUndefined();
    expect(pickMimeType(() => false)).toBeUndefined();
    expect(
      pickMimeType(() => {
        throw new Error('not here');
      }),
    ).toBeUndefined();
  });

  it('knows an iPad asking for the desktop site is still an iPad', () => {
    expect(micPlatform(IPHONE)).toBe('ios');
    expect(micPlatform(IPAD_DESKTOP, 5)).toBe('ios');
    expect(micPlatform(IPAD_DESKTOP, 0)).toBe('other');
    expect(micPlatform(ANDROID)).toBe('android');
  });

  it('says where the switch is for a refused microphone, on the device in hand', () => {
    const refused = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    expect(micProblem(refused, 'ios', true)).toContain('Website Settings › Microphone › Allow');
    expect(micProblem(refused, 'android', true)).toContain('Permissions › Microphone › Allow');
    expect(allowMicHowTo('other')).toContain('allow the microphone for this site');
  });

  it('tells a page without https, a missing microphone and a busy one apart, and always offers the upload', () => {
    const insecure = micProblem(Object.assign(new Error('x'), { name: 'NoMicApi' }), 'android', false);
    expect(insecure).toContain('https');
    const missing = micProblem(Object.assign(new Error('x'), { name: 'NotFoundError' }), 'other', true);
    expect(missing).toContain('No microphone was found');
    const busy = micProblem(Object.assign(new Error('x'), { name: 'NotReadableError' }), 'other', true);
    expect(busy).toContain('busy');
    for (const m of [insecure, missing]) expect(m.toLowerCase()).toContain('upload');
  });

  it('resumes the audio context inside the tap, before the permission prompt, and again after it', async () => {
    // iOS Safari lets a suspended context run only from inside the tap; after the first await it is too late
    const order: string[] = [];
    const node = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null };
    class FakeContext {
      sampleRate = 48_000;
      destination = {};
      resume(): Promise<void> {
        order.push('resume');
        return Promise.resolve();
      }
      close(): Promise<void> {
        return Promise.resolve();
      }
      createMediaStreamSource(): { connect: () => void } {
        return { connect: () => undefined };
      }
      createAnalyser(): { fftSize: number; getFloatTimeDomainData: () => void } {
        return { fftSize: 0, getFloatTimeDomainData: () => undefined };
      }
      createScriptProcessor(): typeof node {
        return node;
      }
    }
    vi.stubGlobal('AudioContext', FakeContext);
    // the older-Safari path, where a context that never runs would mean an empty take
    vi.stubGlobal('MediaRecorder', undefined);
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn(() => {
      order.push('ask');
      return Promise.resolve({ getTracks: () => [track] });
    });
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    try {
      const capture = startCapture();
      // before anything is awaited, the context has already been asked to run
      expect(order).toEqual(['resume', 'ask']);
      (await capture).cancel();
      expect(order).toEqual(['resume', 'ask', 'resume']);
      expect(track.stop).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });
});
