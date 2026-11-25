import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, Polyline, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { GiftTier } from '@kurda/shared';

/**
 * The gift's own art, drawn in code: a present wrapped in kilim (the woven diamonds and zigzags of a Kurdish rug, in
 * the app's gold) with a ribbon and bow; pomegranate seeds and gold sparks for confetti; and the Newroz flame for the
 * legendary, limited gifts. The paper changes with the tier (cream, pomegranate red, night indigo), so a rare gift
 * looks rarer unopened. These are the colours of the things drawn, so they are constants here; only the gold comes from
 * the palette.
 */
const POMEGRANATE = '#B3243B';
const SEED_LIGHT = '#F07A8C';
const CREAM = '#F3E3C3';
const INDIGO = '#24356A';

const NIGHT = '#141A3C';

const PAPER: Record<GiftTier, { paper: string; motif: string }> = {
  common: { paper: CREAM, motif: POMEGRANATE },
  rare: { paper: POMEGRANATE, motif: CREAM },
  legendary: { paper: INDIGO, motif: '#E0475E' },
  // the night sky, for the moon, the sun and the galaxy
  grand: { paper: NIGHT, motif: CREAM },
};

/** The kilim band: a row of stepped diamonds between two zigzags. */
function Kilim({ y, gold, motif }: { y: number; gold: string; motif: string }): React.JSX.Element {
  const diamonds = [20, 32, 68, 80];
  const zig = (base: number) =>
    Array.from({ length: 13 }, (_, i) => `${14 + i * 6},${base + (i % 2 === 0 ? 0 : 3)}`).join(' ');
  return (
    <G>
      <Polyline points={zig(y - 9)} fill="none" stroke={gold} strokeWidth={1.6} />
      {diamonds.map((x) => (
        <G key={x}>
          <Polygon points={`${x},${y - 6} ${x + 6},${y} ${x},${y + 6} ${x - 6},${y}`} fill={gold} />
          <Polygon points={`${x},${y - 3} ${x + 3},${y} ${x},${y + 3} ${x - 3},${y}`} fill={motif} />
        </G>
      ))}
      <Polyline points={zig(y + 7)} fill="none" stroke={gold} strokeWidth={1.6} />
    </G>
  );
}

/**
 * A wrapped present, whole or in its two parts. The parts share one viewBox, so a lid and body stacked in one box line
 * up exactly, which lets the unwrap lift the lid off.
 */
export function GiftBox({
  size,
  tier,
  gold,
  part = 'whole',
}: {
  size: number;
  tier: GiftTier;
  gold: string;
  part?: 'whole' | 'body' | 'lid';
}): React.JSX.Element {
  const { paper, motif } = PAPER[tier];
  const body = part !== 'lid';
  const lid = part !== 'body';
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {body ? (
        <G>
          <Rect x={14} y={44} width={72} height={48} rx={6} fill={paper} />
          <Kilim y={68} gold={gold} motif={motif} />
          <Rect x={45} y={44} width={10} height={48} fill={gold} />
        </G>
      ) : null}
      {lid ? (
        <G>
          <Rect x={10} y={32} width={80} height={14} rx={4} fill={paper} />
          <Polyline points="12,39 18,36 24,39 30,36 36,39 42,36" fill="none" stroke={gold} strokeWidth={1.4} />
          <Polyline points="58,36 64,39 70,36 76,39 82,36 88,39" fill="none" stroke={gold} strokeWidth={1.4} />
          <Rect x={45} y={32} width={10} height={14} fill={gold} />
          {/* The bow: two loops and a knot. */}
          <Path d="M50 31 C38 14 24 20 30 30 C33 34 42 33 50 31Z" fill={gold} />
          <Path d="M50 31 C62 14 76 20 70 30 C67 34 58 33 50 31Z" fill={gold} />
          <Circle cx={50} cy={31} r={4.5} fill={motif} stroke={gold} strokeWidth={2} />
        </G>
      ) : null}
    </Svg>
  );
}

/** A pomegranate seed, the confetti. */
export function Seed({ size }: { size: number }): React.JSX.Element {
  return (
    <Svg width={size} height={size * 1.3} viewBox="0 0 12 16">
      <Path d="M6 0 C9 3 12 7 12 10 A6 6 0 0 1 0 10 C0 7 3 3 6 0Z" fill={POMEGRANATE} />
      <Path d="M4 6 C3 8 3 10 4 11" fill="none" stroke={SEED_LIGHT} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

/** A four-pointed spark, in gold. */
export function Spark({ size, gold }: { size: number; gold: string }): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path d="M8 0 L9.8 6.2 L16 8 L9.8 9.8 L8 16 L6.2 9.8 L0 8 L6.2 6.2Z" fill={gold} />
    </Svg>
  );
}

/** Where the stars of the night sky sit, seeded so the sky is the same each time. */
const STARS = Array.from({ length: 40 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return { x: r(11) * 100, y: r(13) * 100, size: 0.25 + r(17) * 0.5 };
});

/**
 * The night a grand gift opens on: stars across the screen and a glow of the app's gold rising behind the gift. The
 * stars are the gold too, so the sky follows the palette.
 */
export function NightSky({ width, height, gold }: { width: number; height: number; gold: string }): React.JSX.Element {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <RadialGradient id="sky-glow" cx="50" cy="55" r="45" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={gold} stopOpacity={0.45} />
          <Stop offset="1" stopColor={gold} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={55} r={45} fill="url(#sky-glow)" />
      {STARS.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.size} fill={gold} opacity={0.85} />
      ))}
    </Svg>
  );
}

/**
 * The Newroz flame for the legendary gifts: one fire with a lick to each side of its tip, gold at the top into
 * pomegranate at the root, with a pale core.
 */
export function NewrozFlame({ size, gold }: { size: number; gold: string }): React.JSX.Element {
  return (
    <Svg width={size * 0.75} height={size} viewBox="0 0 60 80">
      <Defs>
        <LinearGradient id="newroz" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={POMEGRANATE} />
          <Stop offset="0.5" stopColor="#E8662A" />
          <Stop offset="1" stopColor={gold} />
        </LinearGradient>
      </Defs>
      <Path
        d="M30 2 C33 12 40 18 42 28 C44 22 44 16 42 10 C52 20 57 34 53 50 C50 66 41 76 30 78 C19 76 10 66 7 50 C5 38 10 28 17 20 C17 26 18 30 20 33 C20 20 25 10 30 2Z"
        fill="url(#newroz)"
      />
      <Path
        d="M31 24 C34 34 41 40 40 54 C39 66 35 72 30 72 C25 72 21 66 20 56 C19 46 24 41 26 35 C27 39 28 41 30 43 C29 37 29 30 31 24Z"
        fill="#FFE08A"
      />
    </Svg>
  );
}
