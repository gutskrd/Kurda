import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { heldRow } from '../theme/MotionParts';
import {
  CHARACTER_NAMES,
  PAID_STORY_REPEATS_PER_DAY,
  STORY_ASSESSMENT,
  glossFor,
  storyAudioSentences,
  type StoryCategory,
  type StoryDetail,
  type StoryGameMode,
  type StoryGlossEntry,
  type StoryMe,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useAccountGate } from '../auth/AccountGate';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET, hitSlopFor } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useClipPlayer } from '../alphabet/useClipPlayer';
import { haptic } from '../feedback/haptics';
import { limitErrorText } from '../limits/limitCopy';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText, lineOf } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { activeGames, createGame, getCategories, getStory, saveProgress, saveWord, savedWords, setBookmark, type ProgressInput } from './api';
import { StoryCover } from './covers';
import { DIALECT_NAME, TRADITION_KEY, categoryLabel, levelName, narrationLabel } from './labels';
import { narrationItems, narrationLine, narrationTrack } from './narration';
import { TEXT_SCALES, useStoryPrefs, type TextScale } from './prefs';
import { createErrorMessage, SetupSheet } from './SetupSheet';
import { STORY_BODY_SIZE, StoryText, storyLineHeight } from './StoryText';
import { ENGLISH_TEXT_PROPS, ENGLISH_TEXT_STYLE, storyRowStyle, storyTextProps, storyTextStyle } from './storyText';
import { useNarration } from './useNarration';
import { COLUMN, Card, Note, Pill, SectionLabel, Sheet } from './ui';
import { NarrationBar } from './NarrationBar';
import { CHARACTER_SIZE, SpeakingCharacter } from '../characters/SpeakingCharacter';

/** A reading position is sent to the server at most this often; also on leaving the text. */
export const PROGRESS_EVERY_MS = 10_000;

/** How far down the screen a paragraph's top must be for it to count as the one being read. */
const READING_LINE = 0.6;

/**
 * Where the reader is in the text, from where the text is scrolled to: the
 * last paragraph whose top has passed the reading line, how far through the
 * paragraphs that is, and whether the end has been reached — the last
 * paragraph passing the line, or the list scrolled to its foot.
 */
export function readingPosition(
  scrollY: number,
  viewportHeight: number,
  contentHeight: number,
  textTop: number,
  paragraphTops: ReadonlyMap<number, number>,
  paragraphs: number,
): ProgressInput {
  if (paragraphs === 0) return { paragraph: 0, share: 0, finished: false };
  const line = scrollY + viewportHeight * READING_LINE;
  let paragraph = 0;
  for (let p = 0; p < paragraphs; p += 1) {
    const top = paragraphTops.get(p);
    if (top !== undefined && textTop + top <= line) paragraph = p;
  }
  const atEnd = contentHeight > 0 && scrollY + viewportHeight >= contentHeight - 24;
  if (atEnd) paragraph = paragraphs - 1;
  const finished = paragraph >= paragraphs - 1;
  return { paragraph, share: finished ? 1 : Math.min(1, (paragraph + 1) / paragraphs), finished };
}

/** How many minutes of a story are left at `share` of it: never less than one while there is any. */
export function minutesLeft(readingMinutes: number, share: number): number {
  return Math.max(1, Math.ceil(readingMinutes * (1 - Math.max(0, Math.min(1, share)))));
}

/** The translation shown under the paragraphs: the reader's language, else English, else none. */
export function translationFor(story: Pick<StoryDetail, 'translations'>, locale: string): { paragraphs: string[]; lang: string } | null {
  const own = story.translations[locale];
  if (own && own.length > 0) return { paragraphs: own, lang: locale };
  const en = story.translations.en;
  if (en && en.length > 0) return { paragraphs: en, lang: 'en' };
  return null;
}

type Mode = 'overview' | 'reading';

/**
 * A story (design notes §1–§3): its overview first, then the text.
 *
 * The overview is the story's cover page: its picture, title, level with its
 * word ("A2 · Elementary"), category, minutes and words, whether it is read
 * aloud, who wrote or told it and from what tradition, its synopsis, the
 * other versions of the same story, then Read (or Continue, with the minutes
 * left) and Listen, the key vocabulary with a play button where the
 * dictionary has a clip and Save where the word is a headword, and the check
 * at the end — locked with a line until the story has been finished.
 *
 * The text is set in the display serif, generously leaded, with glossary
 * words marked in dotted gold; a tap on one opens its meaning, part of speech
 * and the same play and save; a Translation toggle under each paragraph shows
 * it in the reader's language. Every string from the story carries the
 * story's own direction and language (`storyTextStyle`), so a Soranî story
 * reads right to left in any interface language; the text size is the
 * reader's own, remembered on this phone, on top of the system's Dynamic
 * Type. Where the reader is comes from where the text is scrolled to and is
 * remembered on the server at most every ten seconds and on leaving — so the
 * overview can say "Continue · 3 min left" and offer the paragraph to go on
 * from. Audio is never started by touching the text: each paragraph with
 * recordings has a Listen button, and a story with recordings has the player
 * bar.
 *
 * The check is the solo game with the assessment's settings (five untimed
 * questions, the text at hand), opened in the game screen; the two ways to
 * play with other people open the setup sheet with this story.
 */
