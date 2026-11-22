import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { gameEmblemNamed } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { onPostDeleted, samePost, useDeleting } from '../composer/postDeleted';
import { CARD_LABEL_KEY, feedImages, type FeedItem } from '../feed/types';
import { GameArt } from '../games/GameArt';
import { useI18n } from '../i18n/I18nContext';
import { formatCompact } from '../i18n/format';
import type { RootNavigation } from '../navigation/rootStack';
import { useDirection } from '../reports/direction';
import { timing } from '../theme/animate';
import { Icon, type IconName } from '../theme/Icon';
import { duration } from '../theme/motion';
import { PressableScale } from '../theme/MotionParts';
import { Pressable } from '../theme/Pressable';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { PROFILE_SECTIONS, type ProfileSection, type ProfileSections } from './sections';

/** How many tiles a page brings. */
const PAGE = 12;
/** The hairline between tiles. */
const GAP = 2;
const TAB_HEIGHT = 48;
/** How near the end of the page, in points, the next page is asked for. */
const NEAR_END = 600;

const LABEL = {
  posts: 'profile.tab.posts',
  games: 'nav.games',
  likes: 'profile.tab.likes',
  reposts: 'repost.tab',
  saved: 'saved.title',
} as const;

const GLYPH: Record<ProfileSection, IconName> = {
  posts: 'wall',
  games: 'play',
  likes: 'heart',
  reposts: 'repost',
  saved: 'bookmark',
};

/** The mark a post of words wears in its corner, so a poem, a story and a saying tell apart at a glance. */
const WORDS_MARK: Record<string, IconName> = { poem: 'quotes', story: 'story', gotin: 'statement' };

/** A game played, which the route answers as a line in a history rather than a post. */
interface ActivityEntry {
  id: string;
  title: string;
  detail: string | null;
  at: string;
}

interface ActivityPage {
  entries?: ActivityEntry[];
  items?: FeedItem[];
}

/** One profile's tabs and the grid under them; the screen places both, so the tabs can stay under the top bar. */
export interface ProfileActivityState {
  shown: ProfileSection[];
  active: ProfileSection | null;
  choose: (s: ProfileSection) => void;
  /** Sections the owner hid from others; only the owner is shown them. */
  hidden: (s: ProfileSection) => boolean;
  entries: ActivityEntry[];
  items: FeedItem[];
  loading: boolean;
  /** Asks for the next page, when there is one and none is on its way. */
  more: () => void;
}

/** True when a scroll has come near enough to the end of the page that the next tiles should be on their way. */
export function nearEnd(e: NativeSyntheticEvent<NativeScrollEvent>): boolean {
  const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
  return layoutMeasurement.height + contentOffset.y >= contentSize.height - NEAR_END;
}

/**
 * What somebody posted, played, liked, reposted and saved, a tab at a time and a page at a time. A section the owner
 * turned off is not offered to anybody else; on your own profile it stays, marked, so turning it off does not hide it
 * from you.
 */
