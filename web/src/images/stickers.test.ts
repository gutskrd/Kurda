import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { PICTURE_STICKERS } from './stickers';

/**
 * The picture stickers against the files that ship.
 *
 * The listing is Vite's own view of `public/stickers`, so a sticker whose file
 * was removed, or a file nothing offers, fails here rather than as a blank
 * button in the picker.
 */
const onDisk = Object.keys(import.meta.glob('/public/stickers/*')).map((p) => p.replace(/^\/public/, ''));

describe('picture stickers', () => {
  it('offers only stickers whose picture ships', () => {
    for (const s of PICTURE_STICKERS) expect(onDisk).toContain(s.src);
  });

  it('offers every sticker that ships', () => {
    expect([...onDisk].sort()).toEqual(PICTURE_STICKERS.map((s) => s.src).sort());
  });

  it('has one name per sticker, and a label for each that is not a name', () => {
    const names = PICTURE_STICKERS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of PICTURE_STICKERS) if (s.labelKey) expect(en[s.labelKey]).toBeTruthy();
  });

  it('has no football club crest, no portrait and no black sun', () => {
    for (const s of PICTURE_STICKERS) {
      expect(`${s.src} ${s.name}`).not.toMatch(/amed|zilan|black/i);
    }
  });
});

/**
 * The emoji are Noto's images, which come under the Apache License — it asks
 * for a copy of the licence beside them and a note of what was changed.
 */
const notice = Object.values(
  import.meta.glob<string>('/public/emoji/NOTICE.txt', { query: '?raw', import: 'default', eager: true }),
)[0];

describe('the emoji notice', () => {
  it('carries the Apache License and says the images were changed', () => {
    expect(notice).toMatch(/Licence:\s+Apache License, Version 2\.0/);
    expect(notice).toContain('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION');
    expect(notice).toContain('END OF TERMS AND CONDITIONS');
    expect(notice).toMatch(/resized and re-encoded/);
    expect(notice).not.toMatch(/No changes were made/);
  });
});
