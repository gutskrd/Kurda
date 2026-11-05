import { KINGDOM_SCENE, type KingdomActor, type KingdomFrame, type KingdomNode, type KingdomSprite } from '@kurda/shared';

/**
 * The village's life as markup for the website: each actor's nodes as nested
 * boxes laid over the scene (a root's box in percent of the canvas, a child's
 * in percent of its parent's), each with its sprite and its loop as a CSS
 * animation of `translate`, `rotate`, `scale` and `opacity` only, so the
 * browser moves them on its compositor and no script runs per frame.
 *
 * Every node also carries its still pose inline. A running animation sits
 * over it; with less motion asked for, the stylesheet turns the animations
 * off and the still poses are what show — the deer by the apple, the sheep
 * with their heads down — a complete, quiet village.
 */

type Pose = Omit<KingdomFrame, 't'>;
const PROPS = ['x', 'y', 'r', 'sx', 'sy', 'o'] as const;

const num = (v: number): string => String(Math.round(v * 1000) / 1000);
const pct = (v: number): string => `${num(v * 100)}%`;

/** A pose as CSS declarations, translation in percent of the node's own box. */
function declarations(p: Pose, w: number, h: number, only?: ReadonlySet<string>): string {
  const out: string[] = [];
  const want = (k: string): boolean => !only || only.has(k);
  if (want('x') || want('y')) out.push(`translate:${pct(w ? p.x / w : 0)} ${pct(h ? p.y / h : 0)}`);
  if (want('r')) out.push(`rotate:${num(p.r)}deg`);
  if (want('sx') || want('sy')) out.push(`scale:${num(p.sx)} ${num(p.sy)}`);
  if (want('o')) out.push(`opacity:${num(p.o)}`);
  return out.join(';');
}

/** Which properties a node's loop moves, or holds at other than its still pose (and so must carry in its keyframes). */
function moved(node: KingdomNode): Set<string> {
  const frames = node.motion?.frames ?? [];
  const out = new Set<string>();
  for (const k of PROPS) {
    if (frames.some((f) => f[k] !== frames[0]![k]) || (frames[0] && frames[0][k] !== node.still[k])) out.add(k);
  }
  return out;
}

export interface LifeMarkup {
  html: string;
  css: string;
}

/**
 * The markup and keyframes for a list of actors, back to front. `sprite`
 * gives each sprite's SVG (made once by the caller); `prefix` keeps the
 * keyframe names of two villages on a page apart.
 */
export function lifeMarkup(actors: readonly KingdomActor[], sprite: (s: KingdomSprite) => string, prefix = 'kg'): LifeMarkup {
  let css = '';
  let count = 0;
  const node = (n: KingdomNode, parent: { w: number; h: number }): string => {
    const { x, y, w, h } = n.box;
    let style = `left:${pct(x / parent.w)};top:${pct(y / parent.h)};width:${pct(w / parent.w)};height:${pct(h / parent.h)};transform-origin:${pct(n.origin[0])} ${pct(n.origin[1])};${declarations(n.still, w, h)}`;
    if (n.motion && n.motion.frames.length > 1) {
      const props = moved(n);
      if (props.size > 0) {
        const name = `${prefix}${count++}`;
        css += `@keyframes ${name}{${n.motion.frames.map((f) => `${num(f.t * 100)}%{${declarations(f, w, h, props)}}`).join('')}}`;
        style += `;animation:${name} ${Math.round(n.motion.period)}ms linear infinite`;
      }
    }
    const inner = (n.sprite ? `<span class="kg-s">${sprite(n.sprite)}</span>` : '') + (n.children ?? []).map((c) => node(c, { w, h })).join('');
    return `<span class="kg-n" style="${style}">${inner}</span>`;
  };
  const canvas = { w: KINGDOM_SCENE.width, h: KINGDOM_SCENE.height };
  const html = actors.map((a) => node(a, canvas)).join('');
  return { html, css };
}
