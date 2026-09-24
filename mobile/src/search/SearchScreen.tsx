import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { LargeTitle } from '../navigation/LargeTitle';
import { SideMenuButton, useOpenMenu } from '../navigation/SideMenu';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import type { SearchHit, SearchResult } from '../dictionary/types';
import { EntryDetail } from '../dictionary/EntryDetail';
import type { CourseMap, CourseSummary } from '../coursemap/types';
import { flattenMap } from '../coursemap/node';
import { GAMES, SCOPES, SCOPE_LABEL, filterByLabel, matches, readyForServer, scopesToRun, type Scope } from './scope';

interface UserRow {
  userId: string;
  username: string;
  displayName?: string | null;
}

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
 */
export function SearchScreen(): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const openMenu = useOpenMenu();
  const topInset = useScreenTopInset();
  const bottomInset = useTabBarInset();

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [people, setPeople] = useState<UserRow[]>([]);
  const [words, setWords] = useState<SearchHit[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [openEntry, setOpenEntry] = useState<string | null>(null);

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
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t(labelKey)}</Text>
        <View style={styles.rows}>{rows}</View>
      </View>
    );

  const row = (key: string, left: React.ReactNode, title: string, sub: string | null, onPress: () => void, label: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
    >
      {left}
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={16} color={colors.textSecondary} />
    </Pressable>
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
      <View style={{ paddingTop: topInset }}>
        <LargeTitle left={<SideMenuButton onPress={openMenu} />} title={t('search.title')} />
      </View>

      <View style={styles.controls}>
        <View style={[styles.field, { backgroundColor: colors.controlTrack }]}>
          <Icon name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={t('search.title')}
            style={[styles.input, { color: colors.textPrimary }]}
          />
        </View>
        <Segmented
          options={SCOPES}
          value={scope}
          onChange={setScope}
          labelOf={(s) => t(SCOPE_LABEL[s])}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!typed ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('search.start')}</Text>
        ) : null}

        {section(
          'search.scope.people',
          people.map((u) =>
            row(
              'p-' + u.userId,
              <InitialsAvatar name={u.username} id={u.userId} size={36} />,
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
              <Icon name="text" size={20} color={colors.primary} />,
              w.headword,
              w.definitionEn,
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
              <Icon name="book" size={20} color={colors.primary} />,
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
              <Icon name={g.icon} size={20} color={colors.primary} />,
              t(g.labelKey),
              null,
              () => navigation.navigate(g.route),
              t(g.labelKey),
            ),
          ),
        )}

        {nothing ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('search.empty', { query: query.trim() })}</Text>
        ) : null}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, fontSize: typography.sizes.md, minHeight: MIN_TOUCH_TARGET },
  content: { padding: spacing.lg, gap: spacing.lg },
  hint: { fontSize: typography.sizes.md, textAlign: 'center', marginTop: spacing.xl },
  section: { gap: spacing.sm },
  sectionTitle: { ...sectionLabel },
  rows: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  rowSub: { fontSize: typography.sizes.sm },
});
