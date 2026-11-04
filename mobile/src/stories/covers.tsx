import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Polygon, Rect } from 'react-native-svg';
import { storyCoverPath } from '@kurda/shared';
import { assetUrl } from '../api/env';
import { radii } from '../theme/tokens';

/**
 * A story's cover: the picture the editor chose for it (its `cover` key, one
 * of the shared `STORY_COVERS` — the shop's painted scenes and kilims, which
 * the admin's picker offers), or a woven kilim band in its category's colours
 * when none was chosen, so a shelf of stories never has a blank spine on it
 * (design notes §7).
 *
 * The pictures are files on the website (`/cosmetics/backgrounds/…`), loaded
 * from there through `assetUrl` as the profile backgrounds are, rather than
 * shipped inside the app a second time. While one loads, the card shows its
 * category's plain ground rather than an empty box; a key the shared list
 * does not know (none, or one from before a picture was taken out) and a
 * picture that will not load both fall back to the band, so a missing file
 * looks like a story without a picture and not like a fault.
 *
 * Art colours are the colours of the things drawn, not the interface's: a
 * kilim stays red on the dark theme. Only the frame around the picture is the
 * card's.
 */

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

/** The address of a cover's picture, for a key the shared list knows; null for none and for an unknown key. */
export function coverUri(cover: string | null | undefined): string | null {
  return assetUrl(storyCoverPath(cover));
}

/** The band is laid out in this box and cropped to the card. */
const W = 160;
const H = 100;

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
        return <Polygon key={x} points={`${x},${mid - d} ${x + d},${mid} ${x},${mid + d} ${x - d},${mid}`} fill={weave.motif} />;
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

/** The quiet band for a story without a picture: two woven rows on a plain ground of their own colour. */
function KilimBand({ weave }: { weave: Weave }): React.JSX.Element {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" testID="story-cover-kilim">
      <Rect x={0} y={0} width={W} height={H} fill={weave.band} />
      <Rect x={0} y={0} width={W} height={H} fill={weave.motif} opacity={0.08} />
      <Kilim y={22} height={24} weave={weave} />
      <Kilim y={54} height={24} weave={weave} />
    </Svg>
  );
}

/** The cover, drawn to fill `style`'s box: the chosen picture, or the category's kilim band. */
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
  const uri = coverUri(cover);
  // the address that failed, so a story given another picture tries that one
  const [failed, setFailed] = useState<string | null>(null);
  const picture = uri !== null && uri !== failed ? uri : null;
  return (
    <View
      style={[styles.box, { borderRadius: radius, backgroundColor: weave.band }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {picture ? (
        <Image source={{ uri: picture }} style={styles.fill} resizeMode="cover" onError={() => setFailed(picture)} accessibilityIgnoresInvertColors />
      ) : (
        <KilimBand weave={weave} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
});
