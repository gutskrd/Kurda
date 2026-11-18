import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Pressable } from '../theme/Pressable';
import { PressableScale, heldDim } from '../theme/MotionParts';
import {
  BACKTICK_WAIT_MS,
  compareTyping,
  displayTarget,
  type RaceLength,
  type TypingDialect,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { describeError } from '../api/errors';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { ClayButton, GlassCard, GlassRow, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { GameArt } from '../games/GameArt';
import { Cloth, GoldButton } from '../impostor/parts';
import { TABLE } from '../impostor/table';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { HeaderButton } from '../navigation/HeaderButton';
import { KeyBar } from '../keyboard/KeyBar';
import { KeyboardGuide } from '../keyboard/KeyboardGuide';
import { ACCENT_LABEL, KeyboardSettingsSheet } from '../keyboard/KeyboardSettings';
import { GUIDE_AFTER_MISSES, tryLetters } from '../keyboard/guide';
import { keyboardPrefs, useKeyboardPrefs } from '../keyboard/prefs';
import { HevaloDeer } from '../feedback/HevaloDeer';
import { leftResults, reportGameFinished, useRatingBoxInset } from '../feedback/gameFinished';
import { applyTypingChange, typeKey } from './input';
import { RaceText } from './RaceText';
import { finishRace, startRace, type RaceGame, type RaceResult } from './raceApi';
import { dialectNameKey } from '../i18n/dialectName';

const LENGTHS: readonly RaceLength[] = [1, 2, 3];

const LENGTH_KEY: Record<RaceLength, TranslationKey> = {
  1: 'games.race.short',
  2: 'games.race.medium',
  3: 'games.race.long',
};

const DIALECTS: readonly TypingDialect[] = ['kurmanci', 'sorani'];

/** How often the on-screen clock ticks. The score is timed server-side. */
const TICK_MS = 100;

/** The API takes up to this much typing; the field never holds more. */
const API_MAX_TYPED = 4000;

/**
 * Typing Race: type a Kurdish text against the clock. A solo time trial with no lobby or invite. The server
 * measures speed from when it handed the text over, so the on-screen timer is never sent. It earns no XP; the
 * result shows speed, accuracy and time, with one line on where XP comes from.
 *
 * The text is drawn word by word and coloured as you type, under an invisible field the keyboard types into. The
 * field's cursor is pinned to the end and every change is read as a keystroke at the end (input.ts), so taps, the
 * iPhone's space-bar trackpad or a long press cannot insert a letter mid-text. It has no menu, autocorrect,
 * suggestions or paste.
 *
 * Typing is compared word by word with `@kurda/shared` compareTyping, so a missed letter costs only that letter,
 * in the accent mode the racer chose, which the server stores with the race.
 */
export function RaceScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const reduceMotion = useReducedMotion();
  const [prefs, setPrefs, prefsReady] = useKeyboardPrefs();
  // Room under the results for the rating box, so Race again and the keyboard nudge scroll clear of it.
  const boxInset = useRatingBoxInset();

  const [game, setGame] = useState<RaceGame | null>(null);
  const [length, setLength] = useState<RaceLength>(1);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<RaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // The server says this race is already over: it cannot be finished again, only raced anew.
  const [over, setOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const startedAt = useRef<number | null>(null);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const typeAreaY = useRef(0);
  // A finish already on its way: auto-finish and "Give up" must not both send one.
  const finishingRef = useRef(false);
  // Set when "Start" opened the guide, so closing it starts the race.
  const startAfterGuide = useRef(false);

  // The variety to race in: the last one chosen here, else the one the app is read in.
  const dialect: TypingDialect = prefs.raceDialect ?? (locale === 'ckb' ? 'sorani' : 'kurmanci');
  const raceDialect = game?.dialect ?? dialect;
  const shown = useMemo(
    () => (game ? displayTarget(game.text.body, game.accentMode, game.dialect) : ''),
    [game],
  );
  const length_ = useMemo(() => [...shown].length, [shown]);
  const maxTyped = Math.min(API_MAX_TYPED, 2 * length_ + 160);
  const comparison = useMemo(
    () =>
      game
        ? compareTyping(game.text.body, typed, game.accentMode, {
            dialect: game.dialect,
            backtickShortcut: prefs.backtick,
          })
        : null,
    [game, typed, prefs.backtick],
  );
  const progress = length_ === 0 || !comparison ? 0 : Math.min(comparison.caret / length_, 1);

  const start = useCallback(async () => {
    if (starting) return;
    // The first Kurmancî race on this device starts with the keyboard guide, before the clock (which starts when
    // the server hands over the text).
    if (dialect === 'kurmanci' && prefsReady && !prefs.guideShown) {
      setPrefs({ guideShown: true });
      startAfterGuide.current = true;
      setGuideOpen(true);
      return;
    }
    haptic('tap');
    setStarting(true);
    setError(null);
    setNotice(null);
    // The rating box belonged to the results this replaces.
    leftResults();
    // Clear the previous race first, so nothing typed while the next text loads lands in it and its clock stops.
    setGame(null);
    setResult(null);
    setOver(false);
    setTyped('');
    setElapsed(0);
    startedAt.current = null;
    finishingRef.current = false;
    // The current mode, not this render's: "Make accents forgiving" in the guide changes it and starts the race
    // in one tap.
    const res = await startRace(client, { length, dialect, accentMode: keyboardPrefs.current.accentMode });
    setStarting(false);
    if (res.ok) {
      setGame(res.data);
      startedAt.current = Date.now();
    } else {
      setError(res.error.code === 'EMPTY_RACE_POOL' ? t('games.race.emptyPool') : describeError(res.error, t));
    }
  }, [starting, dialect, prefsReady, prefs.guideShown, setPrefs, client, length, t]);

  /*
   * The clock is running when the text appears, so the field takes focus as soon as it exists, which also opens
   * the keyboard; it refocuses when a failed finish lets the racer type again.
   */
  useEffect(() => {
    if (game && !result && !finishing) inputRef.current?.focus();
  }, [game, result, finishing]);

  // A sheet over the race took the keyboard while the clock runs: give it back once the sheet has finished leaving.
  const racing = !!game && !result;
  const refocus = () => {
    if (racing) setTimeout(() => inputRef.current?.focus(), 350);
  };

  const closeGuide = () => {
    setGuideOpen(false);
    if (startAfterGuide.current) {
      startAfterGuide.current = false;
      void start();
    } else refocus();
  };

  // A running clock, for the racer; the score is timed server-side.
  useEffect(() => {
    if (!game || result) return;
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [game, result]);

  const finish = useCallback(
    async (gaveUp: boolean) => {
      if (!game || result || finishingRef.current) return;
      finishingRef.current = true;
      setFinishing(true);
      setError(null);
      const res = await finishRace(client, game.id, typed);
      setFinishing(false);
      if (res.ok) {
        setResult(res.data);
        inputRef.current?.blur();
        reportGameFinished({
          moment: res.data.personalBest && !res.data.implausible ? 'personal_best' : 'other',
          gaveUp: gaveUp || res.data.implausible,
        });
      } else {
        // Shown in the race itself, where the racer is looking, and the race can be finished again.
        finishingRef.current = false;
        if (res.error.code === 'ALREADY_FINISHED') setOver(true);
        setError(
          res.error.code === 'ALREADY_FINISHED' ? t('games.race.alreadyOver') : describeError(res.error, t),
        );
      }
    },
    [client, game, typed, result, t],
  );

  // Reaching the end finishes the race without a button. Not while an accent is being composed, and a last letter
  // a backtick may still accent waits a moment.
  useEffect(() => {
    if (!game || result || !comparison) return;
    if (comparison.done) {
      void finish(false);
      return;
    }
    if (comparison.awaitingBacktick && comparison.caret >= length_ - 1) {
      const timer = setTimeout(() => void finish(false), BACKTICK_WAIT_MS);
      return () => clearTimeout(timer);
    }
  }, [comparison, game, result, finish, length_]);

  const onChangeText = (next: string) => {
    if (!game || result) return;
    const change = applyTypingChange(typed, next, { backtick: prefs.backtick, maxLength: maxTyped });
    setNotice(change.pasted ? t('games.race.noPaste') : null);
    setTyped(change.typed);
  };

  // The cursor goes back to the end whenever anything moves it.
  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { start: s, end } = e.nativeEvent.selection;
    if (s !== typed.length || end !== typed.length) inputRef.current?.setSelection?.(typed.length, typed.length);
  };

  const onKey = (letter: string) => {
    if (!game || result) return;
    setTyped((prev) => typeKey(prev, letter, { backtick: prefs.backtick, maxLength: maxTyped }));
    inputRef.current?.focus();
  };

  // Keep the line being typed in sight above the keyboard.
  const onCaretLine = useCallback(
    (y: number) => {
      scrollRef.current?.scrollTo({ y: Math.max(0, typeAreaY.current + y - 48), animated: !reduceMotion });
    },
    [reduceMotion],
  );

  const accentTrouble = !!result && result.accentMisses >= GUIDE_AFTER_MISSES;

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScreenHeader
          title={t('games.race.name')}
          onBack={onExit}
          right={
            <HeaderButton icon="keyboard" label={t('keyboard.settings.title')} onPress={() => setSettingsOpen(true)} />
          }
        />

        {!game ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* The night every game opens on: the emblem acting the race out, and what the race is. */}
            <Cloth style={styles.stage}>
              <GameArt game="race" size={132} moving />
              <Text style={styles.stageLine}>{t('games.race.intro')}</Text>
            </Cloth>
            <GlassCard>
              {/* The card's style dresses its outside; what is in it is laid out here. */}
              <View style={styles.card}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('games.race.textIn')}</Text>
                <View style={styles.full}>
                  <Segmented<TypingDialect>
                    options={DIALECTS}
                    value={dialect}
                    onChange={(d) => setPrefs({ raceDialect: d })}
                    labelOf={(d) => t(dialectNameKey(d))}
                  />
                </View>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('games.race.length')}</Text>
                <View style={styles.full}>
                  <Segmented<string>
                    options={LENGTHS.map(String)}
                    value={String(length)}
                    onChange={(v) => setLength(Number(v) as RaceLength)}
                    labelOf={(v) => t(LENGTH_KEY[Number(v) as RaceLength])}
                  />
                </View>
                <GoldButton label={t('games.race.start')} icon="play" busy={starting} onPress={() => void start()} style={styles.stretch} />
                {error ? (
                  <Text style={[styles.error, { color: colors.danger }]} accessibilityLiveRegion="polite">
                    {error}
                  </Text>
                ) : null}
              </View>
            </GlassCard>
            <GlassCard padding="tight">
              {/* The accent mode under the name, not beside it: side by side, a phone cut both short. */}
              <GlassRow
                icon="keyboard"
                title={t('keyboard.settings.title')}
                subtitle={t(ACCENT_LABEL[prefs.accentMode])}
                onPress={() => setSettingsOpen(true)}
              />
            </GlassCard>
          </ScrollView>
        ) : (
          <View style={styles.flex}>
            <View style={styles.stats}>
              <Text style={[styles.timer, { color: colors.textPrimary }]}>{(elapsed / 1000).toFixed(1)}s</Text>
              <View
                style={[styles.track, { backgroundColor: colors.controlTrack }]}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
              >
                <View style={[styles.trackFill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
              </View>
              <Text style={[styles.textTitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {game.text.title}
              </Text>
            </View>

            <ScrollView
              ref={scrollRef}
              contentContainerStyle={[styles.raceContent, result && boxInset > 0 ? { paddingBottom: spacing.xl + boxInset } : null]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* The way back to typing when the keyboard went away — by touch and by a screen reader. */}
              <Pressable
                onPress={() => inputRef.current?.focus()}
                onLayout={(e) => {
                  typeAreaY.current = e.nativeEvent.layout.y;
                }}
                accessible={!result}
                accessibilityRole="button"
                accessibilityLabel={t('games.race.tapToType')}
                focusable={false}
                style={({ pressed }) => [styles.typeArea, { backgroundColor: colors.controlTrack }, pressed && heldDim]}
              >
                <RaceText
                  text={shown}
                  dialect={raceDialect}
                  comparison={comparison}
                  finished={!!result}
                  onCaretLine={onCaretLine}
                />

                {/*
                  The invisible field the keyboard types into. It takes no touches (the area does, and focuses
                  it), and its cursor is pinned to the end for gestures that move it without a tap.
                */}
                <TextInput
                  ref={inputRef}
                  value={typed}
                  onChangeText={onChangeText}
                  selection={{ start: typed.length, end: typed.length }}
                  onSelectionChange={onSelectionChange}
                  editable={!result && !finishing}
                  contextMenuHidden
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  importantForAutofill="no"
                  textContentType="none"
                  submitBehavior="submit"
                  caretHidden
                  accessibilityLabel={t('games.race.typeTheText')}
                  pointerEvents="none"
                  style={[styles.capture, raceDialect === 'sorani' && styles.captureRtl]}
                />
              </Pressable>

              {notice ? (
                <Text style={[styles.notice, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
                  {notice}
                </Text>
              ) : null}
              {error ? (
                <Text style={[styles.error, { color: colors.danger }]} accessibilityLiveRegion="assertive">
                  {error}
                </Text>
              ) : null}

              {!result && over ? (
                <ClayButton
                  label={t('games.race.again')}
                  tone="primary"
                  busy={starting}
                  onPress={() => void start()}
                  style={styles.stretch}
                />
              ) : !result && comparison?.done ? (
                // The text is all typed: scoring it, or retrying when that failed. Never "Give up" for a finished race.
                <ClayButton
                  label={error ? t('common.retry') : t('games.race.scoring')}
                  tone="primary"
                  busy={finishing}
                  onPress={() => void finish(false)}
                  style={styles.stretch}
                />
              ) : !result ? (
                <ClayButton
                  label={t('games.race.giveUp')}
                  tone="neutral"
                  busy={finishing}
                  onPress={() => void finish(true)}
                  style={styles.stretch}
                />
              ) : (
                <Result
                  result={result}
                  dialect={raceDialect}
                  starting={starting}
                  accentTrouble={accentTrouble}
                  onAgain={() => void start()}
                  onGuide={() => setGuideOpen(true)}
                />
              )}
            </ScrollView>

            {prefs.keyBar && !result ? (
              <View style={[styles.keyBarWrap, { backgroundColor: colors.background, borderTopColor: colors.separator }]}>
                <KeyBar dialect={raceDialect} onKey={onKey} disabled={finishing} />
              </View>
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>

      <KeyboardSettingsSheet
        visible={settingsOpen}
        dialect={raceDialect}
        midRace={!!game && !result}
        onClose={() => {
          setSettingsOpen(false);
          refocus();
        }}
      />
      <KeyboardGuide visible={guideOpen} dialect={raceDialect} onClose={closeGuide} />
    </GradientBackground>
  );
}

function Result({
  result,
  dialect,
  starting,
  accentTrouble,
  onAgain,
  onGuide,
}: {
  result: RaceResult;
  dialect: TypingDialect;
  starting: boolean;
  accentTrouble: boolean;
  onAgain: () => void;
  onGuide: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <>
      <GlassCard>
        {/* The card's style dresses its outside; what is in it is laid out here. */}
        <View style={styles.card}>
          <Text
            // The result heading uses the page's ink: violet is for what can be pressed.
            style={[styles.verdict, { color: result.implausible ? colors.danger : colors.textPrimary }]}
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
          >
            {result.implausible
              ? t('games.race.notScored')
              : result.perfect
                ? t('games.race.perfect')
                : t('games.race.finished')}
          </Text>
          {/* Said out loud rather than a silent zero: whoever hits this has probably bypassed the typing box, and a bare 0 looks broken. */}
          {result.implausible ? (
            <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.race.refused')}</Text>
          ) : null}
          {result.personalBest && !result.implausible ? (
            <View style={[styles.best, { backgroundColor: colors.gold }]}>
              <Icon name="trophy" size={16} color={colors.textOnGold} />
              <Text style={[styles.bestText, { color: colors.textOnGold }]}>{t('games.race.personalBest')}</Text>
            </View>
          ) : null}
          <View style={styles.figures}>
            <Figure value={result.wpm.toFixed(1)} label={t('games.race.wpm')} />
            <Figure value={`${Math.round(result.accuracy * 100)}%`} label={t('games.race.accuracy')} />
            <Figure value={`${(result.elapsedMs / 1000).toFixed(1)}s`} label={t('games.race.time')} />
          </View>
          {result.accented > 0 && result.accentMode !== 'hidden' ? (
            <Text style={[styles.accents, { color: colors.textSecondary }]}>
              {t('games.race.accents', { right: result.accented - result.accentMisses, total: result.accented })}
            </Text>
          ) : null}
          <Text style={[styles.accents, { color: colors.textSecondary }]}>{t('games.noXpAlone')}</Text>
          <GoldButton label={t('games.race.again')} busy={starting} onPress={onAgain} style={styles.stretch} />
        </View>
      </GlassCard>

      {accentTrouble ? (
        <PressableScale
          onPress={onGuide}
          accessibilityRole="button"
          accessibilityLabel={`${t('games.race.accentNudge')} ${t('games.race.accentNudgeAction')}`}
          style={[styles.nudge, { backgroundColor: colors.glassFill }]}
        >
          {/* The letters this race's variety is missed on: Kurmancî's ç ê î, Soranî's own letters. */}
          <HevaloDeer size={84} board={{ kind: 'letters', letters: tryLetters(dialect).slice(0, 3).join(' ') }} />
          <View style={styles.nudgeText}>
            <Text style={[styles.nudgeTitle, { color: colors.textPrimary }]}>{t('games.race.accentNudge')}</Text>
            <Text style={[styles.nudgeAction, { color: colors.primary }]}>{t('games.race.accentNudgeAction')}</Text>
          </View>
        </PressableScale>
      ) : null}
    </>
  );
}

function Figure({ value, label }: { value: string; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.figure}>
      {/* A figure, not something to press: in the page's ink. */}
      <Text style={[styles.figureValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.figureLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  raceContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  card: { alignItems: 'center', gap: spacing.sm },
  stage: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  stageLine: { color: TABLE.inkSoft, fontSize: typography.sizes.md, lineHeight: 22, textAlign: 'center' },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  full: { alignSelf: 'stretch' },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 20 },
  label: { alignSelf: 'stretch', fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, marginTop: spacing.sm },
  error: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  notice: { fontSize: typography.sizes.sm, textAlign: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  timer: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'], minWidth: 64 },
  track: { flex: 1, height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: radii.pill },
  textTitle: { fontSize: typography.sizes.sm, maxWidth: 120 },
  typeArea: { borderRadius: radii.md, padding: spacing.md, minHeight: 160 },
  // Full-bleed and invisible: it takes the keystrokes, the text above is read.
  capture: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: 'transparent', minHeight: MIN_TOUCH_TARGET },
  captureRtl: { writingDirection: 'rtl' },
  keyBarWrap: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  verdict: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center' },
  best: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  bestText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  // Three figures, two and one: centred, so the one under the two sits in the middle.
  figures: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignSelf: 'stretch', rowGap: spacing.md, marginTop: spacing.sm },
  // Two across, not three: labels like PEYV/XULEK or Wörter/Minute collide three to a phone's width.
  figure: { width: '50%', alignItems: 'center' },
  figureValue: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  figureLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  accents: { fontSize: typography.sizes.sm, textAlign: 'center', marginTop: spacing.sm },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, padding: spacing.md },
  nudgeText: { flex: 1, gap: spacing.xs },
  nudgeTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, lineHeight: 21 },
  nudgeAction: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
