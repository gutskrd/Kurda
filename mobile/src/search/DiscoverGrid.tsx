import { useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { getFeed } from '../feed/api';
import { CARD_LABEL_KEY, feedImages, type FeedItem } from '../feed/types';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { sectionLabel } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

/** How many pictures the grid asks for: six rows of three, a screenful and a bit. */
const ASK = 18;
/** The hairline between tiles. */
const GAP = 2;

/**
 * The pictures people have posted lately, three to a row, under the search
 * field before anything is typed: something to look at, and somewhere to go,
 * for somebody who opened Search without a name or a word in mind.
 *
 * A tile is the post's first picture, square; a post with more than one says
 * so in its corner. A tap opens the post. The grid runs to the screen's
 * edges, as pictures do on the wall.
 *
 * `onCount` says how many there turned out to be, so the screen can show its
 * own empty state when there are none and this shows nothing.
 */
export function DiscoverGrid({ width, onCount }: { width: number; onCount?: (n: number) => void }): React.JSX.Element | null {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const counted = useRef(onCount);
  counted.current = onCount;

  // asked once, when Search first opens; a pull on the wall is where fresh pictures come from
  useEffect(() => {
    let active = true;
    void getFeed(client, { section: 'dimen', limit: ASK, offset: 0 }).then((res) => {
      if (!active) return;
      const pictured = res.ok ? (res.data.items ?? []).filter((i) => feedImages(i).length > 0) : [];
      // three to a row: a short last row reads as a grid that broke off
      const whole = pictured.length > 3 ? pictured.slice(0, pictured.length - (pictured.length % 3)) : pictured;
      setItems(whole);
      counted.current?.(whole.length);
    });
    return () => {
      active = false;
    };
  }, [client]);

  const tile = Math.floor((width - 2 * GAP) / 3);
  const title = (
    <Text style={[styles.title, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
      {t('search.fromCommunity')}
    </Text>
  );

  if (items === null) {
    return (
      <View style={styles.section} accessibilityLabel={t('common.loading')}>
        <SkeletonText size={typography.sizes.xs} width={160} style={[styles.title, { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' }]} />
        <View style={[styles.grid, { flexDirection: dir.row }]}>
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} width={tile} height={tile} radius={0} />
          ))}
        </View>
      </View>
    );
  }
  if (items.length === 0) return null;

  return (
    <View style={styles.section} testID="discover-grid">
      {title}
      <View style={[styles.grid, { flexDirection: dir.row }]}>
        {items.map((item) => {
          const pictures = feedImages(item);
          const first = pictures[0]!;
          const badgeKey = CARD_LABEL_KEY[item.kind];
          const who = item.author.displayName || item.author.username;
          const label = first.alt?.trim() || `${badgeKey ? t(badgeKey) : item.kind} — ${who}`;
          return (
            <Pressable
              key={item.key}
              onPress={() =>
                item.targetType === 'library'
                  ? navigation.navigate('LibraryPost', { postId: item.id })
                  : navigation.navigate('MemeDetail', { postId: item.id })
              }
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint={t('memes.openPost')}
              style={({ pressed }) => [{ width: tile, height: tile, backgroundColor: colors.controlTrack }, pressed && styles.pressed]}
            >
              <Image source={{ uri: first.url }} style={styles.fill} resizeMode="cover" accessibilityIgnoresInvertColors />
              {pictures.length > 1 ? (
                <View style={styles.more} pointerEvents="none">
                  <Icon name="image" size={16} color="#FFFFFF" />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  title: { ...sectionLabel, paddingHorizontal: spacing.md },
  grid: { flexWrap: 'wrap', gap: GAP },
  fill: { width: '100%', height: '100%' },
  pressed: { opacity: 0.7 },
  // in the top corner, with a soft shadow so it reads on a pale picture as on a dark one
  more: {
    position: 'absolute',
    top: 6,
    end: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
});
