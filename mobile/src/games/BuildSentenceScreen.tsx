import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import {
  DIFFICULTY_RUNGS,
  GAME_DIFFICULTIES,
  learnGame,
  meaningIn,
  rungAt,
  type GameDialect,
  type GameDifficulty,
  type SentenceCorrection,
  type SentenceHint,
  type SentenceItemView,
  type SentenceLadderView,
  type SentenceRung,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { TONES, REST } from '../coursemap/path';
import { useCourseDialect } from '../learn/courseDialect';
import { useDirection } from '../reports/direction';
import { springTo } from '../theme/animate';
import { Icon } from '../theme/Icon';
import { Tile, TileButton } from '../theme/Tile';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { SoloGameShell, type SoloRound } from './SoloGameShell';
import { useAvailability } from './learnGames';

/**
 * Build a Sentence on the phone.
 *
 * The stage: the meaning on a card, a ruled line the sentence is laid on, and
 * a tray of word tiles under it — the sentence's own words and a few that are
 * not. A tile tapped in the tray arrives on the line lifted and snaps down
 * onto it with a light knock, leaving a ghost in the tray so nothing
 * shuffles; one tapped on the line goes home. When the line is right it
 * settles: the tiles dip onto it one after another and the rule fills with
 * the game's colour.
 *
 * A wrong first try marks the first word out of place on the player's own
 * line; once an item is done the sentence is laid out the right way round,
 * every word with what it means where the approved lessons and stories say
 * so. Before a round, the ladder: six rungs from short sentences to two
 * clauses, from the bottom up, the ones opened in colour.
 *
 * Soranî lines fill from the right. Under Reduce Motion nothing travels or
 * bounces. The website's games/BuildSentence.tsx stages the same round.
 */

type Round = SoloRound<SentenceItemView, SentenceHint, SentenceCorrection>;

const GAME = learnGame('build-sentence');

export const RUNG_KEY: Record<SentenceRung, TranslationKey> = {
  short: 'games.sentence.rung.short',
  question: 'games.sentence.rung.question',
  negation: 'games.sentence.rung.negation',
  ezafe: 'games.sentence.rung.ezafe',
  'verb-final': 'games.sentence.rung.verb-final',
  'two-clauses': 'games.sentence.rung.two-clauses',
};

const WHY_KEY: Record<SentenceRung, TranslationKey> = {
  short: 'games.sentence.why.short',
  question: 'games.sentence.why.question',
  negation: 'games.sentence.why.negation',
  ezafe: 'games.sentence.why.ezafe',
  'verb-final': 'games.sentence.why.verb-final',
  'two-clauses': 'games.sentence.why.two-clauses',
};

/** The difficulty whose rungs hold the learner's own rung. */
export function difficultyForStep(step: number): GameDifficulty {
  const rung = rungAt(step);
  return GAME_DIFFICULTIES.find((d) => DIFFICULTY_RUNGS[d].includes(rung)) ?? 'beginner';
}

/** A tile that has just been laid: it arrives lifted and snaps down onto the line, or dips when the line settles. */
function SnapTile({ children, settle, order }: { children: React.ReactNode; settle: boolean; order: number }): React.JSX.Element {
  const reduce = useReducedMotion();
  const lift = useRef(new Animated.Value(reduce ? 0 : 1)).current;
  const dip = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const run = springTo(lift, 0, 'bouncy');
    run.start();
    return () => run.stop();
  }, [lift, reduce]);
  useEffect(() => {
    if (!settle || reduce) return;
    const run = Animated.sequence([springTo(dip, 1, 'release', order * 40), springTo(dip, 0, 'bouncy')]);
    run.start();
    return () => run.stop();
  }, [settle, reduce, dip, order]);
  const translateY = Animated.add(
    lift.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }),
    dip.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }),
  );
  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  return <Animated.View style={{ transform: [{ translateY }, { scale }] }}>{children}</Animated.View>;
}

