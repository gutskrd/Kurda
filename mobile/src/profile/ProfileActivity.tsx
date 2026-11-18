import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { useAuth } from '../auth/AuthContext';
import { FeedCard, FeedCardSkeleton } from '../feed/FeedCard';
import { SkeletonText } from '../theme/Skeleton';
import type { FeedItem } from '../feed/types';
import { onPostDeleted, samePost, useDeleting } from '../composer/postDeleted';
import { radii, spacing, typography } from '../theme/tokens';
import { sectionLabel } from '../theme/fonts';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';

import { PROFILE_SECTIONS, type ProfileSection, type ProfileSections } from './sections';
import { EmptyState } from '../theme/EmptyState';
import { heldDim } from '../theme/MotionParts';
import { useDirection } from '../reports/direction';
import { reachRoom } from '../a11y/a11y';

/** A tab's height, and the track's inset round the tabs. */
const TAB_HEIGHT = 50;
const TRACK_PAD = 3;

const LABEL: Record<ProfileSection, TranslationKey> = {
  posts: 'profile.tab.posts',
  games: 'nav.games',
  likes: 'profile.tab.likes',
  reposts: 'repost.tab',
  saved: 'saved.title',
};

const GLYPH: Record<ProfileSection, IconName> = {
  posts: 'wall',
  games: 'play',
  likes: 'heart',
  reposts: 'repost',
  saved: 'bookmark',
};

/** A game, which stays a row: a line in a history rather than a post. */
interface ActivityEntry {
  id: string;
  title: string;
  detail: string | null;
  at: string;
}

interface ActivityPage {
  entries: ActivityEntry[];
  items: FeedItem[];
}

/**
 * What somebody has been doing, under their profile. The server answers in two shapes from one route: posts, likes and
 * reposts as whole feed items, drawn with the wall's own card so a profile shows the posts themselves; games stay a
 * row.
 */
