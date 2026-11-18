import { describe, expect, it } from 'vitest';
import { sniffAudioType, sniffImageType } from './mimeSniff.js';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('sniffImageType', () => {
  it('detects JPEG / PNG / WebP by magic bytes', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('image/png');
    // RIFF....WEBP
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp');
  });

  it('detects the ISO-BMFF photo formats a phone actually produces', () => {
    // size, "ftyp", then the brand at offset 8
    const bmff = (brand: string) =>
      new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...new Array<number>(8).fill(0)]);

    for (const brand of ['heic', 'heix', 'hevc', 'mif1', 'msf1']) {
      expect(sniffImageType(bmff(brand)), brand).toBe('image/heic');
    }
    expect(sniffImageType(bmff('avif'))).toBe('image/avif');
    expect(sniffImageType(bmff('avis'))).toBe('image/avif');

    // TIFF, both byte orders
    expect(sniffImageType(bytes(0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0))).toBe('image/tiff');
    expect(sniffImageType(bytes(0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8))).toBe('image/tiff');
  });

  it('does not mistake other ISO-BMFF files for photographs', () => {
    const bmff = (brand: string) =>
      new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...new Array<number>(8).fill(0)]);

    // the same container carries video and audio; only the image brands qualify
    expect(sniffImageType(bmff('isom'))).toBeNull();
    expect(sniffImageType(bmff('mp42'))).toBeNull();
    expect(sniffImageType(bmff('M4A '))).toBeNull();
    // "ftyp" present but the brand is cut off
    expect(sniffImageType(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65]))).toBeNull();
  });

  it('does not take text dressed as a HEIF header for a photograph', () => {
    // An SVG that starts with a comment holding "ftypavif": the brand is in place, but the box size is the text "<!--".
    const disguised = new TextEncoder().encode('<!--ftypavif--><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffImageType(disguised)).toBeNull();
    // a box size larger than the file, or not whole brands
    const sized = (size: number) => new Uint8Array([0, 0, 0, size, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, ...new Array<number>(20).fill(0)]);
    expect(sniffImageType(sized(0x18))).toBe('image/avif');
    expect(sniffImageType(sized(0x40))).toBeNull();
    expect(sniffImageType(sized(0x17))).toBeNull();
  });

  it('returns null for non-images and RIFF-but-not-WEBP', () => {
    expect(sniffImageType(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
    expect(sniffImageType(new TextEncoder().encode('just some text'))).toBeNull();
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45))).toBeNull(); // RIFF WAVE
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull(); // truncated
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('sniffAudioType', () => {
  it('detects MP3 (ID3 + frame-sync) and m4a/mp4 (ftyp)', () => {
    expect(sniffAudioType(bytes(0x49, 0x44, 0x33, 0x03, 0, 0))).toBe('audio/mpeg'); // "ID3"
    expect(sniffAudioType(bytes(0xff, 0xfb, 0x90, 0))).toBe('audio/mpeg'); // MPEG frame sync
    expect(sniffAudioType(bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20))).toBe('audio/mp4'); // ....ftypM4A
  });

  it('returns null for non-audio and truncated input', () => {
    expect(sniffAudioType(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull(); // PNG
    expect(sniffAudioType(new TextEncoder().encode('not audio'))).toBeNull();
    expect(sniffAudioType(bytes(0xff))).toBeNull(); // truncated frame sync
    expect(sniffAudioType(new Uint8Array())).toBeNull();
  });

  it('recognises the WebM a browser records, and not a Matroska video', () => {
    // Browser recording produces WebM, which must be recognised as such.
    const ebml = [0x1a, 0x45, 0xdf, 0xa3];
    const webm = Uint8Array.from([...ebml, 0x42, 0x82, 0x84, ...Buffer.from('webm'), 0, 0, 0, 0]);
    expect(sniffAudioType(webm)).toBe('audio/webm');

    // same container, different DocType — a video file, which is not audio
    const mkv = Uint8Array.from([...ebml, 0x42, 0x82, 0x88, ...Buffer.from('matroska'), 0, 0]);
    expect(sniffAudioType(mkv)).toBe(null);

    // EBML magic with no DocType at all is not enough
    expect(sniffAudioType(Uint8Array.from([...ebml, 0, 0, 0, 0]))).toBe(null);
  });
});
