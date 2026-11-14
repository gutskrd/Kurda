import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { TREE_FOOT, TREE_FULL, TREE_STAGES, TREE_TOP, TREE_WATER_LANDS, hasTreeArt, treeColour, treeSeasonAir, type TreeSeason, type TreeSpecies, type TreeStage, type TreeView } from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { playSound } from '../feedback/sounds';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { Celebration } from '../ranks/Celebration';
import { useDirection } from '../reports/direction';
import { Sheet } from '../stories/ui';
import { BURST } from '../theme/celebration';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { buyTreeKind, getTree, plantTree, treesMissing, waterTree, type MyTree, type TreeKindOffer, type Watered } from './api';
import { healthName, stageName, treeAbout, treeNamed, treeTitle } from './names';
import { TreeArt, WaterDrop, WateringCan } from './TreeArt';
import { TreePicture, TreeSeasonAmbient, TreeStudioScene, studioColour, treePlace } from './TreeScene';
import { useTreeSeason } from './season';

/** How long the can pours for before the screen shows what the water did, and how long a tree is watched growing before the app says that it grew. */
const POUR_MS = 1500;
const GROW_MS = 1150;

/** What the screen is in the middle of: nothing, the can pouring, or the tree growing under it. */
type Phase = 'idle' | 'pour' | 'grow';

/** What a pour did that is worth stopping for: it grew, or a full-grown tree bore. */
interface Moment {
  kind: 'grew' | 'harvest';
  tree: TreeView;
  zer: number;
}

/**
 * The learner's own tree.
 *
 * Before one is planted, the screen is the choice of a first seed: the kinds
 * that are free to start from, each as its own seed, and over them the great
 * tree the chosen one will be. After, it is the tree itself, standing in the
 * scene of the season with the season blowing past it, as big as the phone allows;
 * then how far it is to its next stage, with that stage shown as what is
 * being grown toward; the water held, which a lesson earns, and the button
 * to pour it with; and a way to the nursery, where another kind can be
 * bought and planted in its place.
 *
 * Pouring is the screen's one moment, and it is played in the scene, not in
 * a box over it: the can comes in and tips, the water falls and lands, the
 * tree drinks and starts. When that grows it, the tree is seen to grow where
 * it stands — the new one coming up out of a burst of light — and only then
 * does the app's celebration say so. A full-grown tree that bears gets the
 * celebration at once. A tree that has gone dry has a thought of water
 * floating by it, is said plainly to be thirsty, wilting or withered, with
 * no blame in it, and the first water brings it back.
 *
 * For somebody who has asked for less motion none of this moves: the screen
 * goes straight to how things stand after the water.
 *
 * On a server that has no trees yet there is nothing here but a line saying
 * so; nowhere else in the app mentions them then.
 */
