import { describe, expect, it } from 'vitest';
import { readWav } from './wav.js';
import { sniffAudioType } from '../media/mimeSniff.js';

/** A PCM WAV of `seconds` of silence. */
function wav(seconds: number, { rate = 22050, format = 1 } = {}): Buffer {
  const data = Math.round(seconds * rate) * 2;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + data, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(format, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(data, 40);
  return b;
}

describe('readWav', () => {
  it('reads a PCM file’s length', () => {
    expect(readWav(wav(1.5))).toEqual({ channels: 1, sampleRate: 22050, bitsPerSample: 16, durationMs: 1500 });
  });

  it('refuses what is not plain PCM WAV', () => {
    expect(readWav(wav(1, { format: 3 }))).toBeNull();
    expect(readWav(Buffer.from('RIFF....WEBPVP8 '))).toBeNull();
    expect(readWav(Buffer.alloc(10))).toBeNull();
  });

  it('is sniffed as WAV', () => {
    expect(sniffAudioType(wav(0.5))).toBe('audio/wav');
  });
});
