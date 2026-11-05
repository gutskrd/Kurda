import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CHARACTER_NAMES,
  MEMORY_ROUND_PASSAGES,
  learnGame,
  meaningIn,
  memoryStudyLines,
  type GameDialect,
  type MemoryStudyPiece,
  type MemoryThiefCorrection,
  type MemoryThiefHint,
  type MemoryThiefItemView,
  type MemoryWhy,
} from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { TONES } from '../coursemap/path';
import { KurdishAnswerInput } from '../lesson/components/KurdishAnswerInput';
import { useCourseDialect } from '../learn/courseDialect';
import { useDirection } from '../reports/direction';
import { timing } from '../theme/animate';
import { Icon } from '../theme/Icon';
import { duration } from '../theme/motion';
import { Tile, TileButton } from '../theme/Tile';
import { useTheme } from '../theme/ThemeProvider';
import { displayFont } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { SoloGameShell, type SoloRound } from './SoloGameShell';
import { useAvailability, useOpenRound } from './learnGames';

/**
 * The Memory Thief on the phone.
 *
 * The stage is a page on a desk. While the passage is studied a ribbon along
 * the page's top edge runs down with the time; then the thief comes: the
 * words that will vanish lift off the paper like wet ink, one after another,
 * and soft glowing gaps are left where they stood. The player gives them back
 * from a tray of tiles (a gap is chosen, then a word; a filled gap empties when
 * tapped) or, at the advanced difficulty, types each one with the key bar,
 * choosing the gap from the numbered chips above the field.
 *
 * A wrong first try empties the wrong gaps, which glow again, and keeps the
 * right ones. Once a passage is done the words settle back into the page, and
 * the reveal lists each with what it means and anything given wrongly.
 *
 * The passage is laid out a word at a time, so each word can move on its
 * own; Soranî lines run from the right. Under Reduce Motion nothing lifts,
 * glows or runs: the words are simply gone and the gaps plain. The website's
 * games/MemoryThief.tsx stages the same round.
 */

type Round = SoloRound<MemoryThiefItemView, MemoryThiefHint, MemoryThiefCorrection>;
type Phase = 'study' | 'vanish' | 'restore';

const GAME = learnGame('memory-thief');

/** How long the ink takes to lift, and the stagger between one word and the next. */
const VANISH_MS = 900;
const VANISH_STEP_MS = 160;

const WHY_KEY: Record<MemoryWhy, TranslationKey> = {
  glossary: 'games.memory.why.glossary',
  vocabulary: 'games.memory.why.vocabulary',
};

/** A line as the phone lays it out: words one at a time, each gap with the punctuation that touches it. */
export type MemoryToken = { word: string } | { gap: number; word: string; before: string; after: string };

/**
 * A study line's pieces as word-sized boxes: text cut at its spaces, and the
 * punctuation that touches a gap (an opening quote, a closing comma) kept on
 * the gap's box so a line never breaks between them (pure, for the tests).
 */
export function memoryTokens(pieces: readonly MemoryStudyPiece[]): MemoryToken[] {
  const out: MemoryToken[] = [];
  let pending = '';
  pieces.forEach((p) => {
    if ('gap' in p) {
      out.push({ gap: p.gap, word: p.word, before: pending, after: '' });
      pending = '';
      return;
    }
    const chunks = p.text.split(/(\s+)/u);
    chunks.forEach((chunk, i) => {
      if (chunk === '' || /^\s+$/u.test(chunk)) return;
      const touchesBefore = i === 0;
      const touchesAfter = i === chunks.length - 1;
      const last = out.at(-1);
      if (touchesBefore && pending === '' && last && 'gap' in last && last.after === '') last.after = chunk;
      else if (touchesAfter) pending = chunk;
      else out.push({ word: chunk });
    });
    // text that runs straight into the next gap waits for it; text before a space stands alone
    if (pending !== '' && /\s$/u.test(p.text)) {
      out.push({ word: pending });
      pending = '';
    }
  });
  if (pending !== '') out.push({ word: pending });
  return out;
}

