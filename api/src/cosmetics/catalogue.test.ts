/**
 * The cosmetic catalogue against the files that ship.
 *
 * Every asset key in api/content/cosmetics.json must name a file the web app
 * serves, and every file in the shop's folders must belong to a catalogue row:
 * an item pointing at nothing renders as a blank square someone paid for, and
 * a file nothing names is art nobody can account for. The made pieces must be
 * the ones scripts/generate-cosmetic-art.mjs draws, under the names it gives
 * them, and the items withdrawn from sale must all point at one of them.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const COSMETICS = join(ROOT, 'web', 'public', 'cosmetics');

interface Row {
  sku: string;
  name: string;
  description?: string;
  assetKey: string;
  price: number;
  premiumOnly: boolean;
  displayOrder: number;
  active?: boolean;
  type?: string;
}
interface Manifest {
  avatars: { key: string }[];
  icons: Row[];
  backgrounds: Row[];
}
interface Piece {
  key?: string;
  file?: string;
  ku: string;
  en: string;
}
interface Generator {
  BACKGROUNDS: Piece[];
  ICONS: Piece[];
  STICKERS: Piece[];
  backgroundFile(piece: Piece, i: number): string;
  iconFile(piece: Piece, i: number): string;
  stickerFile(piece: Piece): string;
}
type MadeRow = [string, 'background' | 'icon', string, string, string, number, boolean, number];
interface Migration {
  MADE: MadeRow[];
  REPLACED_BY: Record<string, string>;
  replacementFor(sku: string, assetKey: string | null): string | null;
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'api', 'content', 'cosmetics.json'), 'utf8')) as Manifest;
const rows = (): (Row & { category: 'background' | 'icon' })[] => [
  ...manifest.backgrounds.map((r) => ({ ...r, category: 'background' as const })),
  ...manifest.icons.map((r) => ({ ...r, category: 'icon' as const })),
];
const made = (): (Row & { category: 'background' | 'icon' })[] => rows().filter((r) => r.active !== false);
const retired = (): (Row & { category: 'background' | 'icon' })[] => rows().filter((r) => r.active === false);
const files = (dir: string): string[] => readdirSync(join(COSMETICS, dir)).map((f) => `${dir}/${f}`);

describe('the cosmetic catalogue', () => {
  let gen: Generator;
  let migration: Migration;

  beforeAll(async () => {
    gen = (await import(pathToFileURL(join(ROOT, 'scripts', 'generate-cosmetic-art.mjs')).href)) as Generator;
    migration = (await import(pathToFileURL(join(ROOT, 'api', 'migrations', '1751000161000_code-made-cosmetics.js')).href)) as Migration;
  });

  it('names a file that exists for every asset key', () => {
    const missing = rows().filter((r) => !existsSync(join(COSMETICS, r.assetKey)));
    expect(missing.map((r) => `${r.sku} → ${r.assetKey}`)).toEqual([]);
  });

  it('has a row for every background and icon on disk', () => {
    const named = new Set(rows().map((r) => r.assetKey));
    const orphans = [...files('backgrounds'), ...files('icons')].filter((f) => !named.has(f));
    expect(orphans).toEqual([]);
  });

  it('has an avatar entry for every avatar on disk, and a file for every entry', () => {
    const keys = manifest.avatars.map((a) => `avatars/${a.key}.png`).sort();
    expect(files('avatars').sort()).toEqual(keys);
  });

  it('sells exactly what the generator draws, under its names', () => {
    const drawn = [
      ...gen.BACKGROUNDS.map((p, i) => ({ sku: `bg-made-${p.key}`, file: gen.backgroundFile(p, i), ku: p.ku, en: p.en })),
      ...gen.ICONS.map((p, i) => ({ sku: `icon-made-${p.key}`, file: gen.iconFile(p, i), ku: p.ku, en: p.en })),
    ];
    const selling = made().map((r) => ({ sku: r.sku, file: `web/public/cosmetics/${r.assetKey}`, ku: r.name, en: r.description }));
    expect(selling.sort((a, b) => a.sku.localeCompare(b.sku))).toEqual(drawn.sort((a, b) => a.sku.localeCompare(b.sku)));
  });

  it('prices the made pieces sensibly, with a few free backgrounds to start with', () => {
    for (const r of made()) {
      if (r.category === 'background') {
        expect(r.sku.startsWith('bg-made-')).toBe(true);
        expect(r.type).toBe('image');
        if (r.price === 0) expect(r.premiumOnly).toBe(false);
        else {
          expect(r.price).toBeGreaterThanOrEqual(400);
          expect(r.price).toBeLessThanOrEqual(600);
          expect(r.premiumOnly).toBe(true);
        }
      } else {
        expect(r.sku.startsWith('icon-made-')).toBe(true);
        expect(r.price).toBeGreaterThanOrEqual(600);
        expect(r.price).toBeLessThanOrEqual(900);
        expect(r.premiumOnly).toBe(true);
      }
    }
    const free = made().filter((r) => r.category === 'background' && r.price === 0);
    expect(free.length).toBeGreaterThanOrEqual(2);
    expect(free.length).toBeLessThanOrEqual(5);
  });

  it('keeps every old item, withdrawn, wearing a made piece’s art and name', () => {
    const old = retired();
    expect(old.filter((r) => r.sku.startsWith('bg-background-'))).toHaveLength(52);
    expect(old.filter((r) => r.sku.startsWith('icon-accessoire-icon-'))).toHaveLength(17);
    expect(old).toHaveLength(69);
    const byAsset = new Map(made().map((r) => [r.assetKey, r]));
    for (const r of old) {
      const piece = byAsset.get(r.assetKey);
      expect(piece, r.sku).toBeDefined();
      expect(piece!.category).toBe(r.category);
      expect([r.name, r.description]).toEqual([piece!.name, piece!.description]);
    }
  });

  it('is the catalogue migration 1751000161000 applies', () => {
    const fromManifest = made().map((r): MadeRow => [r.sku, r.category, r.name, r.description ?? '', r.assetKey, r.price, r.premiumOnly, r.displayOrder]);
    expect([...migration.MADE].sort()).toEqual(fromManifest.sort());
    const madeByAsset = new Map(made().map((r) => [r.assetKey, r.sku]));
    const fromRetired = Object.fromEntries(retired().map((r) => [r.sku, madeByAsset.get(r.assetKey)]));
    expect(migration.REPLACED_BY).toEqual(fromRetired);
  });

  it('matches an item made by hand to the art of the file it pointed at', () => {
    expect(migration.replacementFor('bg-background-15', 'backgrounds/background-15.webp')).toBe(migration.REPLACED_BY['bg-background-15']);
    // an admin's own item on a removed file takes that file's replacement
    expect(migration.replacementFor('bg-custom', 'backgrounds/background-02.webp')).toBe(migration.REPLACED_BY['bg-background-02']);
    expect(migration.replacementFor('icon-custom', 'icons/accessoire-icon-13.png')).toBe(migration.REPLACED_BY['icon-accessoire-icon-13']);
    // a removed file that never had a catalogue row falls back by category
    expect(migration.replacementFor('bg-custom', 'backgrounds/background-45.mp4')).toBe('bg-made-hevalo');
    expect(migration.replacementFor('icon-custom', 'icons/accessoire-icon-06.png')).toBe('icon-made-sterk');
    // everything else is left alone
    expect(migration.replacementFor('bg-made-zozan', 'backgrounds/made-16-zozan.webp')).toBeNull();
    expect(migration.replacementFor('streak-freeze', null)).toBeNull();
  });

  it('ships only the stickers the generator draws', () => {
    const drawn = gen.STICKERS.map((p) => gen.stickerFile(p).split('/').pop()).sort();
    expect(readdirSync(join(ROOT, 'web', 'public', 'stickers')).sort()).toEqual(drawn);
  });
});