export function useProfileActivity({
  userId,
  sections,
  own = false,
  reload = 0,
}: {
  userId: string | null | undefined;
  /** What the owner lets people see; null when the profile is private. */
  sections?: ProfileSections | null;
  own?: boolean;
  /** Changed by a pull to refresh, which asks for the open tab again. */
  reload?: number;
}): ProfileActivityState {
  const { client } = useAuth();
  const shown = userId && (own || sections) ? PROFILE_SECTIONS.filter((key) => own || sections?.[key] !== false) : [];
  const [section, setSection] = useState<ProfileSection | null>(null);
  // Recomputed rather than stored, so a tab that disappears is replaced instead of leaving an empty grid.
  const active = section && shown.includes(section) ? section : (shown[0] ?? null);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  // The request that is still wanted; an answer for a tab left meanwhile is dropped.
  const asked = useRef(0);
  const fetching = useRef(false);

  const load = useCallback(
    (kind: ProfileSection, offset: number) => {
      if (!userId) return;
      const ticket = offset === 0 ? ++asked.current : asked.current;
      fetching.current = true;
      if (offset === 0) setLoading(true);
      void client.get<ActivityPage>(`/users/${userId}/activity?kind=${kind}&limit=${PAGE}${offset ? `&offset=${offset}` : ''}`).then((res) => {
        if (ticket !== asked.current) return;
        fetching.current = false;
        // A section that will not load shows as empty rather than as an error: the profile above it is still worth reading.
        const rows = res.ok ? (res.data.entries ?? []) : [];
        const posts = res.ok ? (res.data.items ?? []) : [];
        setEntries((prev) => (offset === 0 ? rows : [...prev, ...rows]));
        setItems((prev) => (offset === 0 ? posts : [...prev, ...posts]));
        // A short page means the end; asking again would return nothing.
        setHasMore(res.ok && (rows.length || posts.length) === PAGE);
        setLoading(false);
      });
    },
    [client, userId],
  );

  useEffect(() => {
    if (active) load(active, 0);
  }, [load, active, reload]);

  // The grid loads a page at a time, so a post deleted from its own page is taken off it here.
  useEffect(() => onPostDeleted((gone) => setItems((prev) => prev.filter((i) => !samePost(i, gone)))), []);
  const deleting = useDeleting();

  const count = active === 'games' ? entries.length : items.length;
  const more = useCallback(() => {
    if (!active || !hasMore || fetching.current || loading) return;
    load(active, count);
  }, [active, hasMore, loading, load, count]);

  return {
    shown,
    active,
    choose: setSection,
    hidden: (s) => own && sections?.[s] === false,
    entries,
    // A post being deleted is gone at once; the last one gone leaves the empty state.
    items: items.filter((item) => !deleting(item)),
    loading,
    more,
  };
}

/**
 * The row of icon tabs: one icon each, named to a screen reader, with a line that slides under the open one. It stands
 * on the page's colour, so the grid scrolls under it while it stays below the top bar.
 */
