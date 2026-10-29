import { useId, useState } from 'react';
import { FIRE_BASE, FIRE_GLOW, FIRE_SMALL_CALM, calmMotion, fireColours, fireParts, type FireLevel, type FireMotion, type FirePose, type FireStops } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import './fire.css';

/**
 * The streak's fire (shared `art/fire.ts`), the same drawing the phone shows:
 * flame tongues that each flicker about their own root, a heart that pulses,
 * a glow that breathes, sparks rising off it, on a pair of logs. Each moving
 * part runs one CSS keyframe with its own poses, period and phase.
 *
 * `size` is its height; at `FIRE_SMALL` and under it is the light version
 * (fewer tongues, gentler, nothing around it) for a row of text. Unlit, it
 * is grey and still: a streak not burning. Under reduced motion it is the
 * fire standing still. Decorative: the words beside it say the streak.
 *
 * Each colour is written for both schemes (`light-dark()`), so the fire
 * follows the page's scheme with nothing here knowing which is on; a browser
 * that cannot read that keeps the attribute, the dark scheme's colour, the
 * app's default.
 */
export function Fire({
  size,
  level,
  lit: litAlone = true,
  still: held = false,
  accent,
  className,
}: {
  size: number;
  /** how big it burns (shared `fireLevel`, `runFireLevel`); cold is the fire not burning */
  level?: FireLevel;
  /** grows from this level into `level` as it appears: the day the fire grew */
  from?: FireLevel | null;
  /** without a `level`: burning or not */
  lit?: boolean;
  /** drawn standing still, as under reduced motion */
  still?: boolean;
  accent?: string | null;
  className?: string;
}): React.JSX.Element {
  const lit = level ? level.stage !== 'cold' : litAlone;
  const id = `fire${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const [reduce] = useState(prefersReducedMotion);
  const parts = fireParts(size);
  const light = fireColours({ lit, scheme: 'light', accent });
  const dark = fireColours({ lit, scheme: 'dark', accent });
  const still = !lit || reduce || held;
  const { view } = parts;
  const motion = (m: FireMotion): FireMotion => (parts.small ? calmMotion(m, FIRE_SMALL_CALM) : m);
  const classes = ['fire', lit ? 'is-lit' : 'is-unlit', parts.small ? 'is-small' : null, still ? 'is-still' : null, className].filter(Boolean).join(' ');
  const glow = parts.glow && light.glow && dark.glow ? { light: light.glow, dark: dark.glow } : null;
  return (
    <svg
      className={classes}
      width={(size * view.w) / view.h}
      height={size}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {glow && (
          <radialGradient id={`${id}-glow`}>
            {FIRE_GLOW.fade.map(([offset, share]) => {
              const [l, d] = [rgba(glow.light.colour, glow.light.opacity * share), rgba(glow.dark.colour, glow.dark.opacity * share)];
              return <stop key={offset} offset={offset} stopColor={d} style={both(l, d)} />;
            })}
          </radialGradient>
        )}
        {parts.tongues.map((t) => (
          <Gradient key={t.id} id={`${id}-${t.id}`} light={light.tongues[t.id]} dark={dark.tongues[t.id]} />
        ))}
        {!still && parts.wisps.length > 0 && <Gradient id={`${id}-wisp`} light={light.tongues.flame} dark={dark.tongues.flame} />}
        {parts.base &&
          [...new Set(FIRE_BASE.map((p) => p.part))].map((part) => <Gradient key={part} id={`${id}-${part}`} light={light.base[part]} dark={dark.base[part]} />)}
      </defs>
      {glow && (
        <ellipse
          className="fire-part fire-loop"
          cx={FIRE_GLOW.cx}
          cy={FIRE_GLOW.cy}
          rx={FIRE_GLOW.rx}
          ry={FIRE_GLOW.ry}
          fill={`url(#${id}-glow)`}
          style={moving(FIRE_GLOW.motion, FIRE_GLOW.origin)}
        />
      )}
      {/* the broken-off tips and the sparks rise from behind the flame, so they are only seen once clear of it */}
      {!still && parts.wisps.map((w, i) => <path key={i} className="fire-part fire-rise" d={w.d} fill={`url(#${id}-wisp)`} style={moving(w.motion, w.origin)} />)}
      {!still &&
        light.ember &&
        dark.ember &&
        parts.embers.map((e, i) => (
          <circle
            key={i}
            className="fire-part fire-rise"
            cx={e.cx}
            cy={e.cy}
            r={e.r}
            fill={dark.ember!}
            style={{ ...both(light.ember!, dark.ember!, 'fill'), ...moving(e.motion, [e.cx, e.cy]) }}
          />
        ))}
      {parts.tongues.map((t) => (
        <path key={t.id} className="fire-part fire-loop" d={t.d} fill={`url(#${id}-${t.id})`} style={moving(motion(t.motion), t.origin)} />
      ))}
      {parts.base && FIRE_BASE.map((p, i) => <path key={i} d={p.d} fill={`url(#${id}-${p.part})`} />)}
    </svg>
  );
}

/** A tongue's (or a log's) colour from its tip to its root, in both schemes. */
function Gradient({ id, light, dark }: { id: string; light: FireStops; dark: FireStops }): React.JSX.Element {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={dark[0]} style={both(light[0], dark[0])} />
      <stop offset="1" stopColor={dark[1]} style={both(light[1], dark[1])} />
    </linearGradient>
  );
}

/** A colour for the page's scheme, as a style that wins over the dark-scheme attribute where it is understood. */
function both(light: string, dark: string, property: 'stopColor' | 'fill' = 'stopColor'): React.CSSProperties {
  return { [property]: `light-dark(${light}, ${dark})` };
}

/** `#rrggbb` at `alpha`, as the glow's stops are written: its strength in the colour itself, the same in either scheme's spelling. */
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

/** A pose as a CSS transform, in the drawing's units. */
function transformOf(p: FirePose): string {
  return `translate(${p.x ?? 0}px, ${p.y ?? 0}px) scale(${p.sx ?? 1}, ${p.sy ?? 1}) skewX(${p.skew ?? 0}deg)`;
}

/** A part's keyframe values, period and phase, and the point it moves about, for fire.css's keyframes. */
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
