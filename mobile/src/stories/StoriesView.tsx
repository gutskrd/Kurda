import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../theme/Pressable';
import Svg, { Circle } from 'react-native-svg';
import { STORY_DIALECTS, type StoryCategory, type StoryDialect, type StoryGameSummary, type StoryLibrary, type StoryListItem } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { HeaderButton } from '../navigation/HeaderButton';
import type { RootNavigation } from '../navigation/rootStack';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { JoinCodeSheet } from '../play/JoinByCode';
import { useDirection } from '../reports/direction';
import { useListEntrance } from '../theme/animate';
import { display, sectionLabel } from '../theme/fonts';
import { ClayButton, ErrorRetry, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale, Rise, heldDim } from '../theme/MotionParts';
import { SearchField } from '../theme/SearchField';
import { Skeleton, SkeletonText, lineOf } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { activeGames, getLibrary, listStories, searchStories, setBookmark } from './api';
import { StoryCover } from './covers';
import { DIALECT_NAME, MODE_KEY, categoryLabel, categoryTitle, levelName } from './labels';
import { LibraryFilterChips, LibraryFilterSheet, NO_FILTER, activeParts, filterButtonLabel, isFiltering, isPlainFilter, libraryQuery, type LibraryFilter } from './LibraryFilter';
import { shownDialect, useStoryPrefs } from './prefs';
import { SetupSheet } from './SetupSheet';
import { storyRowStyle, storyTextProps, storyTextStyle } from './storyText';
import { COLUMN, Note, Pill } from './ui';
import { usePullRefresh } from '../net/usePullRefresh';
import { pressedDim } from '../theme/motion';
import { LoreEntry } from '../lore/LoreEntry';
import { textIn } from '../lore/labels';
import { metaFor } from './legend';

/** A story's row in every list it is in, with `me` changed: a bookmark flips everywhere at once. */
function withMe(list: StoryListItem[], id: string, patch: (me: StoryListItem['me']) => StoryListItem['me']): StoryListItem[] {
  return list.map((s) => (s.id === id ? { ...s, me: patch(s.me) } : s));
}

/** The category whose stories the server sends on a shelf of their own (`legends`), and which names that shelf. */
const LEGEND_CATEGORY = 'legend';

/** How long typing is left alone before the list is asked for it. */
const SEARCH_DEBOUNCE_MS = 300;

/** The variety switch's height (the segmented control as a radio group: a fingertip, and its track's padding), for the bar that holds its place. */
const VARIETY_SWITCH_HEIGHT = 46;

/**
 * The library (Learn → Stories, and the Stories route): what to read, and a
 * way to find it.
 *
 * One variety at a time. A switch over the search, Kurmancî | Soranî, says
 * which, and everything under it follows: the newest and the editors' picks,
 * the categories and their counts, the levels the filter offers, the search,
 * "n of N stories read", and the variety a game with friends is set up in.
 * A legend told in both varieties is one story with two tellings, so it
 * stands on the shelf once and not twice side by side. The switch opens on
 * the variety chosen last time on this phone (Soranî for a Soranî interface
 * before any choice, otherwise Kurmancî) and keeps a new choice; the reader
 * keeps the same choice (StoryReaderScreen). Only the reader's own shelves —
 * what they are reading, what they bookmarked — hold what they hold whatever
 * its variety. A variety's page is kept once it has been shown, so going back
 * to it is at once, and it is asked for again behind what is on screen.
 *
 * Signed in, the shelf opens on how the reading is going — stories finished
 * out of the variety's published ones, the mean score on its checks — then
 * the stories to go back to, the editors' picks, the legends (a shelf of
 * their own, which no newer story can push a legend off), the newest, the
 * categories, and the ones bookmarked. Anything typed in the search, or anything chosen
 * in the sort and filter sheet behind the funnel beside it
 * (stories/LibraryFilter.tsx), turns the shelves into one paged list of what
 * matches, with "More" at its foot; a chip under the search says each thing
 * that is on. A guest sees the same shelves without the personal rows, since
 * the server keeps none for them.
 *
 * Each story is a card with its cover (the editor's picture, or the kilim the
 * story is given when it has none: stories/covers.tsx), its title and a line
 * of its summary, its level by its plain name, how long it takes, its
 * category, a headphones mark when it is read aloud, a bookmark toggle that
 * answers at once and asks the server after, and a hairline of how far it has
 * been read. Tapping a card opens the story's overview (StoryReaderScreen).
 *
 * Above the switch, the library's two companions: the riddles (Metelok) and
 * the proverbs (Gotinên pêşiyan), each a screen of its own (lore/), so the
 * three collections share one home without a new place in the tab bar.
 *
 * At the foot, the two ways into a game with other people on a story — set
 * one up, or join one with the code a friend gave you (the same boxes as on
 * the Games hub, since a code now opens any of the games) — which used to be
 * the hub's whole reason; they are the games' social half and stay here, under
 * the reading.
 */
