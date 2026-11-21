import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable, ReachGroup } from '../theme/Pressable';
import Svg, { Circle } from 'react-native-svg';
import { STORY_DIALECTS, type StoryCategory, type StoryDialect, type StoryGameSummary, type StoryLibrary, type StoryListItem } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { useIntents } from '../api/optimistic';
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
import { MODE_KEY, categoryLabel, categoryTitle, levelName } from './labels';
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
import { dialectNameKey } from '../i18n/dialectName';

/** Applies a `me` change to a story in a list, so a bookmark flips everywhere at once. */
function withMe(list: StoryListItem[], id: string, patch: (me: StoryListItem['me']) => StoryListItem['me']): StoryListItem[] {
  return list.map((s) => (s.id === id ? { ...s, me: patch(s.me) } : s));
}

/** The category the server sends on its own shelf (`legends`), which also names that shelf. */
const LEGEND_CATEGORY = 'legend';

/** How long typing settles before the list is requested. */
const SEARCH_DEBOUNCE_MS = 300;

/** The variety switch's height (a fingertip plus its track's padding), for the placeholder that holds its place. */
const VARIETY_SWITCH_HEIGHT = 46;

/**
 * The library (Learn → Stories, and the Stories route). It shows one variety at a time, chosen by a Kurmancî/Soranî
 * switch that everything below follows; the choice is shared with the reader (StoryReaderScreen) and remembered on
 * this phone. A legend told in both varieties is one story with two tellings. Only the reader's own shelves hold
 * stories of either variety. A variety's page is kept once shown and refreshed behind it.
 *
 * Signed in, the shelves are: reading progress, stories to continue, editors' picks, legends (on their own shelf so
 * newer stories cannot push them off), newest, categories and bookmarks. Typing or filtering (stories/LibraryFilter)
 * turns the shelves into one paged list. Guests see the same shelves without the personal ones.
 *
 * Each card shows the cover (stories/covers.tsx), title and summary line, level, length, category, a narration mark,
 * an optimistic bookmark toggle, and reading progress; tapping opens the story's overview. Above the switch sit the
 * riddles and proverbs (lore/), and at the foot the ways into a story game with others: set one up, or join by code.
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
  // The one variety on show: what the switch says and this phone remembers.
  const dialect = shownDialect(locale, prefs.dialect);

  // Each variety's front page, kept once shown so switching back is instant; the new answer replaces it on arrival.
  const [libraries, setLibraries] = useState<Partial<Record<StoryDialect, StoryLibrary>>>({});
  const [libraryFailed, setLibraryFailed] = useState<{ dialect: StoryDialect; error: ApiError } | null>(null);
  const [active, setActive] = useState<StoryGameSummary[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER);
  const [sheetOpen, setSheetOpen] = useState(false);
  // A list belongs to the variety it was requested in, so one from before a switch is not shown under the other.
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
    // The variety is unknown until the stored preference is read, which takes a moment; the shelves' shape shows meanwhile.
    if (!ready) return Promise.resolve();
    setLibraryFailed(null);
    const shelves = getLibrary(client, dialect).then((res) => {
      if (res.ok) setLibraries((was) => ({ ...was, [dialect]: res.data }));
      else setLibraryFailed({ dialect, error: res.error });
    });
    // A guest has no games to continue, and the server refuses the request.
    const games = isGuest
      ? null
      : activeGames(client).then((res) => {
          if (res.ok) setActive(res.data.games);
        });
    return Promise.all([shelves, games]);
  }, [client, isGuest, dialect, ready]);

  // Reload on return: a story just finished leaves "Continue reading", and a check just taken moves the average.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // And on pull to refresh, as Learn's lessons do.
  const pull = usePullRefresh(load);

  // The search and choices, in the variety on show, after a short pause for more typing.
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
    // The next page: dropped if another list was requested (new words, a filter, the switch) while it was in flight.
    if (run !== search.current) return;
    if (!res.ok) {
      setNotice(describeError(res.error, t));
      return;
    }
    setFound((was) => {
      if (!was) return was;
      // A story published meanwhile shifts later ones down a place, so skip any already listed.
      const have = new Set(was.stories.map((s) => s.id));
      return { ...was, stories: [...was.stories, ...res.data.stories.filter((s) => !have.has(s.id))], total: res.data.total };
    });
  };

  /** The switch: shows the other variety's page and remembers the choice for the library and the reader. */
  const chooseDialect = (next: StoryDialect): void => {
    if (next === dialect && prefs.dialect === next) return;
    setNotice(null);
    update({ dialect: next });
  };

  /** Puts a story on or off the shelves it shows on, everywhere it is listed. */
  const markBookmark = (story: StoryListItem, value: boolean): void => {
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
    // On both varieties' pages, since the Bookmarks shelf holds the story whichever is on show.
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

  // The stories bookmarked here, so a refusal can put one back on the shelves it left.
  const tapped = useRef(new Map<string, StoryListItem>());
  const bookmarking = useIntents<string, boolean>((id, on) => setBookmark(client, id, on), {
    failed: (error, id, confirmed) => {
      const story = tapped.current.get(id);
      if (story) markBookmark(story, confirmed);
      setNotice(describeError(error, t));
    },
  });

  /** Moves the bookmark at once and tells the server after; a refusal puts it back and says why. */
  const toggleBookmark = (story: StoryListItem): void => {
    const was = story.me?.bookmarked ?? false;
    haptic('tap');
    setNotice(null);
    tapped.current.set(story.id, story);
    markBookmark(story, !was);
    bookmarking.want(story.id, !was, was);
  };

  const open = (story: StoryListItem): void => navigation.navigate('StoryReader', { slug: story.slug });

  /**
   * A game with friends uses the variety on show. The setup sheet needs that variety's stories, fetched as it opens so
   * the list is complete; the button is busy meanwhile, and a failed fetch is reported rather than opening empty.
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

  // Two to a row on a phone, three on a tablet, each as wide as its share of the column.
  const column = Math.min(width, layout.column) - layout.gutter * 2;
  const columns = column >= 560 ? 3 : 2;
  const cardWidth = Math.floor((column - layout.rowGap * (columns - 1)) / columns);
  const categories = library?.categories;
  const delayFor = useListEntrance(library !== null);

  /** A shelf's cards; on a single category's shelf the cards omit the category (`filed: false`). */
  const grid = (stories: readonly StoryListItem[], from = 0, filed = true): ReactNode => (
    <View style={[styles.grid, { flexDirection: dir.row }]}>
      {stories.map((s, i) => (
        <Rise key={s.id} delay={delayFor(from + i)} style={{ width: cardWidth }}>
          <StoryCard story={s} categories={filed ? categories : undefined} filed={filed} onOpen={() => open(s)} onBookmark={() => toggleBookmark(s)} />
        </Rise>
      ))}
    </View>
  );

  // What is on, for the chips under the search and the funnel's name.
  const parts = activeParts(filter, t, library, locale);
  /** Back to the shelves: the search cleared and nothing chosen. */
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
          {/* From two chips, their "Clear all" already says this. */}
          {parts.length < 2 ? (
            // A link alone at the end of the count's line, so it reaches past every edge.
            <Pressable onPress={startOver} accessibilityRole="button" reach="open" style={({ pressed }) => [styles.clear, pressed && heldDim]}>
              <Text style={[styles.clearText, { color: colors.primary }]}>{t('stories.library.clearFilters')}</Text>
            </Pressable>
          ) : null}
        </View>
        {searching && !results ? (
          <GridSkeleton cardWidth={cardWidth} count={columns * 2} />
        ) : resultsError ? (
          <ErrorRetry message={describeError(resultsError, t)} onRetry={() => setFilter({ ...filter })} />
        ) : results && results.stories.length === 0 ? (
          <Note icon="story">{t('stories.library.noMatch')}</Note>
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
      // The legends on their own shelf under their category's name, so no newer story pushes one off.
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
        {library.total === 0 ? <Note icon="story">{t('stories.library.empty')}</Note> : null}
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
              {/* Chips wrap with the same gap between rows as between chips; each reaches half the gap every way. */}
              <ReachGroup gap={CHIP_GAP} rowGap={CHIP_GAP}>
                <ShelfChip label={t('stories.library.all')} onPress={() => setFilter({ ...NO_FILTER, all: true })} count={library.total} />
                {library.categories
                  .filter((c) => c.count > 0)
                  .map((c) => (
                    <ShelfChip key={c.slug} label={categoryTitle(c, locale, t)} count={c.count} onPress={() => setFilter({ ...NO_FILTER, category: c.slug })} />
                  ))}
              </ReachGroup>
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
        {/* The library's variety; a bar of the switch's height holds its place while the preference is read. */}
        {ready ? (
          <Segmented<StoryDialect>
            options={STORY_DIALECTS}
            value={dialect}
            onChange={chooseDialect}
            labelOf={(d) => t(dialectNameKey(d))}
            groupLabel={t('stories.variety')}
          />
        ) : (
          <Skeleton width="100%" height={VARIETY_SWITCH_HEIGHT} radius={radii.pill} />
        )}
        <View style={[styles.searchRow, { flexDirection: dir.row }]}>
          {/* The clear button and the filter share the small gap, so the filter's wider reach cannot cover the clear button. */}
          <ReachGroup gap={spacing.xs}>
            {/* The app's one search field. */}
            <SearchField value={q} onChangeText={setQ} label={t('stories.library.search')} style={styles.search} />
            {/* Sort and filter is one button beside the search, filled while anything is on. */}
            <HeaderButton
              icon={isPlainFilter(filter) ? 'filter' : 'filter-fill'}
              label={filterButtonLabel(parts, t)}
              onPress={() => setSheetOpen(true)}
              testID="stories-filter"
            />
          </ReachGroup>
        </View>
        <LibraryFilterChips
          parts={parts}
          onOpen={() => setSheetOpen(true)}
          onUndo={(undo) => setFilter({ ...filter, ...undo })}
          onClearAll={() => setFilter({ ...NO_FILTER })}
        />
        {notice ? (
          <Note tone="danger" icon="alert" live>
            {notice}
          </Note>
        ) : null}
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
      {/* A code opens whichever game it belongs to. */}
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
      // Drawn 36 tall with a width unknown before layout, so `open` reaches past every edge and the group caps it to the gap.
      reach="open"
      style={({ pressed }) => [styles.chip, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
    >
      <Text style={[styles.chipText, { color: colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.chipCount, { color: colors.textSecondary }]}>{formatNumber(count, locale)}</Text>
    </Pressable>
  );
}

/** A ring filled to `fraction`, drawn without animation: reading progress, not a moment to watch. */
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

/** Reading progress: stories finished out of all published, and the mean check score. */
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
        {/* Progress in violet, like the course's bar; gold is for what is earned. */}
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

/** A game to go back to: where it stands, and one word to continue. */
function ContinueCard({ game, onOpen }: { game: StoryGameSummary; onOpen: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
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
      // The story's title is read in the story's language; the app's words about it go in the value.
      accessibilityLabel={game.storyTitle}
      {...storyTextProps(game.dialect)}
      accessibilityValue={{ text: `${t(MODE_KEY[game.mode])}, ${where}` }}
      accessibilityHint={t('stories.continue')}
      style={[styles.continue, { flexDirection: dir.row, backgroundColor: colors.surface }]}
    >
      <View style={styles.rowMain}>
        <Text {...storyTextProps(game.dialect)} style={[styles.rowTitle, { color: colors.textPrimary }, storyTextStyle(game.dialect)]} numberOfLines={1}>
          {game.storyTitle}
        </Text>
        <Text style={[styles.rowMeta, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
          {t(MODE_KEY[game.mode])} · {where}
        </Text>
      </View>
      <Text style={[styles.continueText, { color: colors.primary }]}>{t('stories.continueButton')}</Text>
      <View style={dir.flip}>
        <Icon name="chevron-right" size={16} color={colors.primary} />
      </View>
    </PressableScale>
  );
}

/** The cover's height as a fraction of the card's width. */
const COVER_RATIO = 0.625;

/**
 * One story on a shelf. The title is read in the story's language and its facts in the app's; the bookmark is its
 * own button on the cover. On a single category's shelf the card omits its category (`filed`).
 */
function StoryCard({
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
  // The title in the reader's language under the Kurdish, where the story is not in theirs.
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
          // Two lines, like the Kurdish title: one line cut long legend titles short.
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
          Level and minutes share a row, wrapping when a long level name leaves no room; the category gets its own line,
          since in half a phone's width it was what got cut. The facts sit at the card's foot so they align along a row.
        */}
        <View style={styles.foot}>
          <View style={[styles.facts, storyRowStyle(story.dialect), { flexDirection: dir.row }]}>
            {/* A level is information, not a prize: the quiet pill. */}
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
        // Drawn 32 over the cover but answering over 48: 8 past every edge, still inside the card.
        style={({ pressed }) => [styles.bookmark, { backgroundColor: colors.surface, opacity: pressed ? pressedDim : 1 }]}
      >
        {/* On is violet, as everything chosen is. */}
        <Icon name={bookmarked ? 'bookmark-fill' : 'bookmark'} size={18} color={bookmarked ? colors.primary : colors.textSecondary} />
      </Pressable>
    </View>
  );
}

/** The gap between the Categories shelf's chips, across and between rows. */
const CHIP_GAP = spacing.sm;

/** The display face at size md, with its 1.12 line height. */
const TITLE_LINE = Math.round(typography.sizes.text * typography.displayLineHeight);

function GridSkeleton({ cardWidth, count }: { cardWidth: number; count: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.grid} accessibilityLabel={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { width: cardWidth, backgroundColor: colors.surface }]}>
          <View style={styles.cardBody}>
            <Skeleton width="100%" height={Math.round((cardWidth - spacing.sm * 2) * COVER_RATIO)} radius={radii.sm} />
            <SkeletonText size={typography.sizes.text} lineHeight={TITLE_LINE} width={i % 2 ? '70%' : '85%'} />
            <SkeletonText size={typography.sizes.text} lineHeight={18} width="92%" />
            <View style={styles.facts}>
              <Skeleton width={56} height={lineOf(typography.sizes.text) + 6} radius={radii.pill} />
              <Skeleton width={44} height={lineOf(typography.sizes.text)} />
            </View>
            <SkeletonText size={typography.sizes.text} lineHeight={18} width="55%" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** The shelves while loading: the progress card's shape, then two rows of cards. */
function LibrarySkeleton({ cardWidth, columns, personal }: { cardWidth: number; columns: number; personal: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.sections} accessibilityLabel={t('common.loading')}>
      {personal ? (
        <View style={[styles.progress, { backgroundColor: colors.surface }]}>
          <Skeleton width={64} height={64} radius={radii.pill} />
          <View style={styles.progressText}>
            <SkeletonText size={typography.sizes.text} width="50%" />
            <SkeletonText size={typography.sizes.text} width="80%" />
            <SkeletonText size={typography.sizes.text} width="65%" />
          </View>
        </View>
      ) : null}
      <View style={styles.section}>
        <SkeletonText size={typography.sizes.text} width={96} />
        <GridSkeleton cardWidth={cardWidth} count={columns} />
      </View>
      <View style={styles.section}>
        <SkeletonText size={typography.sizes.text} width={120} />
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
  chipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  chipCount: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  categories: { flexWrap: 'wrap', gap: CHIP_GAP },
  resultsHead: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  clear: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  clearText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  grid: { flexWrap: 'wrap', gap: layout.rowGap },
  // A row's cards are as tall as its tallest, so their feet line up.
  card: { flexGrow: 1, borderRadius: radii.lg, position: 'relative' },
  cardBody: { flexGrow: 1, padding: spacing.sm, gap: spacing.xs },
  coverBox: { position: 'relative' },
  cover: { width: '100%', aspectRatio: 1 / COVER_RATIO },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, borderBottomLeftRadius: radii.sm, borderBottomRightRadius: radii.sm, overflow: 'hidden' },
  hairlineFill: { height: 4 },
  title: { ...display(typography.sizes.text), lineHeight: Math.round(typography.sizes.text * 1.2), marginTop: 2 },
  summary: { fontSize: typography.sizes.text, lineHeight: 22 },
  titleTranslation: { fontSize: typography.sizes.text, lineHeight: 22, fontWeight: typography.weights.semibold, marginTop: -2 },
  foot: { marginTop: 'auto', gap: spacing.xs },
  facts: { flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  factText: { fontSize: typography.sizes.text },
  category: { fontSize: typography.sizes.text, lineHeight: 22 },
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
  ringText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  progressText: { flex: 1, gap: 2 },
  progressTitle: { ...display(typography.sizes.text), lineHeight: Math.round(typography.sizes.text * 1.2) },
  progressLine: { fontSize: typography.sizes.text, lineHeight: 20 },
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
  rowTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  rowMeta: { fontSize: typography.sizes.text },
  continueText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  // Stacked: side by side, "Play with friends" wraps in most languages.
  actions: { gap: spacing.sm },
});
