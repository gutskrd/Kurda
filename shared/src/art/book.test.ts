/**
 * The drawings of Hevalo's book (art/book.ts): the apple that is smaller on
 * every page, the small things the road's scenes are told with, a dab of
 * each colour, the postmark, the sky and hill a scene stands on, and the
 * three friends posed. Each is held to what its neighbours are held to:
 * well-formed and self-contained, flat in the word pictures' hand, the same
 * every time, and unwilling to draw what it was not asked for properly.
 */
import { describe, expect, it } from 'vitest';
import {
  BOOK_APPLE_BITES,
  BOOK_BACKDROP,
  BOOK_PAINTS,
  BOOK_POSES,
  BOOK_SETTINGS,
  BOOK_SPOTS,
  bookAppleSvg,
  bookBackdropSvg,
  bookCastSvg,
  bookPaintSvg,
  bookPostmarkSvg,
  bookRidgeAt,
  bookSkyMarks,
  bookSpotSvg,
  type BookOrb,
  type BookPaint,
  type BookPose,
  type BookSetting,
  type BookSpot,
} from './book.js';
import * as shared from '../index.js';
import { characterArt, cropBody, cropBox, type CharacterId } from '../characters/index.js';
import { n, prefixFor } from './svg.js';
import { wordPictureSvg } from './word-pictures.js';

interface El {
  name: string;
  attrs: Record<string, string>;
  text: string;
  children: El[];
}

/**
 * A strict little reader of a drawing's markup: every tag closed in order,
 * every attribute quoted and named once, nothing after the root. Enough to
 * say a drawing is well-formed and to walk its elements.
 */
function parse(xml: string): El {
  const root: El = { name: '#root', attrs: {}, text: '', children: [] };
  const stack: El[] = [root];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const top = stack.at(-1)!;
    if (lt === -1) {
      if (xml.slice(i).trim()) throw new Error('text after the root element');
      break;
    }
    const text = xml.slice(i, lt);
    if (/>|&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(text)) throw new Error(`stray > or bare & before ${lt}`);
    top.text += text;
    i = lt;
    const close = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(xml.slice(i));
    if (close) {
      const open = stack.pop();
      if (!open || open.name !== close[1]) throw new Error(`</${close[1]}> closes <${open?.name}>`);
      i += close[0].length;
      continue;
    }
    const tag = /^<([A-Za-z][\w:-]*)((?:\s+[A-Za-z][\w:-]*="[^"<]*")*)\s*(\/?)>/.exec(xml.slice(i));
    if (!tag) throw new Error(`bad tag at ${i}: ${xml.slice(i, i + 40)}`);
    const attrs: Record<string, string> = {};
    for (const [, k, v] of (tag[2] ?? '').matchAll(/([A-Za-z][\w:-]*)="([^"]*)"/g)) {
      if (k! in attrs) throw new Error(`attribute ${k} twice on <${tag[1]}>`);
      attrs[k!] = v!;
    }
    const el: El = { name: tag[1]!, attrs, text: '', children: [] };
    top.children.push(el);
    if (!tag[3]) stack.push(el);
    i += tag[0].length;
  }
  if (stack.length !== 1) throw new Error(`<${stack.at(-1)?.name}> never closed`);
  if (root.children.length !== 1) throw new Error('not exactly one root element');
  return root.children[0]!;
}

function walk(el: El, visit: (e: El) => void): void {
  visit(el);
  for (const c of el.children) walk(c, visit);
}

/** Only what every renderer the drawings go to draws the same: a browser, the phone, and the book's PDF. */
const ALLOWED = new Set(['svg', 'title', 'defs', 'g', 'path', 'circle', 'ellipse', 'rect', 'linearGradient', 'radialGradient', 'stop', 'clipPath']);

