import { useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { radii } from '../theme/tokens';

/**
 * A story's cover: a landscape the editor chose for it (its `cover` key), or
 * a woven kilim band in its category's colours when none was chosen, so a
 * shelf of stories never has a blank spine on it (design notes §7).
 *
 * The landscapes are drawn here, by code, as the gift's wrapping is
 * (gifts/art.tsx): a sky, a ground, and the one thing that names the scene —
 * two peaks, a rising sun, the roofs of a village, a river, an orchard, the
 * moon over the hills. A kilim band runs along the foot of each, in the
 * category's colours, so a folktale and a fable are told apart at a glance
 * even when both are set in the mountains. The keys are the ones the admin's
 * cover picker offers; a key this app does not know falls back to the band.
 *
 * Art colours are the colours of the things drawn, not the interface's: a sky
 * stays blue on the dark theme. Only the frame around the picture is the
 * card's.
 */
export const STORY_COVER_KEYS = ['mountains', 'sunrise', 'village', 'river', 'orchard', 'night'] as const;
export type StoryCoverKey = (typeof STORY_COVER_KEYS)[number];

export function isStoryCoverKey(v: unknown): v is StoryCoverKey {
  return (STORY_COVER_KEYS as readonly unknown[]).includes(v);
}

interface Weave {
  band: string;
  motif: string;
}

/** Each category's colours for its kilim: the band's ground and the mark woven into it. */
const WEAVES: Readonly<Record<string, Weave>> = {
  folktale: { band: '#B3243B', motif: '#F3E3C3' },
  fable: { band: '#C98A1E', motif: '#3A2A12' },
  legend: { band: '#24356A', motif: '#E6D7A8' },
  family: { band: '#C45C78', motif: '#FFF1E8' },
  village: { band: '#6F7A2F', motif: '#F4EFD8' },
  nature: { band: '#2F6B4A', motif: '#DFF2E3' },
  everyday: { band: '#2C7A86', motif: '#E2F4F6' },
  celebrations: { band: '#D9A21B', motif: '#4A2F0C' },
};

/** A story filed nowhere yet: warm stone. */
const PLAIN_WEAVE: Weave = { band: '#7A5C3A', motif: '#F3E3C3' };

export function weaveFor(category: string | null | undefined): Weave {
  return (category && WEAVES[category]) || PLAIN_WEAVE;
}

/** The drawing is laid out in this box and cropped to the card. */
const W = 160;
const H = 100;

interface Scene {
  sky: readonly [string, string];
  ground: string;
  far: string;
}

const SCENES: Readonly<Record<StoryCoverKey, Scene>> = {
  mountains: { sky: ['#CFE6F7', '#F4F0E4'], ground: '#5E8A5A', far: '#8FA9C6' },
  sunrise: { sky: ['#F7C78A', '#FBE9C9'], ground: '#9A7A4C', far: '#D98A5A' },
  village: { sky: ['#D8E9F5', '#F6EFDF'], ground: '#7E9A5C', far: '#A9B8C9' },
  river: { sky: ['#C9E2F3', '#EAF3F8'], ground: '#6E9A63', far: '#9DB5CB' },
  orchard: { sky: ['#DCEBF6', '#F8F1E2'], ground: '#7FA35A', far: '#B6C5A8' },
  night: { sky: ['#10203F', '#2A3C6E'], ground: '#1E2B3A', far: '#33446A' },
};

let covers = 0;

/** A row of woven diamonds between two zigzags, across the band's width. */
function Kilim({ y, height, weave }: { y: number; height: number; weave: Weave }): React.JSX.Element {
  const mid = y + height / 2;
  const d = Math.min(6, height / 2 - 2);
  const step = 16;
  const zig = (base: number, amp: number): string =>
    Array.from({ length: Math.ceil(W / 6) + 1 }, (_, i) => `${i * 6},${base + (i % 2 === 0 ? 0 : amp)}`).join(' ');
  return (
    <>
      <Rect x={0} y={y} width={W} height={height} fill={weave.band} />
      <Path d={`M${zig(y + 2.2, 1.8).replace(/ /g, ' L')}`} fill="none" stroke={weave.motif} strokeWidth={0.9} opacity={0.85} />
      {Array.from({ length: Math.ceil(W / step) }, (_, i) => {
        const x = step / 2 + i * step;
        return (
          <Polygon key={x} points={`${x},${mid - d} ${x + d},${mid} ${x},${mid + d} ${x - d},${mid}`} fill={weave.motif} />
        );
      })}
      {Array.from({ length: Math.ceil(W / step) }, (_, i) => {
        const x = step / 2 + i * step;
        const e = Math.max(1.2, d / 2.6);
        return <Polygon key={`eye-${x}`} points={`${x},${mid - e} ${x + e},${mid} ${x},${mid + e} ${x - e},${mid}`} fill={weave.band} />;
      })}
      <Path d={`M${zig(y + height - 4, 1.8).replace(/ /g, ' L')}`} fill="none" stroke={weave.motif} strokeWidth={0.9} opacity={0.85} />
    </>
  );
}

/** What names the scene, drawn over the sky and in front of the far hills. */
function SceneMarks({ cover, scene }: { cover: StoryCoverKey; scene: Scene }): React.JSX.Element | null {
  switch (cover) {
    case 'mountains':
      return (
        <>
          <Polygon points="10,78 58,22 106,78" fill="#5B6E8C" />
          <Polygon points="44,38 58,22 72,38 65,36 58,41 51,36" fill="#F6F8FB" />
          <Polygon points="76,78 118,34 160,78" fill="#48597A" />
          <Polygon points="106,46 118,34 130,46 124,44 118,48 112,44" fill="#F6F8FB" />
        </>
      );
    case 'sunrise':
      return (
        <>
          <Circle cx={100} cy={66} r={20} fill="#F6B13C" />
          <Circle cx={100} cy={66} r={13} fill="#FBD36A" />
          <Path d="M0,74 C40,60 80,70 160,58 L160,80 L0,80 Z" fill={scene.far} />
        </>
      );
    case 'village':
      return (
        <>
          <Path d="M0,66 C40,52 100,58 160,50 L160,80 L0,80 Z" fill={scene.far} />
          {[28, 58, 92, 124].map((x, i) => (
            <Path key={x} d={`M${x - 11},74 L${x - 11},60 L${x},50 L${x + 11},60 L${x + 11},74 Z`} fill={i % 2 ? '#E9D9B8' : '#D9C39A'} />
          ))}
          {[28, 58, 92, 124].map((x) => (
            <Path key={`roof-${x}`} d={`M${x - 13},61 L${x},49 L${x + 13},61 Z`} fill="#8F4E3B" />
          ))}
          {[28, 58, 92, 124].map((x) => (
            <Rect key={`door-${x}`} x={x - 3} y={64} width={6} height={10} fill="#5A3A2A" />
          ))}
        </>
      );
    case 'river':
      return (
        <>
          <Path d="M0,62 C50,50 90,58 160,46 L160,80 L0,80 Z" fill={scene.far} />
          <Path d="M-5,100 C30,80 20,66 60,60 C100,54 110,74 165,66 L165,100 Z" fill="#4A8FBF" />
          <Path d="M6,92 C34,78 32,68 64,63 M60,84 C84,74 100,80 150,70" fill="none" stroke="#9ED0EE" strokeWidth={1.4} />
        </>
      );
    case 'orchard':
      return (
        <>
          <Path d="M0,64 C50,54 100,60 160,52 L160,80 L0,80 Z" fill={scene.far} />
          {[22, 54, 86, 118, 148].map((x, i) => (
            <Rect key={`trunk-${x}`} x={x - 1.6} y={62 - (i % 2) * 4} width={3.2} height={16} fill="#6B4A2E" />
          ))}
          {[22, 54, 86, 118, 148].map((x, i) => (
            <Circle key={`crown-${x}`} cx={x} cy={56 - (i % 2) * 4} r={11} fill={i % 2 ? '#4E8F4A' : '#5FA056'} />
          ))}
          {[18, 26, 50, 58, 82, 90, 114, 122, 144, 152].map((x, i) => (
            <Circle key={`fruit-${x}`} cx={x} cy={54 + (i % 3) * 3 - ((i >> 1) % 2) * 4} r={1.4} fill="#D9433F" />
          ))}
        </>
      );
    case 'night':
      return (
        <>
          <Circle cx={118} cy={30} r={11} fill="#F3E6B0" />
          <Circle cx={123} cy={27} r={9.5} fill={scene.sky[0]} />
          {[14, 40, 66, 92, 140, 30, 150].map((x, i) => (
            <Circle key={`star-${x}`} cx={x} cy={14 + (i * 9) % 30} r={i % 3 === 0 ? 1.2 : 0.8} fill="#F6F1D8" />
          ))}
          <Path d="M0,70 C40,52 80,66 160,54 L160,80 L0,80 Z" fill={scene.far} />
        </>
      );
    default:
      return null;
  }
}

/**
 * The cover, drawn to fill `style`'s box: the scene over the whole height
 * with its kilim along the foot, or — for a story with no scene — the kilim
 * alone, wider, with a plain ground of its own colour above and below.
 */
export function StoryCover({
  cover,
  category,
  style,
  radius = radii.md,
}: {
  cover: string | null | undefined;
  category: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}): React.JSX.Element {
  const weave = weaveFor(category);
  const key = isStoryCoverKey(cover) ? cover : null;
  const scene = key ? SCENES[key] : null;
  // its own gradient id: a card left behind in the stack must not own this one's sky (browser build)
  const ref = useRef<string | null>(null);
  if (ref.current === null) {
    covers += 1;
    ref.current = `cover${covers.toString(36)}`;
  }
  const id = ref.current;
  return (
    <View style={[styles.box, { borderRadius: radius }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        {scene && key ? (
          <>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={scene.sky[0]} />
                <Stop offset="1" stopColor={scene.sky[1]} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={W} height={H} fill={`url(#${id})`} />
            <SceneMarks cover={key} scene={scene} />
            <Rect x={0} y={76} width={W} height={24} fill={scene.ground} />
            <Kilim y={86} height={14} weave={weave} />
          </>
        ) : (
          <>
            <Rect x={0} y={0} width={W} height={H} fill={weave.band} />
            <Rect x={0} y={0} width={W} height={H} fill={weave.motif} opacity={0.08} />
            <Kilim y={22} height={24} weave={weave} />
            <Kilim y={54} height={24} weave={weave} />
          </>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
});
