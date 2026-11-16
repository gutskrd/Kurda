/**
 * The pictures a story can wear as its cover: the five painted for the
 * library's legends alone (scripts/cosmetic-art/story-covers.mjs), and the
 * backgrounds the shop already draws (scripts/cosmetic-art/backgrounds.mjs),
 * each a Kurdish place or moment painted as a scene, or one of the seven
 * kilims. A story's `cover` stores one of these keys; the admin offers the
 * list, and the apps draw the picture the key names as the cover band over
 * the story's title. One list, so the admin never offers a picture the apps
 * cannot draw, and the apps never meet a key they do not know.
 *
 * A story with no cover of its own is not left bare: it is given one of the
 * seven kilims (`storyCoverFor`), chosen from its slug, so a shelf of such
 * stories is a row of different rugs and a story lies on the same rug
 * wherever and whenever it is shown. Each kilim has a plain colour that
 * stands for it — what a card shows while the picture is on its way, and what
 * is left there if it never arrives.
 *
 * The shop's files are numbered in its order (`made-06-gola-sin.webp`), which
 * is why the number is kept here beside the key rather than worked out. The
 * legends' own covers are not for sale and have no place in that order, so
 * their files are named for them instead (`story-kawa.webp`), in the same
 * folder.
 */

export interface StoryCover {
  /** what `stories.cover` stores */
  key: string;
  /** the file under /cosmetics/backgrounds/: numbered in the shop's order, or named for the legend it was painted for */
  file: string;
  /** its name in Kurmancî, as the shop (or, for a legend's own cover, the admin) lists it */
  ku: string;
  /** its name in English */
  en: string;
  /** a painted scene, or a woven kilim */
  kind: 'scene' | 'kilim';
}

/** One of the seven kilims: a cover like any other, and the cover of a story that has none of its own. */
export interface StoryRug extends StoryCover {
  kind: 'kilim';
  /** its main colour, measured from the picture: shown while the picture loads, and left in its place if it cannot */
  ground: string;
}

const cover = (n: number, key: string, ku: string, en: string): StoryCover => ({
  key,
  file: `made-${String(n).padStart(2, '0')}-${key}.webp`,
  ku,
  en,
  kind: 'scene',
});

/** A cover painted for one legend alone, not sold in the shop: its file is named for it, not numbered. */
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

/** Every cover: the legends' own first, then the shop's in its order — the scenes, then the kilims. */
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

/** Where the pictures live on the website, which the phone app loads them from too. */
export const STORY_COVER_DIR = '/cosmetics/backgrounds';

const byKey = new Map(STORY_COVERS.map((c) => [c.key, c]));
const rugByKey = new Map(STORY_RUGS.map((r) => [r.key, r]));

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

/**
 * A slug as a number (FNV-1a, 32 bits). The same slug gives the same number
 * on the server, the phone and the website, in this release and the next,
 * which is what lets each of them lay a story on the same rug without asking
 * the others.
 */
function slugHash(slug: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The kilim a story without a cover of its own is given: one of the seven, always the same one for the same slug. */
export function storyRugFor(slug: string): StoryRug {
  return STORY_RUGS[slugHash(slug) % STORY_RUGS.length]!;
}

/** What to draw as a story's cover, and what to draw under it. */
export interface StoryCoverArt {
  /** the story's own cover, or the kilim it is given */
  cover: StoryCover;
  /** the site path of its picture */
  path: string;
  /** a plain colour for the cover's box: there while the picture loads, and all there is if it cannot */
  ground: string;
}

/**
 * The cover to draw for a story: its own picture when its `cover` is a key
 * this list knows; otherwise — no cover chosen, or a key from before a
 * picture was taken out — the kilim its slug gives it. The ground is the
 * colour of the kilim drawn, and under a painted scene the colour of the
 * kilim the story would otherwise have had, so a picture that fails leaves a
 * plain card in a rug's colour rather than a hole.
 */
export function storyCoverFor(story: { slug: string; cover?: string | null }): StoryCoverArt {
  const given = storyRugFor(story.slug);
  const shown = storyCover(story.cover) ?? given;
  return { cover: shown, path: `${STORY_COVER_DIR}/${shown.file}`, ground: (rugByKey.get(shown.key) ?? given).ground };
}
