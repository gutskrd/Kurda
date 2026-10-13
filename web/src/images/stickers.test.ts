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
