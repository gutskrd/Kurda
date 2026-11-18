import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { justDone, type QuestRow } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
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
import { ChestWobble } from './ChestWobble';
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
 * Today's quests, one row each: what it asks, a thick progress bar with the count on it, and its chest at the
 * bar's end.
 *
 * With `play`, each bar moves in turn from where the session found it to where it left it, the count climbing; a
 * quest just finished lifts, gains a gold edge and throws sparks from its chest. With `arrive`, bars fill from
 * empty in turn as the list opens (first view today). Under Reduce Motion bars are static. A finished quest has
 * the gold edge; an openable chest shakes now and then (ChestWobble) and glints; an opened chest shows open.
 */
export function QuestRows({ rows, play = false, arrive = false }: { rows: readonly QuestRow[]; play?: boolean; arrive?: boolean }): React.JSX.Element {
  // Whether the list is arriving is fixed at mount, so a bar mid-fill is not reset by a changed prop.
  const arriving = useRef(arrive).current;
  // The bars that move take their turns; the rest wait for nothing.
  let turn = 0;
  return (
    <View style={styles.list}>
      {rows.map((row) => {
        const moves = play ? row.to > row.from : arriving && row.to > 0;
        const delay = moves ? FILL_AT_MS + turn++ * FILL_STAGGER_MS : 0;
        return <Row key={row.id} row={row} play={play && moves} arrive={arriving && moves} delayMs={delay} />;
      })}
    </View>
  );
}

function Row({ row, play, arrive, delayMs }: { row: QuestRow; play: boolean; arrive: boolean; delayMs: number }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const moving = (play || arrive) && !reduce;
  // Where the bar starts: before the session, at nothing as the list opens, or where it stands.
  const from = !moving ? row.to : play ? row.from : 0;
  const share = (n: number) => Math.min(1, n / Math.max(1, row.target));
  const fill = useRef(new Animated.Value(share(from))).current;
  const lift = useRef(new Animated.Value(justDone(row) && play && !reduce ? 0 : 1)).current;
  const sparks = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const count = useCountUp(row.to, { from, delayMs, ms: FILL_MS });
  const finished = row.to >= row.target;
  // Finished by the session just done: the lift, the sparks and the knock are for that moment alone.
  const fresh = justDone(row) && play && !reduce;

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
    // Felt as the bar arrives at the end, once.
    const felt = fresh ? setTimeout(() => haptic('tap'), delayMs + FILL_MS) : null;
    run.start();
    return () => {
      run.stop();
      if (felt) clearTimeout(felt);
    };
    // Once, for these numbers.
  }, [moving, row.from, row.to, row.target, delayMs]);

  // The fill slides in from the reading side, as every bar's fill does.
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
   * The count is drawn twice, grey on the track and dark on the gold fill (held still as the fill slides), so
   * each part reads on what lies under it.
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
              <Text style={[styles.count, { color: colors.textOnGold }]} maxFontSizeMultiplier={1.3}>
                {counted}
              </Text>
            </Animated.View>
          </Animated.View>
        </View>
        <View style={[styles.chest, dir.rtl ? styles.chestRtl : null]}>
          {fresh ? <ConfettiBurst progress={sparks} count={8} seed={row.target * 13 + row.to} colours={[colors.gold, '#FFE16A', '#FFBD1F']} reach={44} /> : null}
          <ChestWobble active={row.claimable} testID="quest-chest-shaking">
            <ChestArt tier={row.chest} size={CHEST} open={row.claimed} shine={row.claimable} />
          </ChestWobble>
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
  // The chest sits over the end of its bar, as a prize at the finish.
  chest: { marginStart: -spacing.sm - 2, alignItems: 'center', justifyContent: 'center' },
  chestRtl: { marginStart: 0, marginEnd: -spacing.sm - 2 },
});