export function StoriesView({ scrollRef, inTab = false }: { scrollRef?: Ref<ScrollView>; inTab?: boolean }): React.JSX.Element {
  const { client, isGuest } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const tabBarInset = useTabBarInset();
  const { prefs, ready, update } = useStoryPrefs();
  const { width } = useWindowDimensions();
  // the one variety on show: what the switch says, which is what this phone remembers
  const dialect = shownDialect(locale, prefs.dialect);

  // each variety's front page, kept once shown: going back to one is at once, with the new answer taking its place when it comes
  const [libraries, setLibraries] = useState<Partial<Record<StoryDialect, StoryLibrary>>>({});
  const [libraryFailed, setLibraryFailed] = useState<{ dialect: StoryDialect; error: ApiError } | null>(null);
  const [active, setActive] = useState<StoryGameSummary[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER);
  const [sheetOpen, setSheetOpen] = useState(false);
  // a list belongs to the variety it was asked in: one from before the switch moved is not shown under the other's name
  const [found, setFound] = useState<{ dialect: StoryDialect; stories: StoryListItem[]; total: number } | null>(null);
  const [resultsError, setResultsError] = useState<ApiError | null>(null);
  const [searching, setSearching] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState<{ dialect: StoryDialect; stories: StoryListItem[] } | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const library = libraries[dialect] ?? null;
  const libraryError = libraryFailed?.dialect === dialect ? libraryFailed.error : null;
  const results = found?.dialect === dialect ? found : null;
  const filtering = isFiltering(q, filter);
  const personal = !isGuest;

  const load = useCallback(() => {
    // which variety to ask for is not known until what this phone remembers has been read: a moment, and the shelves' shape meanwhile
    if (!ready) return Promise.resolve();
    setLibraryFailed(null);
    const shelves = getLibrary(client, dialect).then((res) => {
      if (res.ok) setLibraries((was) => ({ ...was, [dialect]: res.data }));
      else setLibraryFailed({ dialect, error: res.error });
    });
    // a guest has no games to go back to, and the server refuses the question
    const games = isGuest
      ? null
      : activeGames(client).then((res) => {
          if (res.ok) setActive(res.data.games);
        });
    return Promise.all([shelves, games]);
  }, [client, isGuest, dialect, ready]);

  // again on coming back: a story just finished leaves "Continue reading", a check just taken moves the average
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // and when pulled down, as Learn's lessons are
  const pull = usePullRefresh(load);

  // what was typed or chosen, in the variety on show, after a short pause for more typing
  const search = useRef(0);
  useEffect(() => {
    if (!filtering || !ready) {
      setFound(null);
      setResultsError(null);
      setSearching(false);
      return;
    }
    const run = (search.current += 1);
    setSearching(true);
    setResultsError(null);
    const timer = setTimeout(() => {
      void searchStories(client, libraryQuery(q, filter, dialect)).then((res) => {
        if (run !== search.current) return;
        setSearching(false);
        if (res.ok) setFound({ dialect, ...res.data });
        else setResultsError(res.error);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [client, q, filter, filtering, dialect, ready]);

  const more = async (): Promise<void> => {
    if (!results || moreBusy) return;
    const run = search.current;
    setMoreBusy(true);
    const res = await searchStories(client, libraryQuery(q, filter, dialect, results.stories.length));
    setMoreBusy(false);
    // the page after the list on show: let go if another list was asked for (new words, a filter, the switch) while it was on its way
    if (run !== search.current) return;
    if (!res.ok) {
      setNotice(describeError(res.error, t));
      return;
    }
    setFound((was) => {
      if (!was) return was;
      // a story published meanwhile moves every later one down a place: one already on the list is not listed twice
      const have = new Set(was.stories.map((s) => s.id));
      return { ...was, stories: [...was.stories, ...res.data.stories.filter((s) => !have.has(s.id))], total: res.data.total };
    });
  };

  /** The switch: the other variety's page, and the choice kept on this phone for the library and the reader alike. */
  const chooseDialect = (next: StoryDialect): void => {
    if (next === dialect && prefs.dialect === next) return;
    setNotice(null);
    update({ dialect: next });
  };

  /** The shelf flips at once; the server is asked after, and a refusal flips it back and says why. */
  const toggleBookmark = (story: StoryListItem): void => {
    const on = !(story.me?.bookmarked ?? false);
    haptic('tap');
    setNotice(null);
    const apply = (value: boolean) => {
      const patch = (me: StoryListItem['me']) => ({
        bookmarked: value,
        paragraph: me?.paragraph ?? 0,
        share: me?.share ?? 0,
        finishedAt: me?.finishedAt ?? null,
        bestCorrect: me?.bestCorrect ?? null,
        total: me?.total ?? null,
        attemptsToday: me?.attemptsToday ?? 0,
      });
      setFound((r) => (r ? { ...r, stories: withMe(r.stories, story.id, patch) } : r));
      // on both varieties' pages: the Bookmarks shelf is the reader's own, and holds the story whichever is on show
      setLibraries((was) => {
        const next: Partial<Record<StoryDialect, StoryLibrary>> = {};
        for (const d of STORY_DIALECTS) {
          const lib = was[d];
          if (!lib) continue;
          const marked = { ...story, me: patch(story.me) };
          const bookmarks = value
            ? [marked, ...lib.bookmarks.filter((s) => s.id !== story.id)]
            : lib.bookmarks.filter((s) => s.id !== story.id);
          next[d] = {
            ...lib,
            featured: withMe(lib.featured, story.id, patch),
            legends: lib.legends ? withMe(lib.legends, story.id, patch) : lib.legends,
            recent: withMe(lib.recent, story.id, patch),
            continue: withMe(lib.continue, story.id, patch),
            bookmarks,
          };
        }
        return next;
      });
    };
    apply(on);
    void setBookmark(client, story.id, on).then((res) => {
      if (res.ok) return;
      apply(!on);
      setNotice(describeError(res.error, t));
    });
  };

  const open = (story: StoryListItem): void => navigation.navigate('StoryReader', { slug: story.slug });

  /**
   * A game with friends is set up in the variety on show. The setup sheet wants that variety's stories; they are
   * fetched as it opens, so the pick list is whole — the button is busy meanwhile, and a list that does not come
   * is said rather than opened empty.
   */
  const openSetup = (): void => {
    if (setupBusy) return;
    setSetupBusy(true);
    setNotice(null);
    void listStories(client, { dialect }).then((res) => {
      setSetupBusy(false);
      if (res.ok) setSetupOpen({ dialect, stories: res.data.stories });
      else setNotice(describeError(res.error, t));
    });
  };

  // two to a row on a phone, three across a tablet, each as wide as its share of the column
  const column = Math.min(width, layout.column) - layout.gutter * 2;
  const columns = column >= 560 ? 3 : 2;
  const cardWidth = Math.floor((column - layout.rowGap * (columns - 1)) / columns);
  const categories = library?.categories;
  const delayFor = useListEntrance(library !== null);

  /** A shelf's cards; on a shelf that is one category's, the cards do not each say it again (`filed: false`). */
  const grid = (stories: readonly StoryListItem[], from = 0, filed = true): ReactNode => (
    <View style={[styles.grid, { flexDirection: dir.row }]}>
      {stories.map((s, i) => (
        <Rise key={s.id} delay={delayFor(from + i)} style={{ width: cardWidth }}>
          <StoryCard story={s} categories={filed ? categories : undefined} filed={filed} onOpen={() => open(s)} onBookmark={() => toggleBookmark(s)} />
        </Rise>
      ))}
    </View>
  );

  // what is on, for the chips under the search and the funnel's name
  const parts = activeParts(filter, t, library, locale);
  /** Back to the shelves: the search emptied and nothing chosen. */
  const startOver = (): void => {
    setQ('');
    setFilter(NO_FILTER);
  };

  let body: ReactNode;
  if (filtering) {
    const count = results?.total ?? 0;
    body = (
      <View style={styles.section}>
        <View style={[styles.resultsHead, { flexDirection: dir.row }]}>
          <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header" accessibilityLiveRegion="polite">
            {results && !searching ? t(count === 1 ? 'stories.library.found.one' : 'stories.library.found', { count: formatNumber(count, locale) }) : t('common.loading')}
          </Text>
          {/* with two chips or more, their "Clear all" already says this */}
          {parts.length < 2 ? (
            <Pressable onPress={startOver} accessibilityRole="button" style={({ pressed }) => [styles.clear, pressed && heldDim]} hitSlop={8}>
              <Text style={[styles.clearText, { color: colors.primary }]}>{t('stories.library.clearFilters')}</Text>
            </Pressable>
          ) : null}
        </View>
        {searching && !results ? (
          <GridSkeleton cardWidth={cardWidth} count={columns * 2} />
        ) : resultsError ? (
          <ErrorRetry message={describeError(resultsError, t)} onRetry={() => setFilter({ ...filter })} />
        ) : results && results.stories.length === 0 ? (
          <Note icon="story">{t('stories.library.empty')}</Note>
        ) : results ? (
          <>
            {grid(results.stories)}
            {results.stories.length < results.total ? (
              <ClayButton label={t('stories.library.more')} variant="outline" busy={moreBusy} onPress={() => void more()} />
            ) : null}
          </>
        ) : null}
      </View>
    );
  } else if (library === null && !libraryError) {
    body = <LibrarySkeleton cardWidth={cardWidth} columns={columns} personal={personal} />;
  } else if (libraryError && !library) {
    body = <ErrorRetry message={describeError(libraryError, t)} onRetry={load} />;
  } else if (library) {
    const shelves: Array<{ key: string; title: string; stories: StoryListItem[]; filed?: boolean }> = [
      ...(personal ? [{ key: 'continue', title: t('stories.library.continue'), stories: library.continue }] : []),
      { key: 'featured', title: t('stories.library.featured'), stories: library.featured },
      // the legends, on a shelf of their own under their category's own name, so no newer story pushes one off the page
      { key: 'legends', title: categoryLabel(LEGEND_CATEGORY, library.categories, locale, t) ?? '', stories: library.legends ?? [], filed: false },
      { key: 'recent', title: t('stories.library.recent'), stories: library.recent },
    ];
    let shown = 0;
    body = (
      <>
        {personal && library.me ? <ProgressCard me={library.me} /> : null}
        {personal && active.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('stories.continue')}
            </Text>
            {active.map((g) => (
              <ContinueCard key={g.id} game={g} onOpen={() => navigation.navigate('StoryGame', { id: g.id })} />
            ))}
          </View>
        ) : null}
        {library.total === 0 ? <Note icon="story">{t('stories.library.emptyAll')}</Note> : null}
        {shelves.map((shelf) => {
          if (shelf.stories.length === 0) return null;
          const from = shown;
          shown += shelf.stories.length;
          return (
            <View key={shelf.key} style={styles.section}>
              <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
                {shelf.title}
              </Text>
              {grid(shelf.stories, from, shelf.filed ?? true)}
            </View>
          );
        })}
        {library.total > 0 && library.categories.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('stories.library.categories')}
            </Text>
            <View style={[styles.categories, { flexDirection: dir.row }]}>
              <ShelfChip label={t('stories.library.all')} onPress={() => setFilter({ ...NO_FILTER, all: true })} count={library.total} />
              {library.categories
                .filter((c) => c.count > 0)
                .map((c) => (
                  <ShelfChip key={c.slug} label={categoryTitle(c, locale, t)} count={c.count} onPress={() => setFilter({ ...NO_FILTER, category: c.slug })} />
                ))}
            </View>
          </View>
        ) : null}
        {personal && library.bookmarks.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('stories.library.bookmarks')}
            </Text>
            {grid(library.bookmarks, shown)}
          </View>
        ) : null}
        {personal ? (
          <View style={styles.section}>
            <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('stories.library.together')}
            </Text>
            <View style={styles.actions}>
              <ClayButton label={t('stories.together.setup')} icon="user-plus" tone="primary" disabled={library.total === 0} busy={setupBusy} onPress={openSetup} />
              <ClayButton label={t('stories.join.open')} icon="ticket" onPress={() => setJoinOpen(true)} />
            </View>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: inTab ? tabBarInset : spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={pull}
      >
        <LoreEntry />
        {/* which Kurdish the library is in: everything below is this variety's; a bar of its height stands in for the instant its place is read */}
        {ready ? (
          <Segmented<StoryDialect>
            options={STORY_DIALECTS}
            value={dialect}
            onChange={chooseDialect}
            labelOf={(d) => DIALECT_NAME[d]}
            groupLabel={t('stories.variety')}
          />
        ) : (
          <Skeleton width="100%" height={VARIETY_SWITCH_HEIGHT} radius={radii.pill} />
        )}
        <View style={[styles.searchRow, { flexDirection: dir.row }]}>
          {/* the app's one search field, in place of a copy of it built here */}
          <SearchField value={q} onChangeText={setQ} label={t('stories.library.search')} style={styles.search} />
          {/* sorting and narrowing is one button beside the search, filled while anything is on */}
          <HeaderButton
            icon={isPlainFilter(filter) ? 'filter' : 'filter-fill'}
            label={filterButtonLabel(parts, t)}
            onPress={() => setSheetOpen(true)}
            testID="stories-filter"
          />
        </View>
        <LibraryFilterChips
          parts={parts}
          onOpen={() => setSheetOpen(true)}
          onUndo={(undo) => setFilter({ ...filter, ...undo })}
          onClearAll={() => setFilter({ ...NO_FILTER })}
        />
        {notice ? <Note tone="danger" icon="alert">{notice}</Note> : null}
        {body}
      </ScrollView>

      {setupOpen ? (
        <SetupSheet
          dialect={setupOpen.dialect}
          stories={setupOpen.stories}
          initialMode="duo"
          onClose={() => setSetupOpen(null)}
          onCreated={(view) => {
            setSetupOpen(null);
            navigation.navigate('StoryGame', { id: view.id });
          }}
        />
      ) : null}
      {/* a game's code opens it, whichever of the games it turns out to be */}
      {joinOpen ? <JoinCodeSheet onClose={() => setJoinOpen(false)} /> : null}
      <LibraryFilterSheet
        visible={sheetOpen}
        value={filter}
        q={q}
        dialect={dialect}
        library={library}
        shownTotal={filtering && results && !searching ? results.total : null}
        onApply={setFilter}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

/** A chip on the Categories shelf: a way into that shelf, with how many stories it holds. */
function ShelfChip({ label, onPress, count }: { label: string; onPress: () => void; count: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  return (
    <Pressable
      onPress={() => {
        haptic('select');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${formatNumber(count, locale)}`}
      // drawn 36 points tall, caught at a fingertip's 44
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [styles.chip, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
    >
      <Text style={[styles.chipText, { color: colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.chipCount, { color: colors.textSecondary }]}>{formatNumber(count, locale)}</Text>
    </Pressable>
  );
}

/** A ring filled to `fraction`, drawn once where it stands: the reading so far, not a moment to watch. */
function Ring({ fraction, size, color }: { fraction: number; size: number; color: string }): React.JSX.Element {
  const { colors } = useTheme();
  const stroke = Math.max(5, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.controlTrack} strokeWidth={stroke} fill="none" />
      {f > 0 ? (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - f)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
    </Svg>
  );
}

/** How the reading is going: stories finished out of all published, and the mean score on the checks. */
function ProgressCard({ me }: { me: NonNullable<StoryLibrary['me']> }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const fraction = me.total > 0 ? me.finished / me.total : 0;
  const percent = Math.round(fraction * 100);
  const average = me.averageScore === null ? null : Math.round(me.averageScore * 100);
  const read = t('stories.library.finishedOf', { finished: formatNumber(me.finished, locale), total: formatNumber(me.total, locale) });
  const score = average === null ? t('stories.library.noScore') : `${formatNumber(average, locale)}%`;
  return (
    <View
      style={[styles.progress, { backgroundColor: colors.surface, flexDirection: dir.row }]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${t('stories.library.progressTitle')}. ${read}. ${t('stories.library.averageScore')}: ${score}`}
    >
      <View style={styles.ring}>
        {/* how far along the reading is: the violet of progress, as the course's bar is (gold is for what is earned) */}
        <Ring fraction={fraction} size={64} color={colors.primary} />
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={[styles.ringText, { color: colors.textPrimary }]} numberOfLines={1}>
            {formatNumber(percent, locale)}%
          </Text>
        </View>
      </View>
      <View style={styles.progressText}>
        <Text style={[styles.progressTitle, dir.text, { color: colors.textPrimary }]}>{t('stories.library.progressTitle')}</Text>
        <Text style={[styles.progressLine, dir.text, { color: colors.textSecondary }]}>{read}</Text>
        <Text style={[styles.progressLine, dir.text, { color: colors.textSecondary }]}>
          {t('stories.library.averageScore')} · <Text style={{ color: average === null ? colors.textSecondary : colors.goldText }}>{score}</Text>
        </Text>
      </View>
    </View>
  );
}

/** A game to go back to: where it stands, and one word to carry on. */
function ContinueCard({ game, onOpen }: { game: StoryGameSummary; onOpen: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const where =
    game.status === 'lobby'
      ? t('stories.status.lobby')
      : game.status === 'reading'
        ? t('stories.status.reading')
        : t('stories.questionOf', { index: game.currentIndex + 1, total: game.total });
  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="button"
      // the story's title is read in the story's language; the app's words about it go in the value
      accessibilityLabel={game.storyTitle}
      {...storyTextProps(game.dialect)}
      accessibilityValue={{ text: `${t(MODE_KEY[game.mode])}, ${where}` }}
      accessibilityHint={t('stories.continue')}
      style={[styles.continue, { backgroundColor: colors.surface }]}
    >
      <View style={styles.rowMain}>
        <Text {...storyTextProps(game.dialect)} style={[styles.rowTitle, { color: colors.textPrimary }, storyTextStyle(game.dialect)]} numberOfLines={1}>
          {game.storyTitle}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {t(MODE_KEY[game.mode])} · {where}
        </Text>
      </View>
      <Text style={[styles.continueText, { color: colors.primary }]}>{t('stories.continueButton')}</Text>
      <Icon name="chevron-right" size={16} color={colors.primary} />
    </PressableScale>
  );
}

/** The cover's shape: as wide as the card, five eighths as tall. */
const COVER_RATIO = 0.625;

/**
 * One story on the shelf. The title is read in the story's own language, its
 * facts in the app's; the bookmark is a button of its own on the cover. On a
 * shelf that is one category's (the legends') the card leaves its category
 * out (`filed`): the shelf's name says it once for all of them.
 */
export function StoryCard({
  story,
  categories,
  filed = true,
  onOpen,
  onBookmark,
}: {
  story: StoryListItem;
  categories: readonly StoryCategory[] | undefined;
  filed?: boolean;
  onOpen: () => void;
  onBookmark: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const minutes = t('stories.aboutMinutes', { count: story.readingMinutes });
  const category = filed ? categoryLabel(story.category, categories, locale, t) : null;
  const narrated = story.audioCoverage === 'full' ? t('stories.library.narrated') : story.audioCoverage === 'partial' ? t('stories.library.partlyNarrated') : null;
  const share = story.me?.finishedAt ? 1 : (story.me?.share ?? 0);
  const level = levelName(story.level, t);
  const facts = [level, category, minutes, narrated, story.me?.finishedAt ? t('stories.library.finished') : share > 0 ? t('stories.library.progress', { percent: Math.round(share * 100) }) : null]
    .filter((f): f is string => !!f)
    .join(', ');
  const bookmarked = story.me?.bookmarked ?? false;
  // the title in the reader's language, under the Kurdish one, where the story is not in theirs
  const meta = metaFor(story, locale);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <PressableScale
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={story.title}
        {...storyTextProps(story.dialect)}
        accessibilityValue={{ text: facts }}
        style={styles.cardBody}
      >
        <View style={styles.coverBox}>
          <StoryCover slug={story.slug} cover={story.cover} style={styles.cover} radius={radii.sm} />
          {share > 0 ? (
            <View style={[styles.hairline, { backgroundColor: colors.scrim }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={[styles.hairlineFill, { width: `${Math.round(share * 100)}%`, backgroundColor: colors.primary }]} />
            </View>
          ) : null}
        </View>
        <Text {...storyTextProps(story.dialect)} style={[styles.title, { color: colors.textPrimary }, storyTextStyle(story.dialect)]} numberOfLines={2}>
          {story.title}
        </Text>
        {meta?.title ? (
          // two lines, as the Kurdish title has: on one, "The Fortress of Dimdim and the Golden-Handed Khan" was "The Fortress of Dimdi…"
          <Text {...textIn(meta.lang).props} style={[styles.titleTranslation, { color: colors.textSecondary }, textIn(meta.lang).style]} numberOfLines={2}>
            {meta.title}
          </Text>
        ) : null}
        {story.summary ? (
          <Text {...storyTextProps(story.dialect)} style={[styles.summary, { color: colors.textSecondary }, storyTextStyle(story.dialect)]} numberOfLines={2}>
            {story.summary}
          </Text>
        ) : null}
        {/*
          The level and the minutes on one row, which takes a second when a long level name leaves the minutes no room;
          the category on a line of its own under them. Side by side in half a phone's width, the category was the part
          that gave way, cut to "Legends …". The facts stand at the card's foot, so along a row of cards they are level
          whatever the titles above them run to.
        */}
        <View style={styles.foot}>
          <View style={[styles.facts, storyRowStyle(story.dialect), { flexDirection: dir.row }]}>
            {/* a level is information, not a prize: the quiet pill */}
            <Pill label={level} />
            <Text style={[styles.factText, { color: colors.textSecondary }]}>{minutes}</Text>
            {narrated ? <Icon name="headphones" size={14} color={colors.textSecondary} /> : null}
            {story.me?.finishedAt ? <Icon name="check" size={14} color={colors.primary} /> : null}
          </View>
          {category ? (
            <Text style={[styles.category, dir.text, { color: colors.textSecondary, textAlign: storyTextStyle(story.dialect).textAlign }]} numberOfLines={2}>
              {category}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      <Pressable
        onPress={onBookmark}
        accessibilityRole="button"
        accessibilityLabel={bookmarked ? t('stories.library.bookmarked') : t('stories.library.bookmark')}
        accessibilityState={{ selected: bookmarked }}
        hitSlop={6}
        style={({ pressed }) => [styles.bookmark, { backgroundColor: colors.surface, opacity: pressed ? pressedDim : 1 }]}
      >
        {/* on is violet, as everything chosen is */}
        <Icon name={bookmarked ? 'bookmark-fill' : 'bookmark'} size={18} color={bookmarked ? colors.primary : colors.textSecondary} />
      </Pressable>
    </View>
  );
}

/** display(17) sets 1.12 */
const TITLE_LINE = Math.round(typography.sizes.md * typography.displayLineHeight);

function GridSkeleton({ cardWidth, count }: { cardWidth: number; count: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.grid} accessibilityLabel={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { width: cardWidth, backgroundColor: colors.surface }]}>
          <View style={styles.cardBody}>
            <Skeleton width="100%" height={Math.round((cardWidth - spacing.sm * 2) * COVER_RATIO)} radius={radii.sm} />
            <SkeletonText size={typography.sizes.md} lineHeight={TITLE_LINE} width={i % 2 ? '70%' : '85%'} />
            <SkeletonText size={typography.sizes.xs} lineHeight={18} width="92%" />
            <View style={styles.facts}>
              <Skeleton width={56} height={lineOf(typography.sizes.xs) + 6} radius={radii.pill} />
              <Skeleton width={44} height={lineOf(typography.sizes.xs)} />
            </View>
            <SkeletonText size={typography.sizes.xs} lineHeight={18} width="55%" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** The shelves while they load: the progress card's shape, then two rows of cards. */
function LibrarySkeleton({ cardWidth, columns, personal }: { cardWidth: number; columns: number; personal: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.sections} accessibilityLabel={t('common.loading')}>
      {personal ? (
        <View style={[styles.progress, { backgroundColor: colors.surface }]}>
          <Skeleton width={64} height={64} radius={radii.pill} />
          <View style={styles.progressText}>
            <SkeletonText size={typography.sizes.md} width="50%" />
            <SkeletonText size={typography.sizes.sm} width="80%" />
            <SkeletonText size={typography.sizes.sm} width="65%" />
          </View>
        </View>
      ) : null}
      <View style={styles.section}>
        <SkeletonText size={typography.sizes.xs} width={96} />
        <GridSkeleton cardWidth={cardWidth} count={columns} />
      </View>
      <View style={styles.section}>
        <SkeletonText size={typography.sizes.xs} width={120} />
        <GridSkeleton cardWidth={cardWidth} count={columns} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { ...COLUMN, paddingHorizontal: layout.gutter, paddingTop: spacing.sm, gap: spacing.lg },
  sections: { gap: spacing.lg },
  section: { gap: spacing.sm },
  heading: { ...sectionLabel },
  searchRow: { alignItems: 'center', gap: spacing.xs },
  search: { flex: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md - 2,
  },
  chipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  chipCount: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  categories: { flexWrap: 'wrap', gap: spacing.sm },
  resultsHead: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  clear: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  clearText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  grid: { flexWrap: 'wrap', gap: layout.rowGap },
  // a row's cards are as tall as its tallest: each fills the place the row gives it, so their feet line up
  card: { flexGrow: 1, borderRadius: radii.lg, position: 'relative' },
  cardBody: { flexGrow: 1, padding: spacing.sm, gap: spacing.xs },
  coverBox: { position: 'relative' },
  cover: { width: '100%', aspectRatio: 1 / COVER_RATIO },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, borderBottomLeftRadius: radii.sm, borderBottomRightRadius: radii.sm, overflow: 'hidden' },
  hairlineFill: { height: 4 },
  title: { ...display(typography.sizes.md), lineHeight: Math.round(typography.sizes.md * 1.2), marginTop: 2 },
  summary: { fontSize: typography.sizes.xs, lineHeight: 18 },
  titleTranslation: { fontSize: typography.sizes.xs, lineHeight: 18, fontWeight: typography.weights.semibold, marginTop: -2 },
  foot: { marginTop: 'auto', gap: spacing.xs },
  facts: { flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  factText: { fontSize: typography.sizes.xs },
  category: { fontSize: typography.sizes.xs, lineHeight: 18 },
  bookmark: {
    position: 'absolute',
    top: spacing.sm + 6,
    right: spacing.sm + 6,
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: { alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, padding: spacing.md },
  ring: { width: 64, height: 64, position: 'relative' },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  progressText: { flex: 1, gap: 2 },
  progressTitle: { ...display(typography.sizes.md), lineHeight: Math.round(typography.sizes.md * 1.2) },
  progressLine: { fontSize: typography.sizes.sm, lineHeight: 20 },
  continue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 60,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  rowMeta: { fontSize: typography.sizes.sm },
  continueText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  // stacked: side by side, "Play with friends" wraps onto two lines in most languages
  actions: { gap: spacing.sm },
});
