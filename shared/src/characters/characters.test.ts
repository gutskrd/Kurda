import { describe, expect, it } from 'vitest';
import { VISEMES } from '../lipsync/visemes.js';
import {
  ACTS,
  BROW_STATES,
  CHARACTER_IDS,
  CHARACTER_NAMES,
  CHARACTERS,
  DEFAULT_CHARACTER,
  EXPRESSION_MOUTHS,
  EYE_STATES,
  MOUTH_SHAPES,
  STAGE_FIGURE_SHARE,
  WINDOW_PLACE,
  WINDOW_VIEW,
  characterArt,
  characterSvg,
  cropBody,
  cropBox,
  faceLayers,
  headFor,
  headGroup,
  isCharacterId,
  stageBackdrop,
  stageFigure,
  windowArt,
  type CharacterArt,
  type CharacterBox,
  type WindowArt,
} from './index.js';
import { curve, mirror, symmetric, taper } from './pen.js';

/**
 * A strict little XML reader, as in the art tests: enough to say a drawing is
 * well-formed (every tag closed in order, every attribute quoted and named
 * once, no stray `<` or `&`) and to hand back its elements.
 */
interface El {
  name: string;
  attrs: Record<string, string>;
  text: string;
  children: El[];
}

function parse(xml: string): El {
  let i = 0;
  const root: El = { name: '#root', attrs: {}, text: '', children: [] };
  const stack: El[] = [root];
  const entity = /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/iy;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const top = stack[stack.length - 1] as El;
    const end = lt === -1 ? xml.length : lt;
    const raw = xml.slice(i, end);
    for (let k = 0; k < raw.length; k++) {
      if (raw[k] === '&') {
        entity.lastIndex = k;
        if (!entity.test(raw)) throw new Error(`bare & at ${i + k}`);
      }
      if (raw[k] === '>') throw new Error(`stray > at ${i + k}`);
    }
    top.text += raw;
    if (lt === -1) break;
    i = lt;
    if (xml.startsWith('</', i)) {
      const m = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(xml.slice(i));
      if (!m) throw new Error(`bad closing tag at ${i}`);
      const open = stack.pop();
      if (!open || open.name !== m[1]) throw new Error(`</${m[1]}> closes <${open?.name}>`);
      i += m[0].length;
      continue;
    }
    const m = /^<([A-Za-z][\w:-]*)((?:\s+[A-Za-z][\w:-]*="[^"<]*")*)\s*(\/?)>/.exec(xml.slice(i));
    if (!m) throw new Error(`bad tag at ${i}: ${xml.slice(i, i + 40)}`);
    const attrs: Record<string, string> = {};
    for (const a of (m[2] ?? '').matchAll(/([A-Za-z][\w:-]*)="([^"]*)"/g)) {
      const [, k, v] = a as unknown as [string, string, string];
      if (k in attrs) throw new Error(`attribute ${k} twice on <${m[1]}>`);
      attrs[k] = v;
    }
    const el: El = { name: m[1] as string, attrs, text: '', children: [] };
    top.children.push(el);
    if (!m[3]) stack.push(el);
    i += m[0].length;
  }
  if (stack.length !== 1) throw new Error(`<${stack[stack.length - 1]?.name}> never closed`);
  return root;
}

function walk(el: El, visit: (e: El) => void): void {
  visit(el);
  for (const c of el.children) walk(c, visit);
}

/** Only what react-native-svg's SvgXml draws the same as a browser. */
const ALLOWED = new Set(['svg', 'title', 'defs', 'g', 'path', 'circle', 'ellipse', 'linearGradient', 'radialGradient', 'stop', 'clipPath']);

/** The elements whose positions are written by the pen, a tenth at a time (a gradient's are fractions of a box). */
const SHAPES = new Set(['path', 'circle', 'ellipse']);