/** A word that will vanish: still while it is studied, lifting off like ink when the thief comes. */
function InkWord({ text, lifting, order, style }: { text: string; lifting: boolean; order: number; style: object }): React.JSX.Element {
  const reduce = useReducedMotion();
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!lifting) return;
    if (reduce) {
      lift.setValue(1);
      return;
    }
    const run = timing(lift, 1, VANISH_MS, { delay: order * VANISH_STEP_MS });
    run.start();
    return () => run.stop();
  }, [lifting, reduce, lift, order]);
  const translateY = lift.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, -3, -20] });
  const rotate = lift.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-5deg'] });
  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  const opacity = lift.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 0.9, 0] });
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { rotate }, { scale }] }}>
      <Text style={style}>{text}</Text>
    </Animated.View>
  );
}

/** A gap's soft glow, breathing while it waits for its word (still under Reduce Motion). */
function useGlow(on: boolean): Animated.Value {
  const reduce = useReducedMotion();
  const glow = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    if (!on || reduce) {
      glow.setValue(on ? 0.45 : 0);
      return;
    }
    const loop = Animated.loop(Animated.sequence([timing(glow, 0.8, 1200), timing(glow, 0.15, 1200)]));
    loop.start();
    return () => loop.stop();
  }, [on, reduce, glow]);
  return glow;
}

