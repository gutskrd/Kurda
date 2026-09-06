/**
 * The sticker catalogue, and the loaded pictures behind it.
 *
 * Emoji need nothing: the canvas draws them as text. Pictures do — `drawLayers`
 * is synchronous, because it also backs the export, and an `<img>` that has not
 * finished loading draws as nothing. So they are loaded once, kept, and handed
 * over already decoded.
 *
 * Everything lives under /stickers in this app's own origin. That is not
 * incidental: drawing a cross-origin image onto a canvas taints it, and a
 * tainted canvas refuses `toBlob` entirely — one sticker from elsewhere would
 * stop the whole picture being posted.
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

/** A small, deliberately unfussy set — a picker of 3000 is a search problem. */
export const EMOJI_STICKERS = [
  '❤️', '🔥', '✨', '⭐', '😂', '😍', '😮', '😢', '👍', '👏',
  '🎉', '🌹', '🌞', '🌙', '☕', '🎵', '⚽', '🏔️', '🕊️', '💯',
] as const;

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