export function StoryReaderScreen({ slug, onExit }: { slug: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const gate = useAccountGate();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const reduceMotion = useReducedMotion();
  const { prefs, update } = useStoryPrefs();
  const bottomInset = useScreenBottomInset(spacing.md);
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [me, setMe] = useState<StoryMe | null>(null);
  const [categories, setCategories] = useState<StoryCategory[] | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [mode, setMode] = useState<Mode>('overview');
  const [gloss, setGloss] = useState<StoryGlossEntry | null>(null);
  const [setupMode, setSetupMode] = useState<StoryGameMode | null>(null);
  const [unfinished, setUnfinished] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [translated, setTranslated] = useState<ReadonlySet<number>>(new Set());
  // the end of the text reached in this sitting, before the server has said so
  const [reachedEnd, setReachedEnd] = useState(false);
  const [continueFrom, setContinueFrom] = useState<number | null>(null);
  // the glossary's dictionary words already in the reader's vocabulary, and a save that did not take
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [saveError, setSaveError] = useState<{ entryId: string; text: string } | null>(null);
  const { narrator, state: narration } = useNarration(prefs.rate);
  const clips = useClipPlayer();
  const scroll = useRef<ScrollView>(null);
  const textTop = useRef(0);
  const paragraphTops = useRef(new Map<number, number>());
  const scrollTarget = useRef<number | null>(null);

  const load = useCallback(() => {
    setError(null);
    void getStory(client, slug).then((res) => {
      if (res.ok) {
        setStory(res.data);
        setMe(res.data.me ?? null);
        // a place to go on from, when there is one: not the first paragraph, and not a story read to its end
        setContinueFrom(res.data.me && res.data.me.paragraph > 0 && !res.data.me.finishedAt ? res.data.me.paragraph : null);
      } else setError(res.error);
    });
  }, [client, slug]);
  useEffect(load, [load]);
  /*
   * Coming back to the story — from its check, above all — the reader's own
   * record is asked again: the best score, and how many checks today, have
   * changed while the game was on top. The first focus is the load itself.
   */
  const refreshMe = useCallback(() => {
    void getStory(client, slug).then((res) => {
      if (res.ok) setMe(res.data.me ?? null);
    });
  }, [client, slug]);
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) refreshMe();
      focusedBefore.current = true;
    }, [refreshMe]),
  );
  // which of the story's dictionary words are saved already: asked only when it has any
  const headwords = !!story?.glossary.some((g) => !!g.entryId);
  useEffect(() => {
    if (!headwords) return;
    let live = true;
    void savedWords(client).then((res) => {
      if (live && res.ok) setSaved(new Set(res.data.words.map((w) => w.entryId)));
    });
    return () => {
      live = false;
    };
  }, [client, headwords]);

  /** Save word / Saved: at once on the screen, then on the server; a refusal takes it back and says why (a full vocabulary, limits/limitCopy.ts). */
  const toggleSave = (entryId: string): void => {
    const on = !saved.has(entryId);
    haptic('tap');
    const mark = (value: boolean) =>
      setSaved((was) => {
        const next = new Set(was);
        if (value) next.add(entryId);
        else next.delete(entryId);
        return next;
      });
    mark(on);
    setSaveError(null);
    void saveWord(client, entryId, on).then((res) => {
      if (res.ok) return;
      mark(!on);
      setSaveError({ entryId, text: limitErrorText(res.error, t) ?? describeError(res.error, t) });
    });
  };

  // the category's name, for the slug the story carries; the list is small and cached on the server
  useEffect(() => {
    let live = true;
    void getCategories(client).then((res) => {
      if (live && res.ok) setCategories(res.data.categories);
    });
    return () => {
      live = false;
    };
  }, [client]);

  /*
   * The reading position, sent at most every ten seconds while it changes and
   * once more on leaving the text, with `finished` the first time the end is
   * reached (the server keeps that for good).
   */
  const pending = useRef<ProgressInput | null>(null);
  const lastSent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storyId = story?.id ?? null;
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    if (!next || !storyId) return;
    pending.current = null;
    lastSent.current = Date.now();
    void saveProgress(client, storyId, next).then((res) => {
      if (res.ok) setMe(res.data.me);
    });
  }, [client, storyId]);
  const noteProgress = (next: ProgressInput): void => {
    const was = pending.current;
    if (was && was.paragraph === next.paragraph && was.finished === next.finished) return;
    pending.current = next;
    if (next.finished) setReachedEnd(true);
    if (timer.current) return;
    const wait = Math.max(0, lastSent.current + PROGRESS_EVERY_MS - Date.now());
    timer.current = setTimeout(flush, wait);
  };
  useEffect(() => () => flush(), [flush]);
  // the sound stops and the position is kept when this screen is left, for a game or for anything else
  useFocusEffect(
    useCallback(
      () => () => {
        narrator.stop();
        flush();
      },
      [narrator, flush],
    ),
  );

  // each paragraph's own recordings, for its Listen; and the whole story as the server's stitched track, for the bar
  const items = useMemo(() => (story ? narrationItems(story.paragraphs, story.audio) : []), [story]);
  const track = useMemo(() => (story?.narration ? narrationTrack(story.narration) : items), [story, items]);
  const listenable = useMemo(() => new Set(items.map((i) => i.paragraph)), [items]);
  // the paragraphs with a sentence a character says keep room for the character, so nothing moves when it appears
  const voiced = useMemo(
    () => new Set(items.filter((i) => narrationLine(story?.paragraphs ?? [], story?.voices, i).voice).map((i) => i.paragraph)),
    [items, story],
  );
  // how many of the story's sentences could be recorded, for "n of m recorded" when not all are
  const recordable = useMemo(() => (story ? story.paragraphs.reduce((n, p) => n + storyAudioSentences(p).length, 0) : 0), [story]);
  const translation = useMemo(() => (story ? translationFor(story, locale) : null), [story, locale]);

  // the sentence being read stays in view; reduced motion jumps rather than glides
  const followed = narration.scope === 'story' ? narration.current?.paragraph : undefined;
  useEffect(() => {
    if (followed === undefined || mode !== 'reading') return;
    const y = paragraphTops.current.get(followed);
    if (y === undefined) return;
    scroll.current?.scrollTo({ y: Math.max(0, textTop.current + y - 96), animated: !reduceMotion });
  }, [followed, reduceMotion, mode]);

  const scrollToParagraph = (p: number): void => {
    const y = paragraphTops.current.get(p);
    if (y === undefined || textTop.current === 0) {
      scrollTarget.current = p;
      return;
    }
    scrollTarget.current = null;
    scroll.current?.scrollTo({ y: Math.max(0, textTop.current + y - 72), animated: !reduceMotion });
  };
  const onParagraphLayout = (p: number, y: number): void => {
    paragraphTops.current.set(p, y);
    if (scrollTarget.current === p) scrollToParagraph(p);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (!story || mode !== 'reading') return;
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    noteProgress(readingPosition(contentOffset.y, layoutMeasurement.height, contentSize.height, textTop.current, paragraphTops.current, story.paragraphs.length));
  };

  const startReading = (from: number | null): void => {
    setMode('reading');
    if (from !== null && from > 0) scrollToParagraph(from);
  };
  const toOverview = (): void => {
    flush();
    narrator.stop();
    setMode('overview');
  };

  const listenTo = (paragraph: number): void => {
    if (narration.scope === 'paragraph' && narration.paragraph === paragraph) {
      narrator.toggle();
      return;
    }
    narrator.play(items.filter((i) => i.paragraph === paragraph), 'paragraph');
  };
  /** Listen from the overview: the whole story, from the paragraph being read. */
  const listenFrom = (paragraph: number): void => {
    startReading(paragraph);
    const start = track.findIndex((i) => i.paragraph >= paragraph);
    narrator.play(track, 'story', Math.max(0, start));
  };

  const toggleBookmark = (): void => {
    if (!story) return;
    const on = !(me?.bookmarked ?? false);
    haptic('tap');
    const patch = (value: boolean) =>
      setMe((was) => ({
        bookmarked: value,
        paragraph: was?.paragraph ?? 0,
        share: was?.share ?? 0,
        finishedAt: was?.finishedAt ?? null,
        bestCorrect: was?.bestCorrect ?? null,
        total: was?.total ?? null,
        attemptsToday: was?.attemptsToday ?? 0,
      }));
    patch(on);
    void setBookmark(client, story.id, on).then((res) => {
      if (!res.ok) patch(!on);
    });
  };

  const textScale = prefs.textScale;
  const scaleIndex = TEXT_SCALES.indexOf(textScale);
  const resize = (step: 1 | -1): void => {
    const next = TEXT_SCALES[Math.max(0, Math.min(TEXT_SCALES.length - 1, scaleIndex + step))] as TextScale;
    update({ textScale: next });
  };

  /** The check: back to an unfinished one on this story, or a new solo game with the assessment's settings. */
  const startCheck = async (fresh = false): Promise<void> => {
    if (!story || starting) return;
    if (!gate.require('play')) return;
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
    flush();
    const res = await createGame(client, { ...STORY_ASSESSMENT, storyId: story.id, extraTime: prefs.extraTime });
    setStarting(false);
    if (!res.ok) {
      setStartError(createErrorMessage(res.error, t));
      return;
    }
    setUnfinished(null);
    navigation.navigate('StoryGame', { id: res.data.id });
  };

  /** An unfinished solo game on this story, to go back to rather than throw away. */
  const findUnfinishedSolo = async (s: StoryDetail): Promise<string | null> => {
    const res = await activeGames(client);
    if (!res.ok) return null;
    return res.data.games.find((g) => g.mode === 'solo' && g.storyId === s.id)?.id ?? null;
  };

  const bookmarkButton = (
    <Pressable
      onPress={toggleBookmark}
      accessibilityRole="button"
      accessibilityLabel={me?.bookmarked ? t('stories.library.bookmarked') : t('stories.library.bookmark')}
      accessibilityState={{ selected: me?.bookmarked ?? false }}
      style={styles.headerButton}
    >
      <Icon name={me?.bookmarked ? 'bookmark-fill' : 'bookmark'} size={22} color={me?.bookmarked ? colors.gold : colors.textPrimary} />
    </Pressable>
  );

  const headerRight =
    mode === 'reading' ? (
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
        {bookmarkButton}
      </View>
    ) : story ? (
      bookmarkButton
    ) : undefined;

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
          <OverviewSkeleton />
        )}
      </GradientBackground>
    );
  }

  const dir = storyTextStyle(story.dialect);
  const props = storyTextProps(story.dialect);
  const finished = !!me?.finishedAt || reachedEnd;
  const share = me?.finishedAt ? 1 : (me?.share ?? 0);
  const left = minutesLeft(story.readingMinutes, share);
  const narrated = narrationLabel(story.audioCoverage, t);
  const category = categoryLabel(story.category, categories, locale);
  const reading = narration.current;
  // what the sentence being read says and who says it, whichever queue it came from
  const line = reading ? narrationLine(story.paragraphs, story.voices, reading) : undefined;
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

  const check = (
    <CheckCard
      me={me}
      unlocked={finished}
      starting={starting}
      error={startError}
      onStart={() => void startCheck()}
    />
  );

  const vocabulary =
    story.glossary.length > 0 ? (
      <View style={styles.section}>
        <SectionLabel>{t('stories.overview.vocabulary')}</SectionLabel>
        <Card padding="tight">
          {story.glossary.map((entry) => (
            <VocabularyRow
              key={entry.term}
              entry={entry}
              story={story}
              onOpen={() => setGloss(entry)}
              clips={clips}
              saved={!!entry.entryId && saved.has(entry.entryId)}
              onSave={entry.entryId ? () => toggleSave(entry.entryId!) : undefined}
              saveColumn={headwords}
            />
          ))}
        </Card>
        {/* a save refused from the list is said under it; one refused in the word's sheet is said there */}
        {saveError && !gloss ? <Note tone="danger" icon="alert">{saveError.text}</Note> : null}
      </View>
    ) : null;

  return (
    <GradientBackground>
      {/* the bar names the place in the app's words; the story's own title is in the body, in its own script */}
      <ScreenHeader title={t('stories.title')} onBack={mode === 'reading' ? toOverview : onExit} right={headerRight} />
      {mode === 'overview' ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + spacing.lg }]} showsVerticalScrollIndicator={false}>
          <StoryCover cover={story.cover} category={story.category} style={styles.cover} radius={radii.lg} />
          <View style={styles.head}>
            <Text {...props} style={[styles.title, { color: colors.textPrimary }, dir]} accessibilityRole="header">
              {story.title}
            </Text>
            <View style={[styles.pills, storyRowStyle(story.dialect)]}>
              <Pill label={levelName(story.level, t)} tone="gold" />
              {category ? <Pill icon="tag" label={category} /> : null}
              <Pill label={DIALECT_NAME[story.dialect]} />
              <Pill label={t('stories.aboutMinutes', { count: story.readingMinutes })} />
              <Pill label={t('stories.overview.words', { count: formatNumber(story.wordCount, locale) })} />
              {narrated ? <Pill icon="headphones" label={narrated} tone="primary" /> : null}
            </View>
            {story.summary ? (
              <Text {...props} style={[styles.summary, { color: colors.textPrimary }, dir]}>
                {story.summary}
              </Text>
            ) : null}
            <Text style={[styles.byline, { color: colors.textSecondary }]}>
              {[story.author ? t('stories.overview.by', { author: story.author }) : null, t(TRADITION_KEY[story.tradition])].filter(Boolean).join(' · ')}
            </Text>
            {story.source ? <Text style={[styles.source, { color: colors.textSecondary }]}>{t('stories.overview.source', { source: story.source })}</Text> : null}
            {story.attributionNote ? <Text style={[styles.source, { color: colors.textSecondary }]}>{story.attributionNote}</Text> : null}
            {story.versions.length > 0 ? (
              <View style={styles.versions}>
                {story.versions.map((v) => (
                  <Pressable
                    key={v.id}
                    onPress={() => navigation.push('StoryReader', { slug: v.slug })}
                    accessibilityRole="button"
                    hitSlop={VERSION_SLOP}
                    style={({ pressed }) => [styles.version, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Icon name="translate" size={14} color={colors.primary} />
                    <Text style={[styles.versionText, { color: colors.primary }]}>{t('stories.overview.readIn', { variety: DIALECT_NAME[v.dialect] })}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.actions}>
            <ClayButton
              label={continueFrom !== null || (share > 0 && !finished) ? `${t('stories.overview.continue')} · ${t('stories.overview.minutesLeft', { count: left })}` : t('stories.overview.read')}
              icon="book"
              tone="primary"
              size="large"
              onPress={() => startReading(continueFrom)}
            />
            {track.length > 0 ? (
              <ClayButton label={t('stories.overview.listen')} icon="headphones" onPress={() => listenFrom(continueFrom ?? 0)} />
            ) : null}
          </View>

          {vocabulary}
          {check}

          <View style={styles.section}>
            <SectionLabel>{t('stories.library.together')}</SectionLabel>
            <View style={styles.actions}>
              <ClayButton label={t('stories.mode.duo')} icon="person" onPress={() => setSetupMode('duo')} />
              <ClayButton label={t('stories.mode.group')} icon="people" onPress={() => setSetupMode('group')} />
            </View>
          </View>
        </ScrollView>
      ) : (
        <>
          <ScrollView
            ref={scroll}
            testID="story-text"
            contentContainerStyle={[styles.content, { paddingBottom: bottomInset + spacing.lg }]}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={100}
          >
            <View style={styles.readingHead}>
              <Text {...props} style={[styles.readingTitle, { color: colors.textPrimary }, dir]} numberOfLines={1} accessibilityRole="header">
                {story.title}
              </Text>
              <Text style={[styles.readingMeta, { color: colors.textSecondary }]}>
                {finished ? t('stories.library.finished') : t('stories.overview.minutesLeft', { count: left })}
              </Text>
            </View>
            {continueFrom !== null ? (
              <Pressable
                onPress={() => {
                  scrollToParagraph(continueFrom);
                  setContinueFrom(null);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.continueChip, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.8 : 1 }]}
              >
                <Icon name="move-down" size={16} color={colors.primary} />
                <Text style={[styles.continueChipText, { color: colors.primary }]}>{t('stories.reader.continueFrom', { n: continueFrom + 1 })}</Text>
              </Pressable>
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
                onReplay={narration.scope ? () => narrator.replay() : undefined}
                voiced={voiced}
                speaker={speaker}
                translation={translation}
                translated={translated}
                onToggleTranslation={(p) =>
                  setTranslated((was) => {
                    const next = new Set(was);
                    if (next.has(p)) next.delete(p);
                    else next.add(p);
                    return next;
                  })
                }
                onParagraphLayout={onParagraphLayout}
              />
            </View>

            <View style={styles.end}>
              <Text style={[styles.endText, { color: colors.textSecondary }]}>{t('stories.reader.finished')}</Text>
              {check}
              {vocabulary}
              <ClayButton label={t('stories.reader.overview')} variant="outline" icon="story" onPress={toOverview} />
            </View>
          </ScrollView>
          {track.length > 0 ? (
            <View style={[styles.player, { paddingBottom: Math.max(bottomInset, spacing.sm) }]}>
              <NarrationBar
                narrator={narrator}
                state={narration}
                items={track}
                rate={prefs.rate}
                onRate={(rate) => update({ rate })}
                speaker={narration.scope === 'story' && line?.voice ? CHARACTER_NAMES[line.voice.speaker] : null}
                recorded={story.narration && !story.narration.complete ? { recorded: story.narration.sentences.length, total: recordable } : null}
              />
            </View>
          ) : null}
        </>
      )}

      {gloss ? (
        <GlossSheet
          entry={gloss}
          story={story}
          clips={clips}
          saved={!!gloss.entryId && saved.has(gloss.entryId)}
          onSave={gloss.entryId ? () => toggleSave(gloss.entryId!) : undefined}
          error={saveError && saveError.entryId === gloss.entryId ? saveError.text : null}
          onClose={() => {
            setGloss(null);
            setSaveError(null);
          }}
        />
      ) : null}

      {setupMode ? (
        <SetupSheet
          dialect={story.dialect}
          stories={[story]}
          story={story}
          initialMode={setupMode}
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
              <ClayButton label={t('stories.reader.startAgain')} busy={starting} onPress={() => void startCheck(true)} />
            </>
          }
        >
          <Text style={[styles.sheetText, { color: colors.textSecondary }]}>{t('stories.reader.unfinishedBody')}</Text>
        </Sheet>
      ) : null}
    </GradientBackground>
  );
}

/** The one player a screen shares for its word clips (alphabet/useClipPlayer). */
type Clips = ReturnType<typeof useClipPlayer>;

/**
 * The check (design notes §1, §6): its name, what it is (five questions, no
 * timer), the best score so far, a note on the XP a repeat earns today, and
 * the button — disabled, with "Finish the story first", until the story has
 * been read to its end.
 */
function CheckCard({
  me,
  unlocked,
  starting,
  error,
  onStart,
}: {
  me: StoryMe | null;
  unlocked: boolean;
  starting: boolean;
  error: string | null;
  onStart: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const attempts = me?.attemptsToday ?? 0;
  // from the third check of a day on, the game pays nothing; the second pays a quarter
  const unpaid = attempts >= PAID_STORY_REPEATS_PER_DAY;
  const checked = me?.bestCorrect !== null && me?.bestCorrect !== undefined && me.total !== null;
  return (
    <Card style={styles.check}>
      <View style={styles.checkHead}>
        <Icon name={unlocked ? 'check' : 'lock'} size={20} color={unlocked ? colors.success : colors.textSecondary} />
        <Text style={[styles.checkTitle, { color: colors.textPrimary }]} accessibilityRole="header">
          {t('stories.check.title')}
        </Text>
      </View>
      <Text style={[styles.checkLine, { color: colors.textSecondary }]}>{t('stories.check.questions', { count: STORY_ASSESSMENT.questionCount })}</Text>
      {checked && me ? (
        <Text style={[styles.checkBest, { color: colors.goldText }]}>
          {t('stories.check.best', { correct: formatNumber(me.bestCorrect ?? 0, locale), total: formatNumber(me.total ?? 0, locale) })}
        </Text>
      ) : null}
      {unlocked && unpaid ? (
        <Text style={[styles.checkLine, { color: colors.textSecondary }]}>{t('stories.check.noXp')}</Text>
      ) : unlocked && attempts > 0 ? (
        <Text style={[styles.checkLine, { color: colors.textSecondary }]}>{t('stories.check.repeatXp')}</Text>
      ) : null}
      {!unlocked ? <Note icon="lock">{t('stories.check.locked')}</Note> : null}
      <ClayButton
        label={checked ? t('stories.check.again') : t('stories.check.start')}
        icon="check"
        tone="primary"
        size="large"
        busy={starting}
        disabled={!unlocked}
        onPress={onStart}
      />
      {error ? <Note tone="danger" icon="alert">{error}</Note> : null}
    </Card>
  );
}

/**
 * A glossary word in the key vocabulary: the word and its meaning (a tap
 * opens its sheet), a play button where the dictionary has a clip, and a
 * save button where the word is a dictionary headword.
 */
function VocabularyRow({
  entry,
  story,
  onOpen,
  clips,
  saved,
  onSave,
  saveColumn,
}: {
  entry: StoryGlossEntry;
  story: Pick<StoryDetail, 'dialect'>;
  onOpen: () => void;
  clips: Clips;
  saved: boolean;
  /** only for a word the dictionary has */
  onSave?: () => void;
  /** some word in the list can be saved: a row without Save keeps its place, so the play buttons stand in one column */
  saveColumn: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = storyTextStyle(story.dialect);
  const props = storyTextProps(story.dialect);
  const meaning = glossFor(entry, locale);
  const english = meaning.lang === 'en' && locale !== 'en';
  const url = entry.audioUrl ?? null;
  const playable = !!url && clips.supported;
  const playing = clips.isPlaying(url);
  return (
    <View style={[styles.wordRow, { flexDirection: dir.textAlign === 'right' ? 'row-reverse' : 'row' }]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        // the word in the story's language; its meaning, in the app's (or English), as the value
        accessibilityLabel={entry.term}
        {...props}
        accessibilityValue={{ text: meaning.text }}
        style={({ pressed }) => [styles.wordMain, { alignItems: dir.textAlign === 'right' ? 'flex-end' : 'flex-start' }, pressed && heldRow(colors.controlTrack)]}
      >
        <Text {...props} style={[styles.wordTerm, { color: colors.textPrimary }, dir]}>
          {entry.term}
        </Text>
        <Text {...(english ? ENGLISH_TEXT_PROPS : {})} style={[styles.wordMeaning, { color: colors.textSecondary }, english ? ENGLISH_TEXT_STYLE : null]}>
          {meaning.text}
        </Text>
      </Pressable>
      {playable && url ? (
        <Pressable
          onPress={() => clips.play(url)}
          accessibilityRole="button"
          accessibilityLabel={t('stories.reader.playWord')}
          hitSlop={WORD_BUTTON_SLOP}
          style={({ pressed }) => [styles.wordPlay, { backgroundColor: playing ? colors.primary : colors.controlTrack, opacity: pressed ? 0.8 : 1 }]}
        >
          <Icon name="speaker" size={18} color={playing ? colors.textOnPrimary : colors.primary} />
        </Pressable>
      ) : null}
      {onSave ? (
        <Pressable
          onPress={onSave}
          accessibilityRole="button"
          // after the word itself, as the play button is: "Save word" needs no name repeated
          accessibilityLabel={saved ? t('stories.reader.saved') : t('stories.reader.saveWord')}
          accessibilityState={{ selected: saved }}
          hitSlop={WORD_BUTTON_SLOP}
          style={({ pressed }) => [styles.wordPlay, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.8 : 1 }]}
        >
          <Icon name={saved ? 'bookmark-fill' : 'bookmark'} size={18} color={saved ? colors.gold : colors.primary} />
        </Pressable>
      ) : saveColumn && playable ? (
        <View style={styles.wordSlot} />
      ) : null}
    </View>
  );
}

/**
 * A word's sheet (design notes §3): the word, its part of speech when the
 * dictionary knows it, its meaning in the interface language (English when
 * there is none, marked as English), a play button where there is a clip, and
 * Save word / Saved where the word is a dictionary headword — with the
 * vocabulary's limit said when the shelf is full.
 */
function GlossSheet({
  entry,
  story,
  clips,
  saved,
  onSave,
  error,
  onClose,
}: {
  entry: StoryGlossEntry;
  story: Pick<StoryDetail, 'dialect'>;
  clips: Clips;
  saved: boolean;
  /** only for a word the dictionary has */
  onSave?: () => void;
  /** why the last save of this word did not take */
  error: string | null;
  onClose: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const meaning = glossFor(entry, locale);
  const english = meaning.lang === 'en' && locale !== 'en';
  const url = entry.audioUrl ?? null;

  return (
    <Sheet title={t('stories.reader.meaning')} onClose={onClose}>
      <Text {...storyTextProps(story.dialect)} style={[styles.glossTerm, { color: colors.textPrimary }, storyTextStyle(story.dialect)]}>
        {entry.term}
      </Text>
      {entry.pos ? <Text style={[styles.glossPos, { color: colors.textSecondary }]}>{entry.pos}</Text> : null}
      <Text {...(english ? ENGLISH_TEXT_PROPS : {})} style={[styles.glossMeaning, { color: colors.textPrimary }, english ? ENGLISH_TEXT_STYLE : null]}>
        {meaning.text}
      </Text>
      {english ? <Text style={[styles.sheetText, { color: colors.textSecondary }]}>{t('stories.reader.inEnglish')}</Text> : null}
      {(url && clips.supported) || onSave ? (
        <View style={styles.glossActions}>
          {url && clips.supported ? (
            <ClayButton label={t('stories.reader.playWord')} icon="speaker" onPress={() => clips.play(url)} />
          ) : null}
          {onSave ? (
            <ClayButton
              label={saved ? t('stories.reader.saved') : t('stories.reader.saveWord')}
              icon={saved ? 'bookmark-fill' : 'bookmark'}
              tone={saved ? 'neutral' : 'primary'}
              onPress={onSave}
              accessibilityLabel={saved ? t('stories.reader.saved') : t('stories.reader.saveWord')}
            />
          ) : null}
        </View>
      ) : null}
      {error ? <Note tone="danger" icon="alert">{error}</Note> : null}
    </Sheet>
  );
}

/**
 * The overview while it loads, in its own column: the cover's shape, the
 * title, the facts as pills, two lines of summary, and the first button —
 * so the words arrive on the lines that were waiting for them.
 */
function OverviewSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={styles.content} accessibilityLabel={t('common.loading')}>
      <Skeleton width="100%" height={COVER_HEIGHT} radius={radii.lg} />
      <View style={styles.head}>
        <SkeletonText size={typography.sizes.xl} lineHeight={TITLE_LINE} width="60%" />
        <View style={styles.pills}>
          {[96, 72, 56, 64].map((w) => (
            <Skeleton key={w} width={w} height={lineOf(typography.sizes.xs) + 6} radius={radii.pill} />
          ))}
        </View>
        <View>
          <SkeletonText size={typography.sizes.md} lineHeight={storyLineHeight(typography.sizes.md)} width="94%" />
          <SkeletonText size={typography.sizes.md} lineHeight={storyLineHeight(typography.sizes.md)} width="58%" />
        </View>
      </View>
      <Skeleton width="100%" height={50} radius={radii.pill} />
    </View>
  );
}

/** display(28) sets 1.12 */
const TITLE_LINE = Math.round(typography.sizes.xl * typography.displayLineHeight);
const COVER_HEIGHT = 180;
/**
 * A word's play and save buttons are drawn at 40 so the row stays a row; the
 * touch reaches a fingertip's 44 past the edge, and the gap between the two
 * is wider than the slop, so neither takes the other's tap.
 */
const WORD_BUTTON = 40;
const WORD_BUTTON_SLOP = hitSlopFor(WORD_BUTTON, WORD_BUTTON);
/**
 * A chip to the same story in another variety: a small pill among the
 * credits, caught as a full fingertip. The slop is half the gap between two
 * rows of them, so one chip's never reaches into the next.
 */
const VERSION_HEIGHT = 36;
const VERSION_SLOP = hitSlopFor(MIN_TOUCH_TARGET, VERSION_HEIGHT);

const styles = StyleSheet.create({
  content: { ...COLUMN, padding: spacing.lg, gap: spacing.lg },
  cover: { width: '100%', height: COVER_HEIGHT },
  head: { gap: spacing.sm },
  title: { ...display(typography.sizes.xl) },
  summary: { fontSize: typography.sizes.md, lineHeight: 24 },
  byline: { fontSize: typography.sizes.sm, lineHeight: 20 },
  source: { fontSize: typography.sizes.xs, lineHeight: 18 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  versions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  version: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: VERSION_HEIGHT, borderRadius: radii.pill, paddingHorizontal: spacing.md - 2 },
  versionText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  actions: { gap: spacing.sm },
  headerButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  sizeControls: { flexDirection: 'row', alignItems: 'center' },
  sizeButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  sizeSmall: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  sizeLarge: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  section: { gap: spacing.sm },
  readingHead: { gap: 2 },
  readingTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  readingMeta: { fontSize: typography.sizes.xs },
  continueChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: MIN_TOUCH_TARGET, borderRadius: radii.pill, paddingHorizontal: spacing.md },
  continueChipText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  end: { gap: spacing.lg, paddingTop: spacing.md },
  endText: { fontSize: typography.sizes.sm, textAlign: 'center', fontStyle: 'italic' },
  player: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  check: { gap: spacing.sm },
  checkHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkTitle: { ...display(typography.sizes.lg), flex: 1 },
  checkLine: { fontSize: typography.sizes.sm, lineHeight: 20 },
  checkBest: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  wordRow: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  wordMain: { flex: 1, justifyContent: 'center', paddingVertical: spacing.xs, gap: 2 },
  wordTerm: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  wordMeaning: { fontSize: typography.sizes.sm },
  wordPlay: { width: WORD_BUTTON, height: WORD_BUTTON, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  wordSlot: { width: WORD_BUTTON, height: WORD_BUTTON },
  sheetText: { fontSize: typography.sizes.md, lineHeight: 22 },
  glossTerm: { ...display(typography.sizes.xl) },
  glossPos: { fontSize: typography.sizes.sm, fontStyle: 'italic' },
  glossMeaning: { fontSize: typography.sizes.lg, lineHeight: 26 },
  glossActions: { gap: spacing.sm },
});
