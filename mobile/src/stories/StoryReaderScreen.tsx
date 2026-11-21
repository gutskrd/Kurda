import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Pressable, ReachGroup } from '../theme/Pressable';
import { heldRow, heldDim } from '../theme/MotionParts';
import {
  CHARACTER_NAMES,
  PAID_STORY_REPEATS_PER_DAY,
  isAppLocale,
  STORY_ASSESSMENT,
  STORY_DIALECTS,
  glossFor,
  storyAudioSentences,
  type StoryCategory,
  type StoryDetail,
  type StoryDialect,
  type StoryGameMode,
  type StoryGlossEntry,
  type StoryMe,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useAccountGate } from '../auth/AccountGate';
import { describeError } from '../api/errors';
import { useIntents } from '../api/optimistic';
import type { ApiError } from '../api/types';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useClipPlayer } from '../alphabet/useClipPlayer';
import { haptic } from '../feedback/haptics';
import { limitErrorText } from '../limits/limitCopy';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { ClayButton, ErrorRetry, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText, lineOf } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { activeGames, createGame, getCategories, getStory, saveProgress, saveWord, savedWords, setBookmark, type ProgressInput } from './api';
import { StoryCover } from './covers';
import { TRADITION_KEY, categoryLabel, levelName, narrationLabel } from './labels';
import { narrationItems, narrationLine, narrationTrack } from './narration';
import { TEXT_SCALES, useStoryPrefs, type TextScale } from './prefs';
import { createErrorMessage, SetupSheet } from './SetupSheet';
import { STORY_BODY_SIZE, StoryText, storyLineHeight } from './StoryText';
import { ENGLISH_TEXT_PROPS, ENGLISH_TEXT_STYLE, storyRowDirection, storyRowStyle, storyTextProps, storyTextStyle } from './storyText';
import { useNarration } from './useNarration';
import { COLUMN, Card, Note, Pill, SectionLabel, Sheet, useAnnouncer } from './ui';
import { NarrationBar } from './NarrationBar';
import { AboutStory, Reflections, StorySources } from './Afterword';
import { chapterAt, hasIntroduction, metaFor, storyOwnLocale, translatedHeading } from './legend';
import { textIn } from '../lore/labels';
import { CHARACTER_SIZE, SpeakingCharacter } from '../characters/SpeakingCharacter';
import { pressedDim } from '../theme/motion';
import { useDirection } from '../reports/direction';
import { dialectNameKey } from '../i18n/dialectName';

/** The most often a reading position is sent to the server; it is also sent on leaving the text. */
const PROGRESS_EVERY_MS = 10_000;

/** How far down the screen a paragraph's top must be to count as the one being read. */
const READING_LINE = 0.6;

