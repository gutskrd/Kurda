import { describe, expect, it } from 'vitest';
import { VISEMES } from '../lipsync/visemes.js';
import {
  CHARACTER_IDS,
  CHARACTER_NAMES,
  CHARACTERS,
  DEFAULT_CHARACTER,
  STAGE_FIGURE_SHARE,
  characterArt,
  characterSvg,
  headGroup,
  isCharacterId,
  stageBackdrop,
  stageFigure,
  type CharacterArt,
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
    ...(art.eyes.half ? ([['eyes.half', art.eyes.half]] as [string, string][]) : []),
    ...(rig
      ? ([
          ['rig.face', rig.face],
          ['rig.crown', rig.crown],
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

      it('has every mouth shape and both eye states, each drawn', () => {
        expect(art.id).toBe(id);
        expect(art.name).toBe(CHARACTER_NAMES[id]);
        expect(Object.keys(art.mouths).sort()).toEqual([...VISEMES].sort());
        for (const v of VISEMES) expect(art.mouths[v].length, v).toBeGreaterThan(40);
        expect(art.eyes.open.length).toBeGreaterThan(40);
        expect(art.eyes.closed.length).toBeGreaterThan(40);
        expect(art.head.length).toBeGreaterThan(200);
        expect(art.body.length).toBeGreaterThan(200);
      });

      it('draws every mouth shape differently, and the eyes shut differently from open', () => {
        const mouths = new Set(VISEMES.map((v) => art.mouths[v]));
        expect(mouths.size).toBe(VISEMES.length);
        expect(art.eyes.closed).not.toBe(art.eyes.open);
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
        // each of the deer's ears carries its own light, so either can be drawn alone
        expect(total).toBeLessThan(31_000);
        for (const v of VISEMES) expect(bytes(art.mouths[v]), v).toBeLessThan(2_500);
        expect(bytes(art.eyes.open) + bytes(art.eyes.closed)).toBeLessThan(3_500);
        const budget: Record<string, number> = { 'rig.face': 9_000, chest: 5_000 };
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

  it('is the same string every time it is drawn', () => {
    for (const id of CHARACTER_IDS) {
      expect(characterSvg(id, { mouth: 'a', idPrefix: 'again' })).toBe(characterSvg(id, { mouth: 'a', idPrefix: 'again' }));
    }
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