/** What every drawing keeps to, whatever it is of; hands back its root. */
function checkDrawing(svg: string, what: string): El {
  const problems: string[] = [];
  const want = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(`${what}: ${problem}`);
  };
  const root = parse(svg);
  want(root.name === 'svg' && root.attrs.xmlns === 'http://www.w3.org/2000/svg', 'root is not an <svg> in the SVG namespace');
  want(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/.test(root.attrs.viewBox ?? ''), `viewBox ${root.attrs.viewBox}`);
  want(Number(root.attrs.width) > 0 && Number(root.attrs.height) > 0, 'no size');
  const ids = new Set<string>();
  const refs: string[] = [];
  walk(root, (e) => {
    want(ALLOWED.has(e.name), `<${e.name}> is not drawn the same everywhere`);
    for (const [k, v] of Object.entries(e.attrs)) {
      want(!k.startsWith('on') && !/href$/i.test(k), `attribute ${k}`);
      for (const m of v.matchAll(/url\(([^)]*)\)/g)) {
        want(m[1]?.startsWith('#') === true, `external url(${m[1]})`);
        refs.push((m[1] ?? '').slice(1));
      }
      if (k !== 'xmlns') want(!/NaN|Infinity|undefined|null/.test(v), `${k}="${v}" on <${e.name}>`);
    }
    if (e.attrs.id) {
      want(!ids.has(e.attrs.id), `id ${e.attrs.id} twice`);
      ids.add(e.attrs.id);
    }
  });
  for (const r of refs) want(ids.has(r), `url(#${r}) points at nothing`);
  want(!/https?:|<image|<script|<style|<foreignObject|<use|<text|data:|javascript:/i.test(svg.replace('xmlns="http://www.w3.org/2000/svg"', '')), 'reaches outside the drawing');
  expect(problems).toEqual([]);
  return root;
}

const SKY = { sky: '#dcecff', ground: '#b9d6f7', light: '#fffdf8' } as const;

/** Every drawing of the book that is painted flat, each with what it is. */
const FLAT: ReadonlyArray<readonly [string, string]> = [
  ...Array.from({ length: BOOK_APPLE_BITES + 1 }, (_, bites) => [`apple ${bites}`, bookAppleSvg({ bites })] as const),
  ...BOOK_SPOTS.map((spot) => [`spot ${spot}`, bookSpotSvg({ spot })] as const),
  ...BOOK_PAINTS.map((colour) => [`paint ${colour}`, bookPaintSvg({ colour })] as const),
  ['postmark', bookPostmarkSvg({ ink: '#1f4f8f' })],
  ...BOOK_SETTINGS.map((setting) => [`backdrop ${setting}`, bookBackdropSvg({ setting, ...SKY })] as const),
];

const CAST = (Object.keys(BOOK_POSES) as CharacterId[]).flatMap((who) => BOOK_POSES[who].map((pose) => ({ who, pose: pose as BookPose })));