export function TreeScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const season = useTreeSeason();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<MyTree | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  // each counts the times it has happened, so the same moment can be played again
  const [grown, setGrown] = useState(0);
  const [planted, setPlanted] = useState(0);
  const [cheer, setCheer] = useState(0);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [nursery, setNursery] = useState(false);
  const after = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (after.current) clearTimeout(after.current);
    },
    [],
  );
  const number = (n: number): string => formatNumber(n, locale);

  const load = useCallback(() => {
    return getTree(client).then((res) => {
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else if (treesMissing(res)) setMissing(true);
      else setError(res.error);
    });
  }, [client]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const plant = useCallback(
    async (species: TreeSpecies): Promise<boolean> => {
      setBusy(true);
      setFailed(null);
      const res = await plantTree(client, species);
      setBusy(false);
      if (!res.ok) {
        setFailed(describeError(res.error, t));
        return false;
      }
      haptic('correct');
      setData(res.data);
      setNote(null);
      setPlanted((n) => n + 1);
      return true;
    },
    [client, t],
  );

  const buy = useCallback(
    async (species: TreeSpecies): Promise<boolean> => {
      setBusy(true);
      setFailed(null);
      const res = await buyTreeKind(client, species);
      setBusy(false);
      if (!res.ok) {
        setFailed(describeError(res.error, t));
        return false;
      }
      haptic('correct');
      setData(res.data);
      return true;
    },
    [client, t],
  );

  /** What the water did, shown once it has landed. */
  const settle = useCallback(
    (was: MyTree, watered: Watered, still: boolean) => {
      setData({ ...was, tree: watered.tree, zer: was.zer + watered.zer });
      if (watered.grew !== null) {
        const say = (): void => {
          setPhase('idle');
          setMoment({ kind: 'grew', tree: watered.tree, zer: watered.zer });
        };
        if (still) return say();
        // it grows where it stands, and is looked at, before anything is said about it
        setGrown((n) => n + 1);
        setPhase('grow');
        haptic('celebrate');
        playSound('complete');
        after.current = setTimeout(say, GROW_MS);
        return;
      }
      setPhase('idle');
      if (!still) setCheer((n) => n + 1);
      if (watered.harvests > 0) setMoment({ kind: 'harvest', tree: watered.tree, zer: watered.zer });
      else if (watered.revived) setNote(t('tree.revived'));
    },
    [t],
  );

  const water = useCallback(
    async (count: number): Promise<void> => {
      if (!data?.tree || busy || phase !== 'idle') return;
      setBusy(true);
      setFailed(null);
      setNote(null);
      const res = await waterTree(client, count);
      setBusy(false);
      if (!res.ok) {
        setFailed(describeError(res.error, t));
        return;
      }
      haptic('tap');
      playSound('correct');
      if (reduce) {
        settle(data, res.data, true);
        return;
      }
      // the can pours over the tree as it was; what the water did is shown once it has landed
      setPhase('pour');
      after.current = setTimeout(() => settle(data, res.data, false), POUR_MS);
    },
    [client, data, busy, phase, reduce, settle, t],
  );

  // the scene is square, as wide as the phone allows and never smaller than a tree can be read at
  const side = Math.max(220, Math.min(420, width - layout.gutter * 2));
  const tree = data?.tree ?? null;
  const tint = tree ? treeColour(tree.species) : colors.success;
  const idle = phase === 'idle';

  return (
    <GradientBackground>
      <ScreenHeader title={t('tree.title')} onBack={onExit} />
      <AsyncBoundary loading={!data && !error && !missing} error={!data ? error : null} onRetry={load} skeleton={<TreeSkeleton size={side} />}>
        {() =>
          missing ? (
            <Text style={[styles.soon, { color: colors.textSecondary }]}>{t('tree.soon')}</Text>
          ) : !data ? null : !tree ? (
            <Chooser data={data} season={season} side={side} busy={busy} failed={failed} onPlant={(species) => void plant(species)} />
          ) : (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.head}>
                <Text style={[styles.lead, { color: colors.textPrimary }]} accessibilityRole="header">
                  {treeNamed(t, tree.species).name}
                </Text>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  {[treeNamed(t, tree.species).meaning, stageName(t, tree.stage), t('tree.day', { count: number(tree.age + 1) })].filter(Boolean).join(' · ')}
                </Text>
              </View>

              <Stage tree={tree} season={season} side={side} phase={phase} grown={grown} planted={planted} cheer={cheer} label={treeTitle(t, tree)} />

              {tree.health !== 'fresh' ? (
                <View style={[styles.health, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]} accessible testID="tree-health">
                  <Text style={[styles.healthName, { color: colors.textPrimary }]}>{healthName(t, tree.health)}</Text>
                  <Text style={[styles.healthSince, dir.text, { color: colors.textSecondary }]}>{t('tree.health.since', { count: number(tree.dryDays) })}</Text>
                </View>
              ) : null}
              {note ? (
                <View style={[styles.health, { backgroundColor: colors.controlTrack }]} accessibilityLiveRegion="polite">
                  <Text style={[styles.healthName, { color: colors.textPrimary }]}>{note}</Text>
                </View>
              ) : null}

              <Growth tree={tree} tint={tint} />

              {failed ? <Failed text={failed} /> : null}

              <View style={styles.water}>
                <View style={[styles.held, { flexDirection: dir.row }]} accessible accessibilityLabel={t('tree.water.held', { count: number(tree.water) })}>
                  <WaterDrop size={22} />
                  <Text style={[styles.heldText, { color: colors.textPrimary }]}>{t('tree.water.held', { count: number(tree.water) })}</Text>
                </View>
                {tree.water > 0 ? (
                  <>
                    <ClayButton
                      label={tree.stage === 0 ? t('tree.water.first') : t('tree.water.pour')}
                      tone="primary"
                      size="large"
                      busy={busy}
                      disabled={!idle}
                      onPress={() => void water(1)}
                      testID="tree-water"
                    />
                    {tree.water > 1 ? (
                      <ClayButton label={t('tree.water.pourAll', { count: number(tree.water) })} variant="outline" disabled={busy || !idle} onPress={() => void water(tree.water)} testID="tree-water-all" />
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('tree.water.none')}</Text>
                    <ClayButton label={t('tree.water.learn')} tone="primary" size="large" onPress={onExit} />
                  </>
                )}
              </View>

              <Text style={[styles.sub, { color: colors.textSecondary }]}>{treeAbout(t, tree.species)}</Text>
              <ClayButton label={t('tree.nursery.open')} variant="outline" onPress={() => setNursery(true)} />
            </ScrollView>
          )
        }
      </AsyncBoundary>

      {nursery && data ? (
        <Nursery
          data={data}
          busy={busy}
          failed={failed}
          onClose={() => {
            setNursery(false);
            setFailed(null);
          }}
          onBuy={buy}
          onPlant={plant}
        />
      ) : null}

      {moment ? (
        <Celebration
          art={<TreeArt species={moment.tree.species} stage={moment.tree.stage} size={200} />}
          glow={colors.gold}
          flecks={BURST.badge}
          fleckColours={[colors.gold, treeColour(moment.tree.species), '#ffffff']}
          seed={moment.tree.waterings * 7 + moment.tree.stage}
          kicker={treeNamed(t, moment.tree.species).name}
          title={moment.kind === 'harvest' ? t('tree.harvest.title') : moment.tree.stage === 1 ? t('tree.sprouted.title') : t('tree.grew.title')}
          subtitle={moment.kind === 'harvest' ? t('tree.harvest.body') : t('tree.grew.body', { stage: stageName(t, moment.tree.stage) })}
          detail={moment.zer > 0 ? `+${number(moment.zer)} Zêr` : null}
          announce={moment.kind === 'harvest' ? t('tree.harvest.title') : t('tree.grew.body', { stage: stageName(t, moment.tree.stage) })}
          onClose={() => setMoment(null)}
          actions={<ClayButton label={t('common.continue')} tone="primary" size="large" onPress={() => setMoment(null)} />}
        />
      ) : null}
    </GradientBackground>
  );
}