function SentenceBoard({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const tone = TONES[scheme][GAME.tone];
  const { item, result, busy, submit } = round;
  const rtl = dialect === 'ckb';
  const flow = rtl ? 'row-reverse' : 'row';
  const [placed, setPlaced] = useState<number[]>([]);
  const [marked, setMarked] = useState<number | null>(null);
  // the line last sent: the same line again would spend the second try on what was already wrong
  const [tried, setTried] = useState<string | null>(null);
  const done = result?.done === true;
  const locked = done || busy;
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setPlaced([]);
    setMarked(null);
    setTried(null);
    fill.setValue(0);
  }, [item.index, fill]);

  useEffect(() => {
    if (!result || result.correct) setMarked(null);
    else setMarked(result.done ? (result.correction?.firstWrong ?? null) : (result.hint?.firstWrong ?? null));
    if (result?.correct) {
      if (reduce) fill.setValue(1);
      else springTo(fill, 1, 'standard').start();
    }
  }, [result, fill, reduce]);

  const say = useCallback(
    (line: number[]) => {
      const answer = line.map((i) => item.tiles[i]).join(' ');
      AccessibilityInfo.announceForAccessibility(answer ? t('lesson.tiles.answer', { answer }) : t('lesson.tiles.empty'));
    },
    [item.tiles, t],
  );
  const place = (i: number): void => {
    if (locked || placed.includes(i)) return;
    const next = [...placed, i];
    setPlaced(next);
    setMarked(null);
    haptic('tap');
    say(next);
  };
  const lift = (i: number): void => {
    if (locked || !placed.includes(i)) return;
    const next = placed.filter((p) => p !== i);
    setPlaced(next);
    setMarked(null);
    haptic('tap');
    say(next);
  };

  const meaning = meaningIn(item.meaning, locale) ?? item.meaning.en;
  const correction = done ? result?.correction : null;
  const lineState = result?.correct ? 'right' : 'idle';
  const hint = !done && marked !== null ? (marked >= placed.length ? t('games.sentence.hintMissing') : t('games.sentence.hint')) : null;
  const text = [dir.text, { color: colors.textPrimary }];

  return (
    <View style={styles.board}>
      <View style={[styles.meaning, dir.rtl ? styles.edgeRight : styles.edgeLeft, { backgroundColor: colors.surface, borderColor: tone.fill }]}>
        <Text style={[styles.kicker, dir.text, { color: tone.text }]}>
          {t('games.sentence.prompt')} · {t(RUNG_KEY[item.rung])}
        </Text>
        <Text style={[styles.meaningText, ...text]}>{meaning}</Text>
      </View>

      <View accessibilityLabel={t('games.sentence.line')} testID="sentence-line" style={styles.lineBox}>
        <View style={[styles.line, { flexDirection: flow }]}>
          {placed.map((i, at) => {
            const astray = marked === at;
            return (
              <SnapTile key={i} settle={result?.correct === true} order={at}>
                <Tile
                  label={item.tiles[i]}
                  state={astray ? 'wrong' : done && !result?.correct ? 'disabled' : lineState}
                  disabled={locked}
                  onPress={() => lift(i)}
                  accessibilityLabel={astray ? `${item.tiles[i]}, ${t('games.sentence.misplaced')}` : item.tiles[i]}
                  accessibilityHint={t('lesson.tiles.removeHint')}
                  textStyle={rtl ? styles.rtl : null}
                />
              </SnapTile>
            );
          })}
          {!done && marked !== null && marked >= placed.length ? <View style={[styles.gapMark, { backgroundColor: colors.danger }]} /> : null}
        </View>
        <View style={[styles.rule, { backgroundColor: REST[scheme].line }]} />
        <Animated.View
          style={[styles.rule, { backgroundColor: tone.fill, transform: [{ scaleX: fill }] }, rtl ? styles.fromRight : styles.fromLeft]}
        />
      </View>
      {hint ? <Text style={[...text, styles.hint]}>{hint}</Text> : null}

      {correction ? (
        <View style={[styles.answer, { flexDirection: flow, backgroundColor: colors.surface }]} accessibilityLabel={t('games.solo.answerWas')}>
          {correction.words.map((w, i) => {
            const m = meaningIn(w.meanings, locale);
            return (
              <View key={i} style={styles.gloss}>
                <Text style={[styles.glossWord, { color: tone.text }, rtl ? styles.rtl : null]}>{w.word}</Text>
                <Text style={[styles.glossMeaning, { color: colors.textSecondary }]} accessibilityLabel={m ?? t('games.sentence.noGloss')}>
                  {m ?? '—'}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={[styles.tray, { flexDirection: flow }]} accessibilityLabel={t('games.sentence.tray')} testID="sentence-tray">
          {item.tiles.map((word, i) =>
            placed.includes(i) ? (
              <View key={i} style={[styles.ghost, { backgroundColor: colors.controlTrack }]} aria-hidden>
                <Text style={[styles.ghostText, rtl ? styles.rtl : null]}>{word}</Text>
              </View>
            ) : (
              <Tile
                key={i}
                label={word}
                state={locked ? 'disabled' : 'idle'}
                disabled={locked}
                onPress={() => place(i)}
                accessibilityHint={t('lesson.tiles.addHint')}
                textStyle={rtl ? styles.rtl : null}
              />
            ),
          )}
        </View>
      )}

      {!done ? (
        <TileButton
          label={result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
          onPress={() => {
            setTried(placed.join(','));
            void submit({ order: placed });
          }}
          busy={busy}
          disabled={locked || placed.length === 0 || tried === placed.join(',')}
        />
      ) : null}
    </View>
  );
}

/** The ladder as a path, bottom to top: the opened rungs in the game's colour, the learner's own ringed. */
export function SentenceLadder({ ladder }: { ladder: SentenceLadderView }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const tone = TONES[scheme][GAME.tone];
  const rest = REST[scheme];
  return (
    <View style={styles.ladder}>
      <Text style={[styles.ladderTitle, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
        {t('games.sentence.ladder')}
      </Text>
      <View style={styles.rungs}>
        <View style={[styles.rail, dir.rtl ? { right: 19 } : { left: 19 }, { backgroundColor: rest.line }]} />
        {ladder.rungs.map((r, i) => {
          const here = i + 1 === ladder.step;
          const meta = here ? t('games.sentence.ladder.here') : r.open ? t('games.sentence.ladder.count', { n: r.sentences }) : t('games.sentence.ladder.locked');
          return (
            <View key={r.rung} style={[styles.rung, { flexDirection: dir.row }]} accessibilityLabel={`${i + 1}. ${t(RUNG_KEY[r.rung])}, ${meta}`}>
              <View
                style={[
                  styles.rungStep,
                  { backgroundColor: r.open ? tone.fill : rest.fill },
                  here && { borderWidth: 3, borderColor: colors.textPrimary },
                ]}
              >
                {r.open ? <Text style={[styles.rungNumber, { color: tone.ink }]}>{i + 1}</Text> : <Icon name="lock" size={14} color={rest.ink} />}
              </View>
              <View style={styles.rungText}>
                <Text style={[styles.rungName, dir.text, { color: r.open ? colors.textPrimary : colors.textSecondary }]}>{t(RUNG_KEY[r.rung])}</Text>
                <Text style={[styles.rungMeta, dir.text, { color: here ? tone.text : colors.textSecondary }]}>{meta}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function BuildSentenceScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const { scheme } = useTheme();
  const dialect = useCourseDialect();
  const availability = useAvailability(dialect);
  const [ladder, setLadder] = useState<(SentenceLadderView & { open: string | null }) | null>(null);
  const [opened, setOpened] = useState<SentenceRung | null>(null);

  const load = useCallback(async () => {
    const res = await client.get<SentenceLadderView & { open: string | null }>(`/games/build-sentence/ladder?dialect=${dialect}`);
    if (res.ok) setLadder(res.data);
    return res.ok ? res.data : null;
  }, [client, dialect]);

  useEffect(() => {
    void load();
  }, [load]);

  const game = availability?.games.find((g) => g.id === 'build-sentence');
  const difficulties = availability ? (game?.difficulties ?? []) : null;
  const tone = TONES[scheme][GAME.tone];

  return (
    <SoloGameShell<SentenceItemView, SentenceHint, SentenceCorrection>
      game="build-sentence"
      dialect={dialect}
      title={t('games.sentence.name')}
      blurb={t('games.sentence.intro')}
      intro={ladder ? <SentenceLadder ladder={ladder} /> : null}
      difficulties={difficulties}
      suggested={ladder ? difficultyForStep(ladder.step) : undefined}
      open={ladder?.open ?? null}
      renderRound={(round) => <SentenceBoard round={round} dialect={dialect} />}
      explain={(why) => (why in WHY_KEY ? t(WHY_KEY[why as SentenceRung]) : null)}
      onFinished={() => {
        const was = ladder?.step ?? 1;
        void load().then((now) => setOpened(now && now.step > was ? (now.rungs[now.step - 1]?.rung ?? null) : null));
      }}
      resultsExtra={
        opened ? (
          <Text style={[styles.opened, { color: tone.text }]}>{t('games.sentence.ladder.opened', { rung: t(RUNG_KEY[opened]) })}</Text>
        ) : null
      }
      onExit={onExit}
      tone={tone.fill}
    />
  );
}

const styles = StyleSheet.create({
  board: { gap: spacing.lg },
  meaning: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, gap: spacing.xs },
  // the coloured edge on the side the reader's language starts from
  edgeLeft: { borderLeftWidth: 4 },
  edgeRight: { borderRightWidth: 4 },
  kicker: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  meaningText: { fontSize: typography.sizes.lg, lineHeight: 30 },
  lineBox: { minHeight: 76, justifyContent: 'flex-end', paddingBottom: spacing.sm },
  line: { flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing.sm, minHeight: 56 },
  rule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, borderRadius: radii.pill },
  // the fill grows from where the line starts reading
  fromLeft: { transformOrigin: 'left center' },
  fromRight: { transformOrigin: 'right center' },
  gapMark: { width: 3, height: 40, borderRadius: radii.pill, marginBottom: 6 },
  hint: { fontSize: typography.sizes.sm, marginTop: -spacing.sm },
  tray: { flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  ghost: { borderRadius: radii.lg, paddingHorizontal: spacing.md, minHeight: 48, justifyContent: 'center' },
  ghostText: { opacity: 0, fontSize: typography.sizes.md },
  answer: { flexWrap: 'wrap', gap: spacing.md, borderRadius: radii.lg, padding: spacing.md },
  gloss: { alignItems: 'center', gap: 2 },
  glossWord: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  glossMeaning: { fontSize: typography.sizes.xs },
  rtl: { writingDirection: 'rtl' },
  ladder: { gap: spacing.sm },
  ladderTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  rungs: { flexDirection: 'column-reverse', gap: spacing.sm },
  rail: { position: 'absolute', top: 20, bottom: 20, width: 3, borderRadius: radii.pill },
  rung: { alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  rungStep: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  rungNumber: { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  rungText: { flex: 1 },
  rungName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  rungMeta: { fontSize: typography.sizes.xs },
  opened: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
