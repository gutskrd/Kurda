/**
 * The default profile banner: sky, sun or moon, and mountain ridges in the tree scene's colours (`tree-scene.ts`).
 * The person's id seeds the sky's hour, the sun's place and the ridges, so each person gets their own, every time. The
 * square picture is composed about its middle line; apps show a wide band through the middle, and the sun and first
 * ridge stay inside any banner shape.
 */
import { Drawing, checkSize, linearAt, n, prefixFor, radialAt, seeded, type Pt } from './svg.js';
import { SKIES, TREE_SKIES, type TreeSky } from './tree-scene.js';

export interface HorizonOptions {
  /** Who it is drawn for: an account id, or any text unique to them. */
  seed: string;
  /** A particular hour of the sky; defaults to the person's own. */
  sky?: TreeSky;
  /** Size in points or CSS pixels; the drawing is square. */
  size?: number;
  /** The accessible label; empty where the picture only sits behind a named face. */
  title?: string;
  idPrefix?: string;
}

/** The sky of a person's horizon, the same on every call. */
export function horizonSky(seed: string): TreeSky {
  return TREE_SKIES[Math.floor(seeded(`horizon-sky:${seed}`)() * TREE_SKIES.length)] ?? 'day';
}

/** A ridge across the picture: straight-sloped peaks about `base`, up to `rise` high, filled down to the foot. */
function ridge(base: number, rise: number, step: number, rand: () => number): string {
  const points: Pt[] = [];
  for (let x = -8; x <= 128 + step; x += step) {
    points.push([x + (rand() - 0.5) * step * 0.34, base - rise * (0.4 + rand() * 0.6)]);
    points.push([x + step * (0.4 + rand() * 0.2), base - rise * rand() * 0.3]);
  }
  let d = `M-8 120L-8 ${n(base)}`;
  for (const [x, y] of points) d += `L${n(x)} ${n(y)}`;
  return `${d}L128 120Z`;
}

/** The horizon over a profile, as an SVG. */
export function horizonSvg(opts: HorizonOptions): string {
  const size = checkSize(opts.size, 360);
  const name = opts.sky ?? horizonSky(opts.seed);
  const sky = SKIES[name];
  const dr = new Drawing(prefixFor(opts.idPrefix, 'horizon', opts.seed, name));
  const rand = seeded(`horizon:${opts.seed}`);
  // The air, deepest at the top and palest at the mountains.
  const air = dr.id('a');
  dr.def(linearAt(air, [[0, sky.air[0]], [0.6, sky.air[1]], [1, sky.air[2]]], 0, 26, 0, 76));
  dr.add(`<rect x="0" y="0" width="120" height="120" fill="url(#${air})"/>`);
  if (name === 'night' || name === 'dusk') {
    // Stars: all of them at night, a few at dusk.
    const count = name === 'night' ? 30 : 8;
    let dots = '';
    for (let i = 0; i < count; i++) {
      const [x, y, r] = [rand() * 120, 36 + rand() * (name === 'night' ? 26 : 14), 0.2 + rand() * 0.36];
      dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#ffffff" opacity="${i % 3 === 0 ? '0.95' : '0.6'}"/>`;
    }
    dr.add(dots);
  }
  // The sun or moon, on the side away from the face.
  const [, , , colour, haloColour] = sky.orb;
  const ox = 62 + rand() * 40;
  // High enough to be the day's sun but inside the shortest banner; at dawn and dusk it sits on the ridge.
  const oy = name === 'day' || name === 'night' ? 54 + rand() * 2.5 : 58.5 + rand() * 2.5;
  const or = name === 'night' ? 3.8 : 4.6 + rand() * 1.1;
  const halo = dr.id('h');
  dr.def(radialAt(halo, [[0, haloColour, name === 'night' ? 0.5 : 0.7], [0.4, haloColour, name === 'night' ? 0.16 : 0.28], [1, haloColour, 0]], ox, oy, or * 4.6));
  dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or * 4.6)}" fill="url(#${halo})"/>`);
  if (name === 'night') {
    // A young moon's horn: an outer arc and a shallower arc back, the edge of its shadow.
    dr.add(`<path d="M${n(ox)} ${n(oy - or)}A${n(or)} ${n(or)} 0 1 0 ${n(ox)} ${n(oy + or)}A${n(or * 1.35)} ${n(or * 1.35)} 0 0 1 ${n(ox)} ${n(oy - or)}Z" fill="${colour}" transform="rotate(-24 ${n(ox)} ${n(oy)})"/>`);
  } else {
    dr.add(`<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(or)}" fill="${colour}"/>`);
  }
  // Ridges, paler with distance.
  dr.add(`<path d="${ridge(66, 9, 15, rand)}" fill="${sky.ridges[0]}"/>`);
  dr.add(`<path d="${ridge(70.5, 7.5, 19, rand)}" fill="${sky.ridges[1]}"/>`);
  dr.add(`<path d="${ridge(75.5, 6, 24, rand)}" fill="${sky.ridges[2]}"/>`);
  return dr.svg(size, opts.title ?? '');
}