/** Every element and attribute of a fragment, checked; returns the ids it defines and the ids it points at. */
function inspect(markup: string): { ids: string[]; refs: string[]; problems: string[] } {
  const ids: string[] = [];
  const refs: string[] = [];
  const problems: string[] = [];
  walk(parse(markup), (e) => {
    if (e.name === '#root') return;
    if (!ALLOWED.has(e.name)) problems.push(`<${e.name}>`);
    for (const [k, v] of Object.entries(e.attrs)) {
      if (k.startsWith('on') || /href$/i.test(k)) problems.push(`${k} on <${e.name}>`);
      if (k !== 'xmlns' && /NaN|Infinity|undefined|null/.test(v)) problems.push(`${k}="${v}"`);
      for (const m of v.matchAll(/url\(#([^)]*)\)/g)) refs.push(m[1] ?? '');
      if (SHAPES.has(e.name) && (k === 'd' || k === 'cx' || k === 'cy' || k === 'r' || k === 'rx' || k === 'ry')) {
        // coordinates are written to a tenth: a run of more decimals is a number that skipped the pen
        if (/\d\.\d{2,}/.test(v)) problems.push(`${k} on <${e.name}> has more than one decimal: ${v.slice(0, 60)}`);
      }
    }
    if (e.attrs.id) ids.push(e.attrs.id);
  });
  return { ids, refs, problems };
}

/** All of a character's parts, as one list, with their names. */
function parts(art: CharacterArt): [string, string][] {
  return [
    ['body', art.body],
    ['head', art.head],
    ['eyes.open', art.eyes.open],
    ['eyes.closed', art.eyes.closed],
    ...VISEMES.map((v) => [`mouth.${v}`, art.mouths[v]] as [string, string]),
    ['overlay', art.overlay],
  ];
}

/** The parts drawn for expressions and for moving on their own: not part of the plain figure's size. */
function extras(art: CharacterArt): [string, string][] {
  const rig = art.rig;
  return [
    ...(art.chest ? ([['chest', art.chest]] as [string, string][]) : []),
    ['eyes.happy', art.eyes.happy],
    ['eyes.wink', art.eyes.wink],
    ['eyes.wide', art.eyes.wide],
    ...(art.eyes.half ? ([['eyes.half', art.eyes.half]] as [string, string][]) : []),
    ...EXPRESSION_MOUTHS.map((m) => [`mouth.${m}`, art.mouths[m]] as [string, string]),
    ...(art.brows ? ([['brows.bare', art.brows.bare], ...BROW_STATES.map((b) => [`brows.${b}`, art.brows!.states[b]])] as [string, string][]) : []),
    ...(art.cheeks ? ([['cheeks.blush', art.cheeks.blush]] as [string, string][]) : []),
    ...(art.hair ? ([['hair', art.hair.art]] as [string, string][]) : []),
    ...(art.moustache ? ([['moustache.body', art.moustache.body], ['moustache.end', art.moustache.end.art]] as [string, string][]) : []),
    ...(rig
      ? ([
          ['rig.face', rig.face],
          ['rig.crown', rig.crown],
          ...(rig.antlers
            ? ([
                ['rig.antlers.left', rig.antlers.left.art],
                ['rig.antlers.right', rig.antlers.right.art],
              ] as [string, string][])
            : []),
          ['rig.ears.left', rig.ears.left.art],
          ['rig.ears.right', rig.ears.right.art],
          ['rig.look.whites', rig.look.whites],
          ['rig.look.left', rig.look.left.art],
          ['rig.look.right', rig.look.right.art],
          ['rig.look.half', rig.look.half],
        ] as [string, string][])
      : []),
  ];
}

const bytes = (s: string): number => new TextEncoder().encode(s).length;

/** How many numbers each path step takes. */
const STEP: Readonly<Record<string, number>> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** Every point a path passes through or pulls towards (its handles too), in absolute units. */
function pathPoints(d: string): [number, number][] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const out: [number, number][] = [];
  let [x, y, sx, sy] = [0, 0, 0, 0];
  let cmd = 'M';
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i] as string;
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i += 1;
      if (t === 'z' || t === 'Z') [x, y] = [sx, sy];
      continue;
    }
    const lower = cmd.toLowerCase();
    const count = STEP[lower] ?? 2;
    const args = tokens.slice(i, i + count).map(Number);
    i += count;
    const rel = cmd === lower;
    const [ox, oy] = rel ? [x, y] : [0, 0];
    if (lower === 'h') x = ox + (args[0] ?? 0);
    else if (lower === 'v') y = oy + (args[0] ?? 0);
    else if (lower === 'a') [x, y] = [ox + (args[5] ?? 0), oy + (args[6] ?? 0)];
    else {
      for (let k = 0; k + 1 < count; k += 2) out.push([ox + (args[k] ?? 0), oy + (args[k + 1] ?? 0)]);
      [x, y] = [ox + (args[count - 2] ?? 0), oy + (args[count - 1] ?? 0)];
      if (lower === 'm') {
        [sx, sy] = [x, y];
        cmd = rel ? 'l' : 'L';
      }
    }
    out.push([x, y]);
  }
  return out;
}

