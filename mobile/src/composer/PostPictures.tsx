import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { FeedImage } from '@kurda/shared';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';

/**
 * A post's pictures, one to four.
 *
 * One picture keeps its own shape, within limits — a tall phone photo is cut
 * to 4:5 and a panorama to 1.91:1, so one post cannot fill a whole screen or
 * become a ribbon. Two to four share a 16:9 box: side by side, one tall and
 * two stacked, or a square of four.
 *
 * Every picture is its own element for a screen reader, named by its alt
 * text, or "Picture 2 of 3" when the poster wrote none — never by the post's
 * text, which a screen reader reads anyway, right before.
 *
 * On the wall (`wall`) the corners are rounder, and two or more are not cut
 * into a box: they come one at a time, each whole and the width of the post,
 * swiped through sideways.
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
  onLongPress,
  wall = false,
}: {
  images: readonly FeedImage[];
  /** opening the post (on the wall); left out where the post is already open */
  onPress?: () => void;
  /** the post's menu, held down on a picture as on the words */
  onLongPress?: () => void;
  /** as the wall shows a post's pictures: inside the page's margins, rounder, several swiped through */
  wall?: boolean;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
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
          // a picture that opens the post: named by what it shows, and said to open the post
          <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.fill}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={t('memes.openPost')}
          >
            {picture}
          </Pressable>
        ) : (
          picture
        )}
      </View>
    );
  };

  if (shown.length === 1) {
    return <View style={[styles.box, wall && styles.wall, { aspectRatio: singleRatio(shown[0]!) }]}>{tile(shown[0]!, 0, styles.fill)}</View>;
  }
  if (wall) return <Swiped images={shown} tile={tile} mirror={dir.row === 'row-reverse'} />;

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

/**
 * A wall post's pictures, one at a time. All of them take the first one's
 * shape, so the post does not change height under the thumb as it is swiped.
 * Where you are is said twice, small: "2/3" in the top corner and a dot for
 * each along the bottom, the one shown filled. Neither is read out — each
 * picture already says "Picture 2 of 3", or what it shows.
 *
 * In Soranî the first picture is on the right and the next one comes in from
 * the left, as a page is turned.
 */
function Swiped({
  images,
  tile,
  mirror,
}: {
  images: readonly FeedImage[];
  tile: (image: FeedImage, i: number, style: object) => React.JSX.Element;
  mirror: boolean;
}): React.JSX.Element {
  // inside the page's margins, so the phone's width less those until the post has been measured
  const screen = useWindowDimensions().width;
  const [measured, setMeasured] = useState(0);
  const width = measured || Math.min(MAX_WIDTH, screen - 2 * layout.gutter);
  const ratio = singleRatio(images[0]!);
  const [index, setIndex] = useState(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setIndex(Math.min(images.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / width))));
  };
  return (
    <View style={[styles.box, styles.wall, { aspectRatio: ratio }]} onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}>
      <FlatList
        data={images}
        style={styles.fill}
        horizontal
        pagingEnabled
        inverted={mirror}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(image, i) => `${i}-${image.url}`}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => tile(item, i, { width, height: width / ratio })}
        onScroll={onScroll}
        scrollEventThrottle={32}
      />
      <View style={[styles.counter, mirror ? styles.counterLeft : styles.counterRight]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.counterText}>{`${index + 1}/${images.length}`}</Text>
      </View>
      <View style={[styles.dots, { flexDirection: mirror ? 'row-reverse' : 'row' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {images.map((image, i) => (
          <View key={`${i}-${image.url}`} style={[styles.dot, i === index ? styles.dotOn : null]} />
        ))}
      </View>
    </View>
  );
}

const GAP = 2;
/** on a tablet or a wide window the pictures stop growing where a phone's would */
const MAX_WIDTH = 560;
// on a picture, whatever its colours and whatever the theme: white on a dimmed pill
const ON_PICTURE = '#FFFFFF';
const UNDER = 'rgba(0,0,0,0.45)';

const styles = StyleSheet.create({
  // on a tablet or a wide window the pictures stop growing where a phone's would: a
  // post is read, not a poster — and the shape, not the height, is what is kept
  box: { width: '100%', maxWidth: MAX_WIDTH, borderRadius: radii.md, overflow: 'hidden' },
  wall: { borderRadius: radii.lg },
  wide: { aspectRatio: 16 / 9, flexDirection: 'row', gap: GAP },
  column: { flex: 1, gap: GAP },
  row: { flex: 1, flexDirection: 'row', gap: GAP },
  cell: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  counter: { position: 'absolute', top: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: UNDER },
  counterRight: { right: spacing.md },
  counterLeft: { left: spacing.md },
  counterText: { color: ON_PICTURE, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  dots: { position: 'absolute', bottom: spacing.sm, alignSelf: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 5, borderRadius: radii.pill, backgroundColor: UNDER },
  dot: { width: 6, height: 6, borderRadius: radii.pill, backgroundColor: ON_PICTURE, opacity: 0.45 },
  dotOn: { opacity: 1 },
});
