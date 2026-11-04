import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  CEFR_LEVELS,
  STORY_DIALECTS,
  categoryName,
  levelOfCefr,
  normalizeJoinCode,
  parseInvite,
  type CefrLevel,
  type StoryCategory,
  type StoryDialect,
  type StoryGameSummary,
  type StoryLibrary,
  type StoryListItem,
  type StoryQuery,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError, type Translate } from '../api/errors';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { RootNavigation } from '../navigation/rootStack';
import { useTabBarInset } from '../navigation/tabBarLayout';
import { lobbyRoute } from '../play/routes';
import { useDirection } from '../reports/direction';
import { useListEntrance } from '../theme/animate';
import { display, sectionLabel } from '../theme/fonts';
import { ClayButton, ErrorRetry } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { PressableScale, Rise } from '../theme/MotionParts';
import { Skeleton, SkeletonText, lineOf } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { activeGames, getLibrary, joinGame, listStories, searchStories, setBookmark } from './api';
import { StoryCover } from './covers';
import { DIALECT_NAME, MODE_KEY, categoryLabel } from './labels';
import { useStoryPrefs } from './prefs';
import { SetupSheet } from './SetupSheet';
import { storyRowStyle, storyTextProps, storyTextStyle } from './storyText';
import { COLUMN, Note, Pill, Sheet } from './ui';

/**
 * Which variety a game is set up in: Soranî when the interface is Soranî,
 * else the one chosen last time on this phone, else Kurmancî.
 */
export function defaultDialect(locale: string, remembered: StoryDialect | null): StoryDialect {
  if (locale === 'ckb') return 'sorani';
  return remembered ?? 'kurmanci';
}

/** What a refusal to join by code means. */
export function joinErrorMessage(error: ApiError, t: Translate): string {
  switch (error.code) {
    case 'GAME_NOT_FOUND':
      return t('stories.join.notFound');
    case 'GAME_STARTED':
      return t('stories.join.started');
    case 'GAME_FULL':
      return t('stories.join.full');
    default:
      return describeError(error, t);
  }
}

/** The chips over the library: each narrows the list, and any of them turns the shelves into one paged list. */
export interface LibraryFilter {
  level: CefrLevel | null;
  dialect: StoryDialect | null;
  narrated: boolean;
  category: string | null;
  /** "All stories": the paged list with nothing narrowing it */
  all: boolean;
}

export const NO_FILTER: LibraryFilter = { level: null, dialect: null, narrated: false, category: null, all: false };

/** A page of 24, as the server's default; a phone shows two or three to a row, so a page is eight rows or more. */
export const PAGE = 24;

/** Whether anything typed or chosen narrows the library into a search. */
export function isFiltering(q: string, filter: LibraryFilter): boolean {
  return q.trim() !== '' || filter.level !== null || filter.dialect !== null || filter.narrated || filter.category !== null || filter.all;
}

/** The query GET /stories is asked, for what was typed and chosen, from `offset` on. */
export function libraryQuery(q: string, filter: LibraryFilter, offset = 0): StoryQuery {
  const level = filter.level ? levelOfCefr(filter.level) : null;
  return {
    q: q.trim() || undefined,
    category: filter.category ?? undefined,
    level: level ?? undefined,
    dialect: filter.dialect ?? undefined,
    audio: filter.narrated || undefined,
    limit: PAGE,
    offset: offset || undefined,
  };
}

/** A story's row in every list it is in, with `me` changed: a bookmark flips everywhere at once. */
function withMe(list: StoryListItem[], id: string, patch: (me: StoryListItem['me']) => StoryListItem['me']): StoryListItem[] {
  return list.map((s) => (s.id === id ? { ...s, me: patch(s.me) } : s));
}