export function ProfileActivity({
  userId,
  sections,
  own = false,
}: {
  userId: string;
  /** What the owner lets people see; null when the profile is private. */
  sections?: ProfileSections | null;
  /** Your own profile: the hidden ones are still yours to look at, labelled. */
  own?: boolean;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();

  /*
   * A section the owner turned off is not offered to anybody else; on your own profile it stays, marked, so turning it
   * off does not hide it from you.
   */
  const shown = PROFILE_SECTIONS.filter((key) => own || sections?.[key] !== false);
  const [section, setSection] = useState<ProfileSection>(shown[0] ?? 'posts');
  // Recomputed rather than stored, so a tab that disappears is replaced instead of leaving an empty panel.
  const active = shown.includes(section) ? section : (shown[0] ?? null);
  const [page, setPage] = useState<ActivityPage | null>(null);
  const strip = useRef<ScrollView>(null);
  const rr = reachRoom(TRACK_PAD);

  const load = useCallback(
    (kind: ProfileSection) => {
      setPage(null);
      void client.get<ActivityPage>(`/users/${userId}/activity?kind=${kind}&limit=12`).then((res) => {
        // A section that will not load shows as empty rather than as an error: the profile above it is still worth
        // reading.
        setPage(res.ok ? res.data : { entries: [], items: [] });
      });
    },
    [client, userId],
  );

  useEffect(() => {
    if (active) load(active);
  }, [load, active]);

  // This list loads once, so a post deleted from its own page is taken off it here.
  useEffect(
    () => onPostDeleted((gone) => setPage((prev) => prev && { ...prev, items: prev.items.filter((i) => !samePost(i, gone)) })),
    [],
  );
  const deleting = useDeleting();

  if (active === null) return null;

  const items = page?.items ?? [];
  const entries = page?.entries ?? [];
  const empty = page !== null && items.length === 0 && entries.length === 0;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('profile.activity')}
      </Text>

      {/* One row, the glyph above the word: each tab is as wide as its word and they share what is left, and where
         five whole words do not fit (Soranî, German) the row scrolls rather than wrapping or cutting them. The chosen
         tab is solid violet, and right to left the first tab is on the right.

         On your own profile a section hidden from others is still here, marked with the closed eye and named
         "Hidden" to a screen reader. */}
      <View style={[styles.tabs, { backgroundColor: colors.controlTrack }]}>
        <ScrollView
          ref={strip}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => {
            if (dir.row === 'row-reverse') strip.current?.scrollToEnd({ animated: false });
          }}
          accessibilityRole="tablist"
          style={rr.scroller}
          contentContainerStyle={[rr.content, styles.tabRow, { flexDirection: dir.row }]}
        >
          {shown.map((s) => {
            const on = s === active;
            const ink = on ? colors.textOnPrimary : colors.textSecondary;
            const hidden = own && sections?.[s] === false;
            return (
              <Pressable
                key={s}
                onPress={() => setSection(s)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={hidden ? `${t(LABEL[s])}, ${t('profile.hidden')}` : t(LABEL[s])}
                style={({ pressed }) => [styles.tab, on ? { backgroundColor: colors.primary } : null, pressed && heldDim]}
              >
                <Icon name={GLYPH[s]} size={18} color={ink} />
                <View style={[styles.tabLabel, { flexDirection: dir.row }]}>
                  <Text style={[styles.tabText, { color: ink }]} numberOfLines={1}>
                    {t(LABEL[s])}
                  </Text>
                  {hidden ? <Icon name="eye-off" size={12} color={ink} /> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {page === null ? (
        <ActivitySkeleton games={active === 'games'} />
      ) : empty ? (
        <EmptyState title={t('profile.nothingHere')} body={t('profile.nothingHere.body')} />
      ) : (
        <View style={styles.list}>
          {items.filter((item) => !deleting(item)).map((item) => (
            <FeedCard key={item.key} item={item} />
          ))}
          {entries.map((e) => (
            <View
              key={e.id}
              style={[styles.row, { backgroundColor: colors.glassFill }]}
            >
              <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {e.title}
              </Text>
              {e.detail ? (
                <Text style={[styles.rowDetail, { color: colors.textSecondary }]} numberOfLines={1}>
                  {e.detail}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** The whole section in grey, for a profile still loading: the heading, the tab strip, and the first posts. */
export function ProfileActivitySkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <SkeletonText size={typography.sizes.xs} width={72} />
      <View style={[styles.tabs, styles.tabsSkeleton, { backgroundColor: colors.controlTrack }]} />
      <ActivitySkeleton games={false} />
    </View>
  );
}

/** A section while it loads: the posts as the cards they will be, or the games as rows, not a spinner. */
function ActivitySkeleton({ games }: { games: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.list} accessibilityLabel={t('common.loading')}>
      {games
        ? [0, 1, 2].map((i) => (
            <View key={i} style={[styles.row, { backgroundColor: colors.glassFill }]}>
              <SkeletonText size={typography.sizes.md} width={i % 2 ? '40%' : '52%'} />
              <SkeletonText size={typography.sizes.sm} width="30%" />
            </View>
          ))
        : [0, 1].map((i) => <FeedCardSkeleton key={i} titled={i > 0} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  heading: { ...sectionLabel },
  tabs: { borderRadius: radii.lg, overflow: 'hidden', paddingVertical: TRACK_PAD },
  // The row fills the track when the tabs fit, so they share what is left.
  tabRow: { flexGrow: 1, paddingHorizontal: TRACK_PAD, gap: 2 },
  // The strip's own height: a tab is 50pt, inside the track's inset.
  tabsSkeleton: { height: TAB_HEIGHT + TRACK_PAD * 2 },
  // As wide as its word to begin with, then a share of what is left in the row.
  tab: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: TAB_HEIGHT,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  tabLabel: { alignItems: 'center', gap: 3 },
  tabText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, textAlign: 'center' },
  list: { gap: spacing.md },
  row: {
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
  },
  rowTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  rowDetail: { fontSize: typography.sizes.sm },
});
