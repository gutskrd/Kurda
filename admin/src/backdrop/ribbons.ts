/**
 * The admin's backdrop: ribbons of violet light folding over one another on
 * black, worked out for every pixel of the screen on its graphics chip, so
 * they stay sharp however large the window is.
 *
 * Each ribbon is a band woven of fine lines between two edges that wave and
 * twist. Where a ribbon turns edge-on its lines crowd together and their light
 * adds up to a bright fold; where it lies open they spread apart into a dim,
 * fine weave. A soft glow surrounds each, brightest at its folds.
 *
 * The picture is laid out on a scene 658 by 494 and fitted to the window by
 * its width: a wide window loses only black above and below, and a phone's
 * tall one gains more black above and below, with the whole shape across its
 * middle.
 */
export const SCENE = { width: 658, height: 494 } as const;

/** How the scene sits in a window: its scale, and where its top is in the window's own pixels. */
export interface Fit {
  scale: number;
  top: number;
}

/** The scene as wide as the window, centred from top to bottom. */
export function fitScene(width: number, height: number): Fit {
  const scale = width / SCENE.width;
  return { scale, top: (height - SCENE.height * scale) / 2 };
}

/** One ribbon: the waves its middle follows, how wide it is and how it twists, and where it sits. */
interface Ribbon {
  /** the middle's two waves: height, length and speed, and where each starts */
  waves: readonly (readonly [amp: number, length: number, speed: number, start: number])[];
  /** half the ribbon's width, the length of its twist, how fast it turns and where it starts */
  twist: readonly [half: number, length: number, speed: number, start: number];
  /** how far its middle sits below the scene's, and how far and how fast it drifts up and down */
  offset: number;
  drift: readonly [amp: number, speed: number];
  /** how many lines it is woven of, and how bright it is */
  lines: number;
  light: number;
}

export const RIBBONS: readonly Ribbon[] = [
  {
    waves: [
      [34, 620, 0.5, 0.4],
      [12, 330, -0.8, 2.1],
    ],
    twist: [62, 760, 0.55, 1.3],
    offset: -14,
    drift: [10, 0.27],
    lines: 72,
    light: 1,
  },
  {
    waves: [
      [28, 700, -0.42, 3.3],
      [14, 380, 0.68, 0.2],
    ],
    twist: [52, 820, -0.5, 4.2],
    offset: 18,
    drift: [12, -0.21],
    lines: 64,
    light: 0.85,
  },
];

const f = (v: number): string => (Number.isInteger(v) ? `${v}.0` : String(v));
const TAU = Math.PI * 2;

/** One ribbon's light at the scene point `s`, as GLSL that adds to `light` and `glow`. */
function ribbonGlsl(r: Ribbon): string {
  const middle = r.waves.map(([amp, length, speed, start]) => `${f(amp)} * sin(${f(TAU / length)} * s.x + ${f(speed)} * t + ${f(start)})`).join(' + ');
  const [half, length, speed, start] = r.twist;
  return `
  {
    float mid = ${f(SCENE.height / 2 + r.offset)} + ${f(r.drift[0])} * sin(${f(r.drift[1])} * t) + reach * (${middle});
    // half the band's width: where the band twists it turns edge-on, but a fold is never thinner than this
    float open = reach * ${f(half)} * sin(${f(TAU / length)} * s.x + ${f(speed)} * t + ${f(start)});
    float hw = sqrt(open * open + 100.0);
    float d = abs(s.y - mid);
    // its edge soft, as silk's is, and lit along it
    float inside = 1.0 - smoothstep(hw - 2.0, hw + 2.5, d);
    float rim = exp(-pow((d - hw) / 3.0, 2.0)) * (20.0 / (hw + 20.0));
    // the lines' light, spread over the band: the narrower the band, the brighter
    float spacing = 2.0 * hw / ${f(r.lines)};
    float mean = ${f(r.light)} * 14.0 / (hw + 2.0);
    // a line every spacing, each LINE_PX wide on the screen, drawn as lines while they are far enough apart to see
    float across = (s.y - mid + hw) / spacing;
    float off = abs(fract(across) - 0.5) * spacing / pixel;
    float apart = spacing / pixel;
    float weave = (1.0 - smoothstep(0.0, LINE_PX, off)) * apart / LINE_PX;
    light += fade * (inside * mean * mix(1.0, weave * (0.7 + 0.3 * grain), smoothstep(1.6, 3.2, apart)) + ${f(r.light)} * 0.9 * rim);
    // the glow round it, brighter where it folds
    float reachOut = hw + 26.0;
    glow += fade * ${f(r.light)} * (18.0 / (hw + 18.0)) * exp(-(d * d) / (2.0 * reachOut * reachOut));
  }`;
}

/** The fragment shader: every ribbon's light and glow at each pixel, coloured violet and brightening to lavender. */
export function fragmentShader(): string {
  return `precision highp float;
uniform vec2 size;
uniform float scale;
uniform float top;
uniform float t;
const float LINE_PX = 0.9;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 px = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
  vec2 s = vec2(px.x / scale, (px.y - top) / scale);
  float pixel = 1.0 / scale;
  float envelope = pow(sin(3.14159265 * clamp(s.x / ${f(SCENE.width)}, 0.0, 1.0)), 0.7);
  float reach = 0.3 + 0.7 * envelope;
  // the light dies away toward the sides faster than the ribbons narrow
  float fade = pow(envelope, 1.6);
  float grain = hash(floor(px));
  float light = 0.0;
  float glow = 0.0;
  ${RIBBONS.map(ribbonGlsl).join('\n')}
  vec3 violet = vec3(0.46, 0.27, 1.0);
  vec3 lavender = vec3(0.95, 0.82, 1.0);
  vec3 colour = violet * (light * 1.15 + glow * 0.45) + lavender * pow(max(light - 0.35, 0.0), 1.5) * 0.9;
  colour = 1.0 - exp(-colour * 1.3);
  gl_FragColor = vec4(colour + vec3(0.012, 0.008, 0.03), 1.0);
}`;
}

/** The vertex shader: one triangle that covers the whole canvas. */
export const VERTEX_SHADER = `attribute vec2 corner;
void main() { gl_Position = vec4(corner, 0.0, 1.0); }`;
