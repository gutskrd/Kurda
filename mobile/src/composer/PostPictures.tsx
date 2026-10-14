import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { FeedImage } from '@kurda/shared';
import { radii } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';

/**
 * A post's pictures, one to four, laid out the way X lays them out.
 *
 * One picture keeps its own shape, within limits — a tall phone photo is cut
 * to 4:5 and a panorama to 1.91:1, so one post cannot fill a whole screen or
 * become a ribbon. Two to four share a 16:9 box: side by side, one tall and
 * two stacked, or a square of four.
 *
 * Every picture is its own element for a screen reader, named by its alt
 * text, or "Picture 2 of 3" when the poster wrote none — never by the post's
 * text, which a screen reader reads anyway, right before.
 */
export const SINGLE_MIN_RATIO = 0.8;
export const SINGLE_MAX_RATIO = 1.91;

/** The shape one picture is shown in: its own, kept within the limits; 4:3 when its size is unknown. */
export function singleRatio(image: Pick<FeedImage, 'width' | 'height'>): number {
  if (!image.width || !image.height) return 4 / 3;
  return Math.min(SINGLE_MAX_RATIO, Math.max(SINGLE_MIN_RATIO, image.width / image.height));
}

export function PostPictures({
  images,
  onPress,
}: {
  images: readonly FeedImage[];
  /** opening the post (on the wall); left out where the post is already open */
  onPress?: () => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const shown = images.slice(0, 4);
  if (shown.length === 0) return null;

  const tile = (image: FeedImage, i: number, style: object) => {
    const label = image.alt?.trim() || t('composer.picture.label', { n: i + 1, total: shown.length });
    const picture = (
      <Image
        source={{ uri: image.url }}
        style={styles.fill}
        resizeMode="cover"
        // on the wall the picture is a way into the post, and that is what is named
        accessible={!onPress}
        accessibilityRole="image"
        accessibilityLabel={onPress ? undefined : label}
        accessibilityIgnoresInvertColors
      />
    );
    return (
      <View key={`${i}-${image.url}`} style={[style, { backgroundColor: colors.controlTrack }]}>
        {onPress ? (
          <Pressable onPress={onPress} style={styles.fill} accessibilityRole="image" accessibilityLabel={label}>
            {picture}
          </Pressable>
        ) : (
          picture
        )}
      </View>
    );
  };

  if (shown.length === 1) {
    return <View style={[styles.box, { aspectRatio: singleRatio(shown[0]!) }]}>{tile(shown[0]!, 0, styles.fill)}</View>;
  }

  return (
    <View style={[styles.box, styles.wide]}>
      {shown.length === 2 ? (
        <>
          {tile(shown[0]!, 0, styles.cell)}
          {tile(shown[1]!, 1, styles.cell)}
        </>
      ) : shown.length === 3 ? (
        <>
          {tile(shown[0]!, 0, styles.cell)}
          <View style={styles.column}>
            {tile(shown[1]!, 1, styles.cell)}
            {tile(shown[2]!, 2, styles.cell)}
          </View>
        </>
      ) : (
        // in rows, so a screen reader meets them in the order they were posted
        <View style={styles.column}>
          <View style={styles.row}>
            {tile(shown[0]!, 0, styles.cell)}
            {tile(shown[1]!, 1, styles.cell)}
          </View>
          <View style={styles.row}>
            {tile(shown[2]!, 2, styles.cell)}
            {tile(shown[3]!, 3, styles.cell)}
          </View>
        </View>
      )}
    </View>
  );
}

const GAP = 2;

const styles = StyleSheet.create({
  // on a tablet or a wide window the pictures stop growing where a phone's would: a
  // post is read, not a poster — and the shape, not the height, is what is kept
  box: { width: '100%', maxWidth: 560, borderRadius: radii.md, overflow: 'hidden' },
  wide: { aspectRatio: 16 / 9, flexDirection: 'row', gap: GAP },
  column: { flex: 1, gap: GAP },
  row: { flex: 1, flexDirection: 'row', gap: GAP },
  cell: { flex: 1 },
  fill: { width: '100%', height: '100%' },
});
