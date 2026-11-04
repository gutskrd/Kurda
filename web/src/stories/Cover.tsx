import { useMemo } from 'react';
import { CHARACTER_IDS, stageBackdrop, type CharacterId } from '@kurda/shared';

/**
 * A story's cover (design notes §7): the shared background its editor chose,
 * or, for a story without one, a kilim band keyed by its category — so the
 * grid never shows an empty card, and stories filed together look like a
 * shelf of the same weave.
 *
 * The backgrounds the apps can draw are the characters' stage light (shared
 * `stageBackdrop`: the deer's purple, Hamo's evening gold, Xezo's rose), so a
 * cover key is one of their ids; anything else falls back to the band. The
 * band follows the house rules for cloth: flat colour planes, the kilim's
 * diamond with a dark eye at its heart, a saw-tooth edge along each selvedge,
 * no gradients and no shading. Decorative throughout — the title beside it
 * is what names the story.
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

/** Whether a cover key names a character whose stage light the apps can draw. */
export function isCharacterCover(cover: string | null | undefined): cover is CharacterId {
  return (CHARACTER_IDS as readonly unknown[]).includes(cover);
}

/**
 * The picture at the head of a card or a story page. Fills whatever box it
 * is given (`.story-cover`), so the card and the page's wide band share one
 * drawing. A character's light is drawn once for a light page and once for a
 * dark one, as the stage draws it; the band is the same on both.
 */
export function StoryCover({ cover, category, className }: { cover: string | null; category: string | null; className?: string }): React.JSX.Element {
  const markup = useMemo(() => {
    if (isCharacterCover(cover)) {
      return {
        light: { __html: stageBackdrop(cover, BOX.w, BOX.h, 0.5, { idPrefix: `cover-${cover}-light` }) },
        dark: { __html: stageBackdrop(cover, BOX.w, BOX.h, 0.5, { dark: true, idPrefix: `cover-${cover}-dark` }) },
      };
    }
    return { band: { __html: kilimBand(category) } };
  }, [cover, category]);
  const cls = `story-cover${className ? ` ${className}` : ''}`;
  if ('band' in markup) return <span className={cls} aria-hidden="true" dangerouslySetInnerHTML={markup.band} />;
  return (
    <span className={`${cls} is-light-dark`} aria-hidden="true">
      <span className="story-cover-light" dangerouslySetInnerHTML={markup.light} />
      <span className="story-cover-dark" dangerouslySetInnerHTML={markup.dark} />
    </span>
  );
}