/** A plant's foot in its picture: what it is turned and stretched about. */
const FOOT = `${TREE_FOOT.x * 100}% ${TREE_FOOT.y * 100}%`;

/** The water that falls from the can: when in the pour each drop sets off, how far to one side of the tree's middle it lands, and how big it is, as shares of the picture. */
const DROPS = Array.from({ length: 13 }, (_, i) => ({ from: (330 + i * 54) / POUR_MS, aside: (((i * 5) % 9) - 4) / 100, size: 0.04 + (i % 3) * 0.009 }));
/** What flies out of a tree as it grows, each at its own angle, and the sparks that stand round one that has drunk, each at its own place. */
const RAYS = Array.from({ length: 12 }, (_, i) => i * 30 + (i % 2 === 0 ? 0 : 9));
const SPARKS = [
  [0.22, 0.3],
  [0.78, 0.26],
  [0.13, 0.54],
  [0.87, 0.5],
  [0.36, 0.12],
  [0.66, 0.1],
  [0.5, 0.03],
] as const;

/** A clock run once from 0 to 1 on the native thread. */
function run(clock: Animated.Value, duration: number, easing: (t: number) => number = Easing.linear): void {
  clock.setValue(0);
  Animated.timing(clock, { toValue: 1, duration, easing, useNativeDriver: true }).start();
}

/**
 * Where the tree stands, and everything that happens to it there. The
 * season's scene is behind it; the season blows past it to the left; and the
 * tree itself stands on its round of grass, rising a little as if it
 * breathed. Touching it shakes it, which is of no use at all
 * and is there because a tree asks to be touched.
 */
