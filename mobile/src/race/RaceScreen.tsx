import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import {
  BACKTICK_WAIT_MS,
  compareTyping,
  displayTarget,
  type RaceLength,
  type TypingDialect,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { ClayButton, GlassCard, GlassRow, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { KeyBar } from '../keyboard/KeyBar';
import { KeyboardGuide } from '../keyboard/KeyboardGuide';
import { ACCENT_LABEL, KeyboardSettingsSheet } from '../keyboard/KeyboardSettings';
import { GUIDE_AFTER_MISSES, tryLetters } from '../keyboard/guide';
import { keyboardPrefs, useKeyboardPrefs } from '../keyboard/prefs';
import { HevaloDeer } from '../feedback/HevaloDeer';
import { leftResults, reportGameFinished } from '../feedback/gameFinished';
import { applyTypingChange, typeKey } from './input';
import { RaceText } from './RaceText';
import { finishRace, startRace, type RaceGame, type RaceResult } from './raceApi';

const LENGTHS: readonly RaceLength[] = [1, 2, 3];

const LENGTH_KEY: Record<RaceLength, TranslationKey> = {
  1: 'games.race.short',
  2: 'games.race.medium',
  3: 'games.race.long',
};

const DIALECTS: readonly TypingDialect[] = ['kurmanci', 'sorani'];
const DIALECT_KEY: Record<TypingDialect, TranslationKey> = {
  kurmanci: 'games.race.kurmanci',
  sorani: 'games.race.sorani',
};

/** How often the on-screen clock ticks. The score is timed server-side. */
const TICK_MS = 100;

/** The API takes up to this much typing; the field never holds more. */
const API_MAX_TYPED = 4000;

/**
 * Typing Race (KUR-307) on the phone: type a Kurdish text against the clock.
 *
 * The one game of the four with no lobby and no invite — it is a solo time
 * trial. Speed is the server's to decide (it timed the handover), so the timer
 * here is for the racer and is never sent.
 *
 * What you read and what takes the keys are two things: the text, drawn word
 * by word and coloured as you go, and an invisible field over it that the
 * phone's keyboard types into. The field's cursor is pinned to the end and
 * every change to it is read as a keystroke at the end (input.ts), so a tap on
 * the text, the iPhone's space-bar trackpad or a long press can no longer put
 * a letter in the middle and turn the rest of the race red. It has no menu, no
 * autocorrect, no suggestions to accept and no paste.
 *
 * Typing is compared word by word with `@kurda/shared` compareTyping — one
 * missed letter costs that letter, not everything after it — in the accent
 * mode the racer chose, which the server stores with the race.
 */
export function RaceScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const reduceMotion = useReducedMotion();
  const [prefs, setPrefs, prefsReady] = useKeyboardPrefs();

  const [game, setGame] = useState<RaceGame | null>(null);
  const [length, setLength] = useState<RaceLength>(1);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<RaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const startedAt = useRef<number | null>(null);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const typeAreaY = useRef(0);
  // a finish already on its way: auto-finish and "Give up" must not both send one
  const finishingRef = useRef(false);
  // set when the guide was opened by "Start", so closing it starts the race
  const startAfterGuide = useRef(false);

  // the variety to race in: the last one chosen here, else the one the app is read in
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
    // the first Kurmancî race on this phone begins with the keyboard guide —
    // before the clock, which starts when the server hands the text over
    if (dialect === 'kurmanci' && prefsReady && !prefs.guideShown) {
      setPrefs({ guideShown: true });
      startAfterGuide.current = true;
      setGuideOpen(true);
      return;
    }
    setStarting(true);
    setError(null);
    setNotice(null);
    // the rating box belonged to the results this replaces
    leftResults();
    // everything from the race before goes first, so nothing typed while the
    // next text loads lands in it, and its clock does not carry on (R7)
    setGame(null);
    setResult(null);
    setTyped('');
    setElapsed(0);
    startedAt.current = null;
    finishingRef.current = false;
    // The mode as it is now, not as this render saw it: "Make accents
    // forgiving" in the guide changes it and starts the race in one tap.
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
   * Typing begins the moment the text appears, and the clock is already
   * running — so the field takes focus as soon as it exists. On a phone this
   * is also what opens the keyboard. It takes it back when a finish that
   * failed lets the racer type again (the field was closed while it was sent).
   */
  useEffect(() => {
    if (game && !result && !finishing) inputRef.current?.focus();
  }, [game, result, finishing]);

  // A sheet over the race took the keyboard away while the clock runs: give it
  // back as the sheet goes, once it has finished leaving.
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

  // a running clock, for the racer; the score is timed server-side
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
        // shown in the race itself, where the racer is looking, and the race
        // can be finished again (R2)
        finishingRef.current = false;
        setError(
          res.error.code === 'ALREADY_FINISHED' ? t('games.race.alreadyOver') : describeError(res.error, t),
        );
      }
    },
    [client, game, typed, result, t],
  );

  // reaching the end ends the race; nobody should have to notice they are done
  // and then reach for a button. Not while an accent is still being composed,
  // and a last letter that a backtick may still accent waits a moment for it.
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

  // the cursor goes back to the end whenever anything moves it
  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { start: s, end } = e.nativeEvent.selection;
    if (s !== typed.length || end !== typed.length) inputRef.current?.setSelection?.(typed.length, typed.length);
  };

  const onKey = (letter: string) => {
    if (!game || result) return;
    setTyped((prev) => typeKey(prev, letter, { backtick: prefs.backtick, maxLength: maxTyped }));
    inputRef.current?.focus();
  };

  // keep the line being typed in sight above the keyboard
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
            <Pressable
              onPress={() => setSettingsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('keyboard.settings.title')}
              style={styles.headerButton}
            >
              <Icon name="keyboard" size={22} color={colors.textPrimary} />
            </Pressable>
          }
        />

        {!game ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <GlassCard>
              {/* the card's style dresses its outside; what is in it is laid out here */}
              <View style={styles.card}>
                <Icon name="bolt" size={44} tone="primary" />
                <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.race.intro')}</Text>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('games.race.textIn')}</Text>
                <View style={styles.full}>
                  <Segmented<TypingDialect>
                    options={DIALECTS}
                    value={dialect}
                    onChange={(d) => setPrefs({ raceDialect: d })}
                    labelOf={(d) => t(DIALECT_KEY[d])}
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
                <ClayButton
                  label={t('games.race.start')}
                  icon="play"
                  tone="primary"
                  size="large"
                  busy={starting}
                  onPress={() => void start()}
                  style={styles.stretch}
                />
                {error ? (
                  <Text style={[styles.error, { color: colors.danger }]} accessibilityLiveRegion="polite">
                    {error}
                  </Text>
                ) : null}
              </View>
            </GlassCard>
            <GlassCard padding="tight">
              {/* the accent mode under the name, not beside it: side by side, a phone cut both short */}
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
              contentContainerStyle={styles.raceContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* the way back to typing when the keyboard went away — by touch and by a screen reader */}
              <Pressable
                onPress={() => inputRef.current?.focus()}
                onLayout={(e) => {
                  typeAreaY.current = e.nativeEvent.layout.y;
                }}
                accessible={!result}
                accessibilityRole="button"
                accessibilityLabel={t('games.race.tapToType')}
                focusable={false}
                style={[styles.typeArea, { backgroundColor: colors.controlTrack }]}
              >
                <RaceText
                  text={shown}
                  dialect={raceDialect}
                  comparison={comparison}
                  finished={!!result}
                  onCaretLine={onCaretLine}
                />

                {/*
                  The field is here, invisible, on purpose: the keyboard types
                  into it, the words above are what you read. It takes no touches
                  (the area does, and focuses it), so a tap cannot put its cursor
                  anywhere; the cursor is pinned to the end besides, for the
                  gestures that move it without a tap.
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

              {!result && comparison?.done ? (
                // The text is all typed: scoring it, or — when that failed —
                // trying again. Never "Give up" for a race that was finished.
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
        {/* the card's style dresses its outside; what is in it is laid out here */}
        <View style={styles.card}>
        <Text
          style={[styles.verdict, { color: result.implausible ? colors.danger : colors.primary }]}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          {result.implausible
            ? t('games.race.notScored')
            : result.perfect
              ? t('games.race.perfect')
              : t('games.race.finished')}
        </Text>
        {/*
          Said out loud rather than shown as a silent zero. Somebody who hits
          this has almost certainly found a way around the typing box, and a
          result that just reads 0 looks like a broken game.
        */}
        {result.implausible ? (
          <Text style={[styles.blurb, { color: colors.textSecondary }]}>{t('games.race.refused')}</Text>
        ) : null}
        {result.personalBest && !result.implausible ? (
          <View style={[styles.best, { backgroundColor: colors.gold }]}>
            <Icon name="trophy" size={16} color={colors.textOnPrimary} />
            <Text style={[styles.bestText, { color: colors.textOnPrimary }]}>{t('games.race.personalBest')}</Text>
          </View>
        ) : null}
        <View style={styles.figures}>
          <Figure value={result.wpm.toFixed(1)} label={t('games.race.wpm')} />
          <Figure value={`${Math.round(result.accuracy * 100)}%`} label={t('games.race.accuracy')} />
          <Figure value={`${(result.elapsedMs / 1000).toFixed(1)}s`} label={t('games.race.time')} />
          {/* XP is the app's own unit and reads the same in every language */}
          <Figure value={`+${result.xpAwarded}`} label="XP" />
        </View>
        {result.accented > 0 && result.accentMode !== 'hidden' ? (
          <Text style={[styles.accents, { color: colors.textSecondary }]}>
            {t('games.race.accents', { right: result.accented - result.accentMisses, total: result.accented })}
          </Text>
        ) : null}
        <ClayButton label={t('games.race.again')} tone="primary" size="large" busy={starting} onPress={onAgain} style={styles.stretch} />
        </View>
      </GlassCard>

      {accentTrouble ? (
        <Pressable
          onPress={onGuide}
          accessibilityRole="button"
          accessibilityLabel={`${t('games.race.accentNudge')} ${t('games.race.accentNudgeAction')}`}
          style={[styles.nudge, { backgroundColor: colors.glassFill }]}
        >
          {/* the letters this race's variety is missed on: Kurmancî's ç ê î, Soranî's own letters */}
          <HevaloDeer size={84} board={{ kind: 'letters', letters: tryLetters(dialect).slice(0, 3).join(' ') }} />
          <View style={styles.nudgeText}>
            <Text style={[styles.nudgeTitle, { color: colors.textPrimary }]}>{t('games.race.accentNudge')}</Text>
            <Text style={[styles.nudgeAction, { color: colors.primary }]}>{t('games.race.accentNudgeAction')}</Text>
          </View>
        </Pressable>
      ) : null}
    </>
  );
}

