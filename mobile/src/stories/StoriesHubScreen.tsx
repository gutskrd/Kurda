import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import {
  STORY_DIALECTS,
  STORY_LENGTHS,
  normalizeJoinCode,
  parseInvite,
  type StoryDialect,
  type StoryGameSummary,
  type StoryLength,
  type StoryListItem,
  type StoryProgress,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError, type Translate } from '../api/errors';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ClayButton, ErrorRetry, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText, lineOf } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { lobbyRoute } from '../play/routes';
import { activeGames, joinGame, listStories, storyHistory } from './api';
import { DIALECT_NAME, LENGTH_KEY, MODE_KEY, lengthWithMinutes } from './labels';
import { useStoryPrefs } from './prefs';
import { SetupSheet } from './SetupSheet';
import { storyRowStyle, storyTextProps, storyTextStyle } from './storyText';
import { COLUMN, ChoiceChips, Note, Pill, SectionLabel, Sheet } from './ui';

/** The level filter appears only once a variety has this many stories; before that it would filter almost nothing. */
export const LEVEL_FILTER_FROM = 20;

type LengthFilter = 'all' | StoryLength;
type LevelFilter = 'all' | '1' | '2' | '3';

/**
 * Which variety the hub opens on (contract §A1): Soranî when the interface is
 * Soranî, else the one chosen last time on this phone, else Kurmancî. (The
 * contract puts the learner's course first; the phone has no notion of a
 * current course — every course is listed side by side — so that step is
 * skipped here.)
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

/**
 * Stories (contract §A1 "Hub"): games to go back to on top, then the stories
 * of one variety to read, filtered by length (and by level once there are
 * enough), and the two ways into a game with other people — set one up, or
 * join one with a code or a link a friend sent.
 *
 * `id` arrives when an invite link (`/app/games/stories?id=…`) opened the app:
 * the hub hands straight over to that game, which joins it if it may.
 */
