import { useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Image, Pressable, Share, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
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
/** The rim the website puts on a poem badge: the gold, well faded back. */
const GOLD_RIM = 'rgba(240,194,74,0.3)';
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
    <View style={[styles.card, { backgroundColor: colors.glassFill }]}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={item.title ? `${badge}: ${item.title}` : `${badge} — ${who}`}
        style={styles.body}
      >
        <View style={styles.head}>
          <InitialsAvatar name={who} id={item.author.id} size={28} photoUrl={item.author.avatarUrl} />
          <View style={styles.headText}>
            <Text style={[styles.who, { color: colors.textPrimary }]} numberOfLines={1}>
              {who}
            </Text>
            <Text style={[styles.age, { color: colors.textSecondary }]}>{relativeTime(item.at)}</Text>
          </View>
          <Text
            style={[
              styles.badge,
              item.kind === 'poem'
                ? { color: colors.gold, borderColor: GOLD_RIM }
                : { color: colors.textSecondary, borderColor: colors.glassBorder },
            ]}
          >
            {badge}
          </Text>
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
          icon={e.liked ? 'heart-fill' : 'heart'}
          on={e.liked}
          disabled={busy !== null}
          label={e.liked ? t('feed.unlike') : t('feed.like')}
          count={e.likes}
          onPress={() => void toggle('like')}
        />
        <Action
          icon="repost"
          on={e.reposted}
          disabled={busy !== null}
          label={e.reposted ? t('repost.undo') : t('repost.do')}
          count={e.reposts}
          onPress={() => void toggle('repost')}
        />
        <Action icon="share" label={t('share.post')} onPress={() => void share()} />
        <Action
          icon={e.bookmarked ? 'bookmark-fill' : 'bookmark'}
          style={styles.save}
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
  style,
}: {
  icon: IconName;
  label: string;
  count?: number;
  on?: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
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
      style={[styles.action, disabled && styles.actionDisabled, style]}
    >
      <Icon name={icon} size={18} color={tint} />
      {count ? <Text style={[styles.count, { color: tint }]}>{count}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  body: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headText: { flex: 1 },
  who: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  age: { fontSize: typography.sizes.sm },
  badge: {
    fontSize: typography.sizes.xs,
    letterSpacing: 0.66,
    textTransform: 'uppercase',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  title: { ...display(typography.sizes.lg) },
  image: { width: '100%', aspectRatio: 1, borderRadius: radii.md },
  excerpt: { fontSize: typography.sizes.md },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,

  },
  /** Saved sits apart: it is about you, not about the post. */
  save: { marginLeft: 'auto' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 11, borderRadius: radii.pill },
  actionDisabled: { opacity: 0.5 },
  count: { fontSize: typography.sizes.sm },
});
