import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { justDone, type QuestRow } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { GOLD_INK } from '../coursemap/path';
import { haptic } from '../feedback/haptics';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { springTo, timing, useCountUp } from '../theme/animate';
import { ConfettiBurst } from '../theme/CelebrationParts';
import { duration } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { ChestArt } from './ChestArt';
import { QUEST_WORDS } from './model';

/** When the first bar starts to fill, and how far behind it each one after starts. */
const FILL_AT_MS = 350;
const FILL_STAGGER_MS = 260;
const FILL_MS = 700;
/** How high a finished quest's row lifts, and how much it grows. */
const LIFT = 3;
const LIFT_SCALE = 1.02;
const CHEST = 46;

/**
 * Today's quests, a row each: what the quest asks, a thick bar of how far it
 * has come with the count on it, and its chest at the end of the bar.
 *
 * With `play`, each bar moves from where the session found it to where it
 * left it, one after another, the count climbing with it; a quest finished
 * just now lifts a little, takes a gold edge and throws a few sparks from its
 * chest as its bar arrives. Under Reduce Motion every bar is simply where it
 * is. A quest already finished has the gold edge; one whose chest has been
 * opened shows it open.
 */
export function QuestRows({ rows, play = false }: { rows: readonly QuestRow[]; play?: boolean }): React.JSX.Element {
  // the bars that move take their turns; the rest wait for nothing
  let turn = 0;
  return (
    <View style={styles.list}>
      {rows.map((row) => {
        const moves = play && row.to > row.from;
        const delay = moves ? FILL_AT_MS + turn++ * FILL_STAGGER_MS : 0;
        return <Row key={row.id} row={row} play={moves} delayMs={delay} />;
      })}
    </View>
  );
}

function Row({ row, play, delayMs }: { row: QuestRow; play: boolean; delayMs: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const moving = play && !reduce;
  const share = (n: number) => Math.min(1, n / Math.max(1, row.target));
  const fill = useRef(new Animated.Value(share(moving ? row.from : row.to))).current;
  const lift = useRef(new Animated.Value(justDone(row) && moving ? 0 : 1)).current;
  const sparks = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const count = useCountUp(row.to, { from: moving ? row.from : row.to, delayMs, ms: FILL_MS });
  const finished = row.to >= row.target;
  const fresh = justDone(row) && moving;

  useEffect(() => {
    if (!moving) {
      fill.setValue(share(row.to));
      lift.setValue(1);
      return;
    }
    const steps: Animated.CompositeAnimation[] = [timing(fill, share(row.to), FILL_MS, { delay: delayMs })];
    if (fresh) {
      steps.push(Animated.parallel([springTo(lift, 1, 'bouncy'), timing(sparks, 1, duration.celebrate)]));
    }
    const run = Animated.sequence(steps);
    // felt as the bar arrives at the end, once
    const felt = fresh ? setTimeout(() => haptic('tap'), delayMs + FILL_MS) : null;
    run.start();
    return () => {
      run.stop();
      if (felt) clearTimeout(felt);
    };
    // once, for these numbers
  }, [moving, row.from, row.to, row.target, delayMs]);

  // the fill slides in from the reading side, as every bar's fill does
  const translateX = fill.interpolate({ inputRange: [0, 1], outputRange: [dir.rtl ? width : -width, 0] });
  const raised = {
    transform: [
      { translateY: finished ? lift.interpolate({ inputRange: [0, 1], outputRange: [0, -LIFT] }) : 0 },
      { scale: finished ? lift.interpolate({ inputRange: [0, 1], outputRange: [1, LIFT_SCALE] }) : 1 },
    ],
  };
  const words = t(QUEST_WORDS[row.kind], { count: formatNumber(row.target, locale) });
  const progress = t('quests.progress', { done: formatNumber(row.to, locale), target: formatNumber(row.target, locale) });
  const state = row.claimable ? `, ${t('quests.ready')}` : row.claimed ? `, ${t('quests.opened')}` : '';
  /*
   * The count sits on the bar twice: in the page's grey on the track, and in
   * dark ink on the gold, held still inside the fill as it slides — so each
   * part of it reads on whichever lies under it.
   */
  const held = fill.interpolate({ inputRange: [0, 1], outputRange: [dir.rtl ? -width : width, 0] });
  const counted = `${formatNumber(count, locale)} / ${formatNumber(row.target, locale)}`;

  return (
    <Animated.View
      style={[styles.row, { backgroundColor: colors.surface }, raised]}
      accessible
      accessibilityLabel={`${words}: ${progress}${state}`}
      testID={`quest-${row.id}`}
    >
      {finished ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, { borderColor: colors.gold, shadowColor: colors.gold, opacity: lift }]}
        />
      ) : null}
      <Text style={[styles.words, dir.text, { color: finished ? colors.goldText : colors.textPrimary }]}>{words}</Text>
      <View style={[styles.barLine, { flexDirection: dir.row }]}>
        <View style={[styles.track, { backgroundColor: colors.controlTrack }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          <Text style={[styles.count, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
            {counted}
          </Text>
          <Animated.View style={[styles.fill, { backgroundColor: colors.gold, opacity: width > 0 ? 1 : 0, transform: [{ translateX }] }]}>
            <Animated.View style={[styles.onFill, { width, transform: [{ translateX: held }] }]}>
              <Text style={[styles.count, { color: GOLD_INK }]} maxFontSizeMultiplier={1.3}>
                {counted}
              </Text>
            </Animated.View>
          </Animated.View>
        </View>
        <View style={[styles.chest, dir.rtl ? styles.chestRtl : null]}>
          {fresh ? <ConfettiBurst progress={sparks} count={8} seed={row.target * 13 + row.to} colours={[colors.gold, '#FFE16A', '#FFBD1F']} reach={44} /> : null}
          <ChestArt tier={row.chest} size={CHEST} open={row.claimed} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { alignSelf: 'stretch', gap: spacing.sm + 4 },
  row: { borderRadius: radii.lg, paddingTop: spacing.md, paddingBottom: spacing.sm + 2, paddingHorizontal: spacing.md, gap: spacing.sm },
  glow: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.lg,
    borderWidth: 2,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  words: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  barLine: { alignItems: 'center' },
  track: { flex: 1, height: 20, borderRadius: radii.pill, overflow: 'hidden', justifyContent: 'center' },
  fill: { ...StyleSheet.absoluteFill, borderRadius: radii.pill, overflow: 'hidden' },
  onFill: { position: 'absolute', top: 0, bottom: 0, left: 0, justifyContent: 'center' },
  count: { textAlign: 'center', fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  // the chest sits over the end of its bar, as a prize at the finish
  chest: { marginStart: -spacing.sm - 2, alignItems: 'center', justifyContent: 'center' },
  chestRtl: { marginStart: 0, marginEnd: -spacing.sm - 2 },
});
