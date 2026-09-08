/**
 * The sticker catalogue, and the loaded pictures behind it.
 *
 * Everything is a picture, emoji included. They used to be drawn as text in
 * whichever emoji font the writer's machine happened to have, which meant a
 * post made on Windows carried Segoe's emoji to everyone who saw it and the
 * same post made on a Mac carried Apple's. One picture, made twice, coming out
 * differently. Drawing from files makes the export identical everywhere.
 *
 * The artwork is Noto Color Emoji (SIL OFL 1.1). Apple's set is not licensed
 * for use off Apple's own platforms and cannot be shipped in a web app; Noto is
 * the closest freely redistributable one. See web/public/emoji/NOTICE.txt.
 *
 * Everything lives under this app's own origin. That is not incidental:
 * drawing a cross-origin image onto a canvas taints it, and a tainted canvas
 * refuses `toBlob` entirely — one sticker from elsewhere would stop the whole
 * picture being posted, not just fail to appear.
 */

export interface PictureSticker {
  src: string;
  name: string;
}

/** Kurdish marks and emblems, kept short — a picker of thousands is a search box. */
export const PICTURE_STICKERS: readonly PictureSticker[] = [
  { src: '/stickers/kurdistan_badge.webp', name: 'Kurdistan' },
  { src: '/stickers/yellow_sun.webp', name: 'Yellow sun' },
  { src: '/stickers/white_sun.webp', name: 'White sun' },
  { src: '/stickers/black_sun.webp', name: 'Black sun' },
  { src: '/stickers/zilan.webp', name: 'Zilan' },
  { src: '/stickers/amed_spor.webp', name: 'Amed Spor' },
  { src: '/stickers/logo.webp', name: 'MyKurda' },
];

export interface EmojiSticker {
  /** the character itself: the accessible name, and the last-resort fallback */
  glyph: string;
  /** codepoints joined by '-', which is also the filename */
  key: string;
}

/** Where an emoji's artwork lives. */
export function emojiSrc(key: string): string {
  return `/emoji/${key}.webp`;
}

/**
 * A curated set rather than all three thousand.
 *
 * A picker of everything is a search problem, and a search box is not what
 * someone decorating a photograph wants in their way. Ordered by kind so the
 * grid reads in bands: faces, then hearts and hands, then marks, then the
 * world, then things.
 */
export const EMOJI_STICKERS: readonly EmojiSticker[] = [
  // faces
  { glyph: '😀', key: '1f600' },
  { glyph: '😂', key: '1f602' },
  { glyph: '🥹', key: '1f979' },
  { glyph: '😍', key: '1f60d' },
  { glyph: '🥰', key: '1f970' },
  { glyph: '😎', key: '1f60e' },
  { glyph: '🤩', key: '1f929' },
  { glyph: '😭', key: '1f62d' },
  { glyph: '😢', key: '1f622' },
  { glyph: '😮', key: '1f62e' },
  { glyph: '🤔', key: '1f914' },
  { glyph: '😅', key: '1f605' },
  { glyph: '🙃', key: '1f643' },
  { glyph: '😴', key: '1f634' },
  { glyph: '🥳', key: '1f973' },
  { glyph: '😇', key: '1f607' },
  // hearts and hands
  { glyph: '❤️', key: '2764' },
  { glyph: '🧡', key: '1f9e1' },
  { glyph: '💛', key: '1f49b' },
  { glyph: '💚', key: '1f49a' },
  { glyph: '💙', key: '1f499' },
  { glyph: '💜', key: '1f49c' },
  { glyph: '👍', key: '1f44d' },
  { glyph: '👏', key: '1f44f' },
  { glyph: '🙏', key: '1f64f' },
  { glyph: '✌️', key: '270c' },
  { glyph: '🤝', key: '1f91d' },
  { glyph: '💪', key: '1f4aa' },
  // marks
  { glyph: '🔥', key: '1f525' },
  { glyph: '✨', key: '2728' },
  { glyph: '⭐', key: '2b50' },
  { glyph: '💯', key: '1f4af' },
  { glyph: '🎉', key: '1f389' },
  { glyph: '🎊', key: '1f38a' },
  { glyph: '🎁', key: '1f381' },
  { glyph: '🏆', key: '1f3c6' },
  { glyph: '🥇', key: '1f947' },
  { glyph: '⚡', key: '26a1' },
  { glyph: '💫', key: '1f4ab' },
  { glyph: '🌈', key: '1f308' },
  // the world
  { glyph: '🌹', key: '1f339' },
  { glyph: '🌻', key: '1f33b' },
  { glyph: '🌞', key: '1f31e' },
  { glyph: '🌙', key: '1f319' },
  { glyph: '🏔️', key: '1f3d4' },
  { glyph: '🕊️', key: '1f54a' },
  { glyph: '🍃', key: '1f343' },
  { glyph: '🌊', key: '1f30a' },
  { glyph: '☕', key: '2615' },
  { glyph: '🎵', key: '1f3b5' },
  // things
  { glyph: '⚽', key: '26bd' },
  { glyph: '🏀', key: '1f3c0' },
  { glyph: '🍉', key: '1f349' },
  { glyph: '🍇', key: '1f347' },
  { glyph: '📚', key: '1f4da' },
  { glyph: '🎬', key: '1f3ac' },
];

const loaded = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<HTMLImageElement | null>>();

/** The decoded picture for `src`, or null if it has not finished loading. */
export function stickerImage(src: string): HTMLImageElement | null {
  return loaded.get(src) ?? null;
}

/**
 * Load a sticker, at most once per src.
 *
 * Resolves null rather than rejecting when a file is missing: one absent
 * sticker should cost you that sticker, not the picture you were making.
 */
export function ensureSticker(src: string): Promise<HTMLImageElement | null> {
  const already = loaded.get(src);
  if (already) return Promise.resolve(already);

  const inFlight = loading.get(src);
  if (inFlight) return inFlight;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      loaded.set(src, img);
      loading.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      loading.delete(src);
      resolve(null);
    };
    img.src = src;
  });
  loading.set(src, promise);
  return promise;
}

/** Load every picture a set of layers refers to, so a draw can be synchronous. */
export async function ensureStickersFor(srcs: readonly (string | undefined)[]): Promise<void> {
  await Promise.all(srcs.filter((s): s is string => typeof s === 'string').map(ensureSticker));
}
