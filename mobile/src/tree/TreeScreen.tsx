import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Animated, Easing, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { TREE_FULL, TREE_STAGES, treeColour, type TreeSpecies, type TreeStage, type TreeView } from '@kurda/shared';
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

/** How long the can pours for, and the tree starts under it, before the screen is as it will stay. */
const POUR_MS = 1100;
/** The drops that fall from the can's rose. */
const DROPS = 5;

/** What a pour did that is worth stopping for: it grew, or a full-grown tree bore. */
interface Moment {
  kind: 'grew' | 'harvest';
  tree: TreeView;
  zer: number;
}

/**
 * The learner's own tree.
 *
 * Before one is planted, the screen is the choice of a first tree: the kinds
 * that are free to start from, each shown as the tree it will be. After, it
 * is the tree itself, as big as the phone allows, with how it fares and how
 * far it is to its next stage; the water held, which a lesson earns, and the
 * button to pour it with; and a way to the nursery, where another kind can
 * be bought and planted in its place.
 *
 * Pouring is the screen's one moment: the can tips, drops fall, the tree
 * starts, and its bar moves. When that grows it, or a full-grown tree bears,
 * the app's celebration says so. A tree that has gone dry is said plainly to
 * be thirsty, wilting or withered, with no blame in it, and the first water
 * brings it back.
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
  const { width } = useWindowDimensions();
  const [data, setData] = useState<MyTree | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [pouring, setPouring] = useState(false);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [nursery, setNursery] = useState(false);
  const pour = useRef(new Animated.Value(0)).current;
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

  /** What the water did, shown once the can has poured. */
  const settle = useCallback(
    (was: MyTree, watered: Watered) => {
      setPouring(false);
      setData({ ...was, tree: watered.tree, zer: was.zer + watered.zer });
      if (watered.grew !== null) setMoment({ kind: 'grew', tree: watered.tree, zer: watered.zer });
      else if (watered.harvests > 0) setMoment({ kind: 'harvest', tree: watered.tree, zer: watered.zer });
      else if (watered.revived) setNote(t('tree.revived'));
    },
    [t],
  );

  const water = useCallback(
    async (count: number): Promise<void> => {
      if (!data?.tree || busy || pouring) return;
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
        settle(data, res.data);
        return;
      }
      // the can pours over the tree as it was; what the water did is shown once it has
      setPouring(true);
      pour.setValue(0);
      Animated.timing(pour, { toValue: 1, duration: POUR_MS, easing: Easing.linear, useNativeDriver: true }).start();
      after.current = setTimeout(() => settle(data, res.data), POUR_MS);
    },
    [client, data, busy, pouring, reduce, pour, settle, t],
  );

  // as big as the phone allows, and never smaller than a tree can be read at
  const size = Math.max(180, Math.min(320, width - layout.gutter * 2 - spacing.md * 2));
  const tree = data?.tree ?? null;
  const tint = tree ? treeColour(tree.species) : colors.success;
  // the start a tree gives as it drinks: flatter, then taller, then itself, about its foot
  const drink = {
    transform: [
      { scaleX: pour.interpolate({ inputRange: [0, 0.24, 0.48, 0.72, 1], outputRange: [1, 1, 1.04, 0.97, 1] }) },
      { scaleY: pour.interpolate({ inputRange: [0, 0.24, 0.48, 0.72, 1], outputRange: [1, 1, 0.94, 1.05, 1] }) },
    ],
  };

  return (
    <GradientBackground>
      <ScreenHeader title={t('tree.title')} onBack={onExit} />
      <AsyncBoundary loading={!data && !error && !missing} error={!data ? error : null} onRetry={load} skeleton={<TreeSkeleton size={size} />}>
        {() =>
          missing ? (
            <Text style={[styles.soon, { color: colors.textSecondary }]}>{t('tree.soon')}</Text>
          ) : !data ? null : !tree ? (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={[styles.lead, { color: colors.textPrimary }]} accessibilityRole="header">
                {t('tree.choose.title')}
              </Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('tree.choose.sub')}</Text>
              {failed ? <Failed text={failed} /> : null}
              {data.kinds
                .filter((k) => k.starter)
                .map((k) => (
                  <KindRow key={k.species} kind={k} busy={busy} action={t('tree.choose.plant')} onAct={() => void plant(k.species)} first />
                ))}
              <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('tree.choose.more')}</Text>
            </ScrollView>
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

              {/* where the tree stands: a soft ground in its own colour, and the can over it while it is watered */}
              <View style={[styles.stage, { backgroundColor: colors.surface }]} testID="tree-stage">
                <View style={[styles.stageWash, { backgroundColor: tint }]} pointerEvents="none" />
                <TreeArt species={tree.species} stage={tree.stage} health={tree.health} size={size} label={treeTitle(t, tree)} alive plant={pouring ? drink : undefined} />
                {pouring ? <Pour progress={pour} rtl={dir.rtl} /> : null}
              </View>

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
                      disabled={pouring}
                      onPress={() => void water(1)}
                      testID="tree-water"
                    />
                    {tree.water > 1 ? (
                      <ClayButton label={t('tree.water.pourAll', { count: number(tree.water) })} variant="outline" disabled={busy || pouring} onPress={() => void water(tree.water)} testID="tree-water-all" />
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

/** The can, tipped over the tree, and what falls from its rose: one clock for all of it. */
function Pour({ progress, rtl }: { progress: Animated.Value; rtl: boolean }): React.JSX.Element {
  const can = {
    opacity: progress.interpolate({ inputRange: [0, 0.16, 0.8, 1], outputRange: [0, 1, 1, 0] }),
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 0.16, 0.8, 1], outputRange: [-10, 0, 0, -6] }) },
      { rotate: progress.interpolate({ inputRange: [0, 0.16, 0.8, 1], outputRange: ['0deg', '-34deg', '-34deg', '-8deg'] }) },
    ],
  };
  return (
    <View style={[styles.pour, rtl ? styles.pourRtl : null]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="tree-pour">
      <Animated.View style={can}>
        <WateringCan size={92} />
      </Animated.View>
      {Array.from({ length: DROPS }, (_, i) => {
        const from = 0.2 + i * 0.1;
        const fall = progress.interpolate({ inputRange: [from, from + 0.46], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={[
              styles.drop,
              {
                opacity: fall.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                transform: [{ translateX: fall.interpolate({ inputRange: [0, 1], outputRange: [-i * 5, -i * 9 - 14] }) }, { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }) }],
              },
            ]}
          >
            <WaterDrop size={14} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/** How far it is to what comes next: the next stage, or a full-grown tree's next harvest; its seven stages as a row of beads. */
function Growth({ tree, tint }: { tree: TreeView; tint: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const full = tree.stage === TREE_FULL;
  const next = full ? t('tree.nextHarvest') : t('tree.next', { stage: stageName(t, (tree.stage + 1) as TreeStage) });
  const share = tree.toward.of > 0 ? Math.min(1, tree.toward.done / tree.toward.of) : 0;
  const count = `${formatNumber(tree.toward.done, locale)} / ${formatNumber(tree.toward.of, locale)}`;
  return (
    <View style={[styles.growth, { backgroundColor: colors.surface }]}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={next}
        accessibilityValue={{ min: 0, max: tree.toward.of, now: tree.toward.done, text: count }}
        style={styles.growthBar}
        testID="tree-growth"
      >
        <View style={[styles.growthHead, { flexDirection: dir.row }]}>
          <Text style={[styles.growthNext, dir.text, { color: colors.textPrimary }]}>{next}</Text>
          <Text style={[styles.growthCount, { color: colors.textSecondary }]}>{count}</Text>
        </View>
        <View style={[styles.track, { backgroundColor: colors.controlTrack, alignItems: dir.rtl ? 'flex-end' : 'flex-start' }]}>
          <View style={[styles.fill, { width: `${Math.round(share * 100)}%`, backgroundColor: tint }]} />
        </View>
      </View>
      <View style={[styles.steps, { flexDirection: dir.row }]} accessible accessibilityLabel={`${t('tree.stages')}: ${stageName(t, tree.stage)}`}>
        {Array.from({ length: TREE_STAGES }, (_, i) => (
          <View
            key={i}
            style={[styles.step, { backgroundColor: i < tree.stage ? tint : i === tree.stage ? colors.surface : colors.controlTrack }, i === tree.stage ? [styles.stepNow, { borderColor: tint }] : null]}
          />
        ))}
      </View>
      {tree.harvests > 0 ? <Text style={[styles.harvests, { color: colors.textSecondary }]}>{t('tree.harvests', { count: formatNumber(tree.harvests, locale) })}</Text> : null}
    </View>
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
  first = false,
}: {
  kind: TreeKindOffer;
  busy: boolean;
  /** the button's words; none for the kind that stands */
  action: string | null;
  onAct: () => void;
  /** in place of a price: "Free", "Yours", "Growing now" */
  note?: string;
  /** the first choice of a tree: the action in the brand's colour */
  first?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const named = treeNamed(t, kind.species);
  const said = named.meaning ? `${named.name} (${named.meaning})` : named.name;
  return (
    <View style={[styles.kind, { backgroundColor: colors.surface }]} testID={`tree-kind-${kind.species}`}>
      <View style={[styles.kindMain, { flexDirection: dir.row }]}>
        <View style={[styles.kindArt, { backgroundColor: colors.controlTrack }]}>
          <TreeArt species={kind.species} stage={TREE_FULL} size={104} />
        </View>
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
      {action ? <ClayButton label={action} accessibilityLabel={`${action}: ${said}`} tone={first ? 'primary' : 'neutral'} disabled={busy} onPress={onAct} /> : null}
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
  stage: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.xl, paddingVertical: spacing.md, overflow: 'hidden' },
  // the kind's own colour, faintly, behind the tree
  stageWash: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.1 },
  pour: { position: 'absolute', top: 10, right: '12%' },
  pourRtl: { right: undefined, left: '12%', transform: [{ scaleX: -1 }] },
  drop: { position: 'absolute', top: 44, left: 0 },
  health: { alignItems: 'baseline', flexWrap: 'wrap', gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  healthName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  healthSince: { flexShrink: 1, fontSize: typography.sizes.sm },
  growth: { gap: spacing.sm, borderRadius: radii.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  growthBar: { gap: spacing.sm },
  growthHead: { alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  growthNext: { flexShrink: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  growthCount: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  track: { height: 10, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.pill },
  steps: { justifyContent: 'center', gap: 6 },
  step: { width: 8, height: 8, borderRadius: radii.pill },
  stepNow: { borderWidth: 2 },
  harvests: { fontSize: typography.sizes.sm, textAlign: 'center' },
  water: { gap: spacing.sm },
  held: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  heldText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  failed: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  failedText: { flex: 1, fontSize: typography.sizes.sm },
  kind: { gap: spacing.sm, borderRadius: radii.lg, padding: spacing.sm + 2 },
  kindMain: { alignItems: 'center', gap: spacing.sm + 4 },
  kindArt: { borderRadius: radii.md },
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
