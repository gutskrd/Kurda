/**
 * The gifts' pictures (gift-art.ts) and the files drawn from them (scripts/generate-gift-art.mjs): each a well-formed,
 * self-contained picture painted flat, the same every time and light enough to inline, and the committed PNGs are what
 * the generator draws.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import * as shared from '../index.js';
import { characterSvg } from '../characters/index.js';
import { GIFT_ART_IDS, giftArtKey, giftArtSvg, isGiftArtId, type GiftArtId } from './gift-art.js';
import { pigeon } from './pigeon.js';
import { Drawing } from './svg.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GIFT_DIR = 'web/public/cosmetics/gifts';

/** Only what the phone's SVG renderer draws the same as a browser. */
const ALLOWED = new Set(['svg', 'title', 'defs', 'g', 'path', 'circle', 'ellipse', 'rect', 'clipPath']);

/** The tags of a drawing in order, checked to open and close in step; throws on anything malformed. */
function tags(svg: string): string[] {
  const names: string[] = [];
  const open: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[A-Za-z][\w:-]*="[^"<]*")*)\s*(\/?)>/g)) {
    const [, closing, name, , selfClosing] = m as unknown as [string, string, string, string, string];
    if (closing) {
      if (open.pop() !== name) throw new Error(`</${name}> out of order`);
      continue;
    }
    names.push(name);
    if (!selfClosing) open.push(name);
  }
  if (open.length) throw new Error(`<${open.at(-1)}> never closed`);
  return names;
}

describe('the gifts’ pictures', () => {
  it('draws every gift as a labelled, self-contained picture at the sizes the apps show it', () => {
    for (const id of GIFT_ART_IDS) {
      for (const size of [48, 96, 240, 512]) {
        const svg = giftArtSvg({ id, size });
        expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120" role="img"`), id).toBe(true);
        const names = tags(svg);
        expect(names[0]).toBe('svg');
        expect(names[1]).toBe('title');
        expect(names.filter((name) => !ALLOWED.has(name)), id).toEqual([]);
        const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, id).toBe(ids.length);
        for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids, id).toContain(ref);
        expect(svg).toMatch(new RegExp(`aria-labelledby="${ids[0]}"`));
        expect(/NaN|Infinity|undefined|https?:|<image|<script|<style|<text|<use|data:|javascript:/.test(svg.replace('http://www.w3.org/2000/svg', '')), id).toBe(false);
      }
    }
  });

  it('paints flat, as gouache is laid on: no gradient, filter, mask or pattern anywhere', () => {
    for (const id of GIFT_ART_IDS) expect(giftArtSvg({ id })).not.toMatch(/Gradient|filter|mask|pattern/i);
  });

  it('draws the same picture every time, and a different one for every gift', () => {
    const drawn = GIFT_ART_IDS.map((id) => giftArtSvg({ id }));
    expect(GIFT_ART_IDS.map((id) => giftArtSvg({ id }))).toEqual(drawn);
    expect(new Set(drawn).size).toBe(GIFT_ART_IDS.length);
  });

  it('keeps ids apart between gifts on one page, and uses a caller’s prefix', () => {
    const seen = new Set<string>();
    for (const id of GIFT_ART_IDS) {
      for (const [, ref] of giftArtSvg({ id }).matchAll(/ id="([^"]+)"/g)) {
        expect(seen.has(ref!), ref).toBe(false);
        seen.add(ref!);
      }
    }
    const svg = giftArtSvg({ id: 'heyv', idPrefix: 'chatGift' });
    expect([...svg.matchAll(/ id="([^"]+)"/g)].every((m) => m[1]!.startsWith('chatGift'))).toBe(true);
  });

  it('labels itself, and escapes a caller’s label', () => {
    expect(giftArtSvg({ id: 'cay' })).toContain('>A glass of tea on its saucer</title>');
    expect(giftArtSvg({ id: 'gul', title: 'Gul <ji bo te> & "silav"' })).toContain('>Gul &lt;ji bo te&gt; &amp; &quot;silav&quot;</title>');
  });

  it('stays light enough to inline a chat of them', () => {
    for (const id of GIFT_ART_IDS) expect(giftArtSvg({ id }).length, id).toBeLessThan(48 * 1024);
  });

  it('draws Hevalo and the pen pal pigeon from their own drawings, never a copy redrawn', () => {
    const paths = (svg: string): string[] => [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]!);
    const ask = giftArtSvg({ id: 'ask' });
    const deer = paths(characterSvg('hevalo', { crop: 'full', idPrefix: 'rig' }));
    expect(deer.length).toBeGreaterThan(10);
    for (const d of deer) expect(ask).toContain(d);
    const bird = new Drawing('rig');
    pigeon(bird, 'grey', 'perched', true, false);
    const kevok = giftArtSvg({ id: 'kevok' });
    for (const d of paths(bird.parts().body)) expect(kevok).toContain(d);
  });

  it('refuses a gift nobody has drawn and a size that is not one', () => {
    expect(isGiftArtId('kadiz')).toBe(true);
    expect(isGiftArtId('deste-gul')).toBe(true);
    expect(isGiftArtId('stran')).toBe(false);
    expect(() => giftArtSvg({ id: 'stran' as GiftArtId })).toThrow(RangeError);
    expect(() => giftArtSvg({ id: 'cay', size: 0 })).toThrow(RangeError);
    expect(() => giftArtSvg({ id: 'cay', size: Number.NaN })).toThrow(RangeError);
    expect(() => giftArtSvg({ id: 'cay', idPrefix: '1 bad' })).toThrow(RangeError);
  });

  it('is the picture the shared package hands the apps', () => {
    expect(shared.giftArtSvg({ id: 'mal' })).toBe(giftArtSvg({ id: 'mal' }));
    expect(shared.GIFT_ART_IDS).toBe(GIFT_ART_IDS);
  });
});