/** How long typing is left alone before the list is asked for it. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The library (Learn → Stories, and the Stories route): what to read, and a
 * way to find it.
 *
 * Signed in, the shelf opens on how the reading is going — stories finished
 * out of all published, the mean score on the checks — then the stories to go
 * back to, the editors' picks, the newest, the categories, and the ones
 * bookmarked. Anything typed in the search, or any chip, turns the shelves
 * into one paged list of what matches, with "More" at its foot and "Clear
 * filters" at its head. A guest sees the same shelves without the personal
 * rows, since the server keeps none for them.
 *
 * Each story is a card with its cover (the editor's landscape, or a kilim in
 * its category's colours), its title and a line of its summary, its CEFR
 * level, category and minutes, a headphones mark when it is read aloud, a
 * bookmark toggle that answers at once and asks the server after, and a
 * hairline of how far it has been read. Tapping a card opens the story's
 * overview (StoryReaderScreen).
 *
 * At the foot, the two ways into a game with other people on a story — set
 * one up, or join one with a code or a link a friend sent — which used to be
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
  const { prefs } = useStoryPrefs();
  const { width } = useWindowDimensions();

  const [library, setLibrary] = useState<StoryLibrary | null>(null);
  const [libraryError, setLibraryError] = useState<ApiError | null>(null);
  const [active, setActive] = useState<StoryGameSummary[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER);
  const [results, setResults] = useState<{ stories: StoryListItem[]; total: number } | null>(null);
  const [resultsError, setResultsError] = useState<ApiError | null>(null);
  const [searching, setSearching] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState<StoryListItem[] | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const filtering = isFiltering(q, filter);
  const personal = !isGuest;

  const load = useCallback(() => {
    setLibraryError(null);
    void getLibrary(client).then((res) => {
      if (res.ok) setLibrary(res.data);
      else setLibraryError(res.error);
    });
    // a guest has no games to go back to, and the server refuses the question
    if (!isGuest) {
      void activeGames(client).then((res) => {
        if (res.ok) setActive(res.data.games);
      });
    }
  }, [client, isGuest]);

  // again on coming back: a story just finished leaves "Continue reading", a check just taken moves the average
  useFocusEffect(useCallback(() => load(), [load]));

  // what was typed or chosen, after a short pause for more typing
  const search = useRef(0);
  useEffect(() => {
    if (!filtering) {
      setResults(null);
      setResultsError(null);
      setSearching(false);
      return;
    }
    const run = (search.current += 1);
    setSearching(true);
    setResultsError(null);
    const timer = setTimeout(() => {
      void searchStories(client, libraryQuery(q, filter)).then((res) => {
        if (run !== search.current) return;
        setSearching(false);
        if (res.ok) setResults(res.data);
        else setResultsError(res.error);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [client, q, filter, filtering]);

  const more = async (): Promise<void> => {
    if (!results || moreBusy) return;
    setMoreBusy(true);
    const res = await searchStories(client, libraryQuery(q, filter, results.stories.length));
    setMoreBusy(false);
    if (res.ok) setResults({ stories: [...results.stories, ...res.data.stories], total: res.data.total });
    else setNotice(describeError(res.error, t));
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
      setResults((r) => (r ? { ...r, stories: withMe(r.stories, story.id, patch) } : r));
      setLibrary((lib) => {
        if (!lib) return lib;
        const marked = { ...story, me: patch(story.me) };
        const bookmarks = value
          ? [marked, ...lib.bookmarks.filter((s) => s.id !== story.id)]
          : lib.bookmarks.filter((s) => s.id !== story.id);
        return {
          ...lib,
          featured: withMe(lib.featured, story.id, patch),
          recent: withMe(lib.recent, story.id, patch),
          continue: withMe(lib.continue, story.id, patch),
          bookmarks,
        };
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

  /** A pasted link first (any game's), then a code. */
  const join = async (): Promise<void> => {
    const typed = code.trim();
    if (!typed || joining) return;
    setJoinError(null);
    const invite = parseInvite(typed);
    if (invite) {
      const route = lobbyRoute(invite.type, invite.id);
      setJoinOpen(false);
      navigation.navigate(route.name, route.params as never);
      return;
    }
    const normalized = normalizeJoinCode(typed);
    if (!normalized) {
      setJoinError(t('stories.join.badCode'));
      return;
    }
    setJoining(true);
    const res = await joinGame(client, { code: normalized }, prefs.extraTime);
    setJoining(false);
    if (!res.ok) {
      setJoinError(joinErrorMessage(res.error, t));
      return;
    }
    setCode('');
    setJoinOpen(false);
    navigation.navigate('StoryGame', { id: res.data.id });
  };

  /** The setup sheet wants one variety's stories; they are fetched as it opens, so the pick list is whole. */
  const setupDialect = defaultDialect(locale, prefs.dialect);
  const openSetup = (): void => {
    void listStories(client, { dialect: setupDialect }).then((res) => setSetupOpen(res.ok ? res.data.stories : []));
  };

  // two to a row on a phone, three across a tablet, each as wide as its share of the column
  const column = Math.min(width, layout.column) - layout.gutter * 2;
  const columns = column >= 560 ? 3 : 2;
  const cardWidth = Math.floor((column - layout.rowGap * (columns - 1)) / columns);
  const categories = library?.categories;
  const delayFor = useListEntrance(library !== null);

  const grid = (stories: readonly StoryListItem[], from = 0): ReactNode => (
    <View style={[styles.grid, { flexDirection: dir.row }]}>
      {stories.map((s, i) => (
        <Rise key={s.id} delay={delayFor(from + i)} style={{ width: cardWidth }}>
          <StoryCard story={s} categories={categories} onOpen={() => open(s)} onBookmark={() => toggleBookmark(s)} />
        </Rise>
      ))}
    </View>
  );

  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { flexDirection: dir.row }]} keyboardShouldPersistTaps="handled">
      <FilterChip icon="headphones" label={t('stories.library.narrated')} on={filter.narrated} onPress={() => setFilter({ ...filter, narrated: !filter.narrated, all: false })} />
      {STORY_DIALECTS.map((d) => (
        <FilterChip key={d} label={DIALECT_NAME[d]} on={filter.dialect === d} onPress={() => setFilter({ ...filter, dialect: filter.dialect === d ? null : d, all: false })} />
      ))}
      {CEFR_LEVELS.map((c) => (
        <FilterChip key={c} label={c} on={filter.level === c} onPress={() => setFilter({ ...filter, level: filter.level === c ? null : c, all: false })} />
      ))}
    </ScrollView>
  );

  let body: ReactNode;
  if (filtering) {
    const count = results?.total ?? 0;
    body = (
      <View style={styles.section}>
        <View style={[styles.resultsHead, { flexDirection: dir.row }]}>
          <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header" accessibilityLiveRegion="polite">
            {results && !searching ? t('stories.library.found', { count: formatNumber(count, locale) }) : t('common.loading')}
          </Text>
          <Pressable
            onPress={() => {
              setQ('');
              setFilter(NO_FILTER);
            }}
            accessibilityRole="button"
            style={styles.clear}
            hitSlop={8}
          >
            <Text style={[styles.clearText, { color: colors.primary }]}>{t('stories.library.clearFilters')}</Text>
          </Pressable>
        </View>
        {filter.category ? (
          <View style={[styles.categoryRow, { flexDirection: dir.row }]}>
            <Pill icon="tag" label={categoryLabel(filter.category, categories, locale) ?? filter.category} tone="primary" />
          </View>
        ) : null}
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
    const shelves: Array<{ key: string; title: string; stories: StoryListItem[] }> = [
      ...(personal ? [{ key: 'continue', title: t('stories.library.continue'), stories: library.continue }] : []),
      { key: 'featured', title: t('stories.library.featured'), stories: library.featured },
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
              {grid(shelf.stories, from)}
            </View>
          );
        })}
        {library.categories.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('stories.library.categories')}
            </Text>
            <View style={[styles.categories, { flexDirection: dir.row }]}>
              <FilterChip label={t('stories.library.all')} on={false} onPress={() => setFilter({ ...NO_FILTER, all: true })} count={library.total} />
              {library.categories
                .filter((c) => c.count > 0)
                .map((c) => (
                  <FilterChip key={c.slug} label={categoryName(c, locale)} count={c.count} on={false} onPress={() => setFilter({ ...NO_FILTER, category: c.slug })} />
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
              <ClayButton label={t('stories.together.setup')} icon="user-plus" tone="primary" disabled={library.total === 0} onPress={openSetup} />
              <ClayButton label={t('stories.join.open')} icon="link" onPress={() => setJoinOpen(true)} />
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
      >
        <View style={[styles.search, { backgroundColor: colors.controlTrack, flexDirection: dir.row }]}>
          <Icon name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('stories.library.search')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('stories.library.search')}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={[styles.searchInput, dir.text, { color: colors.textPrimary }]}
          />
          {q ? (
            <Pressable onPress={() => setQ('')} accessibilityRole="button" accessibilityLabel={t('stories.library.clearSearch')} hitSlop={8} style={styles.searchClear}>
              <Icon name="clear-fill" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        {chips}
        {notice ? <Note tone="danger" icon="alert">{notice}</Note> : null}
        {body}
      </ScrollView>

      {setupOpen ? (
        <SetupSheet
          dialect={setupDialect}
          stories={setupOpen}
          initialMode="duo"
          onClose={() => setSetupOpen(null)}
          onCreated={(view) => {
            setSetupOpen(null);
            navigation.navigate('StoryGame', { id: view.id });
          }}
        />
      ) : null}
      {joinOpen ? (
        <Sheet
          title={t('stories.join.label')}
          onClose={() => setJoinOpen(false)}
          footer={<ClayButton label={t('stories.join.button')} tone="primary" size="large" busy={joining} onPress={() => void join()} />}
        >
          <Text style={[styles.joinBody, { color: colors.textSecondary }]}>{t('stories.join.hint')}</Text>
          <TextInput
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setJoinError(null);
            }}
            onSubmitEditing={() => void join()}
            placeholder={t('stories.join.placeholder')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('stories.join.label')}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            textContentType="none"
            returnKeyType="go"
            style={[styles.codeInput, { backgroundColor: colors.controlTrack, color: colors.textPrimary }]}
          />
          {joinError ? (
            <Text style={[styles.joinError, { color: colors.danger }]} accessibilityLiveRegion="polite">
              {joinError}
            </Text>
          ) : null}
        </Sheet>
      ) : null}
    </>
  );
}