function Figure({ value, label }: { value: string; label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.figure}>
      <Text style={[styles.figureValue, { color: colors.primary }]}>{value}</Text>
      <Text style={[styles.figureLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  raceContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  card: { alignItems: 'center', gap: spacing.sm },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  full: { alignSelf: 'stretch' },
  blurb: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 20 },
  label: { alignSelf: 'stretch', fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, marginTop: spacing.sm },
  error: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textAlign: 'center' },
  notice: { fontSize: typography.sizes.sm, textAlign: 'center' },
  headerButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  timer: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'], minWidth: 64 },
  track: { flex: 1, height: 6, borderRadius: radii.pill, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: radii.pill },
  textTitle: { fontSize: typography.sizes.sm, maxWidth: 120 },
  typeArea: { borderRadius: radii.md, padding: spacing.md, minHeight: 160 },
  // full-bleed and invisible: it takes the keystrokes, the text above is read
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
  figures: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch', rowGap: spacing.md, marginTop: spacing.sm },
  // two across, not four: "words per minute" is PEYV/XULEK in Kurmancî and
  // Wörter/Minute in German, and four of those in a phone's width collide
  figure: { width: '50%', alignItems: 'center' },
  figureValue: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  figureLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  accents: { fontSize: typography.sizes.sm, textAlign: 'center', marginTop: spacing.sm },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, padding: spacing.md },
  nudgeText: { flex: 1, gap: spacing.xs },
  nudgeTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, lineHeight: 21 },
  nudgeAction: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
