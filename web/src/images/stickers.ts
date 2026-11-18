/**
 * The sticker catalogue and its loaded pictures. Emoji are pictures too, so an export looks the same on every system.
 * The emoji artwork is Noto Emoji's images under the Apache License 2.0 (web/public/emoji/NOTICE.txt). Everything is
 * served from this app's own origin, because a cross-origin image taints the canvas and a tainted canvas refuses
 * `toBlob`.
 */

import type { MessageKey } from '../i18n/en';

export interface PictureSticker {
  src: string;
  /** A stable identifier carried onto the layer as its glyph; never shown, so a saved picture is the same in every language. */
  name: string;
  /** What the picker announces, when the name is a description rather than a noun. */
  labelKey?: MessageKey;
}

/**
 * Kurdish marks, a few words, a heart and a star, drawn by scripts/generate-cosmetic-art.mjs into web/public/stickers.
 * The suns and the flag badge keep their old file names so saved pictures still find them.
 */
export const PICTURE_STICKERS: readonly PictureSticker[] = [
  { src: '/stickers/kurdistan_badge.webp', name: 'Kurdistan' },
  { src: '/stickers/yellow_sun.webp', name: 'yellow-sun', labelKey: 'photo.sticker.yellowSun' },
  { src: '/stickers/white_sun.webp', name: 'white-sun', labelKey: 'photo.sticker.whiteSun' },
  { src: '/stickers/hevalo.webp', name: 'Hevalo' },
  { src: '/stickers/newroz.webp', name: 'newroz', labelKey: 'photo.sticker.newroz' },
  { src: '/stickers/biji.webp', name: 'biji', labelKey: 'photo.sticker.biji' },
  { src: '/stickers/spas.webp', name: 'spas', labelKey: 'photo.sticker.spas' },
  { src: '/stickers/heart.webp', name: 'heart', labelKey: 'photo.sticker.heart' },
  { src: '/stickers/star.webp', name: 'star', labelKey: 'photo.sticker.star' },
];

export interface EmojiSticker {
  /** The character itself: the accessible name and the last-resort fallback. */
  glyph: string;
  /** Codepoints joined by '-', which is also the file name. */
  key: string;
}

/** Where an emoji's artwork lives. */
export function emojiSrc(key: string): string {
  return `/emoji/${key}.webp`;
}

/** A curated set rather than all of them, ordered in bands: faces, hearts and hands, marks, the world, things. */
export const EMOJI_STICKERS: readonly EmojiSticker[] = [
  // Faces
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
  // Hearts and hands.
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
  // Marks
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
  // The world
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
  // Things
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

/** Loads a sticker at most once per src; resolves null for a missing file so one sticker cannot cost the picture. */
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

/** Loads every picture a set of layers refers to, so a draw can be synchronous. */
export async function ensureStickersFor(srcs: readonly (string | undefined)[]): Promise<void> {
  await Promise.all(srcs.filter((s): s is string => typeof s === 'string').map(ensureSticker));
}
