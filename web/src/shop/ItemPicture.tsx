/**
 * A shop item's own picture, wherever an item is shown as a tile (the Shop,
 * the inventory, gifts, items handed back).
 *
 * Any item may have one: a background or an icon its art, and since pictures
 * can be uploaded for every kind, a power-up, a streak freeze or a tag a
 * square picture of its own. The caller draws the kind's glyph when there is
 * none. A background can be a short video; a video is not a picture an <img>
 * can show, so it is drawn as a silent, still video of itself.
 *
 * Decorative: the item's name is always written beside it.
 */
const VIDEO = /\.(?:mp4|webm)(?:[?#]|$)/i;

/** Whether an item's art is a video (a moving background) rather than a picture. */
export function isVideoArt(url: string): boolean {
  return VIDEO.test(url);
}

export function ItemPicture({ src, lazy = true }: { src: string; lazy?: boolean }): React.JSX.Element {
  if (isVideoArt(src)) return <video src={src} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} />;
  return <img src={src} alt="" loading={lazy ? 'lazy' : undefined} decoding="async" />;
}
