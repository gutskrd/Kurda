/**
 * The pictures a story can wear as its cover: the backgrounds the shop
 * already draws (scripts/cosmetic-art/backgrounds.mjs), each a Kurdish place
 * or moment painted as a scene, or one of the seven kilims. A story's `cover`
 * stores one of these keys; the admin offers the list, and the apps draw the
 * picture the key names as the cover band over the story's title. One list,
 * so the admin never offers a picture the apps cannot draw, and the apps never
 * meet a key they do not know.
 *
 * The files are numbered in the shop's order (`made-06-gola-sin.webp`), which
 * is why the number is kept here beside the key rather than worked out.
 */

export interface StoryCover {
  /** what `stories.cover` stores */
  key: string;
  /** the file under /cosmetics/backgrounds/, numbered in the shop's order */
  file: string;
  /** its name in Kurmancî, as the shop lists it */
  ku: string;
  /** its name in English */
  en: string;
  /** a painted scene, or a woven kilim */
  kind: 'scene' | 'kilim';
}

const cover = (n: number, key: string, ku: string, en: string, kind: StoryCover['kind'] = 'scene'): StoryCover => ({
  key,
  file: `made-${String(n).padStart(2, '0')}-${key}.webp`,
  ku,
  en,
  kind,
});

/** Every cover, in the shop's order: the scenes first, then the kilims. */
export const STORY_COVERS: readonly StoryCover[] = [
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
  cover(21, 'kilima-sor', 'Kilîma Sor', 'Red kilim', 'kilim'),
  cover(22, 'kilima-mor', 'Kilîma Mor', 'Purple kilim', 'kilim'),
  cover(23, 'kilima-zer', 'Kilîma Zer', 'Gold kilim', 'kilim'),
  cover(24, 'kilima-kesk', 'Kilîma Kesk', 'Green kilim', 'kilim'),
  cover(25, 'kilima-sin', 'Kilîma Şîn', 'Blue kilim', 'kilim'),
  cover(26, 'kilima-gulan', 'Kilîma Gulan', 'Rose kilim', 'kilim'),
  cover(27, 'kilima-seve', 'Kilîma Şevê', 'Night kilim', 'kilim'),
];

/** Where the pictures live on the website, which the phone app loads them from too. */
export const STORY_COVER_DIR = '/cosmetics/backgrounds';

const byKey = new Map(STORY_COVERS.map((c) => [c.key, c]));

/** The cover a key names, or null for a key the apps cannot draw (none, or one from before a picture was taken out). */
export function storyCover(key: string | null | undefined): StoryCover | null {
  return key ? (byKey.get(key) ?? null) : null;
}

export function isStoryCover(key: unknown): key is string {
  return typeof key === 'string' && byKey.has(key);
}

/** The site path of a cover's picture (`/cosmetics/backgrounds/made-06-gola-sin.webp`), or null for a key that is not one. */
export function storyCoverPath(key: string | null | undefined): string | null {
  const c = storyCover(key);
  return c ? `${STORY_COVER_DIR}/${c.file}` : null;
}
