import { Fragment, useId, useMemo, useState } from 'react';
import {
  FIRE_CINDER_FADE,
  FIRE_DISC_FADE,
  FIRE_DRIFT_FADE,
  FIRE_GLOW_FADE,
  FIRE_GROW,
  FIRE_SPRITE_COLS,
  FIRE_SPRITE_MS,
  FIRE_SPRITE_ROWS,
  fireColours,
  fireDrawing,
  fireFrame,
  fireGrowth,
  type FireBaseGroup,
  type FireBasePiece,
  type FireColours,
  type FireDrawing,
  type FireFlame,
  type FireGlow,
  type FireGrowth,
  type FireLevel,
  type FireMotion,
  type FirePose,
  type FireStops,
  type FireTint,
} from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import './fire.css';

/**
 * The streak's fire (shared `art/fire.ts`), as on the phone, at its stage `level`, from cold logs up to the Newroz fire
 * with the sun behind it. The flame is a painted sprite sheet (`public/fire/`, from `scripts/generate-fire-sprites.mjs`)
 * stepped by CSS keyframes; glow, smoke and sparks each run one keyframe of their own.
 *
 * `from` draws a smaller fire first and grows it into `level` (shared `fireGrowth`). At `FIRE_SMALL` and under, a light
 * drawn version is used for rows of text. `framed` lays out only the stage's part of the box (shared `fireFrame`).
 * `still` or reduced motion shows one frame. `accent` tints the light, never the flame. Colours use `light-dark()`,
 * with the dark colour as the attribute fallback. Decorative: the words beside it say the streak.
 */
export function Fire({
  size,
  level,
  from,
  still: held = false,
  framed = false,
  accent,
  className,
}: {
  /** The height of the whole fire's box, framed or not. */
  size: number;
  /** How big it burns (shared `fireLevel`, `runFireLevel`). */
  level: FireLevel;
  /** Grows from this level into `level` as it appears. */
  from?: FireLevel | null;
  /** Drawn still, as under reduced motion. */
  still?: boolean;
  /** Lays out only its stage's frame, the rest drawn over its edges. */
  framed?: boolean;
  accent?: string | null;
  className?: string;
}): React.JSX.Element {
  const id = `fire${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const [reduce] = useState(prefersReducedMotion);
  const drawing = useMemo(() => fireDrawing(level, size), [level.stage, level.growth, size]);
  const still = reduce || held || !drawing.moving;
  const growth = useMemo(
    () => (reduce || held || !from ? null : fireGrowth(from, level, size)),
    [reduce, held, from?.stage, from?.growth, level.stage, level.growth, size],
  );
  // Once the growth has played, the old fire is let go.
  const [grownFrom, setGrownFrom] = useState<FireGrowth | null>(null);
  const growing = growth && grownFrom !== growth ? growth : null;
  const now = paint(`${id}a`, drawing, accent, still);
  const before = growing ? paint(`${id}b`, growing.from, accent, false) : null;
  const root = drawing.root;
  const view = framed && !drawing.small ? fireFrame(drawing.stage) : drawing.view;
  const unit = size / drawing.view.h;
  const classes = ['fire', drawing.stage === 'cold' ? 'is-unlit' : 'is-lit', drawing.small ? 'is-small' : null, still ? 'is-still' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      className={classes}
      data-stage={drawing.stage}
      width={view.w * unit}
      height={view.h * unit}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <Defs paint={now} drawing={drawing} />
        {before && growing && <Defs paint={before} drawing={growing.from} />}
        {growing?.flash && <GlowGradient id={`${id}-flash`} colours={now} strength={growing.flash.strength} />}
      </defs>
      <Hearth paint={now} pieces={drawing.back} arrive={growth?.arrive} />
      {growing && before && (
        <Grow motion={growing.out} origin={root} gone onEnd={() => setGrownFrom(growing)}>
          <Burning paint={before} drawing={growing.from} />
        </Grow>
      )}
      {/* The flash behind the new flame, so the flame itself is never washed out. */}
      {growing?.flash && (
        <Grow motion={growing.flash.motion} origin={[growing.flash.cx, growing.flash.cy]} gone>
          <ellipse cx={growing.flash.cx} cy={growing.flash.cy} rx={growing.flash.rx} ry={growing.flash.ry} fill={`url(#${id}-flash)`} />
        </Grow>
      )}
      <Grow motion={growth?.in} origin={root}>
        <Burning paint={now} drawing={drawing} halo={growth?.halo} />
      </Grow>
      {growing?.burst.map((e, i) => (
        <Grow key={`burst${i}`} motion={e.motion} origin={[e.cx, e.cy]} gone>
          <circle cx={e.cx} cy={e.cy} r={e.r} {...fill(now, e.gold ? 'gold' : 'ember')} />
        </Grow>
      ))}
      <Hearth paint={now} pieces={drawing.front} arrive={growth?.arrive} />
      {drawing.cinder && <Cinder paint={now} drawing={drawing} />}
      {growing?.fade && before && (
        <Grow motion={growing.fade} origin={root} gone>
          <Hearth paint={before} pieces={growing.from.front} />
          {growing.from.cinder && <Cinder paint={before} drawing={growing.from} />}
        </Grow>
      )}
    </svg>
  );
}

