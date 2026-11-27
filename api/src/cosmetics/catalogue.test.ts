/**
 * The cosmetic catalogue against the shipped files. Every asset key in api/content/cosmetics.json must name a file
 * the web app serves, every file in the shop's folders must belong to a row, the made pieces must be the ones
 * scripts/generate-cosmetic-art.mjs draws, every withdrawn item must point at one of them, every price must be a step
 * of the ladder (shared shop-prices.ts), the bundles must be matching sets that save, and every description must have
 * its words in each interface language (shared shop-descriptions.ts).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { GIFTS, PRICE_LADDER, WORDED_BUNDLES, bundleQuote, giftSku, hasShopDescription, itemRarity } from '@kurda/shared';

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
  frames: Row[];
  tags: Omit<Row, 'assetKey'>[];
  bundles: { id: string; name: string; price: number; displayOrder: number; parts: string[]; gifts: { sku: string; count: number }[] }[];
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
  FRAMES: Piece[];
  STICKERS: Piece[];
  backgroundFile(piece: Piece, i: number): string;
  iconFile(piece: Piece, i: number): string;
  frameFile(piece: Piece, i: number): string;
  stickerFile(piece: Piece): string;
}
type MadeRow = [string, 'background' | 'icon', string, string, string, number, boolean, number];
interface Migration {
  MADE: MadeRow[];
  REPLACED_BY: Record<string, string>;
  replacementFor(sku: string, assetKey: string | null): string | null;
}
/** A later migration that renamed pieces 1751000161000 put on sale, by their art. */
interface Renames {
  RENAMED: { assetKey: string; from: [string, string]; to: [string, string] }[];
}
/** The migration that put the frames on sale: [sku, name, description, assetKey, price, displayOrder]. */
interface FramesMigration {
  FRAMES: [string, string, string, string, number, number][];
}
/** The migration that put the animal icons on sale: [sku, name, description, assetKey, price, displayOrder]. */
interface IconsMigration {
  ICONS: [string, string, string, string, number, number][];
}
/** The migration that moved prices down the ladder and put word tags and bundles on sale. */
interface OffersMigration {
  REPRICE: [string, number, number][];
  TAGS: [string, string, string, number, number][];
  BUNDLES: [string, string, number, number, string[], [string, number][]][];
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
  let renames: Renames[];
  let framesOnSale: FramesMigration;
  let offers: OffersMigration;
  let animals: IconsMigration;
  /** A price as the ladder migration left it: moved when it was still at the price it shipped at. */
  const laddered = (sku: string, price: number): number => offers.REPRICE.find(([s, from]) => s === sku && from === price)?.[2] ?? price;

  beforeAll(async () => {
    gen = (await import(pathToFileURL(join(ROOT, 'scripts', 'generate-cosmetic-art.mjs')).href)) as Generator;
    migration = (await import(pathToFileURL(join(ROOT, 'api', 'migrations', '1751000161000_code-made-cosmetics.js')).href)) as Migration;
    // in the order they were applied: a piece renamed twice goes through both names
    renames = [
      (await import(pathToFileURL(join(ROOT, 'api', 'migrations', '1751000179000_tea-glass-and-sun-seal.js')).href)) as Renames,
      (await import(pathToFileURL(join(ROOT, 'api', 'migrations', '1751000430000_tea-is-cay.js')).href)) as Renames,
      (await import(pathToFileURL(join(ROOT, 'api', 'migrations', '1751000743000_tea-glass-is-piyan.js')).href)) as Renames,
    ];
    framesOnSale = (await import(pathToFileURL(join(ROOT, 'api', 'migrations', '1751000431000_frames-to-buy.js')).href)) as FramesMigration;
    offers = (await import(pathToFileURL(join(ROOT, 'api', 'migrations', '1751000890000_fairer-prices-and-bundles.js')).href)) as OffersMigration;
    animals = (await import(pathToFileURL(join(ROOT, 'api', 'migrations', '1751000893000_animal-icons.js')).href)) as IconsMigration;
  });

  it('names a file that exists for every asset key', () => {
    const missing = rows().filter((r) => !existsSync(join(COSMETICS, r.assetKey)));
    expect(missing.map((r) => `${r.sku} → ${r.assetKey}`)).toEqual([]);
  });

  it('sells the frames the generator draws, under its names, each a file that ships and nothing in the folder besides', () => {
    const drawn = gen.FRAMES.map((p, i) => ({ sku: `frame-made-${p.key}`, file: gen.frameFile(p, i), ku: p.ku, en: p.en }));
    const selling = manifest.frames.map((r) => ({ sku: r.sku, file: `web/public/cosmetics/${r.assetKey}`, ku: r.name, en: r.description }));
    expect(selling).toEqual(drawn);
    expect(files('frames').sort()).toEqual(manifest.frames.map((r) => r.assetKey).sort());
    const steps = Object.values(PRICE_LADDER.frame);
    for (const r of manifest.frames) {
      // on the frames' own steps of the ladder, and bought outright: a frame shows only while it is owned
      expect(steps, r.sku).toContain(r.price);
      expect(r.premiumOnly, r.sku).toBe(false);
    }
  });