describe('the gifts’ files', () => {
  it('names each file by its place in the list and its id, under the shop’s art', () => {
    expect(giftArtKey('cay')).toBe('gifts/made-01-cay.png');
    expect(giftArtKey('deste-gul')).toBe('gifts/made-18-deste-gul.png');
    const last = GIFT_ART_IDS[GIFT_ART_IDS.length - 1]!;
    expect(giftArtKey(last)).toBe(`gifts/made-${String(GIFT_ART_IDS.length).padStart(2, '0')}-${last}.png`);
    expect(new Set(GIFT_ART_IDS.map(giftArtKey)).size).toBe(GIFT_ART_IDS.length);
  });

  it('keeps every file it has shipped where it was: new gifts only go on the end', () => {
    expect(GIFT_ART_IDS.slice(0, 8)).toEqual(['cay', 'qehwe', 'gul', 'pisik', 'belem', 'mal', 'heyv', 'kadiz']);
    expect(GIFT_ART_IDS).toHaveLength(31);
  });

  it('ships one square PNG with its transparency for every gift, within the icons’ budget, and nothing else', async () => {
    expect(readdirSync(join(ROOT, GIFT_DIR)).sort()).toEqual(GIFT_ART_IDS.map((id) => giftArtKey(id).replace('gifts/', '')).sort());
    for (const id of GIFT_ART_IDS) {
      const file = readFileSync(join(ROOT, 'web/public/cosmetics', giftArtKey(id)));
      expect(file.length, id).toBeLessThanOrEqual(80 * 1024);
      const meta = await sharp(file).metadata();
      expect([meta.format, meta.width, meta.height, meta.hasAlpha], id).toEqual(['png', 512, 512, true]);
    }
  });

  it('is what the script paints: painted again, the same picture', async () => {
    const out = mkdtempSync(join(tmpdir(), 'hevalo-gift-'));
    try {
      execFileSync(process.execPath, [join(ROOT, 'scripts/generate-gift-art.mjs'), '--out', out, '--only', 'cay'], { cwd: ROOT, stdio: 'pipe' });
      const file = giftArtKey('cay');
      const [again, shipped] = await Promise.all([
        sharp(join(out, 'web/public/cosmetics', file)).ensureAlpha().raw().toBuffer(),
        sharp(join(ROOT, 'web/public/cosmetics', file)).ensureAlpha().raw().toBuffer(),
      ]);
      expect(again.length).toBe(shipped.length);
      let worst = 0;
      for (let i = 0; i < again.length; i++) worst = Math.max(worst, Math.abs(again[i]! - shipped[i]!));
      // Byte for byte with the same encoder; within a hair with another build of it.
      expect(worst).toBeLessThanOrEqual(2);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