/** One drawing's colours in both schemes, its gradient id prefix, and whether it stands still. */
interface Paint {
  id: string;
  light: FireColours;
  dark: FireColours;
  still: boolean;
}

function paint(id: string, drawing: FireDrawing, accent: string | null | undefined, still: boolean): Paint {
  return { id, light: fireColours({ stage: drawing.stage, scheme: 'light', accent }), dark: fireColours({ stage: drawing.stage, scheme: 'dark', accent }), still };
}

/** Every gradient a drawing is painted with. */
function Defs({ paint: p, drawing }: { paint: Paint; drawing: FireDrawing }): React.JSX.Element {
  const parts = [...new Set([...drawing.back, ...drawing.front].map((b) => b.part))];
  const halo = drawing.halo;
  const [lightHalo, darkHalo] = [p.light.halo, p.dark.halo];
  return (
    <>
      {drawing.glow && <GlowGradient id={`${p.id}-glow`} colours={p} strength={drawing.glow.strength} />}
      {halo && lightHalo && darkHalo && (
        <>
          <Fade id={`${p.id}-disc`} light={lightHalo.disc} dark={darkHalo.disc} fade={FIRE_DISC_FADE} strength={halo.strength} />
          <Fade
            id={`${p.id}-rays`}
            light={lightHalo.rays}
            dark={darkHalo.rays}
            fade={halo.rayFade}
            strength={halo.strength}
            space={{ gradientUnits: 'userSpaceOnUse', cx: halo.cx, cy: halo.cy, r: halo.reach }}
          />
        </>
      )}
      {drawing.tongues.map((t) => (
        <Gradient key={t.id} id={`${p.id}-${t.id}`} light={p.light.tongues[t.id]} dark={p.dark.tongues[t.id]} />
      ))}
      {[...new Set(drawing.drifts.map((d) => d.kind))].map((kind) => {
        const [light, dark] = [p.light[kind], p.dark[kind]];
        return light && dark ? <Fade key={kind} id={`${p.id}-${kind}`} light={light} dark={dark} fade={FIRE_DRIFT_FADE[kind]} linear /> : null;
      })}
      {parts.map((part) => (
        <Gradient key={part} id={`${p.id}-${part}`} light={p.light.base[part]} dark={p.dark.base[part]} />
      ))}
      {drawing.cinder && p.light.cinder && p.dark.cinder && (
        <radialGradient id={`${p.id}-cinder`}>
          {FIRE_CINDER_FADE.map(([offset, which, share]) => (
            <Stop key={offset} offset={offset} light={rgba(p.light.cinder![which], share)} dark={rgba(p.dark.cinder![which], share)} />
          ))}
        </radialGradient>
      )}
    </>
  );
}

/** A colour fading by `fade` (offset and strength there): outwards from the middle, or from the top down when `linear`. */
function Fade({
  id,
  light,
  dark,
  fade,
  strength = 1,
  linear = false,
  space,
}: {
  id: string;
  light: FireTint;
  dark: FireTint;
  fade: readonly (readonly [number, number])[];
  strength?: number;
  linear?: boolean;
  space?: React.SVGProps<SVGRadialGradientElement>;
}): React.JSX.Element {
  const at = (tint: FireTint, share: number): string => rgba(tint.colour, Math.min(1, tint.opacity * strength) * share);
  const stops = fade.map(([offset, share]) => <Stop key={offset} offset={offset} light={at(light, share)} dark={at(dark, share)} />);
  return linear ? (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {stops}
    </linearGradient>
  ) : (
    <radialGradient id={id} {...space}>
      {stops}
    </radialGradient>
  );
}

/** The glow's light, strongest in its middle. */
function GlowGradient({ id, colours, strength }: { id: string; colours: Pick<Paint, 'light' | 'dark'>; strength: number }): React.JSX.Element | null {
  const [light, dark] = [colours.light.glow, colours.dark.glow];
  if (!light || !dark) return null;
  return <Fade id={id} light={light} dark={dark} fade={FIRE_GLOW_FADE} strength={strength} />;
}