describe('the drawings of Hevalo’s book', () => {
  it('draws every one well-formed and self-contained, hidden from a screen reader until it is named', () => {
    for (const [what, svg] of FLAT) {
      const root = checkDrawing(svg, what);
      expect(root.attrs['aria-hidden'], what).toBe('true');
      expect(root.attrs.focusable, what).toBe('false');
      expect(root.attrs.role, what).toBeUndefined();
      expect(root.children.some((e) => e.name === 'title'), what).toBe(false);
    }
    const named = checkDrawing(bookSpotSvg({ spot: 'flute', title: 'bilûr & <bilûr>', size: 96 }), 'named');
    expect(named.attrs.role).toBe('img');
    expect(named.attrs.width).toBe('96');
    expect(named.children[0]).toMatchObject({ name: 'title', text: 'bilûr &amp; &lt;bilûr&gt;' });
    expect(named.attrs['aria-labelledby']).toBe(named.children[0]!.attrs.id);
    expect(bookAppleSvg({ bites: 2, title: 'sêv', idPrefix: 'corner4' })).toContain('aria-labelledby="corner4t"');
  });

  it('paints them flat in the word pictures’ hand: no gradient, blur, mask or clip, every colour a plain one, and no outline of another colour', () => {
    for (const [what, svg] of FLAT) {
      expect(svg, what).not.toMatch(/Gradient|filter|mask|clip-path|clipPath|url\(/);
      walk(parse(svg), (e) => {
        for (const k of ['fill', 'stroke'] as const) {
          const v = e.attrs[k];
          if (v !== undefined) expect(v, `${what} ${k}`).toMatch(/^(#[0-9a-f]{6}|none)$/);
        }
        // a line is a thing that is a line; a filled shape only ever wears a line of its own colour
        if (e.attrs.stroke && e.attrs.fill && e.attrs.fill !== 'none') expect(e.attrs.stroke, what).toBe(e.attrs.fill);
      });
    }
  });

  it('draws the things on the word pictures’ canvas, light enough for a page full of them', () => {
    for (const [what, svg] of FLAT.filter(([name]) => !name.startsWith('backdrop'))) {
      const root = parse(svg);
      expect(root.attrs.viewBox, what).toBe('0 0 120 120');
      expect(svg.length, what).toBeLessThan(4 * 1024);
      let count = 0;
      walk(root, () => (count += 1));
      expect(count, what).toBeLessThan(60);
    }
  });

  it('is the same drawing every time, and each one its own', () => {
    const again: string[] = [
      ...Array.from({ length: BOOK_APPLE_BITES + 1 }, (_, bites) => bookAppleSvg({ bites })),
      ...BOOK_SPOTS.map((spot) => bookSpotSvg({ spot })),
      ...BOOK_PAINTS.map((colour) => bookPaintSvg({ colour })),
      bookPostmarkSvg({ ink: '#1f4f8f' }),
      ...BOOK_SETTINGS.map((setting) => bookBackdropSvg({ setting, ...SKY })),
    ];
    expect(again).toEqual(FLAT.map(([, svg]) => svg));
    expect(new Set(again).size).toBe(again.length);
    expect(BOOK_SPOTS).toEqual([
      'moustache', 'flute', 'photo', 'lake', 'stove', 'calendar', 'notebook', 'ladder', 'sack', 'lamp', 'hoofprints', 'town',
      'lowTable', 'tray', 'cloth', 'rock', 'stoneWall', 'bedding', 'appleTree', 'walnutTree', 'flatHouse', 'houseLadder', 'ruin',
      'doe', 'whiteGoat', 'ram', 'flyingBird', 'eagle', 'tin', 'doctorBag', 'boots', 'jug', 'churn', 'saj', 'snowDeer', 'frames',
    ]);
    expect(BOOK_PAINTS).toEqual(['red', 'blue', 'green', 'yellow', 'black', 'white']);
  });

  it('starts from the word pictures’ own apple and takes a bite at a time, down to the core', () => {
    const paths = (svg: string): string[] => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]!);
    const fills = (svg: string): string[] => [...svg.matchAll(/ fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]!);
    // the whole apple is the apple of "sêv": the same outline, stalk and leaf
    const whole = paths(bookAppleSvg({ bites: 0 }));
    const word = paths(wordPictureSvg({ id: 'apple' }));
    for (const d of new Set(word)) expect(whole, d).toContain(d);
    const flesh = '#f8e6b4';
    const leaf = fills(bookAppleSvg({ bites: 0 }))[1]!;
    expect(fills(bookAppleSvg({ bites: 0 }))).not.toContain(flesh);
    // each bite shows the flesh, and the third stage has been bitten from both sides
    const bitten = [1, 2, 3].map((bites) => {
      const svg = bookAppleSvg({ bites });
      const at = [...svg.matchAll(/<path d="([^"]+)" fill="#f8e6b4"/g)];
      expect(at, `apple ${bites}`).toHaveLength(1);
      expect(fills(svg), `apple ${bites}`).toContain(leaf);
      return at[0]![1]!.split('M').length - 1;
    });
    expect(bitten).toEqual([1, 1, 2]);
    // the core keeps its stalk and loses its leaf; and a bite is never a straight cut: every one is tooth marks, as arcs
    const core = bookAppleSvg({ bites: BOOK_APPLE_BITES });
    expect(fills(core)).toContain(flesh);
    expect(fills(core)).not.toContain(leaf);
    expect(core).toContain('M60 41C59 32 62 25 67 20');
    for (const bites of [1, 2, 3]) expect(bookAppleSvg({ bites }), `apple ${bites}`).toMatch(/A[\d.]+ [\d.]+ 0 0 [01] /);
    // half a bite is no bite more
    expect(bookAppleSvg({ bites: 2.7 })).toBe(bookAppleSvg({ bites: 2 }));
  });

  it('cancels a stamp in one ink, and nothing else', () => {
    const svg = bookPostmarkSvg({ ink: '#862be2' });
    walk(parse(svg), (e) => {
      if (e.name !== 'path') return;
      expect(e.attrs.fill).toBe('none');
      expect(e.attrs.stroke).toBe('#862be2');
      expect(e.attrs['stroke-linecap']).toBe('round');
    });
    expect(svg).not.toBe(bookPostmarkSvg({ ink: '#1f4f8f' }));
  });

  it('sets a scene on a sky and a land in the colours it is given, by day, at dusk, by night and in the snow', () => {
    expect(BOOK_SETTINGS).toEqual(['day', 'dusk', 'night', 'snow']);
    const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const setting of BOOK_SETTINGS) {
      const svg = bookBackdropSvg({ setting, ...SKY, size: 360 });
      const root = parse(svg);
      expect(root.attrs.viewBox).toBe(`0 0 ${BOOK_BACKDROP.w} ${BOOK_BACKDROP.h}`);
      expect(root.attrs.width).toBe('360');
      expect(root.attrs.height).toBe('200');
      const painted = root.children.filter((e) => e.name === 'path');
      // the sky fills the panel first; the floor the scene stands on is drawn last and reaches its foot
      expect(painted[0]!.attrs).toMatchObject({ d: `M0 0H${BOOK_BACKDROP.w}V${BOOK_BACKDROP.h}H0Z`, fill: SKY.sky });
      expect(painted.at(-1)!.attrs.fill).toBe(SKY.ground);
      expect(painted.at(-1)!.attrs.d).toMatch(new RegExp(`V${BOOK_BACKDROP.h}H0Z$`));
      // and everything between is painted in mixes of the colours given, so a scene is all of its chapter
      const given = Object.values(SKY).map(channels);
      for (const e of painted) {
        channels(e.attrs.fill!).forEach((v, i) => {
          expect(v, `${setting} ${e.attrs.fill}`).toBeGreaterThanOrEqual(Math.min(...given.map((g) => g[i]!)));
          expect(v, `${setting} ${e.attrs.fill}`).toBeLessThanOrEqual(Math.max(...given.map((g) => g[i]!)));
        });
      }
      expect(painted.length, setting).toBeGreaterThan(5);
    }
    // the night has its stars, a few of them bright enough to twinkle, the snow more flakes than that, a day two clouds at most and dusk one
    const marks = (setting: BookSetting): string[] => bookSkyMarks({ setting }).marks.map((m) => m.kind);
    expect(marks('night').filter((k) => k === 'star').length).toBeGreaterThan(14);
    expect(marks('night')).toContain('twinkle');
    expect(marks('snow').length).toBeGreaterThan(marks('night').length);
    expect(marks('day').every((k) => k === 'cloud') && marks('day').length <= 2).toBe(true);
    expect(marks('dusk').length).toBeLessThanOrEqual(1);
    // the moon is up at night and the sun goes down at dusk by themselves; by day and in the snow the sun is there only when a scene asks for it
    expect(bookSkyMarks({ setting: 'night' }).orb).not.toBeNull();
    expect(bookSkyMarks({ setting: 'dusk' }).orb).not.toBeNull();
    expect(bookSkyMarks({ setting: 'day' }).orb).toBeNull();
    expect(bookSkyMarks({ setting: 'snow' }).orb).toBeNull();
    // a scene's own sky: another lesson, other stars and other clouds
    expect(bookBackdropSvg({ setting: 'night', ...SKY, seed: 'a' })).not.toBe(bookBackdropSvg({ setting: 'night', ...SKY, seed: 'b' }));
    expect(bookBackdropSvg({ setting: 'day', ...SKY, seed: 'a' })).toBe(bookBackdropSvg({ setting: 'day', ...SKY, seed: 'a' }));
  });

  it('never paints a star, a flake or a cloud on the moon or the sun, nor on anything a scene keeps clear, in any sky', () => {
    const problems: string[] = [];
    const k = 10;
    const boxes = [[], [{ x: 0, y: 23, w: 75, h: 80 }], [{ x: 105, y: 23, w: 75, h: 80 }, { x: 60, y: 4, w: 27, h: 27 }], [{ x: 2, y: 2, w: 20, h: 20 }, { x: 0, y: 23, w: 75, h: 80 }, { x: 105, y: 23, w: 75, h: 80 }]];
    for (const setting of BOOK_SETTINGS) {
      for (let x = 12; x <= 168; x += 26) {
        for (const y of [12, 22, 34]) {
          for (const [i, clear] of boxes.entries()) {
            const orb: BookOrb = { x, y, r: 9, full: (x + y) % 2 === 0 };
            const seed = `${x}-${y}-${i}`;
            const sky = bookSkyMarks({ setting, orb, clear, seed });
            const svg = bookBackdropSvg({ setting, ...SKY, orb, clear, seed });
            for (const m of sky.marks) {
              const where = `${setting} ${m.kind} at ${m.x.toFixed(1)},${m.y.toFixed(1)} with the orb at ${x},${y}`;
              const dx = Math.max(m.x - x, 0, x - (m.x + m.w));
              const dy = Math.max(m.y - y, 0, y - (m.y + m.h));
              if (Math.hypot(dx, dy) < orb.r + 2) problems.push(`${where}: on the orb`);
              for (const c of clear) if (m.x < c.x + c.w && c.x < m.x + m.w && m.y < c.y + c.h && c.y < m.y + m.h) problems.push(`${where}: on a box kept clear`);
              if ((m.kind === 'star' || m.kind === 'twinkle') && m.y + m.h > bookRidgeAt(m.x + m.w / 2)) problems.push(`${where}: below the mountains`);
              // and every mark is drawn where it says it is
              if (m.kind === 'star' || m.kind === 'flake') {
                const r = Math.round((m.w / 2) * k) / k;
                if (!svg.includes(`M${n(m.x + m.w / 2 - r)} ${n(m.y + m.h / 2)}a${n(r)} ${n(r)}`)) problems.push(`${where}: not drawn`);
              }
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('poses the three friends without redrawing them: the rig’s own layers, put together another way', () => {
    expect(BOOK_POSES).toEqual({
      hevalo: ['plain', 'caught', 'innocent', 'pleased', 'munching', 'curious', 'sad', 'asleep'],
      hamo: ['plain', 'proud', 'laughing', 'doubtful', 'shocked', 'telling', 'asleep'],
      xezo: ['plain', 'smiling', 'telling'],
    });
    const seen = new Set<string>();
    for (const { who, pose } of CAST) {
      for (const crop of ['bust', 'full'] as const) {
        const svg = bookCastSvg({ who, pose, crop } as Parameters<typeof bookCastSvg>[0]);
        const root = checkDrawing(svg, `${who} ${String(pose)} ${crop}`);
        // every picture carries its own ids, so two on a page never share a gradient
        const art = characterArt(who, prefixFor(undefined, 'book-cast', who, String(pose), crop));
        const frame = cropBox(art, crop);
        expect(root.attrs.viewBox).toBe(`${frame.x} ${frame.y} ${frame.w} ${frame.h}`);
        expect(root.attrs.role).toBe('img');
        expect(root.children[0]).toMatchObject({ name: 'title', text: art.name });
        // the body is the rig's own, and so is every layer of the head a pose does not turn
        expect(svg, `${who} ${String(pose)}`).toContain(cropBody(art, crop));
        if (art.rig) for (const layer of [art.rig.crown, art.rig.face, art.rig.look.whites, art.rig.ears.left.art, art.rig.ears.right.art]) expect(svg, `${who} ${String(pose)}`).toContain(layer);
        if (art.moustache) for (const layer of [art.moustache.body, art.moustache.end.art]) expect(svg, `${who} ${String(pose)}`).toContain(layer);
        expect(seen.has(svg)).toBe(false);
        seen.add(svg);
      }
    }
    // a pose is the same picture every time
    expect(bookCastSvg({ who: 'hevalo', pose: 'caught' })).toBe(bookCastSvg({ who: 'hevalo', pose: 'caught' }));
    expect(bookCastSvg({ who: 'hamo', pose: 'proud', width: 90 })).toContain('width="90"');
  });

  it('gives each pose what tells it apart: an apple in the deer’s mouth, his eyes on the sky, the lift of a moustache', () => {
    const plain = bookCastSvg({ who: 'hevalo', pose: 'plain' });
    const caught = bookCastSvg({ who: 'hevalo', pose: 'caught' });
    const innocent = bookCastSvg({ who: 'hevalo', pose: 'innocent' });
    // caught: the bitten apple, in the apple's own red, and its crumbs; plain has neither
    expect(caught).toContain('fill="#e0503f"');
    expect(caught).toContain('fill="#f8e6b4"');
    expect(plain).not.toContain('fill="#e0503f"');
    // innocent: the core lies beside him, and his pupils have moved from where they rest
    expect(innocent).toContain('fill="#f8e6b4"');
    const pupils = (svg: string): string[] => [...svg.matchAll(/<g transform="translate\(([^)]+)\)">/g)].map((m) => m[1]!);
    expect(pupils(plain).slice(0, 2)).toEqual(['0 0', '0 0']);
    expect(pupils(innocent).slice(0, 2)).not.toEqual(['0 0', '0 0']);
    // Hamo, proud: the near end of the moustache turned about its own pivot, and nothing else of it touched
    const art = characterArt('hamo', prefixFor(undefined, 'book-cast', 'hamo', 'proud', 'bust'));
    const { x, y } = art.moustache!.end.pivot;
    expect(bookCastSvg({ who: 'hamo', pose: 'proud' })).toContain(`<g transform="rotate(7 ${n(x)} ${n(y)})">${art.moustache!.end.art}</g>`);
    expect(bookCastSvg({ who: 'hamo', pose: 'plain' })).not.toContain('rotate(7 ');
    // a sleeper snores in three "z"s
    for (const who of ['hevalo', 'hamo'] as const) expect(bookCastSvg({ who, pose: 'asleep' })).toMatch(/stroke="#7d76a6"/);
  });

  it('refuses what it cannot draw: a bite too many, a thing or a colour it does not have, a size that is not one', () => {
    for (const bites of [-1, BOOK_APPLE_BITES + 1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => bookAppleSvg({ bites }), String(bites)).toThrow(RangeError);
    for (const spot of ['banana', 'toString', 'constructor', '']) expect(() => bookSpotSvg({ spot: spot as BookSpot }), spot).toThrow(RangeError);
    for (const colour of ['purple', 'toString', '']) expect(() => bookPaintSvg({ colour: colour as BookPaint }), colour).toThrow(RangeError);
    for (const ink of ['red', '#FFF', '#12345', '#GGGGGG', 'url(#a)']) expect(() => bookPostmarkSvg({ ink }), ink).toThrow(RangeError);
    expect(() => bookBackdropSvg({ setting: 'dawn' as BookSetting, ...SKY })).toThrow(RangeError);
    expect(() => bookBackdropSvg({ setting: 'night', ...SKY, orb: { x: Number.NaN, y: 4, r: 3 } })).toThrow(RangeError);
    expect(() => bookBackdropSvg({ setting: 'night', ...SKY, orb: { x: 4, y: 4, r: 0 } })).toThrow(RangeError);
    expect(() => bookBackdropSvg({ setting: 'snow', ...SKY, far: 'grey' })).toThrow(RangeError);
    expect(() => bookBackdropSvg({ setting: 'day', ...SKY, sky: 'blue' })).toThrow(RangeError);
    expect(() => bookBackdropSvg({ setting: 'day', ...SKY, light: '"/><script>' })).toThrow(RangeError);
    for (const size of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => bookAppleSvg({ bites: 1, size }), String(size)).toThrow(RangeError);
      expect(() => bookSpotSvg({ spot: 'lamp', size }), String(size)).toThrow(RangeError);
      expect(() => bookCastSvg({ who: 'hamo', pose: 'plain', width: size }), String(size)).toThrow(RangeError);
    }
    expect(() => bookSpotSvg({ spot: 'lamp', idPrefix: '1 bad' })).toThrow(RangeError);
    expect(() => bookCastSvg({ who: 'hevalo', pose: 'flying' as BookPose<'hevalo'> })).toThrow(RangeError);
    expect(() => bookCastSvg({ who: 'hevalo', pose: 'toString' as BookPose<'hevalo'> })).toThrow(RangeError);
    expect(() => bookCastSvg({ who: 'nobody' as CharacterId, pose: 'plain' as never })).toThrow(RangeError);
  });

  it('is offered by the package under the same names', () => {
    expect(shared.bookAppleSvg).toBe(bookAppleSvg);
    expect(shared.bookSpotSvg).toBe(bookSpotSvg);
    expect(shared.bookPaintSvg).toBe(bookPaintSvg);
    expect(shared.bookPostmarkSvg).toBe(bookPostmarkSvg);
    expect(shared.bookBackdropSvg).toBe(bookBackdropSvg);
    expect(shared.bookSkyMarks).toBe(bookSkyMarks);
    expect(shared.bookRidgeAt).toBe(bookRidgeAt);
    expect(shared.bookCastSvg).toBe(bookCastSvg);
    expect(shared.BOOK_SPOTS).toBe(BOOK_SPOTS);
    expect(shared.BOOK_POSES).toBe(BOOK_POSES);
    expect(shared.BOOK_APPLE_BITES).toBe(BOOK_APPLE_BITES);
  });
});
