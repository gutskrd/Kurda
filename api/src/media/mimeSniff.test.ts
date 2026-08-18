import { describe, expect, it } from 'vitest';
import { sniffImageType } from './mimeSniff.js';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('sniffImageType', () => {
  it('detects JPEG / PNG / WebP by magic bytes', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('image/png');
    // RIFF....WEBP
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp');
  });

  it('returns null for non-images and RIFF-but-not-WEBP', () => {
    expect(sniffImageType(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
    expect(sniffImageType(new TextEncoder().encode('just some text'))).toBeNull();
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toBeNull(); // RIFF WAVE
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull(); // truncated
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});