/** The study's time: a ribbon along the page's top edge that runs down to nothing. */
function StudyRibbon({ seconds, color, rtl }: { seconds: number; color: string; rtl: boolean }): React.JSX.Element {
  const reduce = useReducedMotion();
  const left = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const run = Animated.timing(left, { toValue: 0, duration: seconds * 1000, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [left, seconds, reduce]);
  return (
    <Animated.View
      style={[styles.ribbon, { backgroundColor: color, opacity: reduce ? 0.6 : 1, transform: [{ scaleX: left }] }, rtl ? styles.fromRight : styles.fromLeft]}
    />
  );
}

function GapSlot({
  n,
  shown,
  look,
  selected,
  onPress,
  disabled,
  label,
  before,
  after,
  rtl,
}: {
  n: number;
  shown: string;
  look: 'empty' | 'filled' | 'again' | 'kept' | 'right' | 'typo' | 'wrong';
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
  label: string;
  before: string;
  after: string;
  rtl: boolean;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const tone = TONES[scheme][GAME.tone];
  const waiting = look === 'empty' || look === 'again';
  const glow = useGlow(waiting);
  const reduce = useReducedMotion();
  const settle = useRef(new Animated.Value(look === 'right' || look === 'typo' || look === 'wrong' ? 0 : 1)).current;
  useEffect(() => {
    if (look !== 'right' && look !== 'typo' && look !== 'wrong') return;
    if (reduce) {
      settle.setValue(1);
      return;
    }
    const run = timing(settle, 1, duration.progress, { delay: n * 120 });
    run.start();
    return () => run.stop();
  }, [look, reduce, settle, n]);
  const edge = look === 'again' || look === 'wrong' ? colors.danger : tone.fill;
  const dashed = look === 'empty' || look === 'again';
  return (
    <View style={[styles.gapWrap, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      {before ? <Text style={[styles.word, { color: colors.textPrimary }]}>{before}</Text> : null}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        style={[
          styles.gap,
          {
            borderBottomColor: edge,
            borderStyle: dashed ? 'dashed' : look === 'typo' ? 'dotted' : 'solid',
            opacity: look === 'kept' ? 0.7 : 1,
          },
          selected && { backgroundColor: colors.controlTrack },
        ]}
      >
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow, { backgroundColor: look === 'again' ? colors.dangerFill : tone.fill, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }) }]} />
        <Text style={[styles.gapN, { color: tone.text }]}>{n + 1}</Text>
        <Animated.Text
          style={[
            styles.word,
            styles.gapWord,
            { color: tone.text, opacity: settle, transform: [{ translateY: settle.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] },
            rtl ? styles.rtl : null,
          ]}
        >
          {shown || ' '}
        </Animated.Text>
      </Pressable>
      {after ? <Text style={[styles.word, { color: colors.textPrimary }]}>{after}</Text> : null}
    </View>
  );
}

function MemoryBoard({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const tone = TONES[scheme][GAME.tone];
  const { item, result, busy, submit, state } = round;
  const rtl = dialect === 'ckb';
  const flow = rtl ? 'row-reverse' : 'row';
  const typed = item.tiles === null;
  const lines = useMemo(() => memoryStudyLines(item.text, item.parts), [item.text, item.parts]);
  const [phase, setPhase] = useState<Phase>(state.attempts > 0 ? 'restore' : 'study');
  const [left, setLeft] = useState(item.studySeconds);
  const [given, setGiven] = useState<string[]>(() => Array.from({ length: item.gaps }, () => ''));
  const [used, setUsed] = useState<Array<number | null>>(() => Array.from({ length: item.gaps }, () => null));
  const [selected, setSelected] = useState(0);
  const [tried, setTried] = useState<string | null>(null);
  const done = result?.done === true;
  const locked = done || busy || phase !== 'restore';
  const wrong = useMemo(() => new Set(!done && result && !result.correct ? (result.hint?.wrong ?? []) : []), [done, result]);

  // a new passage starts with the study (one already tried, in a round come back to, with its gaps)
  useEffect(() => {
    setPhase(state.attempts > 0 ? 'restore' : 'study');
    setLeft(item.studySeconds);
    setGiven(Array.from({ length: item.gaps }, () => ''));
    setUsed(Array.from({ length: item.gaps }, () => null));
    setSelected(0);
    setTried(null);
    // only when the passage changes, not when its tries do
  }, [item.index]);

  useEffect(() => {
    if (phase !== 'study') return;
    if (left <= 0) {
      setPhase('vanish');
      return;
    }
    const tick = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(tick);
  }, [phase, left]);

  useEffect(() => {
    if (phase !== 'vanish') return;
    AccessibilityInfo.announceForAccessibility(t('games.memory.vanished', { n: item.gaps }));
    haptic('tap');
    const ms = reduce ? 0 : VANISH_MS + VANISH_STEP_MS * Math.max(0, item.gaps - 1);
    const next = setTimeout(() => setPhase('restore'), ms);
    return () => clearTimeout(next);
  }, [phase, item.gaps, reduce, t]);

  useEffect(() => {
    if (!result || result.done || result.correct) return;
    const bad = result.hint?.wrong ?? [];
    setGiven((g) => g.map((w, i) => (bad.includes(i) ? '' : w)));
    setUsed((u) => u.map((tile, i) => (bad.includes(i) ? null : tile)));
    setSelected(bad[0] ?? 0);
  }, [result]);

  const nextEmpty = (from: number, g: readonly string[]): number => {
    for (let k = 1; k <= g.length; k++) {
      const i = (from + k) % g.length;
      if (g[i] === '') return i;
    }
    return from;
  };

  const pickTile = (tile: number): void => {
    if (locked || used.includes(tile)) return;
    const gap = selected;
    const word = item.tiles![tile]!;
    const nextGiven = given.map((w, i) => (i === gap ? word : w));
    setUsed(used.map((u, i) => (i === gap ? tile : u)));
    setGiven(nextGiven);
    setSelected(nextEmpty(gap, nextGiven));
    haptic('tap');
    AccessibilityInfo.announceForAccessibility(t('games.memory.gapFilled', { n: gap + 1, word }));
  };

  const pressGap = (gap: number): void => {
    if (locked) return;
    if (!typed && given[gap] !== '') {
      setGiven(given.map((w, i) => (i === gap ? '' : w)));
      setUsed(used.map((u, i) => (i === gap ? null : u)));
      haptic('tap');
      AccessibilityInfo.announceForAccessibility(t('games.memory.gapEmptied', { n: gap + 1 }));
    }
    setSelected(gap);
  };

  const complete = given.every((w) => w.trim() !== '');
  const unchanged = tried === JSON.stringify(given);
  const check = useCallback(() => {
    if (locked || !complete || unchanged) return;
    setTried(JSON.stringify(given));
    void submit({ gaps: given.map((w) => w.trim()) });
  }, [locked, complete, unchanged, given, submit]);

  const words = done ? (result?.correction?.words ?? null) : null;
  const text = [dir.text, { color: colors.textPrimary }];
  const wordStyle = [styles.word, { color: colors.textPrimary }, rtl ? styles.rtl : null, rtl ? null : { fontFamily: displayFont }];

  return (
    <View style={styles.board}>
      <View style={[styles.desk, { backgroundColor: tone.lip + '33' }]}>
        <View style={[styles.page, { backgroundColor: colors.surface, borderColor: colors.controlTrack }]} accessibilityLabel={t('games.memory.page')} testID="memory-page">
          {phase === 'study' ? <StudyRibbon seconds={item.studySeconds} color={tone.fill} rtl={rtl} /> : null}
          <Text style={[styles.kicker, dir.text, { color: tone.text }]}>
            {t(item.kind === 'conversation' ? 'games.memory.kind.conversation' : 'games.memory.kind.story')}
          </Text>
          {item.title ? <Text style={[styles.title, { color: colors.textPrimary }, rtl ? styles.rtl : null]}>{item.title}</Text> : null}
          {lines.map((pieces, li) => {
            const speaker = item.speakers[li] ?? null;
            return (
              <View key={li} style={[styles.line, { flexDirection: flow }]}>
                {speaker ? (
                  <Text style={[styles.speaker, { backgroundColor: colors.controlTrack, color: colors.textSecondary }]}>{CHARACTER_NAMES[speaker]}</Text>
                ) : null}
                {memoryTokens(pieces).map((tok, ti) => {
                  const key = `${li}-${ti}`;
                  if (!('gap' in tok)) {
                    return (
                      <Text key={key} style={wordStyle}>
                        {tok.word}
                      </Text>
                    );
                  }
                  if (phase !== 'restore') {
                    return <InkWord key={key} text={`${tok.before}${tok.word}${tok.after}`} lifting={phase === 'vanish'} order={tok.gap} style={wordStyle} />;
                  }
                  const back = words?.[tok.gap];
                  const shown = back ? back.term : (given[tok.gap] ?? '');
                  const look = back
                    ? back.verdict
                    : wrong.has(tok.gap)
                      ? 'again'
                      : result && !result.correct
                        ? 'kept'
                        : shown
                          ? 'filled'
                          : 'empty';
                  return (
                    <GapSlot
                      key={key}
                      n={tok.gap}
                      shown={shown}
                      look={look}
                      selected={!done && selected === tok.gap}
                      onPress={() => pressGap(tok.gap)}
                      disabled={done}
                      label={shown ? t('games.memory.gapFilled', { n: tok.gap + 1, word: shown }) : t('games.memory.gapEmpty', { n: tok.gap + 1 })}
                      before={tok.before}
                      after={tok.after}
                      rtl={rtl}
                    />
                  );
                })}
              </View>
            );
          })}
        </View>
      </View>

      {phase === 'study' ? (
        <View style={styles.study}>
          <Text style={[styles.muted, dir.text, { color: colors.textSecondary }]} accessibilityRole="timer" accessibilityLabel={t('games.memory.timeLeft', { n: left })}>
            {t('games.memory.timeLeft', { n: left })}
          </Text>
          <TileButton label={t('games.memory.ready')} onPress={() => setPhase('vanish')} />
        </View>
      ) : null}
      {phase === 'vanish' ? <Text style={[styles.muted, dir.text, { color: colors.textSecondary }]}>{t('games.memory.vanishing')}</Text> : null}

      {phase === 'restore' && !done ? (
        <View style={styles.restore}>
          {wrong.size > 0 ? <Text style={[dir.text, styles.hint, { color: colors.danger }]}>{t('games.memory.hint')}</Text> : null}
          {typed ? (
            <View style={styles.typed}>
              <Text style={[styles.muted, dir.text, { color: colors.textSecondary }]}>{t('games.memory.typeHint')}</Text>
              <View style={[styles.chips, { flexDirection: dir.row }]}>
                {given.map((w, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setSelected(i)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selected === i }}
                    accessibilityLabel={t('games.memory.gapLabel', { n: i + 1 })}
                    style={[
                      styles.chip,
                      { borderColor: wrong.has(i) ? colors.danger : selected === i ? tone.fill : colors.controlTrack, backgroundColor: w ? colors.controlTrack : 'transparent' },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: colors.textPrimary }]}>{i + 1}</Text>
                  </Pressable>
                ))}
              </View>
              <KurdishAnswerInput
                key={`${item.index}-${selected}`}
                text={given[selected] ?? ''}
                onChangeText={(v) => setGiven((g) => g.map((w, i) => (i === selected ? v : w)))}
                dialect={rtl ? 'sorani' : 'kurmanci'}
                disabled={busy}
                placeholder={t('games.memory.gapLabel', { n: selected + 1 })}
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel={t('games.memory.gapLabel', { n: selected + 1 })}
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.controlTrack }]}
              />
            </View>
          ) : (
            <View style={[styles.tray, { flexDirection: flow }]} accessibilityLabel={t('games.memory.tiles')} testID="memory-tray">
              {item.tiles!.map((word, i) =>
                used.includes(i) ? (
                  <View key={i} style={[styles.ghost, { backgroundColor: colors.controlTrack }]} aria-hidden>
                    <Text style={[styles.ghostText, rtl ? styles.rtl : null]}>{word}</Text>
                  </View>
                ) : (
                  <Tile key={i} label={word} state={locked ? 'disabled' : 'idle'} disabled={locked} onPress={() => pickTile(i)} textStyle={rtl ? styles.rtl : null} />
                ),
              )}
            </View>
          )}
          <TileButton
            label={result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
            onPress={check}
            busy={busy}
            disabled={locked || !complete || unchanged}
          />
          {!typed ? <Text style={[styles.muted, dir.text, { color: colors.textSecondary }]}>{t('games.memory.tilesHint')}</Text> : null}
        </View>
      ) : null}

      {words ? (
        <View style={[styles.reveal, { backgroundColor: colors.surface }]}>
          <Text style={[styles.revealTitle, ...text]} accessibilityRole="header">
            {t('games.memory.reveal')}
          </Text>
          {words.map((w) => {
            const meaning = meaningIn(w.meanings, locale);
            return (
              <View key={w.gap} style={[styles.revealRow, { flexDirection: dir.row }]}>
                <Text style={[styles.revealN, { color: colors.textSecondary }]}>{w.gap + 1}</Text>
                <Text style={[styles.revealTerm, { color: tone.text }, rtl ? styles.rtl : null]}>{w.term}</Text>
                <Text style={[styles.revealMeaning, dir.text, { color: colors.textSecondary }]}>{meaning ?? t('games.memory.noMeaning')}</Text>
                {w.verdict === 'right' ? (
                  <View accessible accessibilityLabel={t('games.solo.right')}>
                    <Icon name="check" size={16} color={colors.success} />
                  </View>
                ) : null}
                {w.verdict === 'typo' ? <Text style={[styles.note, { color: colors.textSecondary }]}>{t('games.memory.typo')}</Text> : null}
                {w.verdict === 'wrong' && w.given ? (
                  <Text style={[styles.note, { color: colors.danger }]}>
                    {t('games.memory.youGave')} {w.given}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** The game in three steps, for the intro: study, the words vanish, give them back. */
function MemorySteps(): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  return (
    <View style={[styles.steps, { flexDirection: dir.row }]}>
      {(['games.memory.step.study', 'games.memory.step.vanish', 'games.memory.step.restore'] as const).map((key, i) => (
        <View key={key} style={[styles.step, { flexDirection: dir.row, borderColor: colors.controlTrack }]}>
          <View style={[styles.stepN, { backgroundColor: tone.fill }]}>
            <Text style={[styles.stepNText, { color: tone.ink }]}>{i + 1}</Text>
          </View>
          <Text style={[styles.stepText, { color: colors.textPrimary }]}>{t(key)}</Text>
        </View>
      ))}
    </View>
  );
}

export function MemoryThiefScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const { scheme } = useTheme();
  const dialect = useCourseDialect();
  const availability = useAvailability(dialect);
  const open = useOpenRound('memory-thief', dialect);
  const game = availability?.games.find((g) => g.id === 'memory-thief');
  const difficulties = availability ? (game?.difficulties ?? []) : null;
  return (
    <SoloGameShell<MemoryThiefItemView, MemoryThiefHint, MemoryThiefCorrection>
      game="memory-thief"
      dialect={dialect}
      title={t('games.memory.name')}
      blurb={t('games.memory.intro')}
      intro={<MemorySteps />}
      difficulties={difficulties}
      open={open}
      roundItems={MEMORY_ROUND_PASSAGES}
      renderRound={(round) => <MemoryBoard round={round} dialect={dialect} />}
      explain={(why) => (why in WHY_KEY ? t(WHY_KEY[why as MemoryWhy]) : null)}
      onExit={onExit}
      tone={TONES[scheme][GAME.tone].fill}
    />
  );
}

const styles = StyleSheet.create({
  board: { gap: spacing.lg },
  desk: { borderRadius: radii.xl, padding: spacing.md },
  page: { borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs, overflow: 'hidden' },
  ribbon: { position: 'absolute', top: 0, left: 0, right: 0, height: 5 },
  // the ribbon runs down toward the side the line starts from
  fromLeft: { transformOrigin: 'left center' },
  fromRight: { transformOrigin: 'right center' },
  kicker: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
  line: { flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2, minHeight: MIN_TOUCH_TARGET },
  word: { fontSize: typography.sizes.lg, lineHeight: 32 },
  speaker: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, borderRadius: radii.pill, paddingHorizontal: spacing.sm, overflow: 'hidden' },
  gapWrap: { alignItems: 'center' },
  gap: {
    minWidth: 64,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 2,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  glow: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  gapN: { fontSize: 10, fontWeight: typography.weights.bold, alignSelf: 'flex-start', marginTop: 6 },
  gapWord: { fontWeight: typography.weights.semibold },
  rtl: { writingDirection: 'rtl' },
  study: { gap: spacing.sm },
  muted: { fontSize: typography.sizes.sm },
  restore: { gap: spacing.md },
  hint: { fontSize: typography.sizes.sm },
  typed: { gap: spacing.sm },
  chips: { flexWrap: 'wrap', gap: spacing.sm },
  chip: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontWeight: typography.weights.semibold },
  input: { borderWidth: 1, borderRadius: radii.md, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, fontSize: typography.sizes.lg },
  tray: { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  ghost: { borderRadius: radii.lg, paddingHorizontal: spacing.md, minHeight: 48, justifyContent: 'center' },
  ghostText: { opacity: 0, fontSize: typography.sizes.md },
  reveal: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  revealTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  revealRow: { flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm },
  revealN: { fontSize: typography.sizes.xs },
  revealTerm: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  revealMeaning: { fontSize: typography.sizes.sm },
  note: { fontSize: typography.sizes.xs },
  steps: { flexWrap: 'wrap', gap: spacing.sm },
  step: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1 },
  stepN: { width: 24, height: 24, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  stepNText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  stepText: { fontSize: typography.sizes.sm },
});
