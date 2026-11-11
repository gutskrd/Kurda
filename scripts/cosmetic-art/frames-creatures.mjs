/**
 * Frames with a living thing in them (see frames.mjs): the fawn of the icons
 * curled into a ring, a fox asleep on one, the snake that holds its own tail,
 * and a pair of wings folded round the face, in white and in black.
 *
 * The fawn and the fox are drawn as stickers are, in flat colour with a line
 * round every part; the snake and the wings are painted as the icons are.
 */
import { crescent, softly, within } from './brush.mjs';
import { blade, linear, spline, tube } from './icons.mjs';
import { n, pt } from './kit.mjs';
import { C, INK, P, RI, ring, round } from './ring.mjs';
import { Still } from './still.mjs';

const rad = (deg) => (deg * Math.PI) / 180;
const off = ([x, y], deg, len) => [x + Math.cos(rad(deg)) * len, y + Math.sin(rad(deg)) * len];

/**
 * A pair of wings folded down either side of the opening: on each, three rows of feathers lying the one way, as
 * a folded wing's do — the long flight feathers behind, starting low on the side and hanging to the corner, the
 * shorter rows over their roots up to the shoulder at the top. `tones` are the rows' colours, back to front,
 * each [root, tip]; `edge` the line round a feather, `shade` the line down its middle, `rim` the hoop they are
 * set on.
 */
function wings(rnd, { tones, edge, rim, shade, ink }) {
  const s = new Still(rnd);
  // a row on the left side, from its lowest feather up to its highest, so that each lies over the one below it:
  // `from` and `to` are where on the hoop they grow, `lengths` and `turns` what the lowest and the highest come to
  const row = (cv, count, [from, to], reach, lengths, turns, wide, [root, tip]) => {
    let out = '';
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const base = P(from + (to - from) * t, reach);
      const dir = turns[0] + (turns[1] - turns[0]) * t;
      const end = off(base, dir, lengths[0] + (lengths[1] - lengths[0]) * t);
      const d = blade(base, end, wide, { at: 0.56, point: 0.25, bend: 0.06 });
      out += `<path d="${d}" fill="${linear(cv, [[0, root], [0.75, tip]], ...base, ...end)}" stroke="${edge}" stroke-width="1.7" stroke-linejoin="round"/>`;
      out += `<path d="M${pt(off(base, dir, 8))} L${pt(off(end, dir + 180, 8))}" stroke="${shade}" stroke-width="1.3" stroke-opacity="0.7" stroke-linecap="round"/>`;
    }
    return out;
  };
  s.paint((cv) => {
    const side =
      row(cv, 9, [150, 222], 190, [150, 92], [98, 146], 36, tones[0]) +
      row(cv, 9, [158, 238], 186, [106, 66], [110, 162], 34, tones[1]) +
      row(cv, 9, [168, 250], 182, [64, 44], [122, 174], 30, tones[2]) +
      row(cv, 5, [236, 262], 180, [30, 20], [170, 196], 24, tones[2]);
    cv.add(`<g>${side}</g><g transform="translate(512 0) scale(-1 1)">${side}</g>`);
    // the hoop they are set on, round the face
    const hoop = ring(181, RI);
    cv.add(`<path d="${hoop}" fill="${linear(cv, [[0, rim[0]], [1, rim[1]]], 90, 90, 420, 420)}" stroke="${edge}" stroke-width="1.8"/>`);
    crescent(cv, hoop, [3, 4], { colour: rim[2], opacity: 0.8, soft: 2 });
  });
  return s.done({ finish: { paint: 0.8, grain: 0.008, contrast: 0.05, saturation: 1, ink } });
}

