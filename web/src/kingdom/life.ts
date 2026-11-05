import { KINGDOM_SCENE, kingdomActorReach, type KingdomActor, type KingdomFrame, type KingdomNode, type KingdomSprite } from '@kurda/shared';

/**
 * The village's life as markup for the website: each actor's nodes as nested
 * boxes laid over the world (a root's box in percent of the canvas, a child's
 * in percent of its parent's), each with its sprite and its loop as a CSS
 * animation of `translate`, `rotate`, `scale` and `opacity` only, so the
 * browser moves them on its compositor and no script runs per frame.
 *
 * Each actor is its own piece of markup, so the page can lay only those near
 * the view and add or drop one as the view moves without touching the rest.
 * Every animation runs on one clock: an actor's wrapper carries its age
 * (`--kg-age`, how long the page had been open when it was laid), and each of
 * its loops starts that far back, so an actor coming into view is where it
 * would have been all along rather than starting its loop again.
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

/**
 * A pose as CSS declarations: one `transform` (translation in percent of the
 * node's own box, then the turn, then the scale) and the opacity. One
 * transform rather than the separate translate, rotate and scale properties,
 * because the browser keeps a transform's animation on its compositor.
 */
function declarations(p: Pose, w: number, h: number, only?: ReadonlySet<string>): string {
  const out: string[] = [];
  const want = (k: string): boolean => !only || only.has(k);
  if (want('x') || want('y') || want('r') || want('sx') || want('sy')) out.push(`transform:translate(${pct(w ? p.x / w : 0)},${pct(h ? p.y / h : 0)}) rotate(${num(p.r)}deg) scale(${num(p.sx)},${num(p.sy)})`);
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

/** One actor ready to lay: its markup, how far it reaches on the canvas over its loop, and what a tap on it does. */
export interface ActorMarkup {
  id: string;
  html: string;
  reach: { x: number; y: number; w: number; h: number };
  tap?: KingdomActor['tap'];
}

export interface LifeMarkup {
  css: string;
  actors: ActorMarkup[];
}

/**
 * The markup and keyframes for a list of actors, back to front. `sprite`
 * gives each sprite's SVG (made once by the caller); `prefix` keeps the
 * keyframe names of two villages on a page apart.
 */
export function lifeMarkup(actors: readonly KingdomActor[], sprite: (s: KingdomSprite) => string, prefix = 'kg'): LifeMarkup {
  let css = '';
  let count = 0;
  const node = (n: KingdomNode, parent: { w: number; h: number }, tap: boolean): string => {
    const { x, y, w, h } = n.box;
    let style = `left:${pct(x / parent.w)};top:${pct(y / parent.h)};width:${pct(w / parent.w)};height:${pct(h / parent.h)};transform-origin:${pct(n.origin[0])} ${pct(n.origin[1])};${declarations(n.still, w, h)}`;
    if (n.clip) style += ';overflow:hidden';
    if (tap) style += ';pointer-events:auto;cursor:pointer';
    if (n.motion && n.motion.frames.length > 1) {
      const props = moved(n);
      if (props.size > 0) {
        const name = `${prefix}${count++}`;
        css += `@keyframes ${name}{${n.motion.frames.map((f) => `${num(f.t * 100)}%{${declarations(f, w, h, props)}}`).join('')}}`;
        style += `;animation:${name} ${Math.round(n.motion.period)}ms linear calc(var(--kg-age,0ms) * -1) infinite`;
      }
    }
    const inner = (n.sprite ? `<span class="kg-s">${sprite(n.sprite)}</span>` : '') + (n.children ?? []).map((c) => node(c, { w, h }, false)).join('');
    return `<span class="kg-n"${n.role ? ` data-role="${n.role}"` : ''} style="${style}">${inner}</span>`;
  };
  const canvas = { w: KINGDOM_SCENE.width, h: KINGDOM_SCENE.height };
  // the markup first: writing it is what gathers the keyframes
  const laid = actors.map((a) => ({
    id: a.id,
    html: node(a, canvas, a.tap !== undefined),
    reach: kingdomActorReach(a),
    tap: a.tap,
  }));
  return { css, actors: laid };
}