export function ActivityTabs({ activity, width }: { activity: ProfileActivityState; width: number }): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const { shown, active } = activity;
  const n = Math.max(1, shown.length);
  const tab = width / n;
  const at = active ? shown.indexOf(active) : 0;
  // Right to left, the first tab is on the right, and so is its line.
  const x = (dir.row === 'row-reverse' ? n - 1 - at : at) * tab;
  const ink = useRef(new Animated.Value(x)).current;
  useEffect(() => {
    if (reduce) ink.setValue(x);
    else timing(ink, x, duration.slow).start();
  }, [ink, x, reduce]);

  if (!active) return null;
  return (
    <View style={[styles.tabs, { width, backgroundColor: colors.background, borderBottomColor: colors.separator, flexDirection: dir.row }]} accessibilityRole="tablist">
      {shown.map((s) => {
        const on = s === active;
        const hidden = activity.hidden(s);
        return (
          <Pressable
            key={s}
            onPress={() => activity.choose(s)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={hidden ? `${t(LABEL[s])}, ${t('profile.hidden')}` : t(LABEL[s])}
            style={styles.tab}
          >
            <Icon name={GLYPH[s]} size={24} color={on ? colors.textPrimary : colors.textSecondary} />
            {hidden ? (
              <View style={[styles.lock, { backgroundColor: colors.controlTrack }]}>
                <Icon name="lock" size={11} tone="secondary" />
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <Animated.View pointerEvents="none" style={[styles.ink, { width: tab, backgroundColor: colors.textPrimary, transform: [{ translateX: ink }] }]} />
    </View>
  );
}

/** The open tab's tiles, three to a row: posts as their picture or their words, games as their cover. */
export function ActivityGrid({ activity, width }: { activity: ProfileActivityState; width: number }): React.JSX.Element | null {
  const { t } = useI18n();
  const dir = useDirection();
  const { colors } = useTheme();
  const tile = Math.floor((width - 2 * GAP) / 3);
  const size = { width: tile, height: Math.round(tile * 1.25) };
  if (!activity.active) return null;

  const games = activity.active === 'games';
  if (activity.loading) return <TileSkeletons size={size} width={width} games={games} />;
  const count = games ? activity.entries.length : activity.items.length;
  if (count === 0) {
    return (
      <View style={styles.empty}>
        <View style={[styles.emptyMark, { borderColor: colors.textPrimary }]}>
          <Icon name={GLYPH[activity.active]} size={34} color={colors.textPrimary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('profile.nothingHere')}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.grid, { width, flexDirection: dir.row }]} testID="profile-grid">
      {games ? activity.entries.map((e) => <GameTile key={e.id} entry={e} size={size} />) : activity.items.map((item) => <PostTile key={item.key} item={item} size={size} />)}
    </View>
  );
}

/** The tabs and two rows of tiles, for a profile still loading: the tabs' icons in their cells, the first one marked. */
export function ProfileActivitySkeleton({ width }: { width: number }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const tile = Math.floor((width - 2 * GAP) / 3);
  const tab = width / PROFILE_SECTIONS.length;
  return (
    <View>
      <View style={[styles.tabs, { width, flexDirection: dir.row, borderBottomColor: colors.separator }]}>
        {PROFILE_SECTIONS.map((s) => (
          <View key={s} style={styles.tab}>
            <Skeleton width={24} height={24} radius={radii.sm} />
          </View>
        ))}
        <View style={[styles.ink, { left: dir.row === 'row' ? 0 : width - tab, width: tab, backgroundColor: colors.textPrimary }]} />
      </View>
      <TileSkeletons size={{ width: tile, height: Math.round(tile * 1.25) }} width={width} />
    </View>
  );
}

/** The game captions' first lines, varied so the row reads as different games. */
const CAPTION_WIDTHS = ['72%', '56%', '64%'] as const;

/** Two rows of tiles in the grid's own layout: posts as plain tiles, games as a square cover over the result and the day. */
function TileSkeletons({ size, width, games = false }: { size: { width: number; height: number }; width: number; games?: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.grid, { width, flexDirection: dir.row }]} accessibilityLabel={t('common.loading')}>
      {Array.from({ length: 6 }, (_, i) =>
        games ? (
          // A game tile is painted the placeholder grey, so its boxes take the raised grey to show on it.
          <View key={i} style={[styles.tile, { width: size.width, backgroundColor: colors.controlTrack }]}>
            <Skeleton width={size.width} height={size.width} radius={radii.none} raised />
            <View style={styles.gameCaption}>
              <SkeletonText size={typography.sizes.text} width={CAPTION_WIDTHS[i % CAPTION_WIDTHS.length]} raised />
              <SkeletonText size={typography.sizes.text} width="40%" raised />
            </View>
          </View>
        ) : (
          <Skeleton key={i} width={size.width} height={size.height} radius={radii.none} />
        ),
      )}
    </View>
  );
}

/** A post as a tile: its first picture, or its title and opening words, with how often it was seen. */
function PostTile({ item, size }: { item: FeedItem; size: { width: number; height: number } }): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const pictures = feedImages(item);
  const picture = pictures[0]?.url ?? null;
  const labelKey = CARD_LABEL_KEY[item.kind];
  const label = labelKey ? t(labelKey) : item.kind;
  const name = item.title || item.excerpt || label;
  const mark = picture ? (pictures.length > 1 ? 'tiles' : null) : (WORDS_MARK[item.kind] ?? null);
  return (
    <PressableScale
      onPress={() => (item.targetType === 'library' ? navigation.navigate('LibraryPost', { postId: item.id }) : navigation.navigate('MemeDetail', { postId: item.id }))}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${name}`}
      style={[styles.tile, size, { backgroundColor: colors.controlTrack }]}
    >
      {picture ? (
        <Image source={{ uri: picture }} style={[styles.fill, item.review === 'held' ? styles.held : null]} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        // Clipped to its own box, clear of the mark above and the count below.
        <View style={styles.words}>
          {item.title ? (
            <Text style={[styles.wordsTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={3}>
              {item.title}
            </Text>
          ) : null}
          {item.excerpt ? (
            <Text style={[styles.wordsBody, dir.text, { color: colors.textSecondary }]} numberOfLines={item.title ? 3 : 5}>
              {item.excerpt}
            </Text>
          ) : null}
        </View>
      )}
      {mark ? (
        <View style={[styles.mark, picture ? styles.markOnArt : null]} pointerEvents="none">
          <Icon name={mark} size={16} color={picture ? colors.textOnScrim : colors.textSecondary} />
        </View>
      ) : null}
      {item.viewCount > 0 ? (
        <Foot onArt={!!picture}>
          <Icon name="eye" size={14} color={picture ? colors.textOnScrim : colors.textSecondary} />
          <Text style={[styles.footText, { color: picture ? colors.textOnScrim : colors.textSecondary }]} numberOfLines={1}>
            {formatCompact(item.viewCount, locale)}
          </Text>
        </Foot>
      ) : null}
    </PressableScale>
  );
}

/** A game played: its whole square cover, uncropped, with the result and the day in a caption under it. */
function GameTile({ entry, size }: { entry: ActivityEntry; size: { width: number; height: number } }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const dir = useDirection();
  const emblem = gameEmblemNamed(entry.title);
  const date = when(entry.at, locale);
  return (
    <View
      style={[styles.tile, { width: size.width, backgroundColor: colors.controlTrack }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={[entry.title, entry.detail, date].filter(Boolean).join(', ')}
    >
      <View style={[styles.gameCover, { width: size.width, height: size.width }]}>
        {emblem ? <GameArt game={emblem} size={size.width} square /> : <Icon name="play" size={32} tone="secondary" />}
      </View>
      <View style={styles.gameCaption}>
        <Text style={[styles.footText, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {entry.detail ?? entry.title}
        </Text>
        <Text style={[styles.footDate, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
          {date}
        </Text>
      </View>
    </View>
  );
}

/** The tile's foot: over a picture, on a soft shade so it reads on a pale one as on a dark one. */
function Foot({ onArt, children }: { onArt: boolean; children: React.ReactNode }): React.JSX.Element {
  const dir = useDirection();
  const row = [styles.foot, { flexDirection: dir.row }];
  if (!onArt) return <View style={row} pointerEvents="none">{children}</View>;
  return (
    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.72)']} style={row} pointerEvents="none">
      {children}
    </LinearGradient>
  );
}

/** "3 Sep" / "3 Sep 2024": a year only when it is not this one. */
function when(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

const styles = StyleSheet.create({
  tabs: { height: TAB_HEIGHT, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lock: { position: 'absolute', top: 6, start: '50%', marginStart: 6, width: 18, height: 18, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  ink: { position: 'absolute', bottom: -StyleSheet.hairlineWidth, left: 0, height: 2 },
  grid: { flexWrap: 'wrap', gap: GAP, marginTop: GAP },
  tile: { overflow: 'hidden' },
  gameCover: { alignItems: 'center', justifyContent: 'center' },
  gameCaption: { paddingHorizontal: spacing.sm, paddingTop: 6, paddingBottom: spacing.sm },
  fill: { width: '100%', height: '100%' },
  held: { opacity: 0.55 },
  words: { position: 'absolute', top: 10, left: 10, right: 10, bottom: 30, overflow: 'hidden', gap: 4 },
  wordsTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, lineHeight: 20, paddingEnd: 18 },
  wordsBody: { fontSize: typography.sizes.text, lineHeight: 21 },
  mark: { position: 'absolute', top: 8, end: 8 },
  markOnArt: { shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 4, paddingTop: 28, paddingBottom: 6, paddingHorizontal: spacing.sm },
  footText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  footDate: { fontSize: typography.sizes.text, opacity: 0.85 },
  empty: { alignItems: 'center', gap: spacing.md - 4, paddingTop: spacing.xl + 8, paddingBottom: spacing.lg, paddingHorizontal: spacing.md },
  emptyMark: { width: 72, height: 72, borderWidth: 2, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, textAlign: 'center' },
});
