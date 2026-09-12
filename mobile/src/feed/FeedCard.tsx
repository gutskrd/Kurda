import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RootNavigation } from '../navigation/rootStack';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { relativeTime } from '../memes/types';
import { CARD_LABEL_KEY, type FeedItem } from './types';

/**
 * One card on the wall, whichever half it came from.
 *
 * A written post and a picture were two different cards on two different
 * screens; here they are one, because on a wall they sit next to each other and
 * anything else reads as two apps stitched together. What differs is only what
 * there is to show: a picture has an image and no title, a gotin has a body and
 * no title, a story has both.
 */
export function FeedCard({ item }: { item: FeedItem }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();

  const open = useCallback(() => {
    if (item.targetType === 'library') navigation.navigate('LibraryPost', { postId: item.id });
    else navigation.navigate('MemeDetail', { postId: item.id });
  }, [navigation, item.targetType, item.id]);

  // an unfamiliar kind prints itself rather than an empty chip
  const badgeKey = CARD_LABEL_KEY[item.kind];
  const badge = badgeKey ? t(badgeKey) : item.kind;
  const who = item.author.displayName || item.author.username;

  return (
    <Pressable
      onPress={open}
      style={[styles.card, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}
      accessibilityRole="button"
      accessibilityLabel={item.title ? `${badge}: ${item.title}` : `${badge} — ${who}`}
    >
      <View style={styles.head}>
        <InitialsAvatar name={who} id={item.author.id} size={28} />
        <View style={styles.headText}>
          <Text style={[styles.who, { color: colors.textPrimary }]} numberOfLines={1}>
            {who}
          </Text>
          <Text style={[styles.age, { color: colors.textSecondary }]}>{relativeTime(item.at)}</Text>
        </View>
        <Text style={[styles.badge, { color: colors.textSecondary, borderColor: colors.glassBorder }]}>{badge}</Text>
      </View>

      {item.title ? (
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {item.title}
        </Text>
      ) : null}

      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : null}

      {item.excerpt ? (
        <Text style={[styles.excerpt, { color: colors.textSecondary }]} numberOfLines={3}>
          {item.excerpt}
        </Text>
      ) : null}

      <View style={styles.foot}>
        <Text style={[styles.stat, { color: colors.textSecondary }]}>👁 {item.viewCount}</Text>
        <Text style={[styles.stat, { color: colors.textSecondary }]}>💬 {item.commentCount}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headText: { flex: 1 },
  who: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  age: { fontSize: typography.sizes.sm },
  badge: {
    fontSize: typography.sizes.sm,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  image: { width: '100%', aspectRatio: 1, borderRadius: radii.md },
  excerpt: { fontSize: typography.sizes.md },
  foot: { flexDirection: 'row', gap: spacing.lg },
  stat: { fontSize: typography.sizes.sm },
});
