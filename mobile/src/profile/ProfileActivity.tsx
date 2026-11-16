import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { useAuth } from '../auth/AuthContext';
import { FeedCard, FeedCardSkeleton } from '../feed/FeedCard';
import { SkeletonText } from '../theme/Skeleton';
import type { FeedItem } from '../feed/types';
import { onPostDeleted, samePost } from '../composer/postDeleted';
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

/** The chosen tab's wash: the violet at the strength the tab bar and the segmented control use to say "here". */
const CHOSEN_WASH = '1F';
/** A tab's height, and a strip taller than one row of them by half: it has taken a second row, even at the largest text. */
const TAB_HEIGHT = 50;
const TWO_ROWS_AT_LEAST = (TAB_HEIGHT + 3 * 2) * 1.5;

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
 * What somebody has been doing, under their profile (KUR-086).
 *
 * The browser has had this since profiles were built and the phone never
 * called the endpoint, so a profile on the phone ended at the bio — you could
 * read who somebody was and not one thing they had written.
 *
 * The server answers in two shapes from the one route, and the reason is worth
 * keeping: posts, likes and reposts come back as whole feed items and are drawn
 * with the same card the wall uses, because a profile that shrank a picture to
 * a thumbnail and a poem to an icon was showing a list *about* posts rather
 * than the posts. Only games stay a row.
 */
export function ProfileActivity({
  userId,
  sections,
  own = false,
}: {
  userId: string;
  /** what the owner lets people see; null when the profile is private */
  sections?: ProfileSections | null;
  /** your own profile: the hidden ones are still yours to look at, labelled */
  own?: boolean;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();

  /*
   * A section the owner has turned off is not offered to anybody else. On
   * your own profile it stays, marked, so that turning something off does not
   * also hide it from you.
   */
  const shown = PROFILE_SECTIONS.filter((key) => own || sections?.[key] !== false);
  const [section, setSection] = useState<ProfileSection>(shown[0] ?? 'posts');
  // recomputed rather than stored, so a tab that disappears under you is
  // replaced instead of leaving an empty panel
  const active = shown.includes(section) ? section : (shown[0] ?? null);
  const [page, setPage] = useState<ActivityPage | null>(null);
  /*
   * The strip's width once it has had to take a second row, and so set its
   * tabs three to a row. Left to themselves the tabs fill a row before
   * starting the next, which in most languages left four on the first and
   * the fifth alone across the whole of the second. A new width (a turned
   * tablet) lets them find their rows again.
   */
  const [thirds, setThirds] = useState<number | null>(null);

  const load = useCallback(
    (kind: ProfileSection) => {
      setPage(null);
      void client.get<ActivityPage>(`/users/${userId}/activity?kind=${kind}&limit=12`).then((res) => {
        // a section that will not load shows as empty rather than as an error:
        // the profile above it is still worth reading
        setPage(res.ok ? res.data : { entries: [], items: [] });
      });
    },
    [client, userId],
  );

  useEffect(() => {
    if (active) load(active);
  }, [load, active]);

  // this list loads once, so a post deleted from its own page is taken off it here
  useEffect(
    () => onPostDeleted((gone) => setPage((prev) => prev && { ...prev, items: prev.items.filter((i) => !samePost(i, gone)) })),
    [],
  );

  if (active === null) return null;

  const items = page?.items ?? [];
  const entries = page?.entries ?? [];
  const empty = page !== null && items.length === 0 && entries.length === 0;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('profile.activity')}
      </Text>

      {/*
        Scrollable would hide a tab off the edge, so they share the width and
        keep their labels — the glyph above the word rather than beside it.
        Each tab is as wide as its word and the row grows to fill the strip;
        where five words do not fit across (German's "Gespeichert", Turkish's
        "Yeniden paylaşılanlar", all of Soranî at 320), the strip takes a
        second row rather than cutting them to "Gespeic…". The chosen tab is
        a wash of violet with violet ink, as the tab bar and the segmented
        control mark the place you are in, and right to left the first tab is
        on the right.

        On your own profile a section you have hidden from everybody else is
        still here for you, marked with the closed eye and named "Hidden" to a
        screen reader.
      */}
      <View
        style={[styles.tabs, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}
        accessibilityRole="tablist"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (thirds !== null && thirds !== width) setThirds(null);
          else if (thirds === null && height > TWO_ROWS_AT_LEAST) setThirds(width);
        }}
      >
        {shown.map((s) => {
          const on = s === active;
          const ink = on ? colors.primary : colors.textSecondary;
          const hidden = own && sections?.[s] === false;
          return (
            <Pressable
              key={s}
              onPress={() => setSection(s)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={hidden ? `${t(LABEL[s])}, ${t('profile.hidden')}` : t(LABEL[s])}
              style={({ pressed }) => [
                styles.tab,
                thirds !== null ? styles.tabThird : null,
                on ? { backgroundColor: `${colors.primary}${CHOSEN_WASH}` } : null,
                pressed && heldDim,
              ]}
            >
              <Icon name={GLYPH[s]} size={18} color={ink} />
              <View style={[styles.tabLabel, { flexDirection: dir.row }]}>
                <Text style={[styles.tabText, { color: ink }]}>{t(LABEL[s])}</Text>
                {hidden ? <Icon name="eye-off" size={12} color={ink} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {page === null ? (
        <ActivitySkeleton games={active === 'games'} />
      ) : empty ? (
        <EmptyState title={t('profile.nothingHere')} body={t('profile.nothingHere.body')} />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
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

/**
 * The whole section in grey, for a profile that is itself still loading: the
 * heading, the tab strip, and the first posts.
 */
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

/**
 * A section while it loads: the posts as the cards they will be, or the games
 * as the rows they will be — not a spinner over the space where they arrive.
 */
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
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radii.lg,
    padding: 3,
    gap: 2,
  },
  // the strip's own height: a tab is 50, inside 3 of padding
  tabsSkeleton: { height: TAB_HEIGHT + 3 * 2 },
  // as wide as its word to begin with, then a share of what is left in its row
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
  // three to a row at the most once the strip has two, so the rows come out three and two
  tabThird: { minWidth: '30%' },
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
