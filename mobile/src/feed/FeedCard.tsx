import { useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { radii, spacing, typography } from '../theme/tokens';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { relativeTime } from '../memes/types';
import { postUrl, toggleEngagement } from './api';
import { CARD_LABEL_KEY, type EngagementKind, type FeedItem } from './types';

/**
 * One card on the wall, whichever half it came from.
 *
 * A written post and a picture were two different cards on two different
 * screens; here they are one, because on a wall they sit next to each other and
 * anything else reads as two apps stitched together. What differs is only what
 * there is to show: a picture has an image and no title, a gotin has a body and
 * no title, a story has both.
 *
 * No signed-out variant, unlike the web card: the phone's tabs sit behind the
 * auth stack, so anyone looking at this has an account. Adding "sign in to
 * like" states here would be writing for a reader who cannot get here.
 */
export function FeedCard({
  item,
  onChanged,
}: {
  item: FeedItem;
  /** told the fresh totals, so a like does not reload the wall */
  onChanged?: (next: FeedItem) => void;
}): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [busy, setBusy] = useState<EngagementKind | null>(null);

  const open = useCallback(() => {
    if (item.targetType === 'library') navigation.navigate('LibraryPost', { postId: item.id });
    else navigation.navigate('MemeDetail', { postId: item.id });
  }, [navigation, item.targetType, item.id]);

  const toggle = useCallback(
    async (kind: EngagementKind) => {
      if (busy) return;
      setBusy(kind);
      const res = await toggleEngagement(client, item, kind);
      setBusy(null);
      // the server returns the fresh totals; taking them keeps the count right
      // even when somebody else liked it while this screen was open
      if (res.ok && onChanged) onChanged({ ...item, engagement: res.data.engagement });
    },
    [busy, client, item, onChanged],
  );

  /**
   * Hand the post to whatever the phone shares with.
   *
   * The system sheet rather than the web card's own panel: on a phone that
   * sheet is where every app already puts this, and it reaches the messaging
   * app somebody actually uses instead of the handful we could list.
   */
  const share = useCallback(async () => {
    const url = postUrl(item);
    const message = item.title ? `${item.title}\n${url}` : url;
    try {
      await Share.share({ message, url });
    } catch {
      // the sheet was dismissed, or the platform refused it; nothing was shared
      // and there is nothing to tell anybody
    }
  }, [item]);

  // an unfamiliar kind prints itself rather than an empty chip
  const badgeKey = CARD_LABEL_KEY[item.kind];
  const badge = badgeKey ? t(badgeKey) : item.kind;
  const who = item.author.displayName || item.author.username;
  const e = item.engagement;

  return (
    <View style={[styles.card, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={item.title ? `${badge}: ${item.title}` : `${badge} — ${who}`}
        style={styles.body}
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
      </Pressable>

      <View style={styles.actions}>
        <Action
          icon="chat"
          label={t('feed.comments', { count: item.commentCount })}
          count={item.commentCount}
          onPress={open}
        />
        <Action
          icon="heart"
          on={e.liked}
          disabled={busy !== null}
          label={e.liked ? t('feed.unlike') : t('feed.like')}
          count={e.likes}
          onPress={() => void toggle('like')}
        />
        <Action
          icon="sparkle"
          on={e.reposted}
          disabled={busy !== null}
          label={e.reposted ? t('repost.undo') : t('repost.do')}
          count={e.reposts}
          onPress={() => void toggle('repost')}
        />
        <Action icon="mail" label={t('share.post')} onPress={() => void share()} />
        <Action
          icon={e.bookmarked ? 'star' : 'star-outline'}
          on={e.bookmarked}
          disabled={busy !== null}
          label={e.bookmarked ? t('feed.removeFromSaved') : t('feed.save')}
          onPress={() => void toggle('bookmark')}
        />
      </View>
    </View>
  );
}

/**
 * One button in the row under a card.
 *
 * The label says what pressing it does, never what it counts: these buttons
 * show a number, and a number is what a screen reader announces as the name
 * unless told otherwise — "4" tells you nothing about what would happen.
 */
function Action({
  icon,
  label,
  count,
  on = false,
  disabled = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  count?: number;
  on?: boolean;
  disabled?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const tint = on ? colors.primary : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      accessibilityLabel={count ? `${label} (${count})` : label}
      style={[styles.action, disabled && styles.actionDisabled]}
    >
      <Icon name={icon} size={18} color={tint} />
      {count ? <Text style={[styles.count, { color: tint }]}>{count}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  body: { gap: spacing.sm },
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
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  actionDisabled: { opacity: 0.5 },
  count: { fontSize: typography.sizes.sm },
});
