import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { glossFor, type StoryDetail, type StoryGameMode, type StoryGlossEntry } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { Skeleton, SkeletonText, lineOf } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { activeGames, createGame, getGame, getStory, isView } from './api';
import { DIALECT_NAME, LENGTH_KEY } from './labels';
import { narrationItems, narrationLine } from './narration';
import { TEXT_SCALES, useStoryPrefs, type TextScale } from './prefs';
import { createErrorMessage, SetupSheet } from './SetupSheet';
import { createInput, initialSetup } from './setup';
import { STORY_BODY_SIZE, StoryText, storyLineHeight } from './StoryText';
import { ENGLISH_TEXT_PROPS, ENGLISH_TEXT_STYLE, storyRowStyle, storyTextProps, storyTextStyle } from './storyText';
import { useNarration } from './useNarration';
import { COLUMN, Card, Note, Pill, SectionLabel, Sheet } from './ui';
import { NarrationBar } from './NarrationBar';
import { CHARACTER_SIZE, SpeakingCharacter } from '../characters/SpeakingCharacter';

/**
 * Reading a story (contract §A1 "Reader"), then playing it.
 *
 * Every string from the story carries the story's own direction and language
 * (`storyTextStyle`), so a Soranî story reads right to left in any interface
 * language. The text size is the reader's own (remembered on this phone) on
 * top of the system's Dynamic Type. Glossary words are underlined in the text
 * and listed again under "Words in this story", which is the way to them for
 * a screen reader. Audio is never started by touching the text: each
 * paragraph with recordings has a Listen button, and a story recorded from
 * end to end has a bar to play all of it.
 *
 * Then the three ways to play: "Quiz yourself" starts at once with the
 * settings this phone remembers (no timer, the text on screen, by default);
 * "With a friend" and "With a group" open the setup sheet with this story.
 */
