import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchedParts } from '@kurda/shared';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useAccountGate } from '../auth/AccountGate';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Chips } from '../theme/Chips';
import { SearchField } from '../theme/SearchField';
import { Icon, type IconName } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { deviceStore } from '../keyboard/deviceStore';
import { pushRecent } from '../dictionary/recents';
import { mutualText } from '../social/format';
import type { SearchHit, SearchResult } from '../dictionary/types';
import { EntryDetail } from '../dictionary/EntryDetail';
import type { CourseMap, CourseSummary } from '../coursemap/types';
import { flattenMap } from '../coursemap/node';
import { SCOPES, SCOPE_LABEL, filterByLabel, gameDestinations, matches, peopleQuery, readyForServer, scopesToRun, wayWord, type Scope } from './scope';
import { GAME_CARDS, learnGameCard, type GameCard } from '../games/gameCards';
import { PHONE_LEARN_GAMES, useListedLearnGames } from '../games/learnGames';
import { EmptyState } from '../theme/EmptyState';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { DiscoverGrid } from './DiscoverGrid';
import { heldDim } from '../theme/MotionParts';

interface UserRow {
  userId: string;
  username: string;
  displayName?: string | null;
  /** on search results: already friends with whoever searched */
  friend?: boolean;
}

/** Someone you may know (`/friends/suggestions`), and how. */
interface Suggestion extends UserRow {
  mutualCount: number;
}

/** Where the searches you made are kept, on this device only. */
const RECENTS_KEY = 'hevalo_search_recents_v1';
const SHOWN_RECENTS = 6;

interface LessonRow {
  /** The lesson a tap opens; a skill with none is not offered. */
  lessonId: string;
  title: string;
}

/**
 * One field for the whole app.
 *
 * There were two searches before this and each could only see its own tab:
 * usernames on Friends, headwords on Dictionary. Nothing found a lesson or a
 * game, so reaching either meant remembering which tab it lived behind, which
 * is the one thing a search is supposed to spare you.
 *
 * Four scopes. Two ask the server and two are lists the app already holds:
 *
 *   people   `/users/search`, which is rate-limited, so it waits for two
 *            characters and for you to stop typing; a leading "@" is not
 *            part of the name looked for
 *   words    `/dictionary/search`, same
 *   lessons  the skill nodes of your first course, fetched once and matched
 *            as each letter is typed
 *   games    every game with a card on the Games screen (games/gameCards.ts),
 *            matched on the spot
 *
 * The debounce is 250ms. Typing "kurd" at a normal speed is four keystrokes
 * inside 300ms; without it that is four calls against a budget of thirty a
 * minute, and the first three are answers to a question nobody asked. From
 * the last letter until the server has answered, the people and the words
 * are held in grey where they will be: the page used to be blank for that
 * long, which read as nothing found.
 *
 * The field is the screen's header, pinned at the top. With nothing in it the
 * screen is not blank: it offers the searches you made before (kept on this
 * phone only) and people you may know, so the first thing a new reader sees
 * is somewhere to start rather than an instruction.
 */
