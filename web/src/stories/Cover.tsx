import { useMemo, useState } from 'react';
import { storyCoverPath } from '@kurda/shared';

/**
 * A story's cover (design notes §7): the picture its editor chose from the
 * shared list of covers (shared `STORY_COVERS` — the shop's painted scenes and
 * woven kilims, the same list the admin offers), or, for a story without one,
 * a quiet kilim band keyed by its category — so the grid never shows an empty
 * card, and stories filed together look like a shelf of the same weave.
 *
 * A key the list does not know (none chosen, or a picture taken out since)
 * gets the band, and so does a picture that will not load, rather than a
 * broken image. The band follows the house rules for cloth: flat colour
 * planes, the kilim's diamond with a dark eye at its heart, a saw-tooth edge
 * along each selvedge, no gradients and no shading. Decorative throughout —
 * the title beside it is what names the story.
 */

/** The drawing's own box; it is stretched to the card's shape, so only the proportion matters. */
const BOX = { w: 320, h: 180 } as const;

/**
 * The ground, the weave and the eye of each category's band: warm, flat
 * pairs from the kilim's own palette — madder, indigo, olive, terracotta —
 * each pair readable on a light page and a dark one alike.
 */
const WEAVES: Readonly<Record<string, { ground: string; weave: string; eye: string }>> = {
  folktale: { ground: '#8c3b3b', weave: '#ecd19a', eye: '#2b1a18' },
  fable: { ground: '#4f6b3a', weave: '#f0dfb3', eye: '#1c2616' },
  legend: { ground: '#3b4a6b', weave: '#e5c66e', eye: '#141a2a' },
  family: { ground: '#a35b2d', weave: '#f6e4c6', eye: '#2c1a10' },
  village: { ground: '#7a6a4a', weave: '#f0e4c8', eye: '#282216' },
  nature: { ground: '#2f6b5a', weave: '#e2eac4', eye: '#10251e' },
  everyday: { ground: '#6b5a8c', weave: '#f1dcab', eye: '#201a2b' },
  celebrations: { ground: '#b5442f', weave: '#f7d86e', eye: '#2d130f' },
};

/** The stone band of a story filed nowhere yet. */
const PLAIN = { ground: '#6f655c', weave: '#eae1d1', eye: '#2a2622' };

/** A category this file has no weave for still gets one of them, always the same one. */
function weaveFor(category: string | null): { ground: string; weave: string; eye: string } {
  if (!category) return PLAIN;
  const own = WEAVES[category];
  if (own) return own;
  const names = Object.keys(WEAVES);
  let hash = 0;
  for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return WEAVES[names[hash % names.length]!]!;
}

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** A rhombus centred on (cx, cy). */
function diamond(cx: number, cy: number, w: number, h: number): string {
  return `M${n(cx)},${n(cy - h / 2)}L${n(cx + w / 2)},${n(cy)}L${n(cx)},${n(cy + h / 2)}L${n(cx - w / 2)},${n(cy)}Z`;
}

/** The kilim band for a category, as an SVG string the size of BOX. */
export function kilimBand(category: string | null): string {
  const { ground, weave, eye } = weaveFor(category);
  const { w, h } = BOX;
  const out: string[] = [];
  out.push(`<rect width="${w}" height="${h}" fill="${ground}"/>`);
  // the selvedges: a thin stripe along each edge with a saw-tooth of small triangles against it
  const teeth: string[] = [];
  for (let x = 0; x < w; x += 16) {
    teeth.push(`M${x},24L${x + 8},34L${x + 16},24Z`);
    teeth.push(`M${x},${h - 24}L${x + 8},${h - 34}L${x + 16},${h - 24}Z`);
  }
  out.push(`<rect y="18" width="${w}" height="6" fill="${weave}"/>`);
  out.push(`<rect y="${h - 24}" width="${w}" height="6" fill="${weave}"/>`);
  out.push(`<path d="${teeth.join('')}" fill="${weave}" fill-opacity="0.8"/>`);
  // the row of diamonds, each with a smaller one of the ground inside it and the dark eye at its heart
  const step = 64;
  const outer: string[] = [];
  const inner: string[] = [];
  const eyes: string[] = [];
  const hooks: string[] = [];
  for (let cx = step / 2; cx < w; cx += step) {
    outer.push(diamond(cx, h / 2, 42, 64));
    inner.push(diamond(cx, h / 2, 26, 40));
    eyes.push(diamond(cx, h / 2, 10, 16));
    // the small hooks a kilim diamond carries at its sides
    hooks.push(`M${n(cx - 27)},${n(h / 2)}l-7,-7v5l4,4l-4,4v5Z`);
    hooks.push(`M${n(cx + 27)},${n(h / 2)}l7,-7v5l-4,4l4,4v5Z`);
  }
  out.push(`<path d="${outer.join('')}" fill="${weave}"/>`);
  out.push(`<path d="${inner.join('')}" fill="${ground}"/>`);
  out.push(`<path d="${eyes.join('')}" fill="${eye}"/>`);
  out.push(`<path d="${hooks.join('')}" fill="${weave}" fill-opacity="0.9"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${out.join('')}</svg>`;
}

/**
 * The picture at the head of a card or a story page. Fills whatever box it
 * is given (`.story-cover`), so the card and the page's wide band share one
 * drawing. A card's picture waits until it is near the screen; the story
 * page's own (`eager`) is the first thing on it, so it is asked for at once.
 */
export function StoryCover({
  cover,
  category,
  className,
  eager = false,
}: {
  cover: string | null;
  category: string | null;
  className?: string;
  eager?: boolean;
}): React.JSX.Element {
  const src = storyCoverPath(cover);
  // the picture that would not load, so the band takes its place until the key changes
  const [failed, setFailed] = useState<string | null>(null);
  const band = useMemo(() => ({ __html: kilimBand(category) }), [category]);
  const cls = `story-cover${className ? ` ${className}` : ''}`;
  if (src && failed !== src) {
    return (
      <span className={`${cls} has-picture`} aria-hidden="true">
        <img src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} onError={() => setFailed(src)} />
      </span>
    );
  }
  return <span className={cls} aria-hidden="true" dangerouslySetInnerHTML={band} />;
}
