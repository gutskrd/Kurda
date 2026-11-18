/**
 * A shop item's picture on its tile, for any kind; the caller draws the kind's glyph when there is none. A background
 * can be a short video, which an <img> cannot show, so it is drawn as a silent still video. Decorative, since the name
 * is beside it.
 */
const VIDEO = /\.(?:mp4|webm)(?:[?#]|$)/i;

/** Whether an item's art is a video, such as a moving background. */
export function isVideoArt(url: string): boolean {
  return VIDEO.test(url);
}

export function ItemPicture({ src, lazy = true }: { src: string; lazy?: boolean }): React.JSX.Element {
  if (isVideoArt(src)) return <video src={src} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} />;
  return <img src={src} alt="" loading={lazy ? 'lazy' : undefined} decoding="async" />;
}
