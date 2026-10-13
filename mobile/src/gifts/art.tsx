import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, Polyline, Rect, Stop } from 'react-native-svg';
import type { GiftTier } from '@kurda/shared';

/**
 * The gift's own art, drawn here so it needs no files and no package.
 *
 * A present wrapped in kilim — the woven diamonds and zigzags of a Kurdish
 * rug, in the app's gold — with a ribbon and a bow; pomegranate seeds and
 * gold sparks for the confetti; and for the legendary, limited gifts (the
 * Newroz ones), the Newroz flame. The paper changes with the tier so a rare
 * gift looks rarer before it is opened: cream for common, pomegranate red for
 * rare, a night indigo for legendary.
 *
 * Art colours are not the interface's: they are the colours of the things
 * drawn (a seed is red in the dark too), so they are constants here, and only
 * the gold comes from the palette, as the brand's.
 */
export const POMEGRANATE = '#B3243B';
const SEED_LIGHT = '#F07A8C';
const CREAM = '#F3E3C3';
const INDIGO = '#24356A';

const PAPER: Record<GiftTier, { paper: string; motif: string }> = {
  common: { paper: CREAM, motif: POMEGRANATE },
  rare: { paper: POMEGRANATE, motif: CREAM },
  legendary: { paper: INDIGO, motif: '#E0475E' },
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
 * A wrapped present, whole or in its two parts. The parts share one viewBox,
 * so a lid and a body stacked in the same box line up exactly — which is what
 * lets the unwrap lift the lid off.
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
          {/* the bow: two loops and a knot */}
          <Path d="M50 31 C38 14 24 20 30 30 C33 34 42 33 50 31Z" fill={gold} />
          <Path d="M50 31 C62 14 76 20 70 30 C67 34 58 33 50 31Z" fill={gold} />
          <Circle cx={50} cy={31} r={4.5} fill={motif} stroke={gold} strokeWidth={2} />
        </G>
      ) : null}
    </Svg>
  );
}

/** A pomegranate seed — the confetti. */
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

/** The Newroz flame, for the legendary gifts: three tongues of fire, gold into pomegranate. */
export function NewrozFlame({ size, gold }: { size: number; gold: string }): React.JSX.Element {
  return (
    <Svg width={size * 0.75} height={size} viewBox="0 0 60 80">
      <Defs>
        <LinearGradient id="newroz" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={POMEGRANATE} />
          <Stop offset="0.55" stopColor="#E8662A" />
          <Stop offset="1" stopColor={gold} />
        </LinearGradient>
      </Defs>
      <Path d="M14 40 C6 50 6 64 16 72 C12 62 14 52 20 46Z" fill="url(#newroz)" />
      <Path d="M46 40 C54 50 54 64 44 72 C48 62 46 52 40 46Z" fill="url(#newroz)" />
      <Path d="M30 2 C40 22 50 32 46 52 C44 66 36 76 30 78 C24 76 16 66 14 52 C10 32 20 22 30 2Z" fill="url(#newroz)" />
      <Path d="M30 30 C36 42 40 50 37 60 C35 68 32 72 30 72 C28 72 25 68 23 60 C20 50 24 42 30 30Z" fill="#FFE08A" />
    </Svg>
  );
}