/** What burns: glow, the sun (opening as it grows, given `halo`), the pooled light, smoke, sparks and the flame. */
function Burning({ paint: p, drawing, halo }: { paint: Paint; drawing: FireDrawing; halo?: FireMotion | null }): React.JSX.Element {
  return (
    <>
      {drawing.glow && <Glow paint={p} glow={drawing.glow} />}
      {drawing.halo && (
        <Grow motion={halo} origin={[drawing.halo.cx, drawing.halo.cy]}>
          <Halo paint={p} drawing={drawing} />
        </Grow>
      )}
      {drawing.pool && <Glow paint={p} glow={drawing.pool} />}
      {drawing.drifts.map((d, i) => {
        if (!p.light[d.kind] || (p.still && !d.rest)) return null;
        return (
          <path
            key={`d${i}`}
            className={d.rest ? 'fire-part fire-rise fire-keep' : 'fire-part fire-rise'}
            d={d.d}
            fill={`url(#${p.id}-${d.kind})`}
            style={p.still && d.rest ? resting(d.rest, d.origin) : moving(d.motion, d.origin)}
          />
        );
      })}
      {/* Sparks rise from behind the flame, so they show only once clear of it. */}
      {!p.still &&
        drawing.embers.map((e, i) => <circle key={`e${i}`} className="fire-part fire-rise" cx={e.cx} cy={e.cy} r={e.r} {...fill(p, e.gold ? 'gold' : 'ember', moving(e.motion, [e.cx, e.cy]))} />)}
      {drawing.painted && <Painted flame={drawing.painted} still={p.still} />}
      {drawing.tongues.map((t) => (
        <path key={t.id} className="fire-part fire-loop" d={t.d} fill={`url(#${p.id}-${t.id})`} style={moving(t.motion, t.origin)} />
      ))}
    </>
  );
}

/** The painted flame: a window onto its sheet stepping along each row and down the rows, so frames loop in order. */
function Painted({ flame, still }: { flame: FireFlame; still: boolean }): React.JSX.Element {
  const { sheet, box } = flame;
  const steps = (count: number, ms: number, shift: number): React.CSSProperties =>
    ({ '--fire-steps': count, '--fire-period': `${ms}ms`, '--fire-shift': `${-shift}px` }) as React.CSSProperties;
  return (
    <svg className="fire-flame" x={box.x} y={box.y} width={box.w} height={box.h} viewBox={`0 0 ${sheet.frame.w} ${sheet.frame.h}`} preserveAspectRatio="none">
      <g className={still ? undefined : 'fire-frames fire-frames-down'} style={still ? undefined : steps(FIRE_SPRITE_ROWS, FIRE_SPRITE_MS, sheet.sheet.h)}>
        <image
          className={still ? undefined : 'fire-frames fire-frames-across'}
          style={still ? undefined : steps(FIRE_SPRITE_COLS, FIRE_SPRITE_MS / FIRE_SPRITE_ROWS, sheet.sheet.w)}
          href={`/fire/${sheet.file}`}
          width={sheet.sheet.w}
          height={sheet.sheet.h}
          preserveAspectRatio="none"
        />
      </g>
    </svg>
  );
}

/** A glow round the fire or pooled under it, breathing about its middle. */
function Glow({ paint: p, glow }: { paint: Paint; glow: FireGlow }): React.JSX.Element {
  return <ellipse className="fire-part fire-loop" cx={glow.cx} cy={glow.cy} rx={glow.rx} ry={glow.ry} fill={`url(#${p.id}-glow)`} style={moving(glow.motion, [glow.cx, glow.cy])} />;
}

/** The sun behind the Newroz fire: its disc and slowly turning rays. */
function Halo({ paint: p, drawing }: { paint: Paint; drawing: FireDrawing }): React.JSX.Element | null {
  const halo = drawing.halo;
  if (!halo) return null;
  const turning = halo.motion && !p.still ? moving(halo.motion, [halo.cx, halo.cy]) : undefined;
  return (
    <g className={turning ? 'fire-part fire-rise fire-keep' : undefined} style={turning}>
      <circle cx={halo.cx} cy={halo.cy} r={halo.r} fill={`url(#${p.id}-disc)`} />
      {halo.rays && <path d={halo.rays} fill={`url(#${p.id}-rays)`} />}
    </g>
  );
}

/** The cold hearth's last ember, brightening and dimming. */
function Cinder({ paint: p, drawing }: { paint: Paint; drawing: FireDrawing }): React.JSX.Element | null {
  const c = drawing.cinder;
  if (!c) return null;
  return <circle className="fire-part fire-loop" cx={c.cx} cy={c.cy} r={c.r} fill={`url(#${p.id}-cinder)`} style={moving(c.motion, [c.cx, c.cy])} />;
}