/**
 * The reader's place, from the scroll position: the last paragraph whose top has passed the reading line, the
 * share of paragraphs that is, and whether the end was reached (the last paragraph passing the line, or the foot).
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

/** Minutes left at `share` of a story; never less than one while any remain. */
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
 * A story (design notes §1–§3): its overview, then the text. The overview is the cover page: picture, title, level,
 * category, minutes and words, narration, author and tradition, synopsis, Read (or Continue with minutes left) and
 * Listen, the key vocabulary with play and Save, and the check, locked until the story is finished.
 *
 * A story told in both varieties shows the library's Kurmancî/Soranî switch; the other side opens that telling at
 * the top of its cover page (the tellings are not split alike) and becomes the reader's choice. A link to a story
 * of the other variety shows it without changing the choice.
 *
 * The text uses StoryText, in the story's own direction and language (`storyTextStyle`) at the reader's remembered
 * size. The reading position comes from scrolling and is saved at most every ten seconds and on leaving, so the
 * overview can offer "Continue · 3 min left". Touching text never starts audio; Listen buttons and the player bar
 * do.
 *
 * A legend reads as a book of chapters: the overview lists them with read ones ticked, and a sticky line shows the
 * current chapter and opens the list. After the text and its check come reflections, notes and sources. The check
 * is a solo game with the assessment's settings (five untimed questions, text at hand); playing with others opens
 * the setup sheet with this story.
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
  // The end of the text reached in this sitting, before the server has said so.
  const [reachedEnd, setReachedEnd] = useState(false);
  const [continueFrom, setContinueFrom] = useState<number | null>(null);
  // The paragraph being read, for the chapter line, and whether the chapter list is open.
  const [at, setAt] = useState(0);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  // Glossary words already in the reader's vocabulary, and a save that failed.
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [saveError, setSaveError] = useState<{ entryId: string; text: string } | null>(null);
  // The other telling being fetched while the switch already shows it, and why the last fetch failed.
  const [switching, setSwitching] = useState<StoryDialect | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const { narrator, state: narration } = useNarration(prefs.rate);
  const clips = useClipPlayer();
  const { announce, region } = useAnnouncer();
  const overview = useRef<ScrollView>(null);
  const scroll = useRef<ScrollView>(null);
  const textTop = useRef(0);
  const paragraphTops = useRef(new Map<number, number>());
  const scrollTarget = useRef<number | null>(null);
  // The telling on show, for answers that arrive after the page has switched.
  const shown = useRef<{ id: string; slug: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * Shows a story, from the first load or the switch: everything known of the previous telling (place, open
   * translations, an open sheet) is dropped, and the page opens on the cover at the top.
   */
  const show = useCallback((next: StoryDetail): void => {
    shown.current = { id: next.id, slug: next.slug };
    paragraphTops.current = new Map();
    textTop.current = 0;
    scrollTarget.current = null;
    setStory(next);
    setMe(next.me ?? null);
    // A place to continue from, unless it is the first paragraph or the story was read to its end.
    setContinueFrom(next.me && next.me.paragraph > 0 && !next.me.finishedAt ? next.me.paragraph : null);
    setMode('overview');
    setAt(0);
    setReachedEnd(false);
    setTranslated(new Set());
    setGloss(null);
    setSaveError(null);
    setStartError(null);
    setUnfinished(null);
    setSetupMode(null);
    setChaptersOpen(false);
  }, []);

  const load = useCallback(() => {
    setError(null);
    void getStory(client, slug).then((res) => {
      if (!alive.current) return;
      if (res.ok) show(res.data);
      else setError(res.error);
    });
  }, [client, slug, show]);
  useEffect(() => {
    // The address follows the switch (below), so the telling it now names is already here.
    if (shown.current?.slug === slug) return;
    load();
  }, [load, slug]);
  // Returning to the story, above all from its check, re-reads the reader's record (best score, checks today). The
  // first focus is the load itself.
  const refreshMe = useCallback(() => {
    const asked = shown.current;
    if (!asked) return;
    void getStory(client, asked.slug).then((res) => {
      if (res.ok && shown.current?.id === asked.id) setMe(res.data.me ?? null);
    });
  }, [client]);
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) refreshMe();
      focusedBefore.current = true;
    }, [refreshMe]),
  );
  // Which of the story's dictionary words are already saved; only asked when it has any.
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

  /** Save word / Saved: on screen at once, then on the server; a refusal reverts and says why (a full vocabulary, limits/limitCopy.ts). */
  const saving = useIntents<string, boolean>(
    async (entryId, on) => {
      const res = await saveWord(client, entryId, on);
      if (res.ok) {
        setSaved((was) => {
          const next = new Set(was);
          if (on) next.add(entryId);
          else next.delete(entryId);
          return next;
        });
      }
      return res;
    },
    { failed: (error, entryId) => setSaveError({ entryId, text: limitErrorText(error, t) ?? describeError(error, t) }) },
  );
  const isSaved = (entryId: string | null | undefined): boolean => !!entryId && saving.shown(entryId, saved.has(entryId));
  const toggleSave = (entryId: string): void => {
    haptic('tap');
    setSaveError(null);
    saving.want(entryId, !isSaved(entryId), saved.has(entryId));
  };

  // The category's name for the story's slug; the list is small and cached on the server.
  useEffect(() => {
    let live = true;
    void getCategories(client).then((res) => {
      if (live && res.ok) setCategories(res.data.categories);
    });
    return () => {
      live = false;
    };
  }, [client]);

  // The reading position, sent at most every ten seconds while it changes and once on leaving, with `finished` the
  // first time the end is reached (the server keeps that for good).
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
      // The record belongs to the telling it was written for; ignore it if the switch has moved since.
      if (res.ok && shown.current?.id === storyId) setMe(res.data.me);
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
  // Leaving this screen stops the sound and saves the position.
  useFocusEffect(
    useCallback(
      () => () => {
        narrator.stop();
        flush();
      },
      [narrator, flush],
    ),
  );

  // Each paragraph's recordings for its Listen, and the server's stitched track for the bar.
  const items = useMemo(() => (story ? narrationItems(story.paragraphs, story.audio) : []), [story]);
  const track = useMemo(() => (story?.narration ? narrationTrack(story.narration) : items), [story, items]);
  const listenable = useMemo(() => new Set(items.map((i) => i.paragraph)), [items]);
  // Paragraphs with a character's sentence keep room for the character, so nothing moves when it appears.
  const voiced = useMemo(
    () => new Set(items.filter((i) => narrationLine(story?.paragraphs ?? [], story?.voices, i).voice).map((i) => i.paragraph)),
    [items, story],
  );
  // How many sentences could be recorded, for "n of m recorded" when not all are.
  const recordable = useMemo(() => (story ? story.paragraphs.reduce((n, p) => n + storyAudioSentences(p).length, 0) : 0), [story]);
  const translation = useMemo(() => (story ? translationFor(story, locale) : null), [story, locale]);

  // The sentence being read stays in view; under Reduce Motion it jumps rather than glides.
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
    const position = readingPosition(contentOffset.y, layoutMeasurement.height, contentSize.height, textTop.current, paragraphTops.current, story.paragraphs.length);
    if (position.paragraph !== at) setAt(position.paragraph);
    noteProgress(position);
  };

  const startReading = (from: number | null): void => {
    setMode('reading');
    setAt(from ?? 0);
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

  /**
   * The switch: opens the same story in the other variety here. The switch moves at once and the telling replaces
   * this one when it arrives, on its own cover page; only then is the choice kept and the address updated. A failed
   * fetch leaves the reader where they were and says so.
   */
  const switchTo = (dialect: StoryDialect): void => {
    const version = story?.versions.find((v) => v.dialect === dialect);
    if (!story || !version || switching || dialect === story.dialect) return;
    flush();
    narrator.stop();
    setSwitching(dialect);
    setSwitchError(null);
    void getStory(client, version.slug).then((res) => {
      if (!alive.current) return;
      setSwitching(null);
      if (!res.ok) {
        setSwitchError(res.error.status === 404 ? t('stories.reader.unavailable') : describeError(res.error, t));
        return;
      }
      update({ dialect });
      show(res.data);
      overview.current?.scrollTo({ y: 0, animated: false });
      navigation.setParams({ slug: res.data.slug });
      announce(`${t(dialectNameKey(dialect))}: ${res.data.title}`);
    });
  };

  const bookmarking = useIntents<string, boolean>(async (id, on) => {
    const res = await setBookmark(client, id, on);
    if (res.ok && shown.current?.id === id) {
      setMe((was) => ({
        bookmarked: on,
        paragraph: was?.paragraph ?? 0,
        share: was?.share ?? 0,
        finishedAt: was?.finishedAt ?? null,
        bestCorrect: was?.bestCorrect ?? null,
        total: was?.total ?? null,
        attemptsToday: was?.attemptsToday ?? 0,
      }));
    }
    return res;
  });
  const bookmarked = story ? bookmarking.shown(story.id, me?.bookmarked ?? false) : false;
  const toggleBookmark = (): void => {
    if (!story) return;
    haptic('tap');
    bookmarking.want(story.id, !bookmarked, me?.bookmarked ?? false);
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

  /** An unfinished solo game on this story, to resume rather than discard. */
  const findUnfinishedSolo = async (s: StoryDetail): Promise<string | null> => {
    const res = await activeGames(client);
    if (!res.ok) return null;
    return res.data.games.find((g) => g.mode === 'solo' && g.storyId === s.id)?.id ?? null;
  };

  const bookmarkButton = (
    <Pressable
      onPress={toggleBookmark}
      accessibilityRole="button"
      accessibilityLabel={bookmarked ? t('stories.library.bookmarked') : t('stories.library.bookmark')}
      accessibilityState={{ selected: bookmarked }}
      style={({ pressed }) => [styles.headerButton, pressed && heldDim]}
    >
      <Icon name={bookmarked ? 'bookmark-fill' : 'bookmark'} size={22} color={bookmarked ? colors.primary : colors.textPrimary} />
    </Pressable>
  );

  const headerRight =
    mode === 'reading' ? (
      <View style={styles.sizeControls}>
        {/* Three buttons with no gap: each reaches up and down, none into the next. */}
        <ReachGroup gap={0}>
          <Pressable
            onPress={() => resize(-1)}
            disabled={scaleIndex <= 0}
            accessibilityRole="button"
            accessibilityLabel={t('stories.reader.smaller')}
            accessibilityState={{ disabled: scaleIndex <= 0 }}
            style={({ pressed }) => [styles.sizeButton, { opacity: scaleIndex <= 0 ? 0.35 : 1 }, pressed && heldDim]}
          >
            <Text style={[styles.sizeSmall, { color: colors.primary }]}>A</Text>
          </Pressable>
          <Pressable
            onPress={() => resize(1)}
            disabled={scaleIndex >= TEXT_SCALES.length - 1}
            accessibilityRole="button"
            accessibilityLabel={t('stories.reader.larger')}
            accessibilityState={{ disabled: scaleIndex >= TEXT_SCALES.length - 1 }}
            style={({ pressed }) => [styles.sizeButton, { opacity: scaleIndex >= TEXT_SCALES.length - 1 ? 0.35 : 1 }, pressed && heldDim]}
          >
            <Text style={[styles.sizeLarge, { color: colors.primary }]}>A</Text>
          </Pressable>
          {bookmarkButton}
        </ReachGroup>
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
  const category = categoryLabel(story.category, categories, locale, t);
  const reading = narration.current;
  const meta = metaFor(story, locale);
  // The same story in the other variety, when it has both.
  const otherTelling = story.versions.find((v) => v.dialect !== story.dialect) ?? null;
  const sections = story.sections ?? [];
  // How far the reader has got, for ticking read chapters: this sitting's place, else the server's.
  const readTo = finished ? story.paragraphs.length : Math.max(at, me?.paragraph ?? 0);
  const chapterNow = chapterAt(sections, at);
  // The current sentence's text and speaker, from whichever queue it came.
  const line = reading ? narrationLine(story.paragraphs, story.voices, reading) : undefined;
  // The character faces back toward the Listen it stands after.
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
              saved={isSaved(entry.entryId)}
              onSave={entry.entryId ? () => toggleSave(entry.entryId!) : undefined}
              saveColumn={headwords}
            />
          ))}
        </Card>
        {/* A save refused from the list shows under it; one refused in the word's sheet shows there. */}
        {saveError && !gloss ? (
          <Note tone="danger" icon="alert" live>
            {saveError.text}
          </Note>
        ) : null}
      </View>
    ) : null;

  return (
    <GradientBackground>
      {/* The bar names the place in the app's words; the story's title is in the body in its own script. */}
      <ScreenHeader title={t('stories.title')} onBack={mode === 'reading' ? toOverview : onExit} right={headerRight} />
      {mode === 'overview' ? (
        <ScrollView ref={overview} contentContainerStyle={[styles.content, { paddingBottom: bottomInset + spacing.lg }]} showsVerticalScrollIndicator={false}>
          <StoryCover slug={story.slug} cover={story.cover} style={styles.cover} radius={radii.lg} />
          {otherTelling ? (
            // One story, two tellings: the library's switch, set to the one on show.
            <View style={styles.variety}>
              <Segmented<StoryDialect>
                options={STORY_DIALECTS}
                value={switching ?? story.dialect}
                onChange={switchTo}
                labelOf={(d) => t(dialectNameKey(d))}
                groupLabel={t('stories.variety')}
              />
              {switchError ? <Note tone="danger" icon="alert">{switchError}</Note> : null}
            </View>
          ) : null}
          <View style={styles.head}>
            <Text {...props} style={[styles.title, { color: colors.textPrimary }, dir]} accessibilityRole="header">
              {story.title}
            </Text>
            {meta?.title ? (
              <Text {...textIn(meta.lang).props} style={[styles.titleTranslation, { color: colors.textSecondary }, textIn(meta.lang).style]} testID="story-title-translation">
                {meta.title}
              </Text>
            ) : null}
            <View style={[styles.pills, storyRowStyle(story.dialect)]}>
              <Pill label={levelName(story.level, t)} />
              {category ? <Pill icon="tag" label={category} /> : null}
              {/* Which Kurdish it is, unless the switch already says it. */}
              {otherTelling ? null : <Pill label={t(dialectNameKey(story.dialect))} />}
              <Pill label={t('stories.aboutMinutes', { count: story.readingMinutes })} />
              <Pill label={t('stories.overview.words', { count: formatNumber(story.wordCount, locale) })} />
              {narrated ? <Pill icon="headphones" label={narrated} tone="primary" /> : null}
            </View>
            {story.summary ? (
              <Text {...props} style={[styles.summary, { color: colors.textPrimary }, dir]}>
                {story.summary}
              </Text>
            ) : null}
            {meta?.summary ? (
              <Text {...textIn(meta.lang).props} style={[styles.summaryTranslation, { color: colors.textSecondary }, textIn(meta.lang).style]}>
                {meta.summary}
              </Text>
            ) : null}
            <Text style={[styles.byline, { color: colors.textSecondary }]}>
              {[story.author ? t('stories.overview.by', { author: story.author }) : null, t(TRADITION_KEY[story.tradition])].filter(Boolean).join(' · ')}
            </Text>
            {story.source ? <Text style={[styles.source, { color: colors.textSecondary }]}>{t('stories.overview.source', { source: story.source })}</Text> : null}
            {story.attributionNote ? <Text style={[styles.source, { color: colors.textSecondary }]}>{story.attributionNote}</Text> : null}
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

          {sections.length > 0 ? (
            <View style={styles.section}>
              <SectionLabel>{t('stories.reader.chapters')}</SectionLabel>
              <ChapterList story={story} readTo={readTo} here={null} onOpen={(p) => startReading(p)} />
            </View>
          ) : null}

          {vocabulary}
          {check}
          <AboutStory story={story} />
          <StorySources story={story} />

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
            // The chapter line is the second child, after the title, when the story has chapters.
            stickyHeaderIndices={sections.length > 0 ? [1] : undefined}
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
            {sections.length > 0 ? (
              // Stays at the top while the text scrolls under it, so the current place is a glance away.
              <View style={[styles.chapterSticky, { backgroundColor: colors.background }]}>
                <ChapterLine story={story} chapter={chapterNow} readTo={readTo} onOpen={() => setChaptersOpen(true)} />
              </View>
            ) : null}
            {continueFrom !== null ? (
              <Pressable
                onPress={() => {
                  scrollToParagraph(continueFrom);
                  setContinueFrom(null);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.continueChip, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
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
              <Reflections story={story} />
              <AboutStory story={story} />
              <StorySources story={story} />
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

      {chaptersOpen ? (
        <Sheet title={t('stories.reader.chapters')} onClose={() => setChaptersOpen(false)}>
          <ChapterList
            story={story}
            readTo={readTo}
            here={chapterNow}
            onOpen={(p) => {
              setChaptersOpen(false);
              setAt(p);
              scrollToParagraph(p);
            }}
          />
        </Sheet>
      ) : null}

      {gloss ? (
        <GlossSheet
          entry={gloss}
          story={story}
          clips={clips}
          saved={isSaved(gloss.entryId)}
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
      {region}
    </GradientBackground>
  );
}

/** The one player a screen shares for word clips (alphabet/useClipPlayer). */
type Clips = ReturnType<typeof useClipPlayer>;

/** The check (design notes §1, §6): what it is, the best score, a note on today's repeat XP, and its button, disabled until the story is finished. */
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
  // From the day's third check on the game pays nothing; the second pays a quarter.
  const unpaid = attempts >= PAID_STORY_REPEATS_PER_DAY;
  const checked = me?.bestCorrect !== null && me?.bestCorrect !== undefined && me.total !== null;
  return (
    <Card style={styles.check}>
      <View style={styles.checkHead}>
        {/* Open or locked is a state, not a right answer, so violet rather than green. */}
        <Icon name={unlocked ? 'check' : 'lock'} size={20} color={unlocked ? colors.primary : colors.textSecondary} />
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

/** A key vocabulary row: word and meaning (tap for its sheet), play where the dictionary has a clip, Save where it is a headword. */
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
  /** Only for a word the dictionary has. */
  onSave?: () => void;
  /** Some word in the list can be saved, so a row without Save keeps its place and play buttons stay in one column. */
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
        // The word in the story's language; its meaning in the app's (or English) as the value.
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
          style={({ pressed }) => [styles.wordPlay, { backgroundColor: playing ? colors.primary : colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
        >
          <Icon name="speaker" size={18} color={playing ? colors.textOnPrimary : colors.primary} />
        </Pressable>
      ) : null}
      {onSave ? (
        <Pressable
          onPress={onSave}
          accessibilityRole="button"
          // Read after the word, as the play button is, so "Save word" needs no name repeated.
          accessibilityLabel={saved ? t('stories.reader.saved') : t('stories.reader.saveWord')}
          accessibilityState={{ selected: saved }}
          style={({ pressed }) => [styles.wordPlay, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
        >
          <Icon name={saved ? 'bookmark-fill' : 'bookmark'} size={18} color={colors.primary} />
        </Pressable>
      ) : saveColumn && playable ? (
        <View style={styles.wordSlot} />
      ) : null}
    </View>
  );
}

/**
 * A word's sheet (design notes §3): the word, part of speech when known, its meaning in the interface language
 * (English, marked so, when there is none), play where there is a clip, and Save where it is a headword, with the
 * vocabulary limit shown when full.
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
  /** Only for a word the dictionary has. */
  onSave?: () => void;
  /** Why the last save of this word failed. */
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
      {error ? (
        <Note tone="danger" icon="alert" live>
          {error}
        </Note>
      ) : null}
    </Sheet>
  );
}

/** A legend's place while reading: chapter number of total and title, and a stone per chapter filled once read. A tap opens the list. */
function ChapterLine({
  story,
  chapter,
  readTo,
  onOpen,
}: {
  story: Pick<StoryDetail, 'dialect' | 'sections' | 'paragraphs'>;
  chapter: number;
  readTo: number;
  onOpen: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const ui = useDirection();
  const sections = story.sections;
  const current = chapter >= 0 ? sections[chapter] : null;
  const where = current ? t('stories.reader.chapterOf', { n: chapter + 1, total: sections.length }) : t('stories.reader.introduction');
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={current ? `${where}: ${current.title}` : where}
      accessibilityHint={t('stories.reader.chaptersOpen')}
      style={({ pressed }) => [styles.chapterLine, { backgroundColor: colors.controlTrack }, pressed && heldDim]}
      testID="story-chapter-line"
    >
      <View style={[styles.chapterLineHead, { flexDirection: ui.row }]}>
        <Icon name="menu" size={16} color={colors.primary} />
        <Text style={[styles.chapterLineWhere, { color: colors.primary }]}>{where}</Text>
        {current ? (
          <Text {...storyTextProps(story.dialect)} style={[styles.chapterLineTitle, { color: colors.textPrimary }, ui.text]} numberOfLines={1}>
            {current.title}
          </Text>
        ) : null}
      </View>
      <View style={[styles.chapterStones, { flexDirection: ui.row }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {sections.map((s, i) => {
          const end = sections[i + 1]?.paragraph ?? story.paragraphs.length;
          const read = readTo >= end - 1;
          return <View key={s.paragraph} style={[styles.chapterStone, { backgroundColor: read || i === chapter ? colors.primary : colors.controlTrack, opacity: i === chapter && !read ? 0.55 : 1 }]} />;
        })}
      </View>
    </Pressable>
  );
}

/** A legend's chapter list: the introduction if any, then each chapter with its translated title, read ones ticked and "You are here". */
function ChapterList({
  story,
  readTo,
  here,
  onOpen,
}: {
  story: Pick<StoryDetail, 'dialect' | 'sections' | 'paragraphs' | 'translations'>;
  readTo: number;
  /** The chapter being read, or null on the overview. */
  here: number | null;
  onOpen: (paragraph: number) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = storyTextStyle(story.dialect);
  const props = storyTextProps(story.dialect);
  // A chapter title's translation under it, except where the reader's language is the story's own (legend.ts).
  const translation = locale === storyOwnLocale(story) ? null : translationFor(story, locale);
  const underSet = translation && isAppLocale(translation.lang) ? textIn(translation.lang) : null;
  const rows: Array<{ key: string; paragraph: number; number: string; title: string; under: string | null; read: boolean; current: boolean }> = [];
  if (hasIntroduction(story.sections)) {
    rows.push({ key: 'intro', paragraph: 0, number: '·', title: t('stories.reader.introduction'), under: null, read: readTo >= story.sections[0]!.paragraph, current: here === -1 });
  }
  story.sections.forEach((s, i) => {
    const end = story.sections[i + 1]?.paragraph ?? story.paragraphs.length;
    const under = translatedHeading(translation?.paragraphs[s.paragraph]);
    rows.push({ key: `c${s.paragraph}`, paragraph: s.paragraph, number: String(i + 1), title: s.title, under: under !== s.title ? under : null, read: readTo >= end - 1, current: here === i });
  });
  return (
    <View style={styles.chapterList}>
      {rows.map((r) => (
        <Pressable
          key={r.key}
          onPress={() => onOpen(r.paragraph)}
          accessibilityRole="button"
          accessibilityLabel={[r.key === 'intro' ? r.title : `${t('stories.reader.chapterN', { n: r.number })}: ${r.title}`, r.read ? t('stories.reader.chapterRead') : null].filter(Boolean).join(', ')}
          accessibilityState={{ selected: r.current }}
          style={({ pressed }) => [styles.chapterRow, { flexDirection: storyRowDirection(story.dialect) }, r.current && { backgroundColor: colors.controlTrack }, pressed && heldRow(colors.controlTrack)]}
          testID={`chapter-row-${r.key}`}
        >
          <Text style={[styles.chapterNumber, { color: colors.textSecondary }]}>{r.number}</Text>
          <View style={styles.chapterMain}>
            <Text {...(r.key === 'intro' ? {} : props)} style={[styles.chapterTitle, { color: colors.textPrimary }, r.key === 'intro' ? null : dir]}>
              {r.title}
            </Text>
            {r.under && underSet ? (
              <Text {...underSet.props} style={[styles.chapterUnder, { color: colors.textSecondary }, underSet.style]}>
                {r.under}
              </Text>
            ) : null}
            {r.current ? <Text style={[styles.chapterHere, { color: colors.primary }]}>{t('stories.reader.chapterHere')}</Text> : null}
          </View>
          {r.read ? <Icon name="check" size={16} color={colors.primary} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** The overview while loading, in the shape of the cover, title, facts, summary and first button. */
function OverviewSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={styles.content} accessibilityLabel={t('common.loading')}>
      <Skeleton width="100%" height={COVER_HEIGHT} radius={radii.lg} />
      <View style={styles.head}>
        <SkeletonText size={typography.sizes.title} lineHeight={TITLE_LINE} width="60%" />
        <View style={styles.pills}>
          {[96, 72, 56, 64].map((w) => (
            <Skeleton key={w} width={w} height={lineOf(typography.sizes.text) + 6} radius={radii.pill} />
          ))}
        </View>
        <View>
          <SkeletonText size={typography.sizes.text} lineHeight={storyLineHeight(typography.sizes.text)} width="94%" />
          <SkeletonText size={typography.sizes.text} lineHeight={storyLineHeight(typography.sizes.text)} width="58%" />
        </View>
      </View>
      <Skeleton width="100%" height={50} radius={radii.pill} />
    </View>
  );
}

/** The display face at size xl, with its 1.12 line height. */
const TITLE_LINE = Math.round(typography.sizes.title * typography.displayLineHeight);
const COVER_HEIGHT = 180;
/**
 * Word play and save buttons are drawn at 40 so the row stays compact, and answer over 48 (4 past every edge): the
 * two meet in the middle of the 8 between them, and rows are 8 apart, so none takes another's tap.
 */
const WORD_BUTTON = 40;
const styles = StyleSheet.create({
  content: { ...COLUMN, padding: spacing.lg, gap: spacing.lg },
  cover: { width: '100%', height: COVER_HEIGHT },
  head: { gap: spacing.sm },
  title: { ...display(typography.sizes.title) },
  summary: { fontSize: typography.sizes.text, lineHeight: 24 },
  titleTranslation: { fontSize: typography.sizes.text, lineHeight: 28, marginTop: -spacing.xs },
  summaryTranslation: { fontSize: typography.sizes.text, lineHeight: 21 },
  chapterSticky: { marginVertical: -spacing.sm, paddingVertical: spacing.sm },
  chapterLine: { borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  chapterLineHead: { alignItems: 'center', gap: spacing.xs },
  chapterLineWhere: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  chapterLineTitle: { flex: 1, fontSize: typography.sizes.text },
  chapterStones: { gap: 4 },
  chapterStone: { flex: 1, height: 4, borderRadius: radii.pill },
  chapterList: { gap: 2 },
  chapterRow: { alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH_TARGET + 8, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  chapterNumber: { width: 20, textAlign: 'center', fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  chapterMain: { flex: 1, gap: 2 },
  chapterTitle: { ...display(typography.sizes.text), lineHeight: Math.round(typography.sizes.text * 1.3) },
  chapterUnder: { fontSize: typography.sizes.text, lineHeight: 22 },
  chapterHere: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  byline: { fontSize: typography.sizes.text, lineHeight: 20 },
  source: { fontSize: typography.sizes.text, lineHeight: 22 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  variety: { gap: spacing.sm },
  actions: { gap: spacing.sm },
  headerButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  sizeControls: { flexDirection: 'row', alignItems: 'center' },
  sizeButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  sizeSmall: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  sizeLarge: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  section: { gap: spacing.sm },
  readingHead: { gap: 2 },
  readingTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  readingMeta: { fontSize: typography.sizes.text },
  continueChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: MIN_TOUCH_TARGET, borderRadius: radii.pill, paddingHorizontal: spacing.md },
  continueChipText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  end: { gap: spacing.lg, paddingTop: spacing.md },
  endText: { fontSize: typography.sizes.text, textAlign: 'center', fontStyle: 'italic' },
  player: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  check: { gap: spacing.sm },
  checkHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkTitle: { ...display(typography.sizes.text), flex: 1 },
  checkLine: { fontSize: typography.sizes.text, lineHeight: 20 },
  checkBest: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  wordRow: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  wordMain: { flex: 1, justifyContent: 'center', paddingVertical: spacing.xs, gap: 2 },
  wordTerm: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  wordMeaning: { fontSize: typography.sizes.text },
  wordPlay: { width: WORD_BUTTON, height: WORD_BUTTON, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  wordSlot: { width: WORD_BUTTON, height: WORD_BUTTON },
  sheetText: { fontSize: typography.sizes.text, lineHeight: 22 },
  glossTerm: { ...display(typography.sizes.title) },
  glossPos: { fontSize: typography.sizes.text, fontStyle: 'italic' },
  glossMeaning: { fontSize: typography.sizes.text, lineHeight: 26 },
  glossActions: { gap: spacing.sm },
});