export function SearchScreen(): React.JSX.Element {
  const { client } = useAuth();
  /*
   * A guest searches the words, the lessons and the games, not the people:
   * finding somebody leads to befriending or writing to them, which an
   * account does, and the people search is one of the routes refused to a
   * guest. The scope is not offered rather than offered and refused.
   */
  const { isGuest } = useAccountGate();
  const scopes = useMemo(() => (isGuest ? SCOPES.filter((s) => s !== 'people') : SCOPES), [isGuest]);
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const topInset = useScreenTopInset();
  const bottomInset = useTabBarInset();
  const scrollRef = useRef<ScrollView>(null);
  // tapping Search while on Search goes back to the top of the results
  useScrollToTop(scrollRef);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [people, setPeople] = useState<UserRow[]>([]);
  const [words, setWords] = useState<SearchHit[]>([]);
  // the search the server has answered (or been spared), as `asking` names one: until it is this one, it is still looked for
  const [answered, setAnswered] = useState<string | null>(null);
  // counts the searches asked, so an answer that comes back after a later one was asked is let go
  const asked = useRef(0);
  // a search the server could not answer, which is not the same as one that found nothing
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // how many pictures the grid found (null while it looks): with none, the empty state says where to start
  const [discovered, setDiscovered] = useState<number | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  // people you may know are on their way: their place is held, rather than "search for something" flashing first
  const [suggestionsSettled, setSuggestionsSettled] = useState(false);

  /*
   * What the empty field offers: the searches made before, read once from
   * this device, and people you may know, asked once — it is a friends-of-
   * friends join the server rate-limits, answering a question that does not
   * change between two visits.
   */
  useEffect(() => {
    let live = true;
    void deviceStore.get(RECENTS_KEY).then((raw) => {
      if (!live || !raw) return;
      try {
        const list: unknown = JSON.parse(raw);
        if (Array.isArray(list)) setRecents(list.filter((x): x is string => typeof x === 'string'));
      } catch {
        // a list that will not parse is a list that is not there
      }
    });
    if (isGuest) {
      // nobody to suggest to a guest, and the suggestions are refused to one: settled at once
      setSuggestionsSettled(true);
    } else {
      void client.get<{ suggestions: Suggestion[] }>('/friends/suggestions').then((r) => {
        if (!live) return;
        if (r.ok) setSuggestions(r.data.suggestions);
        setSuggestionsSettled(true);
      });
    }
    return () => {
      live = false;
    };
  }, [client, isGuest]);

  /** Keep what was searched for, once it led somewhere (or was sent with the return key). */
  const remember = useCallback((term: string) => {
    setRecents((list) => {
      const next = pushRecent(list, term);
      void deviceStore.set(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const forgetRecents = useCallback(() => {
    setRecents([]);
    void deviceStore.remove(RECENTS_KEY);
  }, []);

  /*
   * The lessons are fetched once and filtered here.
   *
   * A course map is one request for every skill in a course, and it does not
   * change while you are typing. Asking the server per keystroke for something
   * that is already in memory would be a call per letter for no new answer.
   */
  const [allLessons, setAllLessons] = useState<LessonRow[]>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const list = await client.get<{ courses: CourseSummary[] }>('/courses');
      if (!live || !list.ok) return;
      const first = list.data.courses[0];
      if (!first) return;
      const map = await client.get<CourseMap>(`/courses/${first.id}/map`);
      if (!live || !map.ok) return;
      const rows: LessonRow[] = [];
      for (const row of flattenMap(map.data)) {
        // a skill you have not unlocked has no first lesson, so there is
        // nothing for a tap to open and it is not offered
        if (row.kind === 'node' && row.node.firstLessonId) {
          rows.push({ lessonId: row.node.firstLessonId, title: row.node.title });
        }
      }
      setAllLessons(rows);
    })();
    return () => {
      live = false;
    };
  }, [client]);

  // "all" is every scope a guest has, which is every scope but the people
  const wanted = useMemo(() => scopesToRun(scope).filter((s) => s !== 'people' || !isGuest), [scope, isGuest]);
  const term = query.trim();
  // who is looked for, without the "@" the app writes before a handle
  const person = peopleQuery(query);
  const asksPeople = wanted.includes('people') && readyForServer(person);
  const asksWords = wanted.includes('words') && readyForServer(term);
  /** This search, by name: what is asked of the server, in which scope, and which try at it. */
  const asking = `${scope}|${asksPeople ? person : ''}|${asksWords ? term : ''}|${attempt}`;

  const run = useCallback(
    async (name: string, who: string | null, what: string | null) => {
      const mine = ++asked.current;
      setFailure(null);
      const [p, w] = await Promise.all([
        who !== null ? client.get<{ results: UserRow[] }>(`/users/search?q=${encodeURIComponent(who)}`) : null,
        what !== null ? client.get<SearchResult>(`/dictionary/search?q=${encodeURIComponent(what)}`) : null,
      ]);
      // another search was asked meanwhile: this answer is to a question nobody is waiting on any more
      if (mine !== asked.current) return;
      setPeople(p?.ok ? p.data.results : []);
      setWords(w?.ok ? w.data.results : []);
      const refused = [p, w].find((r) => r && !r.ok);
      if (refused && !refused.ok) setFailure(refused.error);
      setAnswered(name);
    },
    [client],
  );

  /* One timer, reset on every keystroke and on a change of scope. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(asking, asksPeople ? person : null, asksWords ? term : null), 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // a retry runs the same search again: `asking` names the try as well
  }, [asking, run]);

  // the lessons are a list held here: matched on the letter just typed, with no wait
  const lessons = useMemo(
    () => (wanted.includes('lessons') ? filterByLabel(allLessons, (l) => l.title, term) : []),
    [wanted, allLessons, term],
  );

  // every game with a card that can be played now: the ones with screens of their own, and the learning games listed for this learner
  const learnGames = useListedLearnGames();
  const cards = useMemo<GameCard[]>(
    () => [
      ...GAME_CARDS,
      ...learnGames.flatMap(({ game: g, ready }): GameCard[] => {
        const phone = PHONE_LEARN_GAMES[g.id];
        return phone ? [learnGameCard({ id: g.id, ...phone, mode: g.mode === 'solo' ? 'solo' : g.mode === 'multi' ? 'friends' : 'both', ready })] : [];
      }),
    ],
    [learnGames],
  );
  const games = useMemo(() => {
    if (!wanted.includes('games')) return [];
    return gameDestinations(cards).filter((g) => matches(t(g.labelKey), term));
  }, [wanted, cards, term, t]);

  const typed = term.length > 0;
  // asked of the server and not answered yet: from the letter just typed, through the pause, to the answer
  const looking = (asksPeople || asksWords) && answered !== asking;
  // what the server last said is shown only where it is still what is asked for
  const peopleShown = asksPeople ? people : NOBODY;
  const wordsShown = asksWords ? words : NO_WORDS;
  const nothing = typed && !looking && !failure && peopleShown.length === 0 && wordsShown.length === 0 && lessons.length === 0 && games.length === 0;

  const section = (labelKey: TranslationKey, rows: React.ReactNode[]) =>
    rows.length === 0 ? null : (
      <View style={styles.section} key={labelKey}>
        <Text style={[styles.sectionTitle, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {t(labelKey)}
        </Text>
        <View style={styles.rows}>{rows}</View>
      </View>
    );

  /**
   * A line with what was searched for marked in it, folded the way the
   * searches match (@kurda/shared search-highlight.ts): "serk" is marked
   * inside "berserker". A line the query is not in shows as written.
   */
  const marked = (text: string, found: string = term): React.ReactNode =>
    typed && found
      ? matchedParts(text, found).map((part, i) =>
          part.match ? (
            <Text key={i} style={[styles.match, { color: colors.textPrimary }]}>
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )
      : text;

  const row = (key: string, left: React.ReactNode, title: string, sub: string | null, onPress: () => void, label: string, found: string = term) => (
    <Pressable
      key={key}
      onPress={() => {
        if (typed) remember(query);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack }]}
    >
      {left}
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {marked(title, found)}
        </Text>
        {sub ? (
          <Text style={[styles.rowSub, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
            {marked(sub, found)}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
    </Pressable>
  );

  /** A glyph in a soft circle, the same size as an avatar, so every row's text starts at the same place. */
  const glyph = (name: IconName) => (
    <View style={[styles.glyph, { backgroundColor: colors.controlTrack }]}>
      <Icon name={name} size={20} color={colors.textPrimary} />
    </View>
  );

  /*
   * A word opens where it opens on the Dictionary tab.
   *
   * `EntryDetail` is a component there rather than a route, so the tab swaps
   * itself for it and swaps back. Doing the same here means a word found in a
   * search and a word found in the dictionary land on the same screen, and
   * that the back out of it returns to the results you were reading.
   */
  if (openEntry) return <EntryDetail entryId={openEntry} onBack={() => setOpenEntry(null)} />;

  return (
    <GradientBackground>
      <View style={[styles.controls, { paddingTop: topInset }]}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          label={t('search.title')}
          placeholder={t('search.placeholder')}
          onSubmit={() => remember(query)}
        />
        <Chips options={scopes} value={scope} onChange={setScope} labelOf={(s) => t(SCOPE_LABEL[s])} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {!typed && recents.length > 0 ? (
          <View style={styles.section}>
            <View style={[styles.sectionHead, { flexDirection: dir.row }]}>
              <Text style={[styles.sectionTitle, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
                {t('search.recent')}
              </Text>
              <Pressable
                onPress={forgetRecents}
                accessibilityRole="button"
                accessibilityLabel={t('search.clearRecent')}
                // one 18-point line of words, caught at a fingertip's 44
                hitSlop={13}
                style={({ pressed }) => pressed && heldDim}
              >
                <Text style={[styles.sectionAction, { color: colors.textPrimary }]}>{t('search.clearRecent')}</Text>
              </Pressable>
            </View>
            <View style={styles.rows}>
              {recents.slice(0, SHOWN_RECENTS).map((term) => (
                <Pressable
                  key={term}
                  onPress={() => setQuery(term)}
                  accessibilityRole="button"
                  accessibilityLabel={term}
                  style={({ pressed }) => [styles.recent, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack }]}
                >
                  <Icon name="history" size={20} color={colors.textSecondary} />
                  <Text style={[styles.rowTitle, styles.rowMain, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
                    {term}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {!typed && suggestions.length > 0
          ? section(
              'friends.suggestions',
              suggestions.slice(0, 5).map((u) =>
                row(
                  's-' + u.userId,
                  <InitialsAvatar name={u.username} id={u.userId} size={40} />,
                  u.username,
                  u.mutualCount > 0 ? mutualText(t, u.mutualCount) : (u.displayName ?? null),
                  () => navigation.navigate('UserProfile', { userId: u.userId }),
                  u.username,
                ),
              ),
            )
          : null}

        {!typed && !suggestionsSettled ? <SuggestionsSkeleton /> : null}

        {/* kept while a search is typed, so clearing it does not ask for the pictures again */}
        <View style={[styles.discover, typed && styles.hidden]}>
          <DiscoverGrid width={screenWidth} onCount={setDiscovered} />
        </View>

        {!typed && suggestionsSettled && recents.length === 0 && suggestions.length === 0 && discovered === 0 ? (
          <EmptyState title={t('search.start')} body={t('search.start.body')} />
        ) : null}

        {section(
          'search.scope.people',
          peopleShown.map((u) =>
            row(
              'p-' + u.userId,
              <InitialsAvatar name={u.username} id={u.userId} size={40} />,
              u.username,
              // a friend says so, the way a list of people you follow does
              u.friend ? [u.displayName, t('search.friend')].filter(Boolean).join(' · ') : (u.displayName ?? null),
              () => navigation.navigate('UserProfile', { userId: u.userId }),
              u.username,
              person,
            ),
          ),
        )}

        {section(
          'search.scope.words',
          wordsShown.map((w) =>
            row(
              'w-' + w.entryId,
              glyph('text'),
              w.headword,
              w.definitionEn ?? w.definitionKu,
              () => setOpenEntry(w.entryId),
              w.headword,
            ),
          ),
        )}

        {section(
          'search.scope.lessons',
          lessons.map((l) =>
            row(
              'l-' + l.lessonId,
              glyph('book'),
              l.title,
              null,
              () => navigation.navigate('Lesson', { lessonId: l.lessonId }),
              l.title,
            ),
          ),
        )}

        {section(
          'search.scope.games',
          games.map((g) => {
            // two ways into one game under one name are told apart by the word on the card's button
            const way = wayWord(cards, g.key);
            const name = t(g.labelKey);
            return row(
              'g-' + g.key,
              glyph(g.icon),
              name,
              way ? t(way) : null,
              () => (g.route === 'WhoAmI' && g.params ? navigation.navigate('WhoAmI', g.params) : navigation.navigate(g.route)),
              way ? `${name}, ${t(way)}` : name,
            );
          }),
        )}

        {/* still looking, with nothing from the server to show yet: its rows in grey, where they will be */}
        {looking && peopleShown.length === 0 && wordsShown.length === 0 ? <ResultsSkeleton /> : null}

        {nothing ? (
          <EmptyState title={t('search.empty', { query: term })} />
        ) : null}

        {typed && !looking && failure ? <ErrorRetry message={describeError(failure, t)} onRetry={() => setAttempt((n) => n + 1)} /> : null}
      </ScrollView>
    </GradientBackground>
  );
}

/** No answer from the server, or none wanted: the same list each time, so nothing redraws for it. */
const NOBODY: UserRow[] = [];
const NO_WORDS: SearchHit[] = [];

/** People you may know, in grey: the heading and five rows at the rows' own size. */
function SuggestionsSkeleton(): React.JSX.Element {
  return <RowsSkeleton rows={5} testID="search-suggestions-loading" />;
}

/** What a search is still looking for, in grey: a heading and three rows, where its first answers will be. */
function ResultsSkeleton(): React.JSX.Element {
  return <RowsSkeleton rows={3} testID="search-looking" />;
}

/** A section in grey: its heading and `rows` rows at the rows' own size. */
function RowsSkeleton({ rows, testID }: { rows: number; testID: string }): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const start = { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' } as const;
  return (
    <View style={styles.section} accessibilityLabel={t('common.loading')} testID={testID}>
      <SkeletonText size={typography.sizes.xs} width={140} style={[styles.sectionTitleSkeleton, start]} />
      <View style={styles.rows}>
        {Array.from({ length: rows }, (_, i) => i).map((i) => (
          <View key={i} style={[styles.row, { flexDirection: dir.row }]}>
            <Skeleton width={40} height={40} radius={radii.pill} />
            <View style={styles.rowMain}>
              <SkeletonText size={typography.sizes.md} width={i % 2 ? '36%' : '48%'} style={start} />
              <SkeletonText size={typography.sizes.sm} width={i % 2 ? '52%' : '30%'} style={start} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: layout.gutter, gap: spacing.md - 4, paddingBottom: spacing.xs },
  content: { paddingHorizontal: spacing.sm, paddingTop: spacing.md, gap: spacing.lg },
  section: { gap: spacing.xs },
  sectionHead: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  sectionTitle: { ...sectionLabel, paddingHorizontal: spacing.sm },
  sectionTitleSkeleton: { paddingHorizontal: spacing.sm },
  sectionAction: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  rows: { gap: 2 },
  // edge to edge, out past the list's own inset
  discover: { marginHorizontal: -spacing.sm },
  hidden: { display: 'none' },
  row: {
    alignItems: 'center',
    gap: spacing.md - 4,
    minHeight: 56,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  recent: { alignItems: 'center', gap: spacing.md - 4, minHeight: MIN_TOUCH_TARGET, borderRadius: radii.md, paddingHorizontal: spacing.sm + 2 },
  glyph: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  rowSub: { fontSize: typography.sizes.sm },
  /** the part of a line that is what was searched for */
  match: { fontWeight: typography.weights.bold },
});