export const CREATURES = [
  {
    key: 'ask',
    ku: 'Xeleka Askê',
    en: 'Fawn',
    // the fawn of the shop's icon curled into a ring: its head at the top looking out over the face, its short
    // antlers and its ears, the ring its body, tan with a young deer's white spots along the lower half, and its
    // scut of a tail standing out at the lower right; drawn as a sticker, with a thick brown line
    still(rnd) {
      const s = new Still(rnd);
      const ink = '#4a2e1c';
      const TAN = '#e3a76b';
      const CREAM = '#fff1dc';
      const outline = (d, fill, width = 6.5) => `<path d="${d}" fill="${fill}" stroke="${ink}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
      const body = ring(207, RI);
      s.paint((cv) => {
        // the tail first, behind the ring
        const tail = `M${pt(P(58, 198))} Q${pt(P(60, 236))} ${pt(P(48, 250))} Q${pt(P(40, 226))} ${pt(P(44, 198))} Z`;
        cv.add(outline(tail, TAN));
        cv.add(`<path d="M${pt(P(55, 210))} Q${pt(P(57, 232))} ${pt(P(49, 244))} Q${pt(P(47, 226))} ${pt(P(49, 210))} Z" fill="#fffaf0"/>`);
        cv.add(outline(body, TAN));
        cv.add(`<g clip-path="${within(cv, body)}">`);
        // lighter along its back, at the upper left, and cream where its belly lies against the face
        cv.add(`<path d="${round(197)}" fill="none" stroke="#f1bd84" stroke-width="12" stroke-opacity="0.7" stroke-dasharray="300 2000" stroke-dashoffset="-650" filter="${softly(cv, 4)}"/>`);
        cv.add(`<path d="${round(175)}" fill="none" stroke="${CREAM}" stroke-width="6" stroke-opacity="0.9"/>`);
        // a young deer's spots, over the lower half
        for (const [a, r, size] of [[18, 196, 7], [30, 186, 6], [44, 198, 8], [70, 190, 7], [84, 200, 6], [98, 188, 8], [114, 198, 7], [128, 188, 6], [142, 198, 8], [158, 190, 6.5], [172, 198, 7]]) cv.add(`<ellipse cx="${n(P(a, r)[0])}" cy="${n(P(a, r)[1])}" rx="${size}" ry="${n(size * 0.82)}" fill="#fff6e4"/>`);
        cv.add('</g>');
      });
      s.paint((cv) => {
        // its head over the top of the ring: the antlers and the ears behind it
        const head = spline([[256, 40], [294, 46], [316, 72], [308, 100], [282, 114], [256, 117], [230, 114], [204, 100], [196, 72], [218, 46]]);
        for (const side of [-1, 1]) {
          const antler = `M${C + side * 20} 46 Q${C + side * 22} 28 ${C + side * 30} 11 M${C + side * 23} 30 Q${C + side * 34} 26 ${C + side * 45} 17`;
          cv.add(`<path d="${antler}" fill="none" stroke="${ink}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/><path d="${antler}" fill="none" stroke="#8a5e3c" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/>`);
          cv.add(outline(blade([C + side * 48, 64], [C + side * 96, 44], 40, { at: 0.5, point: 0.35 }), TAN, 6));
          cv.add(`<path d="${blade([C + side * 56, 61], [C + side * 87, 49], 21, { at: 0.5, point: 0.35 })}" fill="#f7bdb4"/>`);
        }
        cv.add(outline(head, TAN));
        cv.add(`<g clip-path="${within(cv, head)}">`);
        cv.add(`<path d="${spline([[256, 72], [278, 82], [294, 104], [280, 124], [256, 128], [232, 124], [218, 104], [234, 82]])}" fill="${CREAM}"/>`);
        cv.add(`<ellipse cx="256" cy="48" rx="40" ry="10" fill="#f1bd84" fill-opacity="0.75" filter="${softly(cv, 4)}"/>`);
        cv.add(`<ellipse cx="214" cy="94" rx="11" ry="7" fill="#f6a8a0" fill-opacity="0.75" filter="${softly(cv, 2)}"/><ellipse cx="298" cy="94" rx="11" ry="7" fill="#f6a8a0" fill-opacity="0.75" filter="${softly(cv, 2)}"/>`);
        cv.add('</g>');
        for (const x of [232, 280]) cv.add(`<ellipse cx="${x}" cy="80" rx="6" ry="8" fill="#2a1a12"/><circle cx="${x - 1.8}" cy="77" r="2.2" fill="#ffffff"/>`);
        cv.add('<path d="M250 92 Q256 89.6 262 92 Q262.6 96.4 256 99.4 Q249.4 96.4 250 92 Z" fill="#3a2418"/>');
        cv.add(`<path d="M256 99.4 V103 M250 105 Q253 107.4 256 103 Q259 107.4 262 105" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);
      });
      return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0.04, saturation: 1.02 } });
    },
  },
  {
    key: 'rovi',
    ku: 'Xeleka Rovî',
    en: 'Sleeping fox',
    // a soft ring with a fox asleep on it: two hoops, a broad one the colour of apricots and a fine green one
    // inside it, a fox curled up at the lower left with its tail round it and its nose on its tail, a mushroom
    // beside it, a sprig of leaves at the upper right, a small mauve flower at the left; each a sticker with a
    // white edge
    still(rnd) {
      const s = new Still(rnd);
      const line = '#7a4a2a';
      // (a sticker: its white edge under it, then itself with a fine line)
      const sticker = (cv, shapes) => {
        cv.add(shapes.map(([d]) => `<path d="${d}" fill="#ffffff" stroke="#ffffff" stroke-width="11" stroke-linejoin="round"/>`).join(''));
        cv.add(shapes.map(([d, fill]) => `<path d="${d}" fill="${fill}" stroke="${line}" stroke-width="2.4" stroke-linejoin="round"/>`).join(''));
      };
      s.shadow((cv) => cv.add(`<path d="${ring(208, 194)}"/>`), { blur: 5, opacity: 0.18 });
      s.paint((cv) => {
        cv.add(`<path d="${ring(208, 194)}" fill="${linear(cv, [[0, '#fde6c0'], [0.5, '#f9cf9e'], [1, '#fbe0b4']], 90, 90, 420, 420)}" stroke="#d9a878" stroke-width="1.6"/>`);
        cv.add(`<path d="${round(204)}" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-opacity="0.8"/>`);
        cv.add(`<path d="${round(180)}" fill="none" stroke="#9cc49a" stroke-width="5.4"/><path d="${round(180)}" fill="none" stroke="#e8f4e0" stroke-width="2"/>`);
        // beads where the fine hoop is tied
        for (const a of [-58, 96]) cv.add(`<circle cx="${n(P(a, 180)[0])}" cy="${n(P(a, 180)[1])}" r="7" fill="#ffffff" stroke="#9cc49a" stroke-width="2"/>`);
      });
      s.shadow((cv) => cv.add('<ellipse cx="128" cy="440" rx="74" ry="14"/>'), { blur: 6, opacity: 0.22 });
      s.paint((cv) => {
        // the sprig at the upper right
        const twig = P(-40, 204);
        sticker(cv, [
          [blade(twig, off(twig, -70, 44), 22, { at: 0.5, point: 0.7 }), '#7fb35a'],
          [blade(off(twig, 30, 8), off(twig, 20, 46), 24, { at: 0.5, point: 0.7 }), '#4f8f3c'],
        ]);
        cv.add(`<path d="M${pt(off(twig, -70, 6))} L${pt(off(twig, -70, 36))} M${pt(off(twig, 22, 12))} L${pt(off(twig, 20, 38))}" stroke="#2f6a2a" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.7"/>`);
        // the mauve flower at the left, with its leaf
        const bloom = P(188, 202);
        const petal = [];
        for (let i = 0; i < 5; i++) petal.push([blade(off(bloom, i * 72 - 90, 3), off(bloom, i * 72 - 90, 19), 17, { at: 0.6, point: 0.02 }), '#c9b2e6']);
        sticker(cv, [[blade(off(bloom, 100, 14), off(bloom, 120, 46), 20, { at: 0.5, point: 0.7 }), '#7fb35a'], ...petal]);
        cv.add(`<circle cx="${n(bloom[0])}" cy="${n(bloom[1])}" r="6" fill="#ffe08a" stroke="${line}" stroke-width="1.6"/>`);
        // the mushroom by the fox
        const stalk = 'M216 462 Q214 444 218 436 L232 436 Q236 444 234 462 Z';
        const cap = 'M198 440 Q200 410 226 408 Q252 410 254 440 Q226 448 198 440 Z';
        sticker(cv, [[stalk, '#fff4dc'], [cap, '#f0a43a']]);
        cv.add('<circle cx="216" cy="424" r="4.4" fill="#fff6e4"/><circle cx="234" cy="420" r="3.4" fill="#fff6e4"/><circle cx="240" cy="433" r="3" fill="#fff6e4"/>');
      });
      s.paint((cv) => {
        // the fox: its body, its tail brought round in front of it, its head laid on the tail
        const body = spline([[84, 398], [104, 366], [146, 358], [180, 378], [186, 412], [160, 440], [112, 442], [86, 426]]);
        const tail = tube([[182, 402], [176, 434], [140, 452], [100, 444], [78, 420]], 34, 22);
        const tip = tube([[100, 444], [86, 432], [76, 416]], 26, 20, 8);
        const head = spline([[92, 352], [120, 356], [138, 380], [128, 408], [100, 418], [70, 408], [58, 382], [68, 358]]);
        const ear = (x, y, dx) => `M${x - 13} ${y + 10} Q${x + dx * 0.4} ${y - 16} ${x + dx} ${y - 22} Q${x + 15} ${y - 4} ${x + 14} ${y + 12} Z`;
        sticker(cv, [[body, '#f0a858'], [tail, '#f0a858'], [tip, '#fff6e6'], [ear(76, 356, -6), '#e8964a'], [ear(116, 352, 8), '#e8964a'], [head, '#f4b266']]);
        cv.add('<path d="M70 352 Q73 342 74 338 Q80 348 82 358 Z M112 348 Q120 338 123 334 Q124 348 122 358 Z" fill="#5a3422"/>');
        cv.add(`<g clip-path="${within(cv, head)}"><path d="${spline([[98, 392], [128, 388], [140, 404], [124, 424], [96, 428], [66, 420], [54, 400], [70, 388]])}" fill="#fff6e6"/><ellipse cx="72" cy="398" rx="9" ry="5.6" fill="#f6a8a0" fill-opacity="0.7" filter="${softly(cv, 2)}"/><ellipse cx="124" cy="394" rx="9" ry="5.6" fill="#f6a8a0" fill-opacity="0.7" filter="${softly(cv, 2)}"/></g>`);
        // asleep: two lashes of eyes, a small nose
        cv.add(`<path d="M76 386 Q82 391 88 386 M106 384 Q112 389 118 384" fill="none" stroke="#3a2418" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="97" cy="398" rx="4.2" ry="3" fill="#3a2418"/><path d="M97 401 V404" stroke="#3a2418" stroke-width="2" stroke-linecap="round"/>`);
        cv.add(`<path d="M150 370 Q164 380 168 398" fill="none" stroke="#d98a3e" stroke-width="2.4" stroke-linecap="round" stroke-opacity="0.8"/>`);
      });
      return s.done({ finish: { paint: 0, grain: 0.008, contrast: 0.04, saturation: 1.02 } });
    },
  },
  {
    key: 'mar',
    ku: 'Xeleka Marî',
    en: 'Serpent',
    // the snake that holds its own tail, once round the face: thick behind the head and thinning all the way to
    // the tail it has in its mouth, green as the snakes painted on glass in the old houses, every scale edged
    // with gold, its belly pale along the inside, a red eye and a forked tongue
    still(rnd) {
      const s = new Still(rnd);
      // its body: from behind the head, at the upper right, the long way round to the tail, by angle
      const HEAD = -52;
      const span = 334;
      const halfAt = (t) => 17 - 11.5 * t ** 1.6;
      const mid = 190;
      const edge = (sign) => {
        const out = [];
        for (let i = 0; i <= 84; i++) {
          const t = i / 84;
          out.push(P(HEAD - 6 - span * t, mid + sign * halfAt(t)));
        }
        return out;
      };
      const body = spline([...edge(1), ...edge(-1).reverse()]);
      s.paint((cv) => {
        cv.add(`<path d="${body}" fill="${linear(cv, [[0, '#2f9a6e'], [0.5, '#1c6e52'], [1, '#0e4a3a']], 90, 90, 420, 420)}"/>`);
        cv.add(`<g clip-path="${within(cv, body)}">`);
        // the belly, pale, along the inside of the ring; the light along its back
        cv.add(`<path d="${round(mid - 14)}" fill="none" stroke="#e8d48a" stroke-width="9" stroke-opacity="0.9"/>`);
        cv.add(`<path d="${round(mid + 8)}" fill="none" stroke="#6ad0a0" stroke-width="5" stroke-opacity="0.5" filter="${softly(cv, 3)}"/>`);
        // its scales: rows of them across its back, each a small arc of gold, fewer and finer toward the tail
        let scales = '';
        for (let i = 0; i < 74; i++) {
          const t = i / 74;
          const a = HEAD - 8 - span * t;
          const half = halfAt(t);
          const rows = half > 11 ? 3 : half > 7 ? 2 : 1;
          for (let k = 0; k < rows; k++) {
            const r = mid - half * 0.35 + ((k + 0.5) / rows) * half * 1.3 - half * 0.1;
            const at = P(a + (k % 2) * 2.2, r);
            const w = Math.max(3, half * 0.44);
            const turn = a - 90;
            scales += `<path d="M${pt(off(at, turn - 60, w))} Q${pt(off(at, turn - 180, w * 0.9))} ${pt(off(at, turn + 60, w))}" fill="none" stroke="#f0d070" stroke-width="1.5" stroke-opacity="0.8" stroke-linecap="round"/>`;
          }
        }
        cv.add(scales);
        cv.add('</g>');
      });
      s.paint((cv) => {
        // its head, over the end of its own tail: broad behind the eyes, blunt at the snout, the mouth open on the tail
        const at = P(HEAD + 2, mid);
        const dir = HEAD + 96;
        const head = spline([off(at, dir + 180, 30), off(at, dir + 128, 27), off(at, dir + 62, 22), off(at, dir + 22, 34), off(at, dir, 40), off(at, dir - 22, 34), off(at, dir - 62, 22), off(at, dir - 128, 27)]);
        cv.add(`<path d="${head}" fill="${linear(cv, [[0, '#35a878'], [1, '#12563f']], ...off(at, dir + 180, 30), ...off(at, dir, 40))}"/>`);
        crescent(cv, head, [-3, -4], { colour: '#0a3a2c', opacity: 0.5, soft: 4 });
        cv.add(`<path d="M${pt(off(at, dir + 24, 30))} Q${pt(off(at, dir, 22))} ${pt(off(at, dir - 24, 30))}" fill="none" stroke="#e8d48a" stroke-width="2.4" stroke-linecap="round"/>`);
        for (const side of [-1, 1]) {
          const eye = off(at, dir + side * 78, 16);
          cv.add(`<circle cx="${n(eye[0])}" cy="${n(eye[1])}" r="5.6" fill="#f0d070" stroke="${INK}" stroke-width="1.4"/><ellipse cx="${n(eye[0])}" cy="${n(eye[1])}" rx="1.8" ry="4.4" fill="#b01e1e" transform="rotate(${n(dir)} ${n(eye[0])} ${n(eye[1])})"/>`);
        }
        // the tongue, out past the tail
        const lip = off(at, dir - 30, 34);
        cv.add(`<path d="M${pt(lip)} Q${pt(off(lip, dir - 60, 14))} ${pt(off(lip, dir - 70, 26))} M${pt(off(lip, dir - 62, 15))} Q${pt(off(lip, dir - 30, 22))} ${pt(off(lip, dir - 26, 30))}" fill="none" stroke="#c8282a" stroke-width="2.6" stroke-linecap="round"/>`);
      });
      return s.done({ finish: { paint: 0.8, grain: 0.01, contrast: 0.08, saturation: 1.04, ink: { colour: '#0a1e18', width: 3 } } });
    },
  },
  {
    key: 'bask-spi',
    ku: 'Baskên Spî',
    en: 'White wings',
    // a pair of white wings folded round the face from the top, their long feathers hanging below it
    still(rnd) {
      return wings(rnd, {
        tones: [['#c9d2e4', '#f4f6fb'], ['#dbe2ef', '#ffffff'], ['#eef1f7', '#ffffff']],
        edge: '#8e9ab4',
        shade: '#b4bfd6',
        rim: ['#ffffff', '#cfd7e6', '#ffffff'],
        ink: { colour: '#3a4460', width: 2.6 },
      });
    },
  },
  {
    key: 'bask-res',
    ku: 'Baskên Reş',
    en: 'Black wings',
    // the same wings in black, as a raven's: each feather with a little of the sky's blue along it
    still(rnd) {
      return wings(rnd, {
        tones: [['#0c0d14', '#24283a'], ['#12141e', '#2e3348'], ['#191c28', '#3a4058']],
        edge: '#5a6384',
        shade: '#6a7498',
        rim: ['#3a4058', '#0c0d14', '#6a7498'],
        ink: { colour: '#7a86ac', width: 1.6, opacity: 0.8 },
      });
    },
  },
];