  it('is the list of frames migration 1751000431000 puts on sale, at the prices Zêr at 100 to the euro halved, then laddered', () => {
    const fromManifest = manifest.frames.map((r) => [r.sku, r.name, r.description ?? '', r.assetKey, r.price, r.displayOrder]);
    expect(
      framesOnSale.FRAMES.map(([sku, name, description, assetKey, price, order]) => [sku, name, description, assetKey, laddered(sku, price / 2), order]),
    ).toEqual(fromManifest);
  });

  it('has a row for every background and icon on disk', () => {
    const named = new Set(rows().map((r) => r.assetKey));
    // A legend's own cover (backgrounds/story-<key>.webp) belongs to the library, so no shop row names it.
    const orphans = [...files('backgrounds'), ...files('icons')].filter((f) => !named.has(f) && !f.startsWith('backgrounds/story-'));
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
          expect(Object.values(PRICE_LADDER.background), r.sku).toContain(r.price);
          expect(r.premiumOnly).toBe(true);
        }
      } else {
        expect(r.sku.startsWith('icon-made-')).toBe(true);
        expect(Object.values(PRICE_LADDER.icon), r.sku).toContain(r.price);
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

  it('is the catalogue migration 1751000161000 applies, under the names later migrations gave its pieces, at half its prices, laddered', () => {
    // the animal icons came later, with their own migration (checked below)
    const later = new Set(animals.ICONS.map(([sku]) => sku));
    const fromManifest = made()
      .filter((r) => !later.has(r.sku))
      .map((r): MadeRow => [r.sku, r.category, r.name, r.description ?? '', r.assetKey, r.price, r.premiumOnly, r.displayOrder]);
    const renamed = (row: MadeRow): MadeRow =>
      renames.flatMap((m) => m.RENAMED).reduce<MadeRow>((acc, r) => (acc[4] === r.assetKey && acc[2] === r.from[0] && acc[3] === r.from[1] ? [acc[0], acc[1], r.to[0], r.to[1], acc[4], acc[5], acc[6], acc[7]] : acc), row);
    const halved = (row: MadeRow): MadeRow => [row[0], row[1], row[2], row[3], row[4], laddered(row[0], row[5] / 2), row[6], row[7]];
    expect(migration.MADE.map(renamed).map(halved).sort()).toEqual(fromManifest.sort());
    const madeByAsset = new Map(made().map((r) => [r.assetKey, r.sku]));
    const fromRetired = Object.fromEntries(retired().map((r) => [r.sku, madeByAsset.get(r.assetKey)]));
    expect(migration.REPLACED_BY).toEqual(fromRetired);
  });

  it('is the list of animal icons migration 1751000893000 puts on sale', () => {
    const later = new Set(animals.ICONS.map(([sku]) => sku));
    const fromManifest = manifest.icons.filter((r) => later.has(r.sku)).map((r) => [r.sku, r.name, r.description ?? '', r.assetKey, r.price, r.displayOrder]);
    expect(animals.ICONS).toEqual(fromManifest);
  });

  it('matches an item made by hand to the art of the file it pointed at', () => {
    expect(migration.replacementFor('bg-background-15', 'backgrounds/background-15.webp')).toBe(migration.REPLACED_BY['bg-background-15']);
    // an admin's own item on a removed file takes that file's replacement
    expect(migration.replacementFor('bg-custom', 'backgrounds/background-02.webp')).toBe(migration.REPLACED_BY['bg-background-02']);
    expect(migration.replacementFor('icon-custom', 'icons/accessoire-icon-13.png')).toBe(migration.REPLACED_BY['icon-accessoire-icon-13']);
    // a removed file that never had a catalogue row falls back by category
    expect(migration.replacementFor('bg-custom', 'backgrounds/background-45.mp4')).toBe('bg-made-hevalo');
    expect(migration.replacementFor('icon-custom', 'icons/accessoire-icon-06.png')).toBe('icon-made-sterk');
    // a SKU that happens to be an Object property is not mistaken for one
    expect(migration.replacementFor('constructor', 'icons/accessoire-icon-07.png')).toBe(migration.REPLACED_BY['icon-accessoire-icon-07']);
    expect(migration.replacementFor('toString', null)).toBeNull();
    // everything else is left alone
    expect(migration.replacementFor('bg-made-zozan', 'backgrounds/made-16-zozan.webp')).toBeNull();
    expect(migration.replacementFor('streak-freeze', null)).toBeNull();
  });

  it('moves every price down to a step of its kind’s ladder, and the retired items with the rest', () => {
    const kinds = new Map<string, keyof typeof PRICE_LADDER>([
      ...manifest.backgrounds.map((r) => [r.sku, 'background'] as const),
      ...manifest.icons.map((r) => [r.sku, 'icon'] as const),
      ...manifest.frames.map((r) => [r.sku, 'frame'] as const),
    ]);
    for (const [sku, from, to] of offers.REPRICE) {
      expect(Object.values(PRICE_LADDER[kinds.get(sku)!]), sku).toContain(to);
      expect(to, sku).toBeLessThan(from);
    }
    // the animal icons went on sale after it, already on the ladder
    const later = new Set(animals.ICONS.map(([sku]) => sku));
    const shipped = [...manifest.backgrounds, ...manifest.icons, ...manifest.frames].filter((r) => r.price > 0 && !later.has(r.sku));
    expect(offers.REPRICE.map(([sku]) => sku).sort()).toEqual(shipped.map((r) => r.sku).sort());
  });

  it('sells the word tags migration 1751000890000 puts on sale, each on the tags’ ladder', () => {
    expect(offers.TAGS).toEqual(manifest.tags.map((r) => [r.sku, r.name, r.description, r.price, r.displayOrder]));
    for (const r of manifest.tags) {
      expect(r.sku.startsWith('tag-'), r.sku).toBe(true);
      expect(Object.values(PRICE_LADDER.tag), r.sku).toContain(r.price);
      expect(r.premiumOnly, r.sku).toBe(false);
    }
  });

  it('sells the bundles migration 1751000890000 puts on sale, each a matching set for a third to a half less than its parts', () => {
    expect(offers.BUNDLES).toEqual(manifest.bundles.map((b) => [b.id, b.name, b.price, b.displayOrder, b.parts, b.gifts.map((g) => [g.sku, g.count])]));
    const items = new Map(
      [
        ...manifest.backgrounds.map((r) => ({ ...r, category: 'background' })),
        ...manifest.icons.map((r) => ({ ...r, category: 'icon' })),
        ...manifest.frames.map((r) => ({ ...r, category: 'frame' })),
        ...manifest.tags.map((r) => ({ ...r, category: 'tag' })),
      ].map((r) => [r.sku, r]),
    );
    const gifts = new Map(GIFTS.map((g) => [giftSku(g.id), g]));
    const prices: number[] = [];
    for (const b of manifest.bundles) {
      const parts = b.parts.map((sku) => items.get(sku)!);
      // one background, one frame, one icon and one tag, every one on sale
      expect(parts.map((p) => p?.category), b.id).toEqual(['background', 'frame', 'icon', 'tag']);
      expect(parts.every((p) => p.active !== false && p.price > 0), b.id).toBe(true);
      // a few small gifts for the bag
      for (const g of b.gifts) {
        expect(gifts.get(g.sku)?.price, g.sku).toBeLessThanOrEqual(50);
        expect(g.count).toBeGreaterThanOrEqual(1);
      }
      const quote = bundleQuote(b.price, [
        ...parts.map((p) => ({ price: p.price, quantity: 1, gift: false, owned: false })),
        ...b.gifts.map((g) => ({ price: gifts.get(g.sku)!.price, quantity: g.count, gift: true, owned: false })),
      ]);
      expect(quote.savingPercent, b.id).toBeGreaterThanOrEqual(35);
      expect(quote.savingPercent, b.id).toBeLessThanOrEqual(50);
      expect(quote.price, b.id).toBe(b.price);
      prices.push(b.price);
    }
    expect(manifest.bundles.length).toBeGreaterThanOrEqual(5);
    expect(manifest.bundles.length).toBeLessThanOrEqual(7);
    // the cheapest is an easy yes: under a month of Hevalo+
    expect(Math.min(...prices)).toBeLessThan(399);
    // every bundle has its words in every language (shared shop-bundles.ts), and its showpiece frame a rarity of its own
    expect([...WORDED_BUNDLES].sort()).toEqual(manifest.bundles.map((b) => b.id).sort());
    expect(itemRarity({ category: 'frame', price: items.get('frame-made-rojgirtin')!.price })).toBe('masterwork');
  });

  it('describes every item it ships in every interface language', () => {
    const items = [...manifest.backgrounds, ...manifest.icons, ...manifest.frames, ...manifest.tags];
    expect(items.filter((r) => r.description && !hasShopDescription(r.description)).map((r) => `${r.sku}: ${r.description}`)).toEqual([]);
  });

  it('ships only the stickers the generator draws', () => {
    const drawn = gen.STICKERS.map((p) => gen.stickerFile(p).split('/').pop()).sort();
    expect(readdirSync(join(ROOT, 'web', 'public', 'stickers')).sort()).toEqual(drawn);
  });
});
