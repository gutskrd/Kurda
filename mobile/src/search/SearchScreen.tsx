import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { GradientBackground } from '../theme/glass';
import { Chips } from '../theme/Chips';
import { SearchField } from '../theme/SearchField';
import { Icon, type IconName } from '../theme/Icon';
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
import { GAMES, SCOPES, SCOPE_LABEL, filterByLabel, matches, readyForServer, scopesToRun, type Scope } from './scope';
import { EmptyState } from '../theme/EmptyState';

interface UserRow {
  userId: string;
  username: string;
  displayName?: string | null;
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
 *            characters and for you to stop typing
 *   words    `/dictionary/search`, same
 *   lessons  the skill nodes of your first course, fetched once
 *   games    a list in `scope.ts`, matched on the spot
 *
 * The debounce is 250ms. Typing "kurd" at a normal speed is four keystrokes
 * inside 300ms; without it that is four calls against a budget of thirty a
 * minute, and the first three are answers to a question nobody asked.
 *
 * The field is the screen's header, pinned at the top. With nothing in it the
 * screen is not blank: it offers the searches you made before (kept on this
 * phone only) and people you may know, so the first thing a new reader sees
 * is somewhere to start rather than an instruction.
 */
export function SearchScreen(): React.JSX.Element {
  const { client } = useAuth();
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
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

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
    void client.get<{ suggestions: Suggestion[] }>('/friends/suggestions').then((r) => {
      if (live && r.ok) setSuggestions(r.data.suggestions);
    });
    return () => {
      live = false;
    };
  }, [client]);

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

  const run = useCallback(
    async (q: string, only: Scope) => {
      const wanted = scopesToRun(only);
      const trimmed = q.trim();

      if (wanted.includes('lessons')) setLessons(filterByLabel(allLessons, (l) => l.title, trimmed));
      if (!wanted.includes('lessons')) setLessons([]);
      if (!wanted.includes('people')) setPeople([]);
      if (!wanted.includes('words')) setWords([]);

      if (!readyForServer(trimmed)) {
        setPeople([]);
        setWords([]);
        return;
      }

      setBusy(true);
      const qs = encodeURIComponent(trimmed);
      const [p, w] = await Promise.all([
        wanted.includes('people') ? client.get<{ results: UserRow[] }>(`/users/search?q=${qs}`) : null,
        wanted.includes('words') ? client.get<SearchResult>(`/dictionary/search?q=${qs}`) : null,
      ]);
      setBusy(false);
      if (p?.ok) setPeople(p.data.results);
      if (w?.ok) setWords(w.data.results);
    },
    [client, allLessons],
  );

  /* One timer, reset on every keystroke and on a change of scope. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(query, scope), 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, scope, run]);

  const games = useMemo(() => {
    if (!scopesToRun(scope).includes('games')) return [];
    return GAMES.filter((g) => matches(t(g.labelKey), query.trim()));
  }, [scope, query, t]);

  const typed = query.trim().length > 0;
  const nothing = typed && !busy && people.length === 0 && words.length === 0 && lessons.length === 0 && games.length === 0;

  const section = (labelKey: TranslationKey, rows: React.ReactNode[]) =>
    rows.length === 0 ? null : (
      <View style={styles.section} key={labelKey}>
        <Text style={[styles.sectionTitle, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
          {t(labelKey)}
        </Text>
        <View style={styles.rows}>{rows}</View>
      </View>
    );

  const row = (key: string, left: React.ReactNode, title: string, sub: string | null, onPress: () => void, label: string) => (
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
          {title}
        </Text>
        {sub ? (
          <Text style={[styles.rowSub, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
            {sub}
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
        <Chips options={SCOPES} value={scope} onChange={setScope} labelOf={(s) => t(SCOPE_LABEL[s])} />
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
              <Pressable onPress={forgetRecents} accessibilityRole="button" accessibilityLabel={t('search.clearRecent')} hitSlop={8}>
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

        {!typed && recents.length === 0 && suggestions.length === 0 ? (
          <EmptyState title={t('search.start')} body={t('search.start.body')} />
        ) : null}

        {section(
          'search.scope.people',
          people.map((u) =>
            row(
              'p-' + u.userId,
              <InitialsAvatar name={u.username} id={u.userId} size={40} />,
              u.username,
              u.displayName ?? null,
              () => navigation.navigate('UserProfile', { userId: u.userId }),
              u.username,
            ),
          ),
        )}

        {section(
          'search.scope.words',
          words.map((w) =>
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
          games.map((g) =>
            row(
              'g-' + g.key,
              glyph(g.icon),
              t(g.labelKey),
              null,
              () => navigation.navigate(g.route),
              t(g.labelKey),
            ),
          ),
        )}

        {nothing ? (
          <EmptyState title={t('search.empty', { query: query.trim() })} />
        ) : null}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: layout.gutter, gap: spacing.md - 4, paddingBottom: spacing.xs },
  content: { paddingHorizontal: spacing.sm, paddingTop: spacing.md, gap: spacing.lg },
  section: { gap: spacing.xs },
  sectionHead: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  sectionTitle: { ...sectionLabel, paddingHorizontal: spacing.sm },
  sectionAction: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  rows: { gap: 2 },
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
});
