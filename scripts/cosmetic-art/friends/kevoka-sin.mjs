import { blob, mark, torn } from '../brush.mjs';
import { n, spline } from '../kit.mjs';
import { Still } from '../still.mjs';

const PLAIN = { finish: { paint: 0, grain: 0.012, contrast: 0, saturation: 1, warmth: 0 } };

export const piece = {
  key: 'kevoka-sin',
  ku: 'Kevoka Şîn',
  en: 'Blue dove',
  // a pigeon standing on a line, drawn by a child in one blue crayon on cream paper: a round head with a dot for its
  // eye and an open beak, its breast curving down, the back running out into a long pointed tail, one stroke for the
  // wing with a squiggle of feathers, and two little triangles for feet
  still(rnd) {
    const s = new Still(rnd);
    const BLUE = '#234f69';
    const FRINGE = '#3f6c82';
    const PAPER = '#ede8d4';
    // drawn on a grid of its own and brought up to fill the frame
    const K = 1.62;
    const at = ([x, y]) => [256 + (x - 232) * K, 256 + (y - 263) * K];
    const lines = {
      head: [[338, 181], [333, 173], [325, 165], [312, 158], [300, 156], [289, 158], [279, 165], [269, 178], [261, 192], [256, 207], [252, 224],
        [249, 241], [246, 258]],
      back: [[249, 251], [236, 257], [222, 264], [206, 271], [190, 278], [174, 285], [158, 292], [142, 298], [126, 302], [111, 304], [97, 302]],
      beak: [[343, 184], [351, 192], [360, 202], [368, 212], [364, 215], [352, 211], [338, 205], [321, 201]],
      breast: [[318, 203], [309, 206], [302, 212], [297, 220], [293, 232], [292, 246], [296, 256], [298, 262], [295, 267], [299, 275], [304, 282],
        [305, 292], [303, 301], [300, 309], [297, 320], [291, 332], [283, 339], [277, 343]],
      // the wing: along the back, a turn at its tip, and back as a squiggle of feathers
      wing: [[233, 276], [222, 280], [208, 285], [194, 291], [180, 297], [168, 303], [158, 309], [155, 316], [163, 320], [176, 320], [185, 316],
        [189, 312], [194, 320], [200, 320], [205, 310], [210, 305], [214, 314], [220, 320], [227, 315], [231, 307], [233, 302]],
      // a line under the far foot and the line the near one stands on, each foot a little triangle
      perch: [[296, 321], [312, 321], [328, 319], [344, 318], [356, 319], [364, 320]],
      far: [[343, 318], [346, 302], [351, 286], [355, 292], [359, 305], [363, 318]],
      ground: [[214, 342], [232, 347], [252, 350], [272, 354], [292, 356], [312, 358], [330, 362], [347, 364]],
      near: [[324, 371], [326, 356], [329, 342], [333, 331], [338, 339], [342, 352], [346, 365]],
      under: [[104, 305], [113, 311], [122, 317], [132, 323], [143, 328], [154, 333], [166, 337], [183, 337]],
    };
    const L = Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, v.map(at)]));
    // how hard each line was pressed: its width, and where it thins
    const press = {
      head: [13, { start: 0.5, end: 0.7, peak: 0.45 }],
      back: [12, { start: 0.8, end: 0.45, peak: 0.3 }],
      beak: [12.5, { start: 0.6, end: 0.6, peak: 0.45 }],
      breast: [12.5, { start: 0.6, end: 0.55, peak: 0.5 }],
      wing: [12, { start: 0.6, end: 0.6, peak: 0.5 }],
      perch: [11, { start: 0.6, end: 0.7, peak: 0.5 }],
      far: [10.5, { start: 0.6, end: 0.7, peak: 0.5 }],
      ground: [12, { start: 0.8, end: 0.6, peak: 0.4 }],
      near: [11, { start: 0.6, end: 0.6, peak: 0.5 }],
      under: [12, { start: 0.6, end: 0.8, peak: 0.6 }],
    };
    // the bird's inside and its open beak, for the paper to fill
    const inside = spline([...L.head, L.back[3], ...L.back.slice(5), ...L.under.slice(1), at([214, 342]), at([250, 349]), at([277, 345]),
      ...L.breast.slice(0, -1).reverse(), at([338, 205]), at([366, 214]), at([346, 186])]);
    s.paint((cv) => {
      // the paper, cut out close round the drawing so that it reads over a dark picture too
      const edge = Object.entries(L).map(([k, p]) => `<path d="${spline(p, false)}" stroke-width="${n(press[k][0] + 6)}"/>`).join('');
      const cut = torn(cv, rnd, 3, 0.08);
      const paper = `fill="${PAPER}" stroke="${PAPER}" stroke-linecap="round" stroke-linejoin="round"`;
      cv.add(`<g ${paper} filter="${cut}"><path d="${inside}"/><g fill="none">${edge}</g></g>`);
    });
    // wax on rough paper: the mark's edge wavers and softens, and the paper's tooth shows through where it stands
    // proud of the wax, more where the hand pressed lightly (`press` lower) and in patches along the line (`patchy`)
    const seed = () => Math.floor(rnd() * 999);
    const wax = (cv, colour, { press = 0.82, gain = 4.5, soft = 1.4, tear = 3, grain = 0.6, patchy = 0.8 } = {}) => {
      const f = cv.id('wax');
      const alone = 'type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0"';
      cv.def(`<filter id="${f}" x="0" y="0" width="512" height="512" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">`
        + `<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="${seed()}" result="w"/>`
        + `<feDisplacementMap in="SourceAlpha" in2="w" scale="${tear}" xChannelSelector="R" yChannelSelector="G" result="d"/>`
        + `<feGaussianBlur in="d" stdDeviation="${soft}" result="b"/>`
        + `<feTurbulence type="fractalNoise" baseFrequency="${grain}" numOctaves="3" seed="${seed()}"/><feColorMatrix ${alone} result="f"/>`
        + `<feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="${seed()}"/><feColorMatrix ${alone} result="c"/>`
        + `<feComposite in="f" in2="c" operator="arithmetic" k2="1" k3="${patchy}" k4="${n(-patchy / 2)}" result="g"/>`
        + `<feComposite in="b" in2="g" operator="arithmetic" k2="${gain}" k3="${-gain}" k4="${n(gain * (press - 1))}" result="m"/>`
        + `<feFlood flood-color="${colour}"/><feComposite in2="m" operator="in"/></filter>`);
      return `url(#${f})`;
    };
    s.paint((cv) => {
      const marks = (extra, keys) => keys.map((k) => `<path d="${mark(rnd, L[k], press[k][0] + extra, { tremble: 0.35, count: 64, ...press[k][1] })}"/>`)
        .join('');
      const firm = Object.keys(L).filter((k) => k !== 'under');
      const eye = `<path d="${blob(rnd, at([302, 187]), 6.4 * K, 6 * K, 20, 0.08, 18)}"/>`;
      // a grazing fringe of paler wax round each line, then its pressed middle; the line under the tail only grazed
      cv.add(`<g filter="${wax(cv, FRINGE, { press: 0.72, gain: 4, soft: 1.8, tear: 4, grain: 0.8 })}">${marks(4, firm)}</g>`);
      cv.add(`<g filter="${wax(cv, BLUE)}">${marks(0, firm)}${eye}</g>`);
      cv.add(`<g filter="${wax(cv, BLUE, { press: 0.84, gain: 4, soft: 1.6, patchy: 0.6 })}">${marks(0, ['under'])}</g>`);
    }, { blur: 0.4 });
    return s.done(PLAIN);
  },
};