/** The hearth's pieces, still; a group new to the grown fire arrives as it grows. */
function Hearth({ paint: p, pieces, arrive }: { paint: Paint; pieces: readonly FireBasePiece[]; arrive?: Readonly<Partial<Record<FireBaseGroup, FireMotion>>> }): React.JSX.Element {
  // Consecutive pieces of one group, so an arriving group moves as one.
  const runs: { group: FireBaseGroup; pieces: FireBasePiece[] }[] = [];
  for (const piece of pieces) {
    const last = runs.at(-1);
    if (last && last.group === piece.group) last.pieces.push(piece);
    else runs.push({ group: piece.group, pieces: [piece] });
  }
  return (
    <>
      {runs.map((run, i) => (
        <Grow key={i} motion={arrive?.[run.group]} origin={[100, 236]}>
          {run.pieces.map((piece, j) => (
            <path key={j} d={piece.d} fill={`url(#${p.id}-${piece.part})`} />
          ))}
        </Grow>
      ))}
    </>
  );
}

/** Its children growing once by `motion` about `origin`; without a motion, just its children. */
function Grow({
  motion,
  origin,
  gone = false,
  onEnd,
  children,
}: {
  motion?: FireMotion | null;
  origin: readonly [number, number];
  /** Gone by its end, and at once if reduced motion turns on while it plays. */
  gone?: boolean;
  onEnd?: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  if (!motion) return <Fragment>{children}</Fragment>;
  return (
    <g
      className={gone ? 'fire-grow is-gone' : 'fire-grow'}
      style={{ ...moving(motion, origin), '--fire-delay': `${FIRE_GROW.delayMs}ms` } as React.CSSProperties}
      onAnimationEnd={onEnd ? (e) => e.target === e.currentTarget && onEnd() : undefined}
    >
      {children}
    </g>
  );
}

/** A tongue's or log's colour from tip to root, in both schemes. */
function Gradient({ id, light, dark }: { id: string; light: FireStops; dark: FireStops }): React.JSX.Element {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {dark.map((colour, i) => (
        <Stop key={i} offset={i / (dark.length - 1)} light={light[i] ?? colour} dark={colour} />
      ))}
    </linearGradient>
  );
}

function Stop({ offset, light, dark }: { offset: number; light: string; dark: string }): React.JSX.Element {
  return <stop offset={offset} stopColor={dark} style={both(light, dark)} />;
}

/** A spark's colour in both schemes with its motion: gold for the Newroz fire's gold sparks, the fire's own otherwise. */
function fill(p: Paint, which: 'ember' | 'gold', style?: React.CSSProperties): { fill: string; style: React.CSSProperties } {
  const [light, dark] = [p.light[which] ?? p.light.ember ?? 'none', p.dark[which] ?? p.dark.ember ?? 'none'];
  return { fill: dark, style: { ...both(light, dark, 'fill'), ...style } };
}

/** A colour for the page's scheme, as a style that overrides the dark-scheme attribute where understood. */
function both(light: string, dark: string, property: 'stopColor' | 'fill' = 'stopColor'): React.CSSProperties {
  return { [property]: `light-dark(${light}, ${dark})` };
}

/** `#rrggbb` at `alpha`, the same in either scheme's spelling. */
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

/** A pose as a CSS transform, in the drawing's units. */
function transformOf(p: FirePose): string {
  return `translate(${p.x ?? 0}px, ${p.y ?? 0}px) rotate(${p.r ?? 0}deg) scale(${p.sx ?? 1}, ${p.sy ?? 1}) skewX(${p.skew ?? 0}deg)`;
}

/** A part held at one pose, for a still fire. */
function resting(p: FirePose, origin: readonly [number, number]): React.CSSProperties {
  return { transformOrigin: `${origin[0]}px ${origin[1]}px`, transform: transformOf(p), opacity: p.o ?? 1 };
}

/** A part's keyframe values, period, phase and origin, for fire.css. */
function moving(m: FireMotion, origin: readonly [number, number]): React.CSSProperties {
  const style: Record<string, string> = {
    transformOrigin: `${origin[0]}px ${origin[1]}px`,
    '--fire-period': `${m.periodMs}ms`,
    '--fire-delay': `${-Math.round(m.phase * m.periodMs)}ms`,
  };
  m.poses.forEach((p, i) => {
    style[`--fire-k${i}`] = transformOf(p);
    style[`--fire-o${i}`] = String(p.o ?? 1);
  });
  return style as React.CSSProperties;
}