export function StoryReaderScreen({ slug, onExit }: { slug: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const reduceMotion = useReducedMotion();
  const { prefs, update } = useStoryPrefs();
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [gloss, setGloss] = useState<StoryGlossEntry | null>(null);
  const [setupMode, setSetupMode] = useState<StoryGameMode | null>(null);
  const [unfinished, setUnfinished] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const { narrator, state: narration } = useNarration(prefs.rate);
  const scroll = useRef<ScrollView>(null);
  const textTop = useRef(0);
  const paragraphTops = useRef(new Map<number, number>());

  const load = useCallback(() => {
    setError(null);
    void getStory(client, slug).then((res) => {
      if (res.ok) setStory(res.data);
      else setError(res.error);
    });
  }, [client, slug]);
  useEffect(load, [load]);

  // the sound stops when this screen is left, for a game or for anything else
  useFocusEffect(useCallback(() => () => narrator.stop(), [narrator]));

  const items = useMemo(() => (story ? narrationItems(story.paragraphs, story.audio) : []), [story]);
  const listenable = useMemo(() => new Set(items.map((i) => i.paragraph)), [items]);
  // what each recorded sentence says and who says it; a paragraph with a character keeps room for one
  const lines = useMemo(() => new Map(items.map((i) => [i, narrationLine(story?.paragraphs ?? [], story?.voices, i)])), [items, story]);
  const voiced = useMemo(() => new Set(items.filter((i) => lines.get(i)?.voice).map((i) => i.paragraph)), [items, lines]);

  // the sentence being read stays in view; reduced motion jumps rather than glides
  const followed = narration.scope === 'story' ? narration.current?.paragraph : undefined;
  useEffect(() => {
    if (followed === undefined) return;
    const y = paragraphTops.current.get(followed);
    if (y === undefined) return;
    scroll.current?.scrollTo({ y: Math.max(0, textTop.current + y - 96), animated: !reduceMotion });
  }, [followed, reduceMotion]);

  const listenTo = (paragraph: number): void => {
    if (narration.scope === 'paragraph' && narration.paragraph === paragraph) {
      narrator.toggle();
      return;
    }
    narrator.play(items.filter((i) => i.paragraph === paragraph), 'paragraph');
  };

  const textScale = prefs.textScale;
  const scaleIndex = TEXT_SCALES.indexOf(textScale);
  const resize = (step: 1 | -1): void => {
    const next = TEXT_SCALES[Math.max(0, Math.min(TEXT_SCALES.length - 1, scaleIndex + step))] as TextScale;
    update({ textScale: next });
  };

  /** "Quiz yourself": back to an unfinished solo game on this story, or a new one at once. */
  const quizYourself = async (fresh = false): Promise<void> => {
    if (!story || starting) return;
    setStartError(null);
    setStarting(true);
    if (!fresh) {
      const existing = await findUnfinishedSolo(story);
      if (existing) {
        setStarting(false);
        setUnfinished(existing);
        return;
      }
    }
    narrator.stop();
    const setup = initialSetup({ mode: 'solo', dialect: story.dialect, story, solo: prefs.quiz });
    const res = await createGame(client, createInput(setup, { skipReading: true, extraTime: prefs.extraTime }));
    setStarting(false);
    if (!res.ok) {
      setStartError(createErrorMessage(res.error, t));
      return;
    }
    setUnfinished(null);
    navigation.navigate('StoryGame', { id: res.data.id });
  };

  /** The active list has titles, not ids; a title match is confirmed against the game itself. */
  const findUnfinishedSolo = async (s: StoryDetail): Promise<string | null> => {
    const res = await activeGames(client);
    if (!res.ok) return null;
    for (const g of res.data.games.filter((x) => x.mode === 'solo' && x.storyTitle === s.title)) {
      const view = await getGame(client, g.id);
      if (view.ok && isView(view.data) && view.data.settings.storyId === s.id) return g.id;
    }
    return null;
  };

  const headerRight = (
    <View style={styles.sizeControls}>
      <Pressable
        onPress={() => resize(-1)}
        disabled={scaleIndex <= 0}
        accessibilityRole="button"
        accessibilityLabel={t('stories.reader.smaller')}
        accessibilityState={{ disabled: scaleIndex <= 0 }}
        style={[styles.sizeButton, { opacity: scaleIndex <= 0 ? 0.35 : 1 }]}
      >
        <Text style={[styles.sizeSmall, { color: colors.primary }]}>A</Text>
      </Pressable>
      <Pressable
        onPress={() => resize(1)}
        disabled={scaleIndex >= TEXT_SCALES.length - 1}
        accessibilityRole="button"
        accessibilityLabel={t('stories.reader.larger')}
        accessibilityState={{ disabled: scaleIndex >= TEXT_SCALES.length - 1 }}
        style={[styles.sizeButton, { opacity: scaleIndex >= TEXT_SCALES.length - 1 ? 0.35 : 1 }]}
      >
        <Text style={[styles.sizeLarge, { color: colors.primary }]}>A</Text>
      </Pressable>
    </View>
  );

  if (error || !story) {
    return (
      <GradientBackground>
        <ScreenHeader title={t('stories.title')} onBack={onExit} />
        {error ? (
          error.status === 404 ? (
            <View style={styles.content}>
              <Note icon="story">{t('stories.reader.unavailable')}</Note>
            </View>
          ) : (
            <ErrorRetry message={describeError(error, t)} onRetry={load} />
          )
        ) : (
          <ReaderSkeleton scale={textScale} />
        )}
      </GradientBackground>
    );
  }

  const dir = storyTextStyle(story.dialect);
  const props = storyTextProps(story.dialect);
  const reading = narration.current;
  const line = reading ? lines.get(reading) : undefined;
  // the character faces back toward the Listen it stands after
  const speaker =
    reading && line?.voice
      ? {
          paragraph: reading.paragraph,
          view: (
            <SpeakingCharacter
              speaker={line.voice.speaker}
              voice={line.voice}
              text={line.text}
              player={narrator.clock}
              playing={narration.playing}
              source={reading.url}
              size={CHARACTER_SIZE.row}
              flip={dir.writingDirection !== 'rtl'}
            />
          ),
        }
      : null;

  return (
    <GradientBackground>
      <ScreenHeader title={t('stories.title')} onBack={onExit} right={headerRight} />
      <ScrollView ref={scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text {...props} style={[styles.title, { color: colors.textPrimary }, dir]} accessibilityRole="header">
            {story.title}
          </Text>
          <View style={[styles.pills, storyRowStyle(story.dialect)]}>
            <Pill label={DIALECT_NAME[story.dialect]} tone="primary" />
            <Pill label={t('stories.level', { level: story.level })} />
            <Pill label={t(LENGTH_KEY[story.length])} />
            <Pill label={t('stories.aboutMinutes', { count: story.readingMinutes })} />
            {story.fullyNarrated ? <Pill icon="headphones" label={t('stories.narratedShort')} tone="primary" /> : null}
          </View>
          {story.summary ? (
            <Text {...props} style={[styles.summary, { color: colors.textSecondary }, dir]}>
              {story.summary}
            </Text>
          ) : null}
        </View>

        {story.fullyNarrated && items.length > 0 ? (
          <NarrationBar
            narrator={narrator}
            state={narration}
            items={items}
            rate={prefs.rate}
            onRate={(rate) => update({ rate })}
          />
        ) : null}

        <View onLayout={(e) => (textTop.current = e.nativeEvent.layout.y)}>
          <StoryText
            story={story}
            fontSize={Math.round(STORY_BODY_SIZE * textScale)}
            current={narration.current ? { paragraph: narration.current.paragraph, sentence: narration.current.sentence } : null}
            onGloss={setGloss}
            listenable={listenable}
            listening={narration.scope === 'paragraph' ? narration.paragraph : null}
            playing={narration.playing}
            onListen={listenTo}
            voiced={voiced}
            speaker={speaker}
            onParagraphLayout={(p, y) => paragraphTops.current.set(p, y)}
          />
        </View>

        {story.glossary.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>{t('stories.reader.words')}</SectionLabel>
            <Card padding="tight">
              {story.glossary.map((entry) => {
                const meaning = glossFor(entry, locale);
                const english = meaning.lang === 'en' && locale !== 'en';
                return (
                  <Pressable
                    key={entry.term}
                    onPress={() => setGloss(entry)}
                    accessibilityRole="button"
                    // the word in the story's language; its meaning, in the app's (or English), as the value
                    accessibilityLabel={entry.term}
                    {...props}
                    accessibilityValue={{ text: meaning.text }}
                    // the meaning sits under its word, on the side the story is written from
                    style={[styles.wordRow, { alignItems: dir.textAlign === 'right' ? 'flex-end' : 'flex-start' }]}
                  >
                    <Text {...props} style={[styles.wordTerm, { color: colors.textPrimary }, dir]}>
                      {entry.term}
                    </Text>
                    <Text
                      {...(english ? ENGLISH_TEXT_PROPS : {})}
                      style={[styles.wordMeaning, { color: colors.textSecondary }, english ? ENGLISH_TEXT_STYLE : null]}
                    >
                      {meaning.text}
                    </Text>
                  </Pressable>
                );
              })}
            </Card>
          </View>
        ) : null}

        <Card style={styles.play}>
          <Text style={[styles.playTitle, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('stories.reader.readIt')}
          </Text>
          <ClayButton
            label={t('stories.reader.quizYourself')}
            icon="check"
            tone="primary"
            size="large"
            busy={starting}
            onPress={() => void quizYourself()}
          />
          <Pressable
            onPress={() => setSetupMode('solo')}
            accessibilityRole="button"
            style={styles.settingsLink}
            hitSlop={8}
          >
            <Text style={[styles.settingsText, { color: colors.primary }]}>{t('stories.reader.quizSettings')}</Text>
          </Pressable>
          {startError ? <Note tone="danger" icon="alert">{startError}</Note> : null}
          <ClayButton label={t('stories.mode.duo')} icon="person" onPress={() => setSetupMode('duo')} />
          <ClayButton label={t('stories.mode.group')} icon="people" onPress={() => setSetupMode('group')} />
        </Card>
      </ScrollView>

      {gloss ? <GlossSheet entry={gloss} dialect={story.dialect} onClose={() => setGloss(null)} /> : null}

      {setupMode ? (
        <SetupSheet
          dialect={story.dialect}
          stories={[story]}
          story={story}
          initialMode={setupMode}
          skipReading={setupMode === 'solo'}
          onClose={() => setSetupMode(null)}
          onCreated={(view) => {
            setSetupMode(null);
            narrator.stop();
            navigation.navigate('StoryGame', { id: view.id });
          }}
        />
      ) : null}

      {unfinished ? (
        <Sheet
          title={t('stories.reader.unfinishedTitle')}
          onClose={() => setUnfinished(null)}
          footer={
            <>
              <ClayButton
                label={t('stories.continueButton')}
                tone="primary"
                size="large"
                onPress={() => {
                  const id = unfinished;
                  setUnfinished(null);
                  narrator.stop();
                  navigation.navigate('StoryGame', { id });
                }}
              />
              <ClayButton label={t('stories.reader.startAgain')} busy={starting} onPress={() => void quizYourself(true)} />
            </>
          }
        >
          <Text style={[styles.sheetText, { color: colors.textSecondary }]}>{t('stories.reader.unfinishedBody')}</Text>
        </Sheet>
      ) : null}
    </GradientBackground>
  );
}

/** A word's meaning in the interface language (English when there is none), marked as English when it is. */
function GlossSheet({ entry, dialect, onClose }: { entry: StoryGlossEntry; dialect: StoryDetail['dialect']; onClose: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const meaning = glossFor(entry, locale);
  const english = meaning.lang === 'en' && locale !== 'en';
  return (
    <Sheet title={t('stories.reader.meaning')} onClose={onClose}>
      <Text {...storyTextProps(dialect)} style={[styles.glossTerm, { color: colors.textPrimary }, storyTextStyle(dialect)]}>
        {entry.term}
      </Text>
      <Text
        {...(english ? ENGLISH_TEXT_PROPS : {})}
        style={[styles.glossMeaning, { color: colors.textPrimary }, english ? ENGLISH_TEXT_STYLE : null]}
      >
        {meaning.text}
      </Text>
      {english ? <Text style={[styles.sheetText, { color: colors.textSecondary }]}>{t('stories.reader.inEnglish')}</Text> : null}
    </Sheet>
  );
}

/**
 * The story while it loads, in the reader's own column: the title, the facts,
 * the summary, and paragraphs at the reader's chosen size and the story's own
 * line height — so the words arrive on the lines that were waiting for them.
 */
function ReaderSkeleton({ scale }: { scale: number }): React.JSX.Element {
  const { t } = useI18n();
  const line = storyLineHeight(Math.round(STORY_BODY_SIZE * scale));
  const size = Math.round(STORY_BODY_SIZE * scale);
  const widths = ['96%', '92%', '98%', '70%'] as const;
  const { height } = useWindowDimensions();
  const paragraphs = Math.max(3, Math.ceil((height - 260) / (line * widths.length + spacing.md)));
  return (
    <View style={styles.content} accessibilityLabel={t('common.loading')}>
      <View style={styles.head}>
        <SkeletonText size={typography.sizes.xl} lineHeight={TITLE_LINE} width="60%" />
        <View style={styles.pills}>
          {[72, 56, 64, 80].map((w) => (
            <Skeleton key={w} width={w} height={lineOf(typography.sizes.xs) + 6} radius={radii.pill} />
          ))}
        </View>
        <View>
          <SkeletonText size={typography.sizes.md} lineHeight={22} width="94%" />
          <SkeletonText size={typography.sizes.md} lineHeight={22} width="58%" />
        </View>
      </View>
      <View style={styles.paragraphs}>
        {Array.from({ length: paragraphs }, (_, p) => (
          <View key={p}>
            {widths.map((w, i) => (
              <SkeletonText key={i} size={size} lineHeight={line} width={w} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/** display(28) sets 1.12 */
const TITLE_LINE = Math.round(typography.sizes.xl * typography.displayLineHeight);

const styles = StyleSheet.create({
  paragraphs: { gap: spacing.md },
  content: { ...COLUMN, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  head: { gap: spacing.sm },
  title: { ...display(typography.sizes.xl) },
  summary: { fontSize: typography.sizes.md, lineHeight: 22 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  sizeControls: { flexDirection: 'row', alignItems: 'center' },
  sizeButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  sizeSmall: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  sizeLarge: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  section: { gap: spacing.sm },
  wordRow: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingVertical: spacing.xs, gap: 2 },
  wordTerm: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  wordMeaning: { fontSize: typography.sizes.sm },
  play: { gap: spacing.md },
  playTitle: { ...display(typography.sizes.lg) },
  settingsLink: { alignSelf: 'center', minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  settingsText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  sheetText: { fontSize: typography.sizes.md, lineHeight: 22 },
  glossTerm: { ...display(typography.sizes.xl) },
  glossMeaning: { fontSize: typography.sizes.lg, lineHeight: 26 },
});