function Stage({
  tree,
  season,
  side,
  phase,
  grown,
  planted,
  cheer,
  label,
}: {
  tree: TreeView;
  season: TreeSeason;
  side: number;
  phase: Phase;
  grown: number;
  planted: number;
  cheer: number;
  label: string;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const alive = useMotionAlive();
  const { size, bottom } = treePlace(side);
  const tint = treeColour(tree.species);
  // one clock to a movement: arriving, breathing, pouring, growing, dropping in, being shaken, the sparks, the thought
  const arrive = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const pour = useRef(new Animated.Value(0)).current;
  const grow = useRef(new Animated.Value(1)).current;
  // a seed that was planted a moment ago starts above its heap of earth, so it is never seen in it before it falls
  const drop = useRef(new Animated.Value(planted > 0 && tree.stage === 0 ? 0 : 1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(1)).current;
  const thought = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) arrive.setValue(1);
    else run(arrive, 760, Easing.out(Easing.back(1.4)));
  }, [arrive, reduce]);
  useEffect(() => {
    if (!alive) return;
    const half = { duration: 3750, easing: Easing.inOut(Easing.sin), useNativeDriver: true };
    const breathing = Animated.loop(Animated.sequence([Animated.timing(bob, { toValue: 1, ...half }), Animated.timing(bob, { toValue: 0, ...half })]));
    const nod = { duration: tree.health === 'thirsty' ? 1400 : 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true };
    const nodding = Animated.loop(Animated.sequence([Animated.timing(thought, { toValue: 1, ...nod }), Animated.timing(thought, { toValue: 0, ...nod })]));
    breathing.start();
    nodding.start();
    return () => {
      breathing.stop();
      nodding.stop();
    };
  }, [alive, bob, thought, tree.health]);
  useEffect(() => {
    if (phase === 'pour') run(pour, POUR_MS);
  }, [phase, pour]);
  // before the new picture is painted, so the grown tree is not seen at its full size for a frame and then small
  useLayoutEffect(() => {
    if (grown > 0 && !reduce) run(grow, GROW_MS);
  }, [grown, grow, reduce]);
  useLayoutEffect(() => {
    if (planted === 0) return;
    if (reduce) drop.setValue(1);
    else run(drop, 950);
  }, [planted, drop, reduce]);
  useEffect(() => {
    if (cheer > 0 && !reduce) run(spark, 1100);
  }, [cheer, spark, reduce]);

  const poke = (): void => {
    if (reduce || phase !== 'idle') return;
    haptic('select');
    run(shake, 680, Easing.out(Easing.quad));
  };

  // the whole picture: in with the screen, and up from its foot out of the light when it has grown
  const whole = {
    opacity: Animated.multiply(arrive.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }), grow.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.2, 1, 1] })),
    transform: [
      { translateY: Animated.add(arrive.interpolate({ inputRange: [0, 1], outputRange: [size * 0.05, 0] }), bob.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.015] })) },
      { scale: Animated.multiply(arrive.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }), grow.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0.5, 1.05, 1] })) },
    ],
  };
  // the plant alone: dropped in as a seed, shaken when touched, and the start it gives as it drinks
  const plantOf = {
    transform: [
      { translateY: drop.interpolate({ inputRange: [0, 0.52, 0.68, 0.84, 1], outputRange: [-size * 0.62, 0, -size * 0.045, 0, 0] }) },
      {
        rotate: Animated.add(
          drop.interpolate({ inputRange: [0, 0.52, 0.68, 0.84, 1], outputRange: [-16, 5, -2, 1, 0] }),
          shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -2.8, 2.3, -1.3, 0.6, 0] }),
        ).interpolate({ inputRange: [-30, 30], outputRange: ['-30deg', '30deg'] }),
      },
      { scaleX: pour.interpolate({ inputRange: [0, 0.35, 0.5, 0.66, 0.82, 1], outputRange: [1, 1, 1.05, 0.96, 1.02, 1] }) },
      { scaleY: pour.interpolate({ inputRange: [0, 0.35, 0.5, 0.66, 0.82, 1], outputRange: [1, 1, 0.93, 1.06, 0.98, 1] }) },
    ],
  };
  const lands = TREE_WATER_LANDS[tree.stage] ?? 0.5;
  const top = Math.max(0.02, (TREE_TOP[tree.stage] ?? 0.2) - 0.12);

  return (
    <View style={[styles.stage, { height: side, backgroundColor: studioColour(season) }]} testID="tree-stage">
      <TreeStudioScene season={season} health={tree.health} side={side} />
      <Pressable accessible={false} onPress={poke} style={[styles.plot, { width: size, height: size, bottom }]} testID="tree-plot">
        <Animated.View style={[{ width: size, height: size, transformOrigin: FOOT }, whole]}>
          <TreeArt species={tree.species} stage={tree.stage} health={tree.health} season={season} size={size} label={label} alive plant={plantOf} />
        </Animated.View>

        {tree.health !== 'fresh' && phase === 'idle' ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.thought,
              { top: size * top, left: size * 0.62, width: size * 0.15, height: size * 0.15 },
              { transform: [{ translateY: thought.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.012] }) }, { scale: thought.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }] },
            ]}
            testID="tree-thought"
          >
            <View style={[styles.thoughtDot, { width: size * 0.04, height: size * 0.04, left: 0, bottom: -size * 0.022 }]} />
            <View style={[styles.thoughtDot, { width: size * 0.022, height: size * 0.022, left: -size * 0.02, bottom: -size * 0.046 }]} />
            <WaterDrop size={Math.round(size * 0.085)} />
          </Animated.View>
        ) : null}

        {phase === 'pour' ? <Pour clock={pour} size={size} lands={lands} /> : null}
        {phase === 'grow' ? <Burst clock={grow} size={size} tint={tint} /> : null}
        {cheer > 0 && phase === 'idle' && !reduce ? <Sparks clock={spark} size={size} /> : null}
      </Pressable>
      <TreeSeasonAmbient air={hasTreeArt(tree.species) ? treeSeasonAir(tree.species, tree.stage, tree.health, season) : null} side={side} />
    </View>
  );
}

const UNSEEN = { pointerEvents: 'none' as const, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** The can, the water and where it lands: it comes in over the tree's shoulder, tips, pours, and goes, on one clock. */
function Pour({ clock, size, lands }: { clock: Animated.Value; size: number; lands: number }): React.JSX.Element {
  const wide = size * 0.31;
  const can = {
    opacity: clock.interpolate({ inputRange: [0, 0.16, 0.78, 1], outputRange: [0, 1, 1, 0] }),
    transform: [
      { translateX: clock.interpolate({ inputRange: [0, 0.16, 0.78, 1], outputRange: [wide * 0.46, 0, 0, wide * 0.3] }) },
      { translateY: clock.interpolate({ inputRange: [0, 0.16, 0.78, 1], outputRange: [-wide * 0.34, 0, wide * 0.02, -wide * 0.3] }) },
      { rotate: clock.interpolate({ inputRange: [0, 0.16, 0.28, 0.78, 1], outputRange: ['14deg', '0deg', '-40deg', '-36deg', '6deg'] }) },
    ],
  };
  const ring = (from: number) => ({
    opacity: clock.interpolate({ inputRange: [from, from + 0.01, Math.min(1, from + 0.5)], outputRange: [0, 0.9, 0], extrapolate: 'clamp' as const }),
    transform: [{ scale: clock.interpolate({ inputRange: [from, Math.min(1, from + 0.5)], outputRange: [0.12, 1], extrapolate: 'clamp' as const }) }],
  });
  return (
    <View {...UNSEEN} style={StyleSheet.absoluteFill} testID="tree-pour">
      <Animated.View style={[styles.can, { left: size * 0.56, width: wide, height: wide, transformOrigin: '52% 65%' }, can]}>
        <WateringCan size={Math.round(wide)} />
      </Animated.View>
      {DROPS.map((d, i) => {
        // from the can's rose down to where it lands on the tree
        const fall = clock.interpolate({ inputRange: [d.from, d.from + 520 / POUR_MS], outputRange: [0, 1], extrapolate: 'clamp' });
        const big = Math.round(size * d.size);
        return (
          <Animated.View
            key={i}
            style={[
              styles.drop,
              { left: size * 0.56, top: size * 0.22 },
              {
                opacity: fall.interpolate({ inputRange: [0, 0.14, 0.86, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: fall.interpolate({ inputRange: [0, 1], outputRange: [0, size * (0.5 + d.aside - 0.56)] }) },
                  // it gathers speed as it falls
                  { translateY: fall.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, size * (lands - 0.22) * 0.3, size * (lands - 0.22)] }) },
                  { scale: fall.interpolate({ inputRange: [0, 0.86, 1], outputRange: [0.6, 1, 1.2] }) },
                ],
              },
            ]}
            testID="tree-pour-drop"
          >
            <WaterDrop size={big} />
          </Animated.View>
        );
      })}
      {/* and where it reaches the ground, a ring goes out from the foot of the tree */}
      {[0.5, 0.65].map((from) => (
        <Animated.View key={from} style={[styles.ring, { left: size * 0.24, top: size * (TREE_FOOT.y - 0.045), width: size * 0.52, height: size * 0.09 }, ring(from)]} />
      ))}
    </View>
  );
}