export function StoriesHubScreen({ id, onExit }: { id?: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const { prefs, ready, update } = useStoryPrefs();

  const [stories, setStories] = useState<StoryListItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [active, setActive] = useState<StoryGameSummary[]>([]);
  const [progress, setProgress] = useState<Map<string, StoryProgress>>(new Map());
  const [dialect, setDialect] = useState<StoryDialect | null>(null);
  const [length, setLength] = useState<LengthFilter>('all');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  useEffect(() => {
    if (id) navigation.replace('StoryGame', { id });
  }, [id, navigation]);

  // the variety and length remembered on this phone, once they are read
  useEffect(() => {
    if (!ready || dialect) return;
    /*
     * As updates, not values: this effect can run just after a tap on a
     * variety or a length in the screen's first moments (React runs it before
     * the tap's render), and what was tapped wins over what was remembered.
     */
    const remembered = prefs.length;
    setDialect((d) => d ?? defaultDialect(locale, prefs.dialect));
    if (remembered) setLength((l) => (l === 'all' ? remembered : l));
  }, [ready, dialect, locale, prefs.dialect, prefs.length]);

  const load = useCallback(() => {
    setError(null);
    void listStories(client).then((res) => {
      if (res.ok) setStories(res.data.stories);
      else setError(res.error);
    });
    void activeGames(client).then((res) => {
      if (res.ok) setActive(res.data.games);
    });
    void storyHistory(client).then((res) => {
      if (res.ok) setProgress(new Map(res.data.progress.map((p) => [p.storyId, p])));
    });
  }, [client]);

  // again on coming back, so a game just finished leaves "Continue" and shows its score
  useFocusEffect(useCallback(() => load(), [load]));

  const current = dialect ?? 'kurmanci';
  const ofVariety = useMemo(() => (stories ?? []).filter((s) => s.dialect === current), [stories, current]);
  const other: StoryDialect = current === 'kurmanci' ? 'sorani' : 'kurmanci';
  const otherCount = (stories ?? []).filter((s) => s.dialect === other).length;
  const showLevels = ofVariety.length >= LEVEL_FILTER_FROM;
  const shown = ofVariety.filter(
    (s) => (length === 'all' || s.length === length) && (!showLevels || level === 'all' || String(s.level) === level),
  );

  const pickDialect = (d: StoryDialect): void => {
    setDialect(d);
    update({ dialect: d });
  };
  const pickLength = (l: LengthFilter): void => {
    setLength(l);
    update({ length: l === 'all' ? null : l });
  };

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

  return (
    <GradientBackground>
      <ScreenHeader title={t('stories.title')} onBack={onExit} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {active.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>{t('stories.continue')}</SectionLabel>
            {active.map((g) => (
              <ContinueCard key={g.id} game={g} onOpen={() => navigation.navigate('StoryGame', { id: g.id })} />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionLabel>{t('stories.variety')}</SectionLabel>
          <Segmented<StoryDialect>
            groupLabel={t('stories.variety')}
            options={STORY_DIALECTS}
            value={current}
            onChange={pickDialect}
            labelOf={(d) => DIALECT_NAME[d]}
          />
        </View>

        <View style={styles.section}>
          <SectionLabel>{t('stories.setup.length')}</SectionLabel>
          <ChoiceChips<LengthFilter>
            label={t('stories.setup.length')}
            options={['all', ...STORY_LENGTHS]}
            value={length}
            onChange={pickLength}
            labelOf={(l) => (l === 'all' ? t('stories.filter.all') : lengthWithMinutes(current, l, t))}
          />
          {showLevels ? (
            <Segmented<LevelFilter>
              groupLabel={t('stories.filter.level')}
              options={['all', '1', '2', '3']}
              value={level}
              onChange={setLevel}
              labelOf={(l) => (l === 'all' ? t('stories.filter.all') : t('stories.level', { level: l }))}
            />
          ) : null}
        </View>

        <View style={styles.actions}>
          <ClayButton
            label={t('stories.together.setup')}
            icon="user-plus"
            tone="primary"
            disabled={ofVariety.length === 0}
            onPress={() => setSetupOpen(true)}
          />
          <ClayButton label={t('stories.join.open')} icon="link" onPress={() => setJoinOpen(true)} />
        </View>

        <View style={styles.section}>
          <SectionLabel>{t('stories.read')}</SectionLabel>
          {stories === null && !error ? (
            <StoriesSkeleton />
          ) : error ? (
            <ErrorRetry message={describeError(error, t)} onRetry={load} />
          ) : ofVariety.length === 0 ? (
            <View style={styles.empty}>
              <Note icon="story">{t(current === 'sorani' ? 'stories.empty.sorani' : 'stories.empty.kurmanci')}</Note>
              {otherCount > 0 ? (
                <ClayButton
                  label={t('stories.empty.switch', { variety: DIALECT_NAME[other] })}
                  variant="outline"
                  tone="primary"
                  onPress={() => pickDialect(other)}
                />
              ) : null}
            </View>
          ) : shown.length === 0 ? (
            <Note>{t('stories.filter.none')}</Note>
          ) : (
            shown.map((s) => (
              <StoryRow
                key={s.id}
                story={s}
                progress={progress.get(s.id) ?? null}
                onOpen={() => navigation.navigate('StoryReader', { slug: s.slug })}
              />
            ))
          )}
        </View>
      </ScrollView>

      {setupOpen ? (
        <SetupSheet
          dialect={current}
          stories={ofVariety}
          initialMode="duo"
          onClose={() => setSetupOpen(false)}
          onCreated={(view) => {
            setSetupOpen(false);
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
          <Text style={[styles.playBody, { color: colors.textSecondary }]}>{t('stories.join.hint')}</Text>
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
    </GradientBackground>
  );
}

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
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      // the story's title is read in the story's language; the app's words about it go in the value
      accessibilityLabel={game.storyTitle}
      {...storyTextProps(game.dialect)}
      accessibilityValue={{ text: `${t(MODE_KEY[game.mode])}, ${where}` }}
      accessibilityHint={t('stories.continue')}
      style={({ pressed }) => [styles.continue, { backgroundColor: colors.glassFill, opacity: pressed ? 0.85 : 1 }]}
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
    </Pressable>
  );
}

/** The list while it loads: story cards in grey — the title, two lines of summary, the facts as pills. */
function StoriesSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const wide = width >= 600;
  // cards enough to reach the foot of the screen under the choices above them
  const count = Math.max(3, Math.ceil((height - 420) / 112));
  return (
    <View style={styles.section} accessibilityLabel={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.story, { backgroundColor: colors.glassFill }]}>
          <SkeletonText size={typography.sizes.lg} lineHeight={STORY_TITLE_LINE} width={i % 2 ? '42%' : '56%'} />
          {/* a summary runs to two lines across a phone and fits on one across a tablet */}
          <View>
            <SkeletonText size={typography.sizes.sm} lineHeight={20} width={wide ? '72%' : '94%'} />
            {wide ? null : <SkeletonText size={typography.sizes.sm} lineHeight={20} width="60%" />}
          </View>
          <View style={styles.pills}>
            {[56, 64, 80].map((w) => (
              <Skeleton key={w} width={w} height={PILL_HEIGHT} radius={radii.pill} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** display(22) sets 1.12 */
const STORY_TITLE_LINE = Math.round(typography.sizes.lg * typography.displayLineHeight);
/** a pill: a 13pt line, 3 above and below */
const PILL_HEIGHT = lineOf(typography.sizes.xs) + 6;

function StoryRow({
  story,
  progress,
  onOpen,
}: {
  story: StoryListItem;
  progress: StoryProgress | null;
  onOpen: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const minutes = t('stories.aboutMinutes', { count: story.readingMinutes });
  const done = progress ? t('stories.done', { correct: progress.bestCorrect, total: progress.total }) : null;
  const facts = [t('stories.level', { level: story.level }), t(LENGTH_KEY[story.length]), minutes];
  if (story.fullyNarrated) facts.push(t('stories.narrated'));
  if (done) facts.push(done);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      // the title in the story's language; its facts, in the app's words, as the value
      accessibilityLabel={story.title}
      {...storyTextProps(story.dialect)}
      accessibilityValue={{ text: facts.join(', ') }}
      style={({ pressed }) => [styles.story, { backgroundColor: colors.glassFill, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text {...storyTextProps(story.dialect)} style={[styles.storyTitle, { color: colors.textPrimary }, storyTextStyle(story.dialect)]}>
        {story.title}
      </Text>
      {story.summary ? (
        <Text {...storyTextProps(story.dialect)} style={[styles.summary, { color: colors.textSecondary }, storyTextStyle(story.dialect)]} numberOfLines={2}>
          {story.summary}
        </Text>
      ) : null}
      <View style={[styles.pills, storyRowStyle(story.dialect)]}>
        <Pill label={t('stories.level', { level: story.level })} />
        <Pill label={t(LENGTH_KEY[story.length])} />
        <Pill label={minutes} />
        {story.fullyNarrated ? <Pill icon="headphones" label={t('stories.narratedShort')} tone="primary" /> : null}
        {done ? <Pill icon="check" label={done} tone="success" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { ...COLUMN, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  section: { gap: spacing.sm },
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
  playBody: { fontSize: typography.sizes.sm, lineHeight: 20 },
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
  empty: { gap: spacing.md },
  story: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  storyTitle: { ...display(typography.sizes.lg) },
  summary: { fontSize: typography.sizes.sm, lineHeight: 20 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
});