/** The box round everything a piece of markup draws (not its clips or gradients), in its own units. */
function extent(markup: string): CharacterBox {
  const xs: number[] = [];
  const ys: number[] = [];
  const visit = (e: El): void => {
    if (e.name === 'defs' || e.name === 'clipPath') return;
    if (e.name === 'path') {
      for (const [px, py] of pathPoints(e.attrs.d ?? '')) {
        xs.push(px);
        ys.push(py);
      }
    }
    if (e.name === 'ellipse' || e.name === 'circle') {
      // turned about its own middle, as every ellipse here is
      const turn = (Number(/rotate\((-?[\d.]+)/.exec(e.attrs.transform ?? '')?.[1] ?? 0) * Math.PI) / 180;
      const rx = Number(e.attrs.rx ?? e.attrs.r);
      const ry = Number(e.attrs.ry ?? e.attrs.r);
      const across = Math.hypot(rx * Math.cos(turn), ry * Math.sin(turn));
      const down = Math.hypot(rx * Math.sin(turn), ry * Math.cos(turn));
      xs.push(Number(e.attrs.cx) - across, Number(e.attrs.cx) + across);
      ys.push(Number(e.attrs.cy) - down, Number(e.attrs.cy) + down);
    }
    e.children.forEach(visit);
  };
  visit(parse(markup));
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The box round each shape a piece of markup draws, one by one (not its clips or gradients). */
function shapes(markup: string): CharacterBox[] {
  const out: CharacterBox[] = [];
  const visit = (e: El): void => {
    if (e.name === 'defs' || e.name === 'clipPath') return;
    if (e.name === 'path' || e.name === 'ellipse' || e.name === 'circle') {
      const attrs = Object.entries(e.attrs)
        .map(([k, v]) => ` ${k}="${v}"`)
        .join('');
      out.push(extent(`<${e.name}${attrs}/>`));
    }
    e.children.forEach(visit);
  };
  visit(parse(markup));
  return out;
}

/** A colour's red, green and blue, 0 to 1. */
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

/** How light a colour looks, 0 to 1. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const inside = (inner: CharacterBox, outer: CharacterBox): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

describe('the characters', () => {
  it('are Hevalo, Hamo and Xezo, by those names', () => {
    expect([...CHARACTER_IDS]).toEqual(['hevalo', 'hamo', 'xezo']);
    expect(CHARACTER_NAMES).toEqual({ hevalo: 'Hevalo', hamo: 'Hamo', xezo: 'Xezo' });
    expect(CHARACTERS.map((c) => c.name)).toEqual(['Hevalo', 'Hamo', 'Xezo']);
    expect(DEFAULT_CHARACTER).toBe('hevalo');
    expect(isCharacterId('hamo')).toBe(true);
    expect(isCharacterId('Hamo')).toBe(false);
    expect(isCharacterId(undefined)).toBe(false);
  });

  for (const id of CHARACTER_IDS) {
    describe(id, () => {
      const art = characterArt(id);

      it('has every mouth shape and every eye state, each drawn', () => {
        expect(art.id).toBe(id);
        expect(art.name).toBe(CHARACTER_NAMES[id]);
        expect(Object.keys(art.mouths).sort()).toEqual([...MOUTH_SHAPES].sort());
        for (const v of MOUTH_SHAPES) expect(art.mouths[v].length, v).toBeGreaterThan(40);
        for (const state of EYE_STATES) if (state !== 'half') expect(art.eyes[state].length, state).toBeGreaterThan(40);
        expect(art.head.length).toBeGreaterThan(200);
        expect(art.body.length).toBeGreaterThan(200);
      });

      it('draws every mouth shape differently, and every eye state differently from the others', () => {
        const mouths = new Set(MOUTH_SHAPES.map((v) => art.mouths[v]));
        expect(mouths.size).toBe(MOUTH_SHAPES.length);
        const eyes = new Set(EYE_STATES.map((state) => art.eyes[state] ?? art.eyes.closed));
        expect(eyes.size).toBe(EYE_STATES.length - (art.eyes.half ? 0 : 1));
      });

      it('winks with one eye smiling and the other open, and opens its eyes wider when startled', () => {
        const open = extent(art.eyes.open);
        const wide = extent(art.eyes.wide);
        expect(wide.h).toBeGreaterThan(open.h * 1.08);
        expect(Math.abs(wide.y + wide.h / 2 - (open.y + open.h / 2))).toBeLessThan(open.h * 0.1);
        // the wink: one eye drawn open (its iris or its pupil, on the right), the other not
        const wink = art.eyes.wink;
        if (art.rig) {
          expect(shapes(wink).filter((s) => s.w > 90 && s.h > 100)).toHaveLength(2);
        } else {
          expect(wink).toContain('data-iris="right"');
          expect(wink).not.toContain('data-iris="left"');
        }
        // the wink and the wide eyes sit where the open ones do
        for (const state of ['wink', 'wide'] as const) {
          const box = extent(art.eyes[state]);
          expect(inside(box, { x: open.x - 8, y: open.y - 12, w: open.w + 16, h: open.h + 24 }), state).toBe(true);
        }
      });

      it('grins and pokes its tongue out in the place of its mouth, the tongue reaching below the lips', () => {
        const rest = extent(art.mouths.rest);
        const grin = extent(art.mouths.grin);
        const tongue = extent(art.mouths.tongue);
        const middle = (b: CharacterBox): number => b.x + b.w / 2;
        expect(Math.abs(middle(grin) - middle(rest))).toBeLessThan(rest.w * 0.15);
        expect(grin.w).toBeGreaterThan(extent(art.mouths.a).w * 1.05);
        expect(Math.abs(middle(tongue) - middle(rest))).toBeLessThan(rest.w * 0.15);
        expect(tongue.y + tongue.h).toBeGreaterThan(rest.y + rest.h + 2);
        // a grin stays on the face: no wider than the eyes are apart
        expect(grin.w).toBeLessThan(extent(art.eyes.open).w);
      });

      it('keeps its brows at rest as part of the head, and moves them as a layer of their own', () => {
        const brows = art.brows!;
        expect(brows).toBeDefined();
        if (art.rig) {
          // the deer has no brows: his head is his head, and his lids do the work
          expect(brows.bare).toBe(art.head);
          expect(brows.states.neutral).toBe('');
          expect(brows.states.raised).toBe('');
          const eyes = extent(art.eyes.open);
          // each lid is drawn over the whole eye (a hair past its white) and cut off at its edge
          for (const state of ['one', 'knit'] as const) expect(inside(extent(brows.states[state]), { x: eyes.x - 10, y: eyes.y - 30, w: eyes.w + 20, h: eyes.h + 40 }), state).toBe(true);
          expect(extent(brows.states.one).w).toBeLessThan(eyes.w * 0.6);
          return;
        }
        expect(art.head).toContain(brows.states.neutral);
        expect(brows.bare).not.toContain(brows.states.neutral);
        expect(brows.bare.length).toBeLessThan(art.head.length);
        if (art.hair) {
          expect(art.head).toContain(art.hair.art);
          expect(brows.bare).not.toContain(art.hair.art);
        }
        // raised brows sit higher than at rest, knitted ones lower and nearer each other; none leaves the face
        const rest = extent(brows.states.neutral);
        const raised = extent(brows.states.raised);
        const knit = extent(brows.states.knit);
        const one = extent(brows.states.one);
        expect(raised.y).toBeLessThan(rest.y - 1.5);
        expect(knit.y + knit.h).toBeGreaterThan(rest.y + rest.h + 0.5);
        expect(knit.w).toBeLessThan(rest.w);
        expect(one.y).toBeLessThan(rest.y - 1);
        const face = extent(art.head);
        for (const state of BROW_STATES) expect(inside(extent(brows.states[state]), face), state).toBe(true);
        // and every state is as heavy a stroke as the brows at rest
        for (const state of BROW_STATES) expect(Math.abs(bytes(brows.states[state]) - bytes(brows.states.neutral)), state).toBeLessThan(bytes(brows.states.neutral) * 0.2);
      });

      it('writes every expression as well-formed markup that only uses what every platform draws', () => {
        for (const [name, markup] of extras(art)) {
          const { problems, ids, refs } = inspect(markup);
          expect(problems, name).toEqual([]);
          for (const r of refs) expect(ids, `${name} points at #${r}`).toContain(r);
        }
        // every expression that can share a drawing with the plain figure has ids of its own; the bare head, the rig and the
        // half-shut eyes stand in for the head and the open eyes, so they share theirs
        const all = [...parts(art), ...extras(art)]
          .filter(([name]) => !['brows.bare', 'chest', 'eyes.half'].includes(name) && !name.startsWith('rig.'))
          .flatMap(([, m]) => inspect(m).ids);
        expect(new Set(all).size).toBe(all.length);
      });

      it('has frames that make sense: the bust inside the figure, the neck inside the bust', () => {
        const { viewBox: f, bust: b, headPivot: p } = art;
        expect(f.w).toBeGreaterThan(0);
        expect(f.h).toBeGreaterThan(f.w);
        expect(b.w).toBeGreaterThan(0);
        expect(b.h).toBeGreaterThan(0);
        expect(b.y).toBeGreaterThanOrEqual(f.y - b.h * 0.05);
        expect(b.y + b.h).toBeLessThan(f.y + f.h);
        expect(p.x).toBeGreaterThan(b.x);
        expect(p.x).toBeLessThan(b.x + b.w);
        expect(p.y).toBeGreaterThan(b.y);
        expect(p.y).toBeLessThan(b.y + b.h * 1.1);
      });

      it('writes every part as well-formed markup that only uses what every platform draws', () => {
        for (const [name, markup] of parts(art)) {
          const { problems } = inspect(markup);
          expect(problems, name).toEqual([]);
        }
      });

      it('keeps every part self-contained: whatever a part points at, it defines itself', () => {
        const everywhere: string[] = [];
        for (const [name, markup] of parts(art)) {
          const { ids, refs } = inspect(markup);
          for (const r of refs) expect(ids, `${name} points at #${r}`).toContain(r);
          everywhere.push(...ids);
        }
        // and no two parts define the same id, so all of them can sit in one <svg>
        expect(new Set(everywhere).size).toBe(everywhere.length);
      });

      it('prefixes every id, with its own prefix or the one asked for', () => {
        for (const [, markup] of parts(art)) for (const i of inspect(markup).ids) expect(i.startsWith(`hv${id}-`)).toBe(true);
        const other = characterArt(id, 'pick2');
        for (const [, markup] of parts(other)) {
          const { ids, refs } = inspect(markup);
          for (const i of [...ids, ...refs]) expect(i.startsWith('pick2-')).toBe(true);
        }
        expect(() => characterArt(id, '1bad')).toThrow(RangeError);
        expect(() => characterArt(id, 'a"b')).toThrow(RangeError);
      });

      it('stays small: the whole figure within its budget, and a mouth a sliver of it', () => {
        const total = parts(art).reduce((s, [, m]) => s + bytes(m), 0);
        // each of the deer's ears carries its own light, so either can be drawn alone;
        // Hamo spends a little of the budget on his groomed hair and warm eyes
        expect(total).toBeLessThan(32_000);
        for (const v of MOUTH_SHAPES) expect(bytes(art.mouths[v]), v).toBeLessThan(2_500);
        // Xezo's eyes carry a second lash each
        expect(bytes(art.eyes.open) + bytes(art.eyes.closed)).toBeLessThan(3_800);
        // the bare head is the head less its brows; the deer's is his head
        const budget: Record<string, number> = { 'rig.face': 9_000, chest: 5_000, 'brows.bare': bytes(art.head) + 1 };
        for (const [name, markup] of extras(art)) expect(bytes(markup), name).toBeLessThan(budget[name] ?? 3_000);
      });

      it('uses no pictures, filters, masks, styles or text', () => {
        for (const [name, markup] of [...parts(art), ...extras(art)]) {
          expect(markup, name).not.toMatch(/<image|<filter|<mask|<pattern|<style|<text|<use|<script|<foreignObject|data:|https?:/i);
        }
      });
    });
  }

  it('cuts Hevalo off under his chest, for a badge: the body down to there, drawn in its place', () => {
    const art = characterArt('hevalo');
    const chest = art.chest ?? '';
    const { problems, ids, refs } = inspect(chest);
    expect(problems).toEqual([]);
    for (const r of refs) expect(ids).toContain(r);
    // the same drawing as the body, under the same ids, less the legs and the hooves
    expect(new Set(ids)).toEqual(new Set(inspect(art.body).ids.filter((i) => !i.endsWith('hoof'))));
    expect(bytes(chest)).toBeLessThan(bytes(art.body) / 2);
    expect(characterArt('hamo').chest).toBeUndefined();
    expect(characterArt('xezo').chest).toBeUndefined();
  });

  it('frames Hevalo head and neck for a window: all of his head in the box, centred on him, and his neck on under the sill', () => {
    const art = characterArt('hevalo');
    const neck = art.neck!;
    const box = cropBox(art, 'head');
    expect(box).toEqual(neck.box);
    // the antlers, the ears and the face, every point of them, with a little room round them
    const head = extent(headGroup(art));
    expect(inside({ x: head.x - 10, y: head.y - 10, w: head.w + 20, h: head.h }, box)).toBe(true);
    expect(box.x + box.w / 2).toBe(art.headPivot.x);
    // the sill crosses his neck under his chin, and the box goes on below it further than his highest hop lifts him
    expect(neck.sill).toBeGreaterThan(head.y + head.h);
    expect(neck.sill).toBeLessThan(box.y + box.h);
    const hop = Math.max(...Object.values(ACTS).flatMap((act) => (act.rise ?? []).map(([, v]) => v)));
    expect(box.y + box.h - neck.sill).toBeGreaterThan(hop * box.h + 20);
    // his body as far as the chest under the same ids, and the daylight behind him catching the edges of his neck
    const { problems, ids, refs } = inspect(neck.body);
    expect(problems).toEqual([]);
    for (const r of refs) expect(ids).toContain(r);
    expect(neck.body.startsWith(art.chest!)).toBe(true);
    const rim = ((parse(neck.body.slice(art.chest!.length)).children[0] as El).children[0] as El).children;
    const stops = rim.map((stop) => ({ light: luminance(stop.attrs['stop-color'] ?? ''), opacity: Number(stop.attrs['stop-opacity'] ?? 1) }));
    // a light that grows toward the sill, never a shade going down into a room
    for (const stop of stops) expect(stop.light).toBeGreaterThan(0.8);
    expect(stops[0]?.opacity).toBe(0);
    expect(stops[stops.length - 1]?.opacity).toBeGreaterThan(0.5);
    expect(neck.body).toMatch(/fill="none" stroke="url\(#[^)]*neckrim\)"/);
    expect(cropBody(art, 'head')).toBe(neck.body);
    expect(cropBody(art, 'half')).toBe(art.body);
    // drawn whole: the crop shows it
    const svg = parse(characterSvg('hevalo', { crop: 'head', idPrefix: 'neck' })).children[0] as El;
    expect(svg.attrs.viewBox).toBe(`${box.x} ${box.y} ${box.w} ${box.h}`);
  });

  it('shows the head and shoulders for head and neck of a character drawn without a neck to put in at a window', () => {
    for (const id of ['hamo', 'xezo'] as const) {
      const art = characterArt(id);
      expect(art.neck).toBeUndefined();
      expect(cropBox(art, 'head')).toEqual(art.bust);
      expect(cropBody(art, 'head')).toBe(art.body);
    }
  });

  it('is the same string every time it is drawn', () => {
    for (const id of CHARACTER_IDS) {
      expect(characterSvg(id, { mouth: 'a', idPrefix: 'again' })).toBe(characterSvg(id, { mouth: 'a', idPrefix: 'again' }));
    }
  });

  it('cuts Hamo’s moustache into its near end and the rest from the one outline, the two overlapping at the root', () => {
    const art = characterArt('hamo');
    const { body, end } = art.moustache!;
    const d = /<path d="([^"]+)" fill="#1f1510"\/>/.exec(art.overlay)?.[1];
    expect(d).toBeTruthy();
    // each piece is the whole moustache inside a clip, so at rest the two together are the overlay to the pixel
    expect(body).toContain(`d="${d}"`);
    expect(end.art).toContain(`d="${d}"`);
    const cut = (markup: string): number[] => (/<clipPath[^>]*><path d="M([\d.]+),[\d.]+H([\d.]+)/.exec(markup) ?? []).slice(1).map(Number);
    const [bodyFrom] = cut(body);
    const [, endTo] = cut(end.art);
    expect(endTo!).toBeGreaterThan(bodyFrom!);
    expect(endTo! - bodyFrom!).toBeLessThan(3);
    // the end turns about its root, between the two cuts and in the middle of the moustache's height
    const whole = extent(art.overlay);
    expect(end.pivot.x).toBeGreaterThanOrEqual(bodyFrom!);
    expect(end.pivot.x).toBeLessThanOrEqual(endTo!);
    expect(end.pivot.y).toBeGreaterThan(whole.y);
    expect(end.pivot.y).toBeLessThan(whole.y + whole.h);
    // the near end is the shorter piece, on the side his face turns toward us
    expect(end.pivot.x - whole.x).toBeLessThan(whole.w / 3);
    expect(characterArt('hevalo').moustache).toBeUndefined();
    expect(characterArt('xezo').moustache).toBeUndefined();
  });

  it('gives Xezo a blush on both cheeks and wisps of hair that swing from the parting; the others neither', () => {
    const art = characterArt('xezo');
    const blush = extent(art.cheeks!.blush);
    const eyes = extent(art.eyes.open);
    const face = extent(art.head);
    // under the eyes, either side of the nose, inside the face
    expect(blush.y).toBeGreaterThan(eyes.y + eyes.h * 0.5);
    expect(blush.x + blush.w / 2).toBeCloseTo(eyes.x + eyes.w / 2, 0);
    expect(inside(blush, face)).toBe(true);
    expect(shapes(art.cheeks!.blush)).toHaveLength(2);
    const hair = art.hair!;
    const wisps = extent(hair.art);
    expect(hair.pivot.y).toBeLessThan(wisps.y);
    expect(hair.pivot.x).toBeGreaterThan(wisps.x);
    expect(hair.pivot.x).toBeLessThan(wisps.x + wisps.w);
    for (const other of ['hevalo', 'hamo'] as const) {
      expect(characterArt(other).cheeks).toBeUndefined();
      expect(characterArt(other).hair).toBeUndefined();
    }
  });

  it('draws a face with its brows and cheeks as layers over the bare head when asked, and whole when not', () => {
    for (const id of CHARACTER_IDS) {
      const art = characterArt(id);
      expect(headGroup(art)).toBe(`<g>${art.head}${art.eyes.open}${art.mouths.rest}${art.overlay}</g>`);
      expect(headFor(art, false)).toBe(art.head);
      expect(headFor(art, true)).toBe(art.brows!.bare);
      const face = { brows: 'one', blush: true } as const;
      const asked = headGroup(art, 'grin', 'wink', 0, face);
      expect(asked).toContain(art.brows!.bare);
      expect(asked).toContain(art.eyes.wink);
      expect(asked).toContain(art.mouths.grin);
      expect(asked).toContain(faceLayers(art, face));
      expect(asked).toContain(art.brows!.states.one);
      if (art.cheeks) expect(asked).toContain(art.cheeks.blush);
      if (art.hair) expect(asked).toContain(art.hair.art);
      // the layers come after the eyes, so the deer's lids lie over his eyes
      expect(asked.indexOf(art.eyes.wink)).toBeLessThan(asked.indexOf(art.brows!.states.one));
      const still = parse(characterSvg(id, { eyes: 'wide', mouth: 'tongue', brows: 'one', blush: true, idPrefix: 'face' }));
      expect(inspect(characterSvg(id, { eyes: 'wide', mouth: 'tongue', brows: 'one', blush: true, idPrefix: 'face' })).problems).toEqual([]);
      expect((still.children[0] as El).name).toBe('svg');
    }
    expect(() => characterSvg('hamo', { brows: 'arched' as never })).toThrow(RangeError);
    expect(() => characterSvg('hamo', { mouth: 'smirk' as never })).toThrow(RangeError);
    expect(characterSvg('hamo', { eyes: 'wink', idPrefix: 'w' })).toContain(characterArt('hamo', 'w').eyes.wink);
  });

  it('gives the three their own ids, so all can share a page', () => {
    const all = CHARACTER_IDS.flatMap((id) => parts(characterArt(id)).flatMap(([, m]) => inspect(m).ids));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('characterSvg', () => {
  it('is a complete drawing: an <svg> with a title it is labelled by, the body, then the head group', () => {
    for (const id of CHARACTER_IDS) {
      const svg = characterSvg(id);
      const root = parse(svg).children;
      expect(root.length).toBe(1);
      const el = root[0] as El;
      expect(el.name).toBe('svg');
      expect(el.attrs.xmlns).toBe('http://www.w3.org/2000/svg');
      expect(el.attrs.role).toBe('img');
      const title = el.children[0] as El;
      expect(title.name).toBe('title');
      expect(title.text).toBe(CHARACTER_NAMES[id]);
      expect(el.attrs['aria-labelledby']).toBe(title.attrs.id);
      const { refs, ids, problems } = inspect(svg);
      expect(problems).toEqual([]);
      for (const r of refs) expect(ids).toContain(r);
      const art = characterArt(id);
      const v = art.viewBox;
      expect(el.attrs.viewBox).toBe(`${v.x} ${v.y} ${v.w} ${v.h}`);
      expect(svg).toContain(art.body + headGroup(art));
    }
  });

  it('shows the mouth and eyes asked for, and crops to the bust', () => {
    const art = characterArt('xezo');
    const svg = characterSvg('xezo', { mouth: 'o', eyes: 'closed', crop: 'bust', width: 96 });
    expect(svg).toContain(art.mouths.o);
    expect(svg).toContain(art.eyes.closed);
    expect(svg).not.toContain(art.eyes.open);
    const el = parse(svg).children[0] as El;
    expect(el.attrs.viewBox).toBe(`${art.bust.x} ${art.bust.y} ${art.bust.w} ${art.bust.h}`);
    expect(el.attrs.width).toBe('96');
    expect(Number(el.attrs.height)).toBeCloseTo((96 * art.bust.h) / art.bust.w, 0);
  });

  it('escapes the title, and drops what XML cannot carry', () => {
    const svg = characterSvg('hamo', { title: `Hamo <b>"says"</b> & 'hi'\u0001` });
    const title = (parse(svg).children[0] as El).children[0] as El;
    expect(title.text).toBe('Hamo &lt;b&gt;&quot;says&quot;&lt;/b&gt; &amp; &apos;hi&apos;');
    expect(svg).not.toContain('<b>');
  });

  it('prefixes the ids with the prefix asked for, so the same character can be on a page twice', () => {
    const one = inspect(characterSvg('hevalo', { idPrefix: 'one' }));
    const two = inspect(characterSvg('hevalo', { idPrefix: 'two' }));
    for (const i of one.ids) expect(i.startsWith('one-')).toBe(true);
    for (const i of two.ids) expect(i.startsWith('two-')).toBe(true);
    expect(one.ids.filter((i) => two.ids.includes(i))).toEqual([]);
  });

  it('refuses what it cannot draw', () => {
    expect(() => characterSvg('hamo', { mouth: 'x' as never })).toThrow(RangeError);
    expect(() => characterSvg('hamo', { eyes: 'squint' as never })).toThrow(RangeError);
    expect(() => characterSvg('hamo', { width: 0 })).toThrow(RangeError);
    expect(() => characterSvg('nobody' as never)).toThrow(RangeError);
  });

  it('nods the head about the neck when asked', () => {
    const art = characterArt('hamo');
    expect(headGroup(art, 'rest', 'open', 0)).toMatch(/^<g>/);
    expect(headGroup(art, 'a', 'open', -2)).toContain(`rotate(-2 ${art.headPivot.x} ${art.headPivot.y})`);
  });
});

describe('a stage', () => {
  it('stands each character in nothing but its own light: a wash and a glow, no landscape', () => {
    for (const id of CHARACTER_IDS) {
      for (const dark of [false, true]) {
        const svg = parse(stageBackdrop(id, 342, 340, 0.27, { dark, idPrefix: `t-${id}` })).children[0] as El;
        expect(svg.name).toBe('svg');
        expect(svg.children.map((el) => el.name)).toEqual(['defs', 'rect', 'rect']);
      }
    }
  });

  it('shows a character head to waist as tall as the stage allows, and smaller rather than wider than its share', () => {
    for (const id of CHARACTER_IDS) {
      const half = characterArt(id).half;
      for (const [width, height] of [
        [342, 340],
        [342, 150],
        [648, 380],
      ] as const) {
        const shown = stageFigure(id, width, height, 16);
        expect(shown.height).toBeLessThanOrEqual(height - 16 + 1e-9);
        expect(shown.width).toBeLessThanOrEqual(width * STAGE_FIGURE_SHARE + 1e-9);
        expect(shown.width / shown.height).toBeCloseTo(half.w / half.h, 9);
        // one of the two limits is reached: the figure is never smaller than it need be
        expect(Math.max(shown.height / (height - 16), shown.width / (width * STAGE_FIGURE_SHARE))).toBeCloseTo(1, 9);
      }
    }
  });
});

describe('the window Hevalo puts his head in at', () => {
  const art = characterArt('hevalo');
  const neck = art.neck!;
  const head = extent(headGroup(art));
  const layers = (drawn: WindowArt): string[] => [drawn.back, drawn.front, drawn.shadow];

  it('is three well-formed drawings in the window box, behind him, on our side of him and his shadow, by day and at dusk', () => {
    for (const dark of [false, true]) {
      const drawn = windowArt({ dark, idPrefix: `win${dark ? 'd' : 'l'}` });
      for (const layer of layers(drawn)) {
        const svg = parse(layer).children[0] as El;
        expect(svg.name).toBe('svg');
        expect(svg.attrs.viewBox).toBe(`${WINDOW_VIEW.x} ${WINDOW_VIEW.y} ${WINDOW_VIEW.w} ${WINDOW_VIEW.h}`);
        expect(svg.attrs['aria-hidden']).toBe('true');
        const { problems, ids, refs } = inspect(layer);
        expect(problems).toEqual([]);
        for (const r of refs) expect(ids).toContain(r);
        for (const i of ids) expect(i.startsWith(`win${dark ? 'd' : 'l'}-`)).toBe(true);
        // all of it inside the picture's own box
        expect(inside(extent(layer), WINDOW_VIEW)).toBe(true);
      }
    }
    expect(windowArt().back).not.toBe(windowArt({ dark: true }).back);
    expect(windowArt({ idPrefix: 'again' })).toEqual(windowArt({ idPrefix: 'again' }));
  });

  it('keeps two windows on a page apart: each its own ids', () => {
    const ids = [...layers(windowArt({ idPrefix: 'one' })), ...layers(windowArt({ idPrefix: 'two' }))].flatMap((m) => inspect(m).ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows the outside behind him through the opening: a bright sky by day, an evening sky with its first stars at dusk', () => {
    const sky = (dark: boolean): { top: string; low: string; stars: number; kept: boolean } => {
      let gradient: El | undefined;
      let stars = 0;
      let kept = false;
      walk(parse(windowArt({ dark, idPrefix: 'sky' }).back), (e) => {
        if (e.attrs.id === 'sky-sky') gradient = e;
        if (e.name === 'circle') stars += 1;
        // the sky, the mountains and the trees are kept inside the opening
        if (e.attrs['clip-path'] === 'url(#sky-opening)') kept = e.children.some((c) => c.attrs.fill === 'url(#sky-sky)');
      });
      const stops = gradient?.children ?? [];
      return { top: stops[0]?.attrs['stop-color'] ?? '', low: stops[stops.length - 1]?.attrs['stop-color'] ?? '', stars, kept };
    };
    const day = sky(false);
    const dusk = sky(true);
    expect(day.kept && dusk.kept).toBe(true);
    // by day a blue sky going pale toward the mountains, and no stars
    expect(luminance(day.top)).toBeGreaterThan(0.55);
    expect(luminance(day.low)).toBeGreaterThan(0.9);
    expect(day.stars).toBe(0);
    // at dusk violet above, amber at the horizon, and a star or two
    expect(luminance(dusk.top)).toBeLessThan(0.25);
    const [r, , b] = rgb(dusk.low);
    expect(r).toBeGreaterThan(b);
    expect(dusk.stars).toBeGreaterThanOrEqual(2);
  });

  it('stands the pot on our side of him, no curtains, beside his head or under his chin, never over his face', () => {
    for (const dark of [false, true]) {
      const { back, front } = windowArt({ dark, idPrefix: 'side' });
      for (const id of ['side-pot', 'side-ledge']) {
        expect(inspect(front).ids).toContain(id);
        expect(inspect(back).ids).not.toContain(id);
      }
      // the kilim curtains are gone: the window is left plain
      expect(front).not.toContain('curtain');
      for (const shape of shapes(front)) {
        const beside = shape.x + shape.w < head.x || shape.x > head.x + head.w;
        const under = shape.y > head.y + head.h;
        expect(beside || under).toBe(true);
      }
    }
  });

  it('cuts him off at the sill, the sill on our side drawn over that line, and his shadow lying on it toward us', () => {
    const { front, shadow } = windowArt();
    // the sill is the only thing on our side right across him
    const across = shapes(front).filter((shape) => shape.x < art.headPivot.x && shape.x + shape.w > art.headPivot.x);
    expect(across.length).toBeGreaterThan(0);
    for (const shape of across) expect(shape.y).toBeGreaterThanOrEqual(neck.sill - 4);
    expect(Math.min(...across.map((shape) => shape.y))).toBeLessThan(neck.sill);
    const cast = extent(shadow);
    expect(cast.x + cast.w / 2).toBe(art.headPivot.x);
    expect(cast.y).toBeLessThan(neck.sill);
    expect(cast.y + cast.h).toBeGreaterThan(neck.sill + 20);
  });

  it('says where the room wall it is in stands, for what is set on the floor in front of it', () => {
    const wall = extent(windowArt().back);
    const { left, right, foot } = WINDOW_PLACE.wall;
    expect(WINDOW_VIEW.x + left * WINDOW_VIEW.w).toBeCloseTo(wall.x, 6);
    expect(WINDOW_VIEW.x + right * WINDOW_VIEW.w).toBeCloseTo(wall.x + wall.w, 6);
    expect(WINDOW_VIEW.y + foot * WINDOW_VIEW.h).toBeCloseTo(wall.y + wall.h, 6);
  });

  it('places him in it: his head and neck crop where it is drawn, cut off at the sill, and waiting outside under it, farther off, to come in', () => {
    const box = neck.box;
    expect(inside(box, WINDOW_VIEW)).toBe(true);
    // the same either way round, so a mirrored window keeps him where he is
    expect(WINDOW_VIEW.x + WINDOW_VIEW.w / 2).toBe(box.x + box.w / 2);
    const { figure, sill, drop, far, through } = WINDOW_PLACE;
    expect(figure.left * WINDOW_VIEW.w + WINDOW_VIEW.x).toBeCloseTo(box.x, 9);
    expect(figure.top * WINDOW_VIEW.h + WINDOW_VIEW.y).toBeCloseTo(box.y, 9);
    expect(figure.width * WINDOW_VIEW.w).toBeCloseTo(box.w, 9);
    expect(figure.height * WINDOW_VIEW.h).toBeCloseTo(box.h, 9);
    expect(sill * WINDOW_VIEW.h + WINDOW_VIEW.y).toBeCloseTo(neck.sill, 9);
    // he grows from the middle of his neck where it comes in over the sill
    expect(through.x * box.w + box.x).toBeCloseTo(art.headPivot.x, 9);
    expect(through.y * box.h + box.y).toBeCloseTo(neck.sill, 9);
    // waiting smaller and lowered, the top of his antlers just under the sill
    expect(far).toBeGreaterThan(0.6);
    expect(far).toBeLessThan(1);
    expect(neck.sill + drop * WINDOW_VIEW.h - far * (neck.sill - box.y)).toBeCloseTo(neck.sill, 9);
  });
});

describe('the pen', () => {
  it('runs a closed curve through every point it is given, rounded to a tenth', () => {
    const d = curve([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(d.startsWith('M0,0c')).toBe(true);
    expect(d.endsWith('z')).toBe(true);
    // four curved sides: the first written in full, the rest with the handle that mirrors the last one's left out
    expect(d.match(/[cs]/g)?.length).toBe(4);
    expect(d.match(/s/g)?.length).toBe(3);
    expect(d).not.toMatch(/\d\.\d{2,}/);
  });

  it('draws corners as straight lines', () => {
    expect(curve(
      [
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0],
      ],
      false,
    )).toBe('M0,0l10,0l0,10');
  });

  it('mirrors and completes symmetric outlines', () => {
    expect(mirror([[1, 2], [3, 4]], 10)).toEqual([
      [17, 4, 1],
      [19, 2, 1],
    ]);
    expect(symmetric([[10, 0], [4, 5], [10, 10]], 10)).toEqual([
      [10, 0],
      [4, 5],
      [10, 10],
      [16, 5, 1],
    ]);
  });

  it('tapers a stroke to points at its ends', () => {
    const d = taper(
      [
        [0, 0],
        [5, 0],
        [10, 0],
      ],
      [0, 2, 0],
    );
    expect(d.startsWith('M0,0')).toBe(true);
    expect(d.endsWith('z')).toBe(true);
  });
});