/** Growing: a light goes off behind the tree, and its leaves fly out, each its own way. */
function Burst({ clock, size, tint }: { clock: Animated.Value; size: number; tint: string }): React.JSX.Element {
  const wide = size * 0.7;
  const light = {
    opacity: clock.interpolate({ inputRange: [0, 0.2, 0.87], outputRange: [0, 1, 0], extrapolate: 'clamp' }),
    transform: [{ scale: clock.interpolate({ inputRange: [0, 0.87], outputRange: [0.2, 1.9], extrapolate: 'clamp' }) }],
  };
  const far = size * 0.5;
  return (
    <View {...UNSEEN} style={StyleSheet.absoluteFill} testID="tree-burst">
      <Animated.View style={[styles.burstLight, { left: size * 0.5 - wide / 2, top: size * 0.56 - wide / 2, width: wide, height: wide }, light]}>
        {/* a light with no edge to it: bright at its middle, gone before its rim */}
        <Svg width={wide} height={wide} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="hv-tree-burst" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#fffff0" stopOpacity={0.98} />
              <Stop offset="0.3" stopColor="#fffff0" stopOpacity={0.9} />
              <Stop offset="0.6" stopColor="#fff4b4" stopOpacity={0.5} />
              <Stop offset="1" stopColor="#fff4b4" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill="url(#hv-tree-burst)" />
        </Svg>
      </Animated.View>
      {RAYS.map((deg, i) => {
        const from = (i % 4) * 0.035;
        const out = clock.interpolate({ inputRange: [from, from + 0.82], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={deg}
            style={[
              styles.burstLeaf,
              { left: size * 0.5 - 6, top: size * 0.56 - 4, backgroundColor: i % 3 === 0 ? '#fff3a8' : tint },
              {
                opacity: out.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 1, 0] }),
                transform: [{ rotate: `${deg}deg` }, { translateY: out.interpolate({ inputRange: [0, 0.4, 1], outputRange: [-10, -far * 0.7, -far] }) }, { rotate: out.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '200deg'] }) }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/** Drunk: sparks stand round the tree for a moment, one after another. */
function Sparks({ clock, size }: { clock: Animated.Value; size: number }): React.JSX.Element {
  const big = size * 0.036;
  return (
    <View {...UNSEEN} style={StyleSheet.absoluteFill} testID="tree-cheer">
      {SPARKS.map(([x, y], i) => {
        const from = i * 0.05;
        const pop = clock.interpolate({ inputRange: [from, from + 0.69], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={[
              styles.spark,
              { left: size * x - big / 2, top: size * y - big / 2, width: big, height: big },
              {
                opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 0] }),
                transform: [{ rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['45deg', '135deg'] }) }, { scale: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.2, 1.15, 0.3] }) }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/** The ring round what is being grown toward: its length, which is what a share of it is measured on. */
const GOAL = 84;
const GOAL_ROUND = 2 * Math.PI * 38;

/**
 * How far it is to what comes next: what is being grown toward — the next
 * stage's picture, or what a full-grown tree bears — in a ring that closes
 * as the tree is watered; and its seven stages as a row of beads.
 */
function Growth({ tree, tint }: { tree: TreeView; tint: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const full = tree.stage === TREE_FULL;
  const next = full ? t('tree.nextHarvest') : t('tree.next', { stage: stageName(t, (tree.stage + 1) as TreeStage) });
  const share = tree.toward.of > 0 ? Math.min(1, tree.toward.done / tree.toward.of) : 0;
  const count = `${formatNumber(tree.toward.done, locale)} / ${formatNumber(tree.toward.of, locale)}`;
  return (
    <View style={[styles.growth, { flexDirection: dir.row, backgroundColor: colors.surface }]}>
      <View style={styles.goal}>
        <Svg width={GOAL} height={GOAL} viewBox="0 0 84 84" style={styles.goalRing}>
          <Circle cx={42} cy={42} r={38} stroke={colors.controlTrack} strokeWidth={6} fill="none" />
          <Circle cx={42} cy={42} r={38} stroke={tint} strokeWidth={6} strokeLinecap="round" fill="none" strokeDasharray={GOAL_ROUND} strokeDashoffset={GOAL_ROUND * (1 - share)} testID="tree-goal-fill" />
        </Svg>
        <View style={[styles.goalArt, { backgroundColor: colors.controlTrack }]}>{full ? <Icon name="coin" size={30} /> : <TreeArt species={tree.species} stage={(tree.stage + 1) as TreeStage} size={60} />}</View>
      </View>
      <View style={styles.growthText}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={next} accessibilityValue={{ min: 0, max: tree.toward.of, now: tree.toward.done, text: count }} style={styles.growthBar} testID="tree-growth">
          <Text style={[styles.growthNext, dir.text, { color: colors.textPrimary }]}>{next}</Text>
          <Text style={[styles.growthCount, dir.text, { color: colors.textSecondary }]}>{count}</Text>
        </View>
        <View style={[styles.steps, { flexDirection: dir.row }]} accessible accessibilityLabel={`${t('tree.stages')}: ${stageName(t, tree.stage)}`}>
          {Array.from({ length: TREE_STAGES }, (_, i) => (
            <View
              key={i}
              style={[styles.step, { backgroundColor: i < tree.stage ? tint : i === tree.stage ? colors.surface : colors.controlTrack }, i === tree.stage ? [styles.stepNow, { borderColor: tint }] : null]}
            />
          ))}
        </View>
        {tree.harvests > 0 ? <Text style={[styles.harvests, dir.text, { color: colors.textSecondary }]}>{t('tree.harvests', { count: formatNumber(tree.harvests, locale) })}</Text> : null}
      </View>
    </View>
  );
}

/**
 * The choice of a first tree. Each kind that is free to start from is its
 * own seed to pick up; over them stands the great tree the one picked will
 * be, in the season it will grow in, so the choice is of something seen.
 * Nothing is planted until the button is pressed.
 */
function Chooser({ data, season, side, busy, failed, onPlant }: { data: MyTree; season: TreeSeason; side: number; busy: boolean; failed: string | null; onPlant: (species: TreeSpecies) => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const starters = data.kinds.filter((k) => k.starter);
  const [picked, setPicked] = useState<TreeSpecies>(starters[0]?.species ?? 'beru');
  const said = (species: TreeSpecies): string => {
    const named = treeNamed(t, species);
    return named.meaning ? `${named.name} (${named.meaning})` : named.name;
  };
  const { size, bottom } = treePlace(side);
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={[styles.lead, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('tree.choose.title')}
      </Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('tree.choose.sub')}</Text>
      <View style={[styles.stage, { height: side, backgroundColor: studioColour(season) }]} testID="tree-stage">
        <TreeStudioScene season={season} health="fresh" side={side} />
        <View style={[styles.plot, { width: size, height: size, bottom }]}>
          <TreeArt key={picked} species={picked} stage={TREE_FULL} season={season} size={size} label={said(picked)} alive />
        </View>
        <TreeSeasonAmbient air={treeSeasonAir(picked, TREE_FULL, 'fresh', season)} side={side} />
      </View>
      <View style={[styles.seeds, { flexDirection: dir.row }]} accessibilityRole="radiogroup" accessibilityLabel={t('tree.choose.title')}>
        {starters.map((k) => {
          const named = treeNamed(t, k.species);
          const on = k.species === picked;
          return (
            <Pressable
              key={k.species}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              accessibilityLabel={said(k.species)}
              onPress={() => {
                haptic('select');
                setPicked(k.species);
              }}
              style={[styles.seed, { backgroundColor: colors.surface, borderColor: on ? treeColour(k.species) : 'transparent' }]}
              testID={`tree-seed-${k.species}`}
            >
              {/* the seed's picture closes in on the seed itself */}
              <View style={styles.seedArt}>
                <TreeArt species={k.species} stage={0} size={132} style={styles.seedPicture} />
              </View>
              <Text style={[styles.seedName, { color: colors.textPrimary }]} numberOfLines={1}>
                {named.name}
              </Text>
              {named.meaning ? (
                <Text style={[styles.seedMeaning, { color: colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {named.meaning}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>{treeAbout(t, picked)}</Text>
      {failed ? <Failed text={failed} /> : null}
      <ClayButton label={t('tree.choose.plant')} accessibilityLabel={`${t('tree.choose.plant')}: ${said(picked)}`} tone="primary" size="large" busy={busy} onPress={() => onPlant(picked)} testID="tree-plant" />
      <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('tree.choose.more')}</Text>
    </ScrollView>
  );
}

function Failed({ text }: { text: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.failed, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]} accessibilityRole="alert">
      <Icon name="alert" size={18} color={colors.danger} />
      <Text style={[styles.failedText, dir.text, { color: colors.textPrimary }]}>{text}</Text>
    </View>
  );
}

/** One kind of tree as a row: the tree it will be, its name and what it means, a line about it, and what can be done with it. */
function KindRow({
  kind,
  busy,
  action,
  onAct,
  note,
}: {
  kind: TreeKindOffer;
  busy: boolean;
  /** the button's words; none for the kind that stands */
  action: string | null;
  onAct: () => void;
  /** in place of a price: "Free", "Yours", "Growing now" */
  note?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const named = treeNamed(t, kind.species);
  const said = named.meaning ? `${named.name} (${named.meaning})` : named.name;
  return (
    <View style={[styles.kind, { backgroundColor: colors.surface }]} testID={`tree-kind-${kind.species}`}>
      <View style={[styles.kindMain, { flexDirection: dir.row }]}>
        {/* each kind in summer, in its own leaves: in spring every one that flowers is pink, and a choice between them has to be seen */}
        <TreePicture species={kind.species} stage={TREE_FULL} season="summer" size={104} />
        <View style={styles.kindText}>
          <Text style={[styles.kindName, dir.text, { color: colors.textPrimary }]}>{named.name}</Text>
          {named.meaning ? <Text style={[styles.kindMeaning, dir.text, { color: colors.textSecondary }]}>{named.meaning}</Text> : null}
          <Text style={[styles.kindAbout, dir.text, { color: colors.textSecondary }]}>{treeAbout(t, kind.species)}</Text>
          {note ? (
            <Text style={[styles.kindNote, dir.text, { color: colors.textPrimary }]}>{note}</Text>
          ) : !kind.owned ? (
            <View style={[styles.price, { flexDirection: dir.row }]}>
              <Icon name="coin" size={16} />
              <Text style={[styles.kindNote, { color: colors.textPrimary }]}>{formatNumber(kind.price, locale)}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {action ? <ClayButton label={action} accessibilityLabel={`${action}: ${said}`} tone="neutral" disabled={busy} onPress={onAct} /> : null}
    </View>
  );
}

/**
 * The nursery: every kind there is. One that is free or already bought can
 * be planted, which is asked about first, because the tree that stands is
 * gone when another is planted; one that is not can be bought with Zêr, which
 * plants nothing by itself. The question is the sheet's second step, in the
 * sheet itself, so nothing opens over anything. What cannot be afforded says
 * how much is missing rather than only refusing.
 */
function Nursery({
  data,
  busy,
  failed,
  onClose,
  onBuy,
  onPlant,
}: {
  data: MyTree;
  busy: boolean;
  failed: string | null;
  onClose: () => void;
  onBuy: (species: TreeSpecies) => Promise<boolean>;
  onPlant: (species: TreeSpecies) => Promise<boolean>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [asking, setAsking] = useState<{ kind: TreeKindOffer; what: 'buy' | 'plant' } | null>(null);
  const number = (n: number): string => formatNumber(n, locale);
  const standing = data.tree?.species ?? null;

  if (asking) {
    const asked = treeNamed(t, asking.kind.species);
    const buying = asking.what === 'buy';
    const short = buying ? Math.max(0, asking.kind.price - data.zer) : 0;
    const confirm = async (): Promise<void> => {
      const done = buying ? await onBuy(asking.kind.species) : await onPlant(asking.kind.species);
      if (!done) return;
      setAsking(null);
      // planted: back to the tree, which is a seed now; bought: back to the kinds, where it is now theirs to plant
      if (!buying) onClose();
    };
    return (
      <Sheet
        title={buying ? t('tree.buy.title', { name: asked.name }) : t('tree.replace.title', { name: asked.name })}
        onClose={onClose}
        footer={
          <View style={styles.askActions}>
            <ClayButton label={buying ? t('tree.buy.confirm') : t('tree.replace.confirm')} tone="primary" size="large" busy={busy} disabled={short > 0} onPress={() => void confirm()} testID="tree-ask-confirm" />
            <ClayButton label={buying ? t('common.cancel') : t('tree.replace.keep')} variant="outline" onPress={() => setAsking(null)} testID="tree-ask-back" />
          </View>
        }
      >
        <View style={styles.ask}>
          <TreeArt species={asking.kind.species} stage={buying ? TREE_FULL : 0} size={150} />
          <Text style={[styles.askBody, { color: colors.textSecondary }]}>
            {buying ? t('tree.buy.body', { price: number(asking.kind.price) }) : standing ? t('tree.replace.body', { current: treeNamed(t, standing).name }) : t('tree.replace.first')}
          </Text>
          {short > 0 ? <Text style={[styles.askShort, { color: colors.textPrimary }]}>{t('tree.buy.short', { count: number(short) })}</Text> : null}
          {failed ? <Failed text={failed} /> : null}
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('tree.nursery.title')} onClose={onClose}>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('tree.nursery.sub')}</Text>
      <View style={[styles.zer, { flexDirection: dir.row }]} accessible accessibilityLabel={`${number(data.zer)} Zêr`}>
        <Icon name="coin" size={18} />
        <Text style={[styles.zerText, { color: colors.textPrimary }]}>{number(data.zer)} Zêr</Text>
      </View>
      {data.kinds.map((k) => {
        const here = k.species === standing;
        return (
          <KindRow
            key={k.species}
            kind={k}
            busy={busy}
            note={here ? t('tree.nursery.standing') : k.starter ? t('tree.nursery.free') : k.owned ? t('tree.nursery.yours') : undefined}
            action={here ? null : k.owned ? t('tree.nursery.plant') : t('tree.nursery.buy')}
            onAct={() => setAsking({ kind: k, what: k.owned ? 'plant' : 'buy' })}
          />
        );
      })}
    </Sheet>
  );
}

function TreeSkeleton({ size }: { size: number }): React.JSX.Element {
  return (
    <View style={styles.content}>
      <Skeleton height={size + spacing.md * 2} radius={radii.xl} />
      <Skeleton height={84} radius={radii.lg} />
      <Skeleton height={56} radius={radii.pill} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md, width: '100%', maxWidth: layout.column, alignSelf: 'center' },
  soon: { padding: layout.gutter, fontSize: typography.sizes.md, textAlign: 'center' },
  head: { gap: 2 },
  lead: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center', letterSpacing: -0.4 },
  sub: { fontSize: typography.sizes.sm, lineHeight: 21, textAlign: 'center' },
  // where the tree stands: the scene of the season, its floor at the foot
  stage: { width: '100%', alignItems: 'center', borderRadius: radii.xl, overflow: 'hidden' },
  // the tree's own square of the scene, its foot on the floor
  plot: { position: 'absolute' },
  thought: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: '#ffffff' },
  thoughtDot: { position: 'absolute', borderRadius: radii.pill, backgroundColor: '#ffffff' },
  can: { position: 'absolute', top: 0 },
  drop: { position: 'absolute' },
  ring: { position: 'absolute', borderRadius: radii.pill, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.9)' },
  burstLight: { position: 'absolute' },
  burstLeaf: { position: 'absolute', width: 12, height: 8, borderRadius: radii.pill },
  spark: { position: 'absolute', backgroundColor: '#fff6c0' },
  health: { alignItems: 'baseline', flexWrap: 'wrap', gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  healthName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  healthSince: { flexShrink: 1, fontSize: typography.sizes.sm },
  growth: { alignItems: 'center', gap: spacing.md, borderRadius: radii.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  goal: { width: GOAL, height: GOAL, alignItems: 'center', justifyContent: 'center' },
  // the ring starts at the top and closes clockwise
  goalRing: { position: 'absolute', top: 0, left: 0, transform: [{ rotate: '-90deg' }] },
  goalArt: { width: GOAL - 22, height: GOAL - 22, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, overflow: 'hidden' },
  growthText: { flex: 1, gap: spacing.sm },
  growthBar: { gap: 2 },
  growthNext: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  growthCount: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  steps: { gap: 6 },
  step: { width: 9, height: 9, borderRadius: radii.pill },
  stepNow: { borderWidth: 2 },
  harvests: { fontSize: typography.sizes.sm },
  seeds: { gap: spacing.sm },
  // a seed to pick: its edge takes its kind's colour when it is the one picked
  seed: { flex: 1, alignItems: 'center', gap: 2, borderRadius: radii.lg, borderWidth: 2, paddingTop: spacing.sm, paddingBottom: spacing.sm + 2, paddingHorizontal: 2 },
  seedArt: { width: 76, height: 76, overflow: 'hidden' },
  seedPicture: { position: 'absolute', top: -50, left: -28 },
  seedName: { fontSize: typography.sizes.sm + 1, fontWeight: typography.weights.bold, textAlign: 'center' },
  // small enough for a long word to stay on its line in a quarter of the phone's width
  seedMeaning: { fontSize: 11, fontWeight: typography.weights.semibold, textAlign: 'center' },
  water: { gap: spacing.sm },
  held: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  heldText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  failed: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  failedText: { flex: 1, fontSize: typography.sizes.sm },
  kind: { gap: spacing.sm, borderRadius: radii.lg, padding: spacing.sm + 2 },
  kindMain: { alignItems: 'center', gap: spacing.sm + 4 },
  kindText: { flex: 1, gap: 2 },
  kindName: { fontSize: typography.sizes.md + 1, fontWeight: typography.weights.bold },
  kindMeaning: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  kindAbout: { fontSize: typography.sizes.sm, lineHeight: 20 },
  kindNote: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  price: { alignItems: 'center', gap: 5, marginTop: 2 },
  zer: { alignItems: 'center', gap: 6 },
  zerText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  ask: { alignItems: 'center', gap: spacing.sm },
  askBody: { fontSize: typography.sizes.md, lineHeight: 23, textAlign: 'center' },
  askShort: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, textAlign: 'center' },
  askActions: { gap: spacing.sm },
});
