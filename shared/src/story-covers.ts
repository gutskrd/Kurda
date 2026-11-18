/**
 * The pictures a story's cover can be: five painted for the legends alone (scripts/cosmetic-art/story-covers.mjs) and the
 * shop's backgrounds (scripts/cosmetic-art/backgrounds.mjs), scenes and seven kilims. `stories.cover` stores a key; the
 * admin offers this list and the apps draw it, so neither meets a key the other lacks.
 *
 * A story without a cover gets one of the kilims from its slug (`storyCoverFor`), so a shelf of them is a row of
 * different rugs and a story always has the same one. Each kilim has a plain colour shown while the picture loads and
 * left in place if it fails. Shop files carry the shop's order number (`made-06-gola-sin.webp`), so it is kept beside the
 * key; the legends' covers are not for sale and are named for their legend (`story-kawa.webp`).
 */

export interface StoryCover {
  /** what `stories.cover` stores */
  key: string;
  /** the file under /cosmetics/backgrounds/: numbered in the shop's order, or named for its legend */
  file: string;
  /** its Kurmancî name, as the shop (or, for a legend's cover, the admin) lists it */
  ku: string;
  /** its name in English */
  en: string;
  /** a painted scene, or a woven kilim */
  kind: 'scene' | 'kilim';
}

/** One of the seven kilims: a cover like any other, and the default for a story without one. */
export interface StoryRug extends StoryCover {
  kind: 'kilim';
  /** its main colour, measured from the picture: shown while it loads and left in its place if it cannot */
  ground: string;
}

const cover = (n: number, key: string, ku: string, en: string): StoryCover => ({
  key,
  file: `made-${String(n).padStart(2, '0')}-${key}.webp`,
  ku,
  en,
  kind: 'scene',
});

/** A cover painted for one legend, not sold in the shop, so its file is named for it rather than numbered. */
const legend = (key: string, ku: string, en: string): StoryCover => ({ key, file: `story-${key}.webp`, ku, en, kind: 'scene' });

/** A kilim, with the colour that stands for it. */
const rug = (n: number, key: string, ku: string, en: string, ground: string): StoryRug => ({ ...cover(n, key, ku, en), kind: 'kilim', ground });

/** The seven kilims, in the shop's order. */
export const STORY_RUGS: readonly StoryRug[] = [
  rug(21, 'kilima-sor', 'Kilîma Sor', 'Red kilim', '#926351'),
  rug(22, 'kilima-mor', 'Kilîma Mor', 'Purple kilim', '#8f655a'),
  rug(23, 'kilima-zer', 'Kilîma Zer', 'Gold kilim', '#936e4e'),
  rug(24, 'kilima-kesk', 'Kilîma Kesk', 'Green kilim', '#886f54'),
  rug(25, 'kilima-sin', 'Kilîma Şîn', 'Blue kilim', '#95776a'),
  rug(26, 'kilima-gulan', 'Kilîma Gulan', 'Rose kilim', '#ac917e'),
  rug(27, 'kilima-seve', 'Kilîma Şevê', 'Night kilim', '#2a2b37'),
];

/** Every cover: the legends' own first, then the shop's in its order, scenes before kilims. */
export const STORY_COVERS: readonly StoryCover[] = [
  legend('kawa', 'Kawayê Hesinkar', 'Kawa the blacksmith'),
  legend('sahmaran', 'Şahmaran', 'The serpent queen'),
  legend('mem-u-zin', 'Mem û Zîn', 'Mem and Zîn'),
  legend('siyabend', 'Siyabend û Xecê', 'Siyabend and Xecê'),
  legend('dimdim', 'Kela Dimdimê', 'The fortress of Dimdim'),
  cover(1, 'hevalo', 'Hevalo', 'Hevalo violet'),
  cover(2, 'seva-zozanan', 'Şeva Zozanan', 'Night on the high pastures'),
  cover(3, 'ezmane-sterkan', 'Ezmanê Stêrkan', 'Sky full of stars'),
  cover(4, 'heyva-zivin', 'Heyva Zîvîn', 'Silver moon'),
  cover(5, 'berfa-ciyayan', 'Berfa Çiyayan', 'Snow on the mountains'),
  cover(6, 'gola-sin', 'Gola Şîn', 'Blue lake'),
  cover(7, 'ronahiya-bakur', 'Ronahiya Bakur', 'Northern lights'),
  cover(8, 'bin-erxewanan', 'Binê Erxewanan', 'Under the Judas trees'),
  cover(9, 'berbang', 'Berbang', 'Daybreak'),
  cover(10, 'mija-gulan', 'Mija Gulan', 'Rose mist'),
  cover(11, 'evara-zerin', 'Êvara Zêrîn', 'Golden evening'),
  cover(12, 'agire-newroze', 'Agirê Newrozê', 'Newroz fire'),
  cover(13, 'evara-sor', 'Êvara Sor', 'Red evening'),
  cover(14, 'seva-sor', 'Şeva Sor', 'Red night'),
  cover(15, 'lalezar', 'Lalezar', 'Tulip field'),
  cover(16, 'zozan', 'Zozan', 'High pasture'),
  cover(17, 'bihar', 'Bihar', 'Spring'),
  cover(18, 'daristana-seve', 'Daristana Şevê', 'Forest at night'),
  cover(19, 'mij', 'Mij', 'Mist'),
  cover(20, 'newroz', 'Rengên Newrozê', 'The colours of Newroz'),
  ...STORY_RUGS,
];

/** Where the pictures live on the website, which the phone loads them from too. */
export const STORY_COVER_DIR = '/cosmetics/backgrounds';

const byKey = new Map(STORY_COVERS.map((c) => [c.key, c]));
const rugByKey = new Map(STORY_RUGS.map((r) => [r.key, r]));

/** The cover a key names, or null for a key the apps cannot draw (none, or one whose picture was removed). */
export function storyCover(key: string | null | undefined): StoryCover | null {
  return key ? (byKey.get(key) ?? null) : null;
}

/** The site path of a cover's picture (`/cosmetics/backgrounds/made-06-gola-sin.webp`), or null. */
export function storyCoverPath(key: string | null | undefined): string | null {
  const c = storyCover(key);
  return c ? `${STORY_COVER_DIR}/${c.file}` : null;
}

/** A slug as a 32-bit FNV-1a number, the same on the server, the phone and the website in every release, so all pick the same rug. */
function slugHash(slug: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The kilim a story without its own cover gets: always the same one for the same slug. */
export function storyRugFor(slug: string): StoryRug {
  return STORY_RUGS[slugHash(slug) % STORY_RUGS.length]!;
}

/** What to draw as a story's cover, and what to draw under it. */
export interface StoryCoverArt {
  /** the story's own cover, or the kilim it is given */
  cover: StoryCover;
  /** the site path of its picture */
  path: string;
  /** a plain colour for the cover's box, there while the picture loads and all there is if it fails */
  ground: string;
}

/**
 * The cover to draw for a story: its own when `cover` is a known key, else the kilim its slug gives. The ground is the
 * kilim's colour, under a painted scene too, so a failed picture leaves a rug-coloured card rather than a hole.
 */
export function storyCoverFor(story: { slug: string; cover?: string | null }): StoryCoverArt {
  const given = storyRugFor(story.slug);
  const shown = storyCover(story.cover) ?? given;
  return { cover: shown, path: `${STORY_COVER_DIR}/${shown.file}`, ground: (rugByKey.get(shown.key) ?? given).ground };
}
