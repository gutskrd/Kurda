/**
 * How far a piece of the village's markup reaches on the canvas: the box
 * round every path, rect and group in it, through the groups' translate and
 * scale, widened by the heaviest line the village draws. The world is cut
 * into tiles by these boxes, so a piece is written into every tile it
 * touches and never into one it does not.
 *
 * It reads only the markup the village's own pen writes: paths (absolute and
 * relative moves, lines, curves and arcs), rects, and groups moved by
 * `translate(x y)` and `scale(k)`.
 */

export interface Extent {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** How far past its path a piece's ink can reach: half the heaviest stroke the village draws, and a little over. */
const INK_REACH = 5;

const TOKEN = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** Every point a path's data passes through or curves towards, in its own units. */
function pathPoints(d: string, add: (x: number, y: number) => void): void {
  const t = d.match(TOKEN) ?? [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const num = (): number => Number(t[i++]);
  while (i < t.length) {
    const tok = t[i]!;
    if (/^[a-zA-Z]$/.test(tok)) {
      cmd = tok;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        cx = sx;
        cy = sy;
      }
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const bx = rel ? cx : 0;
    const by = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        cx = bx + num();
        cy = by + num();
        sx = cx;
        sy = cy;
        add(cx, cy);
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
      case 'T':
        cx = bx + num();
        cy = by + num();
        add(cx, cy);
        break;
      case 'H':
        cx = (rel ? cx : 0) + num();
        add(cx, cy);
        break;
      case 'V':
        cy = (rel ? cy : 0) + num();
        add(cx, cy);
        break;
      case 'Q':
      case 'S': {
        add(bx + num(), by + num());
        cx = bx + num();
        cy = by + num();
        add(cx, cy);
        break;
      }
      case 'C': {
        add(bx + num(), by + num());
        add(bx + num(), by + num());
        cx = bx + num();
        cy = by + num();
        add(cx, cy);
        break;
      }
      case 'A': {
        const rx = Math.abs(num());
        const ry = Math.abs(num());
        i += 3;
        const ex = bx + num();
        const ey = by + num();
        // an arc stays within its radii of either end
        const r = Math.max(rx, ry);
        add(cx - r, cy - r);
        add(cx + r, cy + r);
        add(ex - r, ey - r);
        add(ex + r, ey + r);
        cx = ex;
        cy = ey;
        break;
      }
      default:
        i++;
    }
  }
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** The box a piece of markup covers on the canvas, or null if it draws nothing. */
export function markupExtent(markup: string): Extent | null {
  const box: Extent = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  // each open group's transform, as (tx, ty, k): a point p is drawn at t + k p
  const stack: [number, number, number][] = [[0, 0, 1]];
  const add = (x: number, y: number): void => {
    const [tx, ty, k] = stack[stack.length - 1]!;
    const X = tx + k * x;
    const Y = ty + k * y;
    if (X < box.x0) box.x0 = X;
    if (X > box.x1) box.x1 = X;
    if (Y < box.y0) box.y0 = Y;
    if (Y > box.y1) box.y1 = Y;
  };
  for (const m of markup.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
    const [, close, name, rest, selfClose] = m;
    if (name === 'g') {
      if (close) stack.pop();
      else if (!selfClose) {
        const [ptx, pty, pk] = stack[stack.length - 1]!;
        const tf = attr(rest!, 'transform') ?? '';
        const tr = /translate\(\s*([-\d.e]+)[ ,]+([-\d.e]+)\s*\)/.exec(tf);
        const sc = /scale\(\s*([-\d.e]+)\s*\)/.exec(tf);
        const tx = tr ? Number(tr[1]) : 0;
        const ty = tr ? Number(tr[2]) : 0;
        const k = sc ? Number(sc[1]) : 1;
        stack.push([ptx + pk * tx, pty + pk * ty, pk * k]);
      }
    } else if (name === 'path') {
      const d = attr(rest!, 'd');
      if (d) pathPoints(d, add);
    } else if (name === 'rect') {
      const x = Number(attr(rest!, 'x') ?? 0);
      const y = Number(attr(rest!, 'y') ?? 0);
      add(x, y);
      add(x + Number(attr(rest!, 'width') ?? 0), y + Number(attr(rest!, 'height') ?? 0));
    }
  }
  if (box.x0 === Infinity) return null;
  return { x0: box.x0 - INK_REACH, y0: box.y0 - INK_REACH, x1: box.x1 + INK_REACH, y1: box.y1 + INK_REACH };
}

/** Whether two boxes overlap. */
export function overlaps(a: Extent, b: Extent): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}