/** One chip of the filter row: a toggle that reads as pressed, with a count where there is one. */
function FilterChip({ label, on, onPress, icon, count }: { label: string; on: boolean; onPress: () => void; icon?: 'headphones'; count?: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  return (
    <Pressable
      onPress={() => {
        haptic('select');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={count !== undefined ? `${label}, ${formatNumber(count, locale)}` : label}
      style={({ pressed }) => [styles.chip, { backgroundColor: on ? colors.primary : colors.controlTrack, opacity: pressed ? 0.8 : 1 }]}
    >
      {icon ? <Icon name={icon} size={14} color={on ? colors.textOnPrimary : colors.textPrimary} /> : null}
      <Text style={[styles.chipText, { color: on ? colors.textOnPrimary : colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text style={[styles.chipCount, { color: on ? colors.textOnPrimary : colors.textSecondary }]}>{formatNumber(count, locale)}</Text>
      ) : null}
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
        <Ring fraction={fraction} size={64} color={colors.gold} />
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
 * facts in the app's; the bookmark is a button of its own on the cover.
 */
export function StoryCard({
  story,
  categories,
  onOpen,
  onBookmark,
}: {
  story: StoryListItem;
  categories: readonly StoryCategory[] | undefined;
  onOpen: () => void;
  onBookmark: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const minutes = t('stories.aboutMinutes', { count: story.readingMinutes });
  const category = categoryLabel(story.category, categories, locale);
  const narrated = story.audioCoverage === 'full' ? t('stories.library.narrated') : story.audioCoverage === 'partial' ? t('stories.library.partlyNarrated') : null;
  const share = story.me?.finishedAt ? 1 : (story.me?.share ?? 0);
  const facts = [story.cefr, category, minutes, narrated, story.me?.finishedAt ? t('stories.library.finished') : share > 0 ? t('stories.library.progress', { percent: Math.round(share * 100) }) : null]
    .filter((f): f is string => !!f)
    .join(', ');
  const bookmarked = story.me?.bookmarked ?? false;
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
          <StoryCover cover={story.cover} category={story.category} style={styles.cover} radius={radii.sm} />
          {share > 0 ? (
            <View style={[styles.hairline, { backgroundColor: colors.scrim }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={[styles.hairlineFill, { width: `${Math.round(share * 100)}%`, backgroundColor: colors.gold }]} />
            </View>
          ) : null}
        </View>
        <Text {...storyTextProps(story.dialect)} style={[styles.title, { color: colors.textPrimary }, storyTextStyle(story.dialect)]} numberOfLines={2}>
          {story.title}
        </Text>
        {story.summary ? (
          <Text {...storyTextProps(story.dialect)} style={[styles.summary, { color: colors.textSecondary }, storyTextStyle(story.dialect)]} numberOfLines={2}>
            {story.summary}
          </Text>
        ) : null}
        <View style={[styles.facts, storyRowStyle(story.dialect), { flexDirection: dir.row }]}>
          <Pill label={story.cefr} tone="gold" />
          <Text style={[styles.factText, { color: colors.textSecondary }]} numberOfLines={1}>
            {[category, minutes].filter(Boolean).join(' · ')}
          </Text>
          {narrated ? <Icon name="headphones" size={14} color={colors.textSecondary} /> : null}
          {story.me?.finishedAt ? <Icon name="check" size={14} color={colors.success} /> : null}
        </View>
      </PressableScale>
      <Pressable
        onPress={onBookmark}
        accessibilityRole="button"
        accessibilityLabel={bookmarked ? t('stories.library.bookmarked') : t('stories.library.bookmark')}
        accessibilityState={{ selected: bookmarked }}
        hitSlop={6}
        style={({ pressed }) => [styles.bookmark, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
      >
        <Icon name={bookmarked ? 'bookmark-fill' : 'bookmark'} size={18} color={bookmarked ? colors.gold : colors.textSecondary} />
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
              <Skeleton width={34} height={lineOf(typography.sizes.xs) + 6} radius={radii.pill} />
              <Skeleton width={72} height={lineOf(typography.sizes.xs)} />
            </View>
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
  search: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, borderRadius: radii.md, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, minHeight: MIN_TOUCH_TARGET, fontSize: typography.sizes.md },
  searchClear: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  // the chips row sits a little closer to the search than the sections below do
  chips: { gap: spacing.sm, paddingRight: layout.gutter, marginTop: -spacing.sm },
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
  categoryRow: { gap: spacing.sm },
  resultsHead: { alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  clear: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  clearText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  grid: { flexWrap: 'wrap', gap: layout.rowGap },
  card: { borderRadius: radii.lg, position: 'relative' },
  cardBody: { padding: spacing.sm, gap: spacing.xs },
  coverBox: { position: 'relative' },
  cover: { width: '100%', aspectRatio: 1 / COVER_RATIO },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, borderBottomLeftRadius: radii.sm, borderBottomRightRadius: radii.sm, overflow: 'hidden' },
  hairlineFill: { height: 4 },
  title: { ...display(typography.sizes.md), lineHeight: Math.round(typography.sizes.md * 1.2), marginTop: 2 },
  summary: { fontSize: typography.sizes.xs, lineHeight: 18 },
  facts: { alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  factText: { flexShrink: 1, fontSize: typography.sizes.xs },
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
  joinBody: { fontSize: typography.sizes.sm, lineHeight: 20 },
  codeInput: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.lg,
    letterSpacing: 2,
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  joinError: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
