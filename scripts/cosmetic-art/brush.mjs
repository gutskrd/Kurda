/**
 * A painter's means, for the icons: how a thing is painted rather than
 * modelled. Its colours laid in flat, its shadow and its light laid over them
 * as shapes of their own, soft-edged, the way a painter puts them where the
 * light falls; strokes of paint over that, in the colours of the thing, lying
 * the way its surface runs; an edge drawn in where it turns away; and specks,
 * the grain of the paint. Each draws into a Canvas (kit.mjs) as SVG.
 */
import { n, pt } from './kit.mjs';

/** A blur, `sd` pixels: a filter's url. */
export function softly(cv, sd) {
  const id = cv.id('soft');
  cv.def(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(sd)}"/></filter>`);
  return `url(#${id})`;
}

/** A clip to the outline `d`: its url. */
export function within(cv, d) {
  const id = cv.id('in');
  cv.def(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
  return `url(#${id})`;
}

/**
 * The part of a shape the light does not reach, or the part it reaches
 * most: `d` less itself moved by [dx, dy] — moved toward the light, what is
 * left is the side away from it, a crescent of shadow; moved away from the
 * light, the lit side — painted in `colour` at `opacity`, its inner edge
 * softened by `soft`.
 */
export function crescent(cv, d, [dx, dy], { colour, opacity = 0.5, soft = 8, blur = 0 }) {
  const m = cv.id('cres');
  const s = softly(cv, soft);
  cv.def(`<mask id="${m}" maskUnits="userSpaceOnUse" x="-512" y="-512" width="1536" height="1536"><path d="${d}" fill="#fff"/><path d="${d}" fill="#000" transform="translate(${n(dx)} ${n(dy)})" filter="${s}"/></mask>`);
  cv.add(`<g clip-path="${within(cv, d)}"><path d="${d}" fill="${colour}" fill-opacity="${n(opacity)}" mask="url(#${m})"${blur ? ` filter="${softly(cv, blur)}"` : ''}/></g>`);
}

/**
 * Strokes of paint over the box [x0, y0, x1, y1], kept to the outline `d`:
 * `count` of them, each lying along `flow(x, y)` (degrees, a little either
 * way), `length` long and `width` wide at their middle, tapering to points,
 * in one of `colours` — or in the colour `colour(x, y)` gives for where it
 * lies — at an opacity between `opacity`.
 */
export function strokes(cv, rnd, d, [x0, y0, x1, y1], { count, colours = [], colour = null, flow = () => 0, length = 10, width = 2, opacity = [0.1, 0.3], spread = 14, bend = 0.25 }) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = y0 + rnd() * (y1 - y0);
    const a = ((flow(x, y) + (rnd() - 0.5) * spread) * Math.PI) / 180;
    const l = length * (0.6 + rnd() * 0.8);
    const w = width * (0.6 + rnd() * 0.8);
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    const [vx, vy] = [-uy, ux];
    const b = (rnd() - 0.5) * l * bend;
    const p0 = [x - (ux * l) / 2, y - (uy * l) / 2];
    const p1 = [x + (ux * l) / 2, y + (uy * l) / 2];
    const m1 = [x + vx * (b + w / 2), y + vy * (b + w / 2)];
    const m2 = [x + vx * (b - w / 2), y + vy * (b - w / 2)];
    const fill = colour ? colour(x, y) : colours[Math.floor(rnd() * colours.length)];
    out += `<path d="M${pt(p0)} Q${pt(m1)} ${pt(p1)} Q${pt(m2)} ${pt(p0)} Z" fill="${fill}" fill-opacity="${n(opacity[0] + rnd() * (opacity[1] - opacity[0]))}"/>`;
  }
  cv.add(`<g clip-path="${within(cv, d)}">${out}</g>`);
}

/** Specks over the box, kept to `d`: the grain of the paint, or the pores of a skin. */
export function specks(cv, rnd, d, [x0, y0, x1, y1], { count, colours, size = [0.5, 1.5], opacity = [0.1, 0.4] }) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const r = size[0] + rnd() * (size[1] - size[0]);
    out += `<circle cx="${n(x0 + rnd() * (x1 - x0))}" cy="${n(y0 + rnd() * (y1 - y0))}" r="${n(r)}" fill="${colours[Math.floor(rnd() * colours.length)]}" fill-opacity="${n(opacity[0] + rnd() * (opacity[1] - opacity[0]))}"/>`;
  }
  cv.add(`<g clip-path="${within(cv, d)}">${out}</g>`);
}

/** The edge of a shape drawn in, inside it, as a painter darkens where a thing turns away: `width` wide, softened by `soft`. */
export function rim(cv, d, { colour, width = 4, opacity = 0.6, soft = 0 }) {
  cv.add(`<path d="${d}" clip-path="${within(cv, d)}" fill="none" stroke="${colour}" stroke-width="${n(width * 2)}" stroke-opacity="${n(opacity)}"${soft ? ` filter="${softly(cv, soft)}"` : ''}/>`);
}
