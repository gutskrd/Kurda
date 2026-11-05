import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KINGDOM_BUILDINGS,
  KINGDOM_FRAME,
  KINGDOM_LEVEL_TOTAL,
  KINGDOM_PLOTS,
  KINGDOM_SCENE,
  KINGDOM_SPRITES,
  kingdomBuildingSvg,
  kingdomLevelCount,
  kingdomLevels,
  kingdomLife,
  kingdomPlotBox,
  kingdomPlotSvg,
  kingdomProgress,
  kingdomRising,
  kingdomSceneSvg,
  kingdomSpriteSvg,
  type KingdomBuilding,
  type KingdomBuildingView,
  type KingdomFrame,
  type KingdomLevel,
  type KingdomNode,
  type KingdomPlace,
  type KingdomSprite,
  type KingdomUpgrade,
  type KingdomView,
} from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { Celebration } from '../ranks/Celebration';
import { FLECKS } from '../ranks/motion';
import { useDirection } from '../reports/direction';
import { BottomSheet } from '../theme/BottomSheet';
import { sectionLabel } from '../theme/fonts';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';

export const buildingNameKey = (b: KingdomBuilding): TranslationKey => `kingdom.name.${b}` as TranslationKey;
const growsKey = (b: KingdomBuilding): TranslationKey => `kingdom.grows.${b}` as TranslationKey;
const countKey = (b: KingdomBuilding): TranslationKey => `kingdom.count.${b}` as TranslationKey;

const GO_KEY: Readonly<Record<KingdomPlace, TranslationKey>> = {
  review: 'kingdom.go.review',
  lessons: 'kingdom.go.lessons',
  stories: 'kingdom.go.stories',
};

/** Where each part of Learn a building grows from is, in the app. */
export function goToPlace(navigation: RootNavigation, place: KingdomPlace): void {
  if (place === 'review') navigation.navigate('PracticeHub');
  else if (place === 'stories') navigation.navigate('Stories');
  else navigation.navigate('Tabs', { screen: 'Learn', params: { view: 'lessons' } });
}

/** The gold the celebration and the bars are drawn in: Zêr's own. */
const GOLD = '#f2b632';
const GOLD_LIGHT = '#ffe16a';
/** The game's own skin over the scene: the drawing's ink and cream, the same by day and at dusk. */
const INK = '#4a2a1a';
const CREAM = '#fff7e6';
const CREAM_EDGE = '#e7d3ae';
const LAKE = '#4fb5e2';

/** How long a building takes to go up, when the new stage lands (and is felt), and when its badge ticks over, in milliseconds. */
const RAISE_MS = 2100;
const LAND_MS = 900;
const TICK_MS = 1700;

/**
 * Kurdish Kingdom on the phone: the learner's village, Sêvan, each building
 * at the level their own learning raised it to (GET /kingdom; nothing is
 * counted here).
 *
 * The village fills the screen as a game's home does: one isometric drawing
 * (shared art/kingdom.ts) fitted so the whole village stays in view, its lake
 * and mountains filling the rest — a composed view rather than one to pan, so
 * every building and its badge is always in sight and the page under it
 * scrolls like any other. Over it: its life (the deer on the path, the flock,
 * smoke, water, wind; shared life.ts), each node one native-driver loop and
 * still under Reduce Motion, and paused while the screen is out of sight; a
 * pressable on every building with its level badge and a thin bar to its next
 * level under it; and a chunky top bar with the way back, the learner's Zêr
 * and how many of the village's thirty levels stand. A building past
 * half-way to its next level is drawn going up in scaffolding.
 *
 * A level reached since the last visit goes up in the scene — dust, the
 * scaffolding falling away, the new stage popping up with a squash and a
 * stretch, sparkles, a buzz as it lands, the badge ticking over — and is then
 * celebrated once and marked seen as it is put away. The six are listed under
 * the scene as well, for a screen reader and for anyone who would rather read
 * than look. The first visit opens with the one sentence on how the village
 * grows, quietly.
 */
export function KingdomScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const bottom = useScreenBottomInset(spacing.lg);
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background');
  const [view, setView] = useState<KingdomView | null>(null);
  const [zer, setZer] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<KingdomBuilding | null>(null);
  const [queue, setQueue] = useState<KingdomUpgrade[]>([]);
  const [introShown, setIntroShown] = useState(true);
  const [raised, setRaised] = useState<ReadonlySet<string>>(() => new Set());
  const [ticked, setTicked] = useState(false);
  const dark = scheme === 'dark';

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    void Promise.all([client.get<KingdomView>('/kingdom'), client.get<{ balances: { zer: number } }>('/me/wallet')]).then(([res, wallet]) => {
      if (!live) return;
      if (res.ok) {
        setView(res.data);
        setQueue(res.data.celebrate);
        setIntroShown(res.data.intro !== null);
      }
      if (wallet.ok) setZer(wallet.data.balances.zer);
      setStatus(res.ok ? 'ready' : 'failed');
    });
    return () => {
      live = false;
    };
  }, [client, attempt]);

  // the stage: the whole width, nearly the whole height, the village's frame fitted inside it
  const stageW = Math.max(screenW, 320);
  const stageH = Math.max(440, (screenH > 0 ? screenH : 800) - insets.top - 64);
  const scale = Math.min(stageW / KINGDOM_FRAME.w, stageH / KINGDOM_FRAME.h);
  const canvas = { w: KINGDOM_SCENE.width * scale, h: KINGDOM_SCENE.height * scale };
  const offset = { x: stageW / 2 - (KINGDOM_FRAME.x + KINGDOM_FRAME.w / 2) * scale, y: stageH / 2 - (KINGDOM_FRAME.y + KINGDOM_FRAME.h / 2) * scale };

  const current = introShown ? undefined : queue[0];
  const currentKey = current ? `${current.building}:${current.level}` : null;
  const isRaising = currentKey !== null && !reduce && !raised.has(currentKey);
  useEffect(() => {
    if (!isRaising || !currentKey) return;
    setTicked(false);
    const land = setTimeout(() => haptic('celebrate'), LAND_MS);
    const tick = setTimeout(() => setTicked(true), TICK_MS);
    const done = setTimeout(() => setRaised((r) => new Set(r).add(currentKey)), RAISE_MS);
    return () => {
      clearTimeout(land);
      clearTimeout(tick);
      clearTimeout(done);
    };
  }, [isRaising, currentKey]);

  // a level not yet celebrated still stands at the one before it, until it is raised
  const levels = useMemo(() => {
    if (!view) return null;
    const out = kingdomLevels(view.buildings);
    for (const u of queue) {
      if (u === current && !isRaising) continue;
      out[u.building] = Math.min(out[u.building], u.level - 1) as KingdomLevel;
    }
    return out;
  }, [view, queue, current, isRaising]);
  const rising = useMemo(() => (view ? kingdomRising(view.buildings) : []), [view]);
  const scene = useMemo(
    () => (levels ? kingdomSceneSvg({ levels, rising, dark, moving: true, without: isRaising ? current?.building : undefined, width: canvas.w, title: t('kingdom.title') }) : null),
    [levels, rising, dark, isRaising, current, canvas.w, t],
  );
  const number = useCallback((v: number) => new Intl.NumberFormat(locale).format(v), [locale]);

  const levelText = (b: KingdomBuildingView): string => (b.level === 0 ? t('kingdom.empty') : t('kingdom.levelOf', { level: b.level }));
  const openBuilding = view?.buildings.find((b) => b.id === open) ?? null;

  const dismissIntro = (): void => {
    setIntroShown(false);
    void client.post('/kingdom/seen', { intro: true });
  };
  const celebrated = (u: KingdomUpgrade): void => {
    void client.post('/kingdom/seen', { levels: [{ building: u.building, level: u.level }] });
    setQueue((q) => q.slice(1));
  };

  const back = (
    <Pressable onPress={onExit} accessibilityRole="button" accessibilityLabel={t('common.back')} style={({ pressed }) => [styles.back, pressed && styles.pressed]} hitSlop={6}>
      <Icon name={dir.row === 'row-reverse' ? 'chevron-right' : 'chevron-left'} size={20} color={INK} />
    </Pressable>
  );

  let body: React.ReactNode;
  if (status === 'failed' && !view) {
    body = (
      <View style={[styles.column, { paddingTop: insets.top + spacing.md }]}>
        <View style={[styles.hudRow, { flexDirection: dir.row }]}>{back}</View>
        <ErrorRetry onRetry={() => setAttempt((n) => n + 1)} />
      </View>
    );
  } else if (!view || !scene || !levels) {
    body = <Skeleton height={stageH} radius={0} />;
  } else {
    const total = kingdomLevelCount(KINGDOM_BUILDINGS.map((id) => ({ level: levels[id] })));
    body = (
      <>
        <View style={[styles.stage, { height: stageH + insets.top, paddingTop: insets.top }]} testID="kingdom-stage">
          <View style={[styles.canvas, { left: offset.x, top: insets.top + offset.y, width: canvas.w, height: canvas.h }]} testID="kingdom-scene">
            <SvgXml xml={scene} width={canvas.w} height={canvas.h} />
            <KingdomLife levels={levels} dark={dark} scale={scale} still={reduce} active={focused && appActive} />
            {isRaising && current ? <Raise upgrade={current} dark={dark} scale={scale} /> : null}
            {view.buildings.map((b) => {
              const plot = KINGDOM_PLOTS[b.id];
              const shown = isRaising && current?.building === b.id ? (ticked ? current.level : current.level - 1) : levels[b.id];
              return (
                <Pressable
                  key={b.id}
                  onPress={() => setOpen(b.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t(buildingNameKey(b.id))}, ${levelText(b)}`}
                  testID={`kingdom-plot-${b.id}`}
                  style={[styles.plot, { left: plot.box.x * scale, top: plot.box.y * scale, width: plot.box.w * scale, height: plot.box.h * scale }]}
                >
                  <Badge
                    level={shown}
                    share={shown < b.level ? 1 : kingdomProgress(b)}
                    label={t('kingdom.lv', { level: shown })}
                    left={(plot.badge.x - plot.box.x) * scale}
                    top={(plot.badge.y - plot.box.y) * scale}
                    rtl={dir.row === 'row-reverse'}
                    bounce={isRaising && current?.building === b.id && ticked && !reduce}
                  />
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.hud, { top: insets.top + 10, flexDirection: dir.row }]}>
            {back}
            <Text style={[styles.hudTitle, stageW < 430 && styles.hudTitleTight]} numberOfLines={1} accessibilityRole="header">
              {t('kingdom.title')}
            </Text>
            <View style={[styles.chips, { flexDirection: dir.row }]}>
              {zer !== null ? (
                <View style={[styles.chip, { flexDirection: dir.row }]} accessible accessibilityLabel={`${number(zer)} Zêr`} testID="kingdom-zer">
                  <Icon name="coin" size={18} />
                  <Text style={styles.chipText}>{number(zer)}</Text>
                </View>
              ) : null}
              <View style={[styles.chip, { flexDirection: dir.row }]} accessible accessibilityLabel={t('kingdom.hud.levels', { count: number(total), total: number(KINGDOM_LEVEL_TOTAL) })} testID="kingdom-levels">
                <Icon name="home" size={18} color={INK} />
                <Text style={styles.chipText}>
                  {number(total)}/{number(KINGDOM_LEVEL_TOTAL)}
                </Text>
              </View>
            </View>
          </View>

          {introShown && view.intro ? (
            <View style={styles.intro} testID="kingdom-intro">
              <Text style={[styles.introText, dir.text]}>{t('kingdom.intro')}</Text>
              {view.intro.levels > 0 ? (
                <Text style={[styles.introBuilt, dir.text]}>
                  {view.intro.zer > 0 ? `${t('kingdom.intro.built')} ${t('kingdom.celebrate.zer', { zer: number(view.intro.zer) })}` : t('kingdom.intro.built')}
                </Text>
              ) : null}
              <ClayButton label={t('kingdom.intro.go')} tone="primary" onPress={dismissIntro} />
            </View>
          ) : null}
        </View>

        <View style={[styles.column, styles.list]}>
          <Text style={[styles.listTitle, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('kingdom.list')}
          </Text>
          {view.buildings.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => setOpen(b.id)}
              accessibilityRole="button"
              accessibilityLabel={`${t(buildingNameKey(b.id))}, ${levelText(b)}`}
              testID={`kingdom-row-${b.id}`}
              style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, flexDirection: dir.row }, pressed && styles.pressed]}
            >
              <SvgXml xml={kingdomBuildingSvg({ building: b.id, level: b.level, size: 56, dark, idPrefix: `kgrow${b.id}` })} width={56} height={56} />
              <View style={styles.rowText}>
                <Text style={[styles.rowName, dir.text, { color: colors.textPrimary }]}>{t(buildingNameKey(b.id))}</Text>
                <Text style={[styles.rowLevel, dir.text, { color: colors.textSecondary }]}>{levelText(b)}</Text>
                <Bar share={kingdomProgress(b)} track={colors.controlTrack} rtl={dir.row === 'row-reverse'} />
              </View>
              <Icon name={dir.row === 'row-reverse' ? 'chevron-left' : 'chevron-right'} size={16} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      </>
    );
  }

  return (
    <GradientBackground>
      <View style={styles.screen} testID="kingdom-screen">
        <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: bottom }}>
          {body}
        </ScrollView>
      </View>

      <BottomSheet visible={openBuilding !== null} onClose={() => setOpen(null)} title={openBuilding ? t(buildingNameKey(openBuilding.id)) : undefined} testID="kingdom-sheet">
        {openBuilding ? (
          <View style={styles.sheet}>
            <SvgXml xml={kingdomBuildingSvg({ building: openBuilding.id, level: openBuilding.level, rising: rising.includes(openBuilding.id), size: 148, dark, idPrefix: `kgsheet${openBuilding.id}` })} width={148} height={148} />
            <Text style={[styles.sheetLevel, { color: colors.textSecondary }]}>{levelText(openBuilding)}</Text>
            <Text style={[styles.sheetHeading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('kingdom.builtBy')}
            </Text>
            <Text style={[styles.sheetText, dir.text, { color: colors.textPrimary }]}>{t(countKey(openBuilding.id), { count: number(openBuilding.count) })}</Text>
            <Text style={[styles.sheetHeading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('kingdom.nextUp')}
            </Text>
            <Text style={[styles.sheetText, dir.text, { color: colors.textPrimary }]}>{t(growsKey(openBuilding.id))}</Text>
            <Bar share={kingdomProgress(openBuilding)} track={colors.controlTrack} rtl={dir.row === 'row-reverse'} />
            <Text style={[styles.sheetNext, dir.text, { color: colors.textSecondary }]}>
              {openBuilding.next === null ? t('kingdom.full') : t('kingdom.toNext', { remaining: number(openBuilding.remaining), level: openBuilding.level + 1 })}
            </Text>
            <ClayButton
              label={t(GO_KEY[openBuilding.place])}
              tone="primary"
              size="large"
              onPress={() => {
                const place = openBuilding.place;
                setOpen(null);
                goToPlace(navigation, place);
              }}
            />
          </View>
        ) : null}
      </BottomSheet>

      {current && !isRaising ? (
        <Celebration
          key={`${current.building}:${current.level}`}
          art={<SvgXml xml={kingdomBuildingSvg({ building: current.building, level: current.level, size: 168, dark, title: t(buildingNameKey(current.building)) })} width={168} height={168} />}
          glow={GOLD}
          flecks={FLECKS.badge}
          fleckColours={[GOLD_LIGHT, GOLD, '#ffffff']}
          seed={current.level * 31 + current.building.length}
          kicker={t('kingdom.celebrate.kicker')}
          title={t('kingdom.celebrate.title', { building: t(buildingNameKey(current.building)), level: current.level })}
          detail={current.zer > 0 ? t('kingdom.celebrate.zer', { zer: number(current.zer) }) : null}
          note={t(growsKey(current.building))}
          announce={`${t('kingdom.celebrate.kicker')}: ${t('kingdom.celebrate.title', { building: t(buildingNameKey(current.building)), level: current.level })}`}
          // already felt as the building landed in the scene, unless it was simply shown
          felt={reduce}
          onClose={() => celebrated(current)}
          actions={
            <ClayButton
              label={queue.length > 1 ? t('kingdom.celebrate.next') : t('kingdom.celebrate.done')}
              tone="primary"
              size="large"
              onPress={() => celebrated(current)}
            />
          }
        />
      ) : null}
    </GradientBackground>
  );
}

/** A thin bar of how far a building is toward its next level. */
function Bar({ share, track, rtl }: { share: number; track: string; rtl: boolean }): React.JSX.Element {
  return (
    <View style={[styles.bar, { backgroundColor: track }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: GOLD }, rtl ? { right: 0 } : { left: 0 }]} />
    </View>
  );
}

/** A building's level badge under it, and its thin bar to the next level; it bounces once as it ticks over. */
function Badge({ level, share, label, left, top, rtl, bounce }: { level: number; share: number; label: string; left: number; top: number; rtl: boolean; bounce: boolean }): React.JSX.Element {
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!bounce) return;
    pop.setValue(1);
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.35, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [bounce, pop]);
  return (
    <View style={[styles.badge, { left: left - 30, top }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`kingdom-badge-${level}`}>
      <Animated.View style={[styles.badgePill, { transform: [{ scale: pop }] }]}>
        <Text style={styles.badgeText}>{label}</Text>
      </Animated.View>
      <View style={styles.badgeBar}>
        <View style={[styles.badgeFill, { width: `${Math.round(share * 100)}%` }, rtl ? { right: 0 } : { left: 0 }]} />
      </View>
    </View>
  );
}

/** Each sprite of the village's life, made once for each scheme. */
const SPRITE_CACHE: Partial<Record<'light' | 'dark', Record<KingdomSprite, string>>> = {};
function spritesFor(dark: boolean): Record<KingdomSprite, string> {
  const key = dark ? 'dark' : 'light';
  SPRITE_CACHE[key] ??= Object.fromEntries(KINGDOM_SPRITES.map((s) => [s, kingdomSpriteSvg(s, { dark })])) as Record<KingdomSprite, string>;
  return SPRITE_CACHE[key];
}

/**
 * The village's life over the drawing: every actor from shared, each of its
 * nodes an animated view placed where the drawing says, moved by one value
 * looping on the native driver through the node's own frames. Still under
 * Reduce Motion (each node at its still pose), and held where it is while
 * the screen is out of sight or the app is in the background.
 */
function KingdomLife({ levels, dark, scale, still, active }: { levels: Record<KingdomBuilding, KingdomLevel>; dark: boolean; scale: number; still: boolean; active: boolean }): React.JSX.Element {
  const actors = useMemo(() => kingdomLife(levels), [levels]);
  const sprites = spritesFor(dark);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="kingdom-life">
      {actors.map((a) => (
        <LifeNode key={a.id} node={a} k={scale} still={still} active={active} sprites={sprites} />
      ))}
    </View>
  );
}

type Pose = Omit<KingdomFrame, 't'>;
type PoseKey = keyof Pose;

const LifeNode = memo(function LifeNode({ node, k, still, active, sprites }: { node: KingdomNode; k: number; still: boolean; active: boolean; sprites: Record<KingdomSprite, string> }): React.JSX.Element {
  const value = useRef(new Animated.Value(0)).current;
  const motion = still ? undefined : node.motion;
  useEffect(() => {
    if (!motion || !active) return;
    value.setValue(0);
    const run = Animated.loop(Animated.timing(value, { toValue: 1, duration: motion.period, easing: Easing.linear, useNativeDriver: true }));
    run.start();
    return () => run.stop();
  }, [motion, active, value]);
  const moving = useMemo(() => {
    if (!motion) return poseStyle(node.still, k);
    const input = motion.frames.map((f) => f.t);
    const track = (key: PoseKey, times = 1): Animated.AnimatedInterpolation<number> => value.interpolate({ inputRange: input, outputRange: motion.frames.map((f) => f[key] * times) });
    const changes = (key: PoseKey): boolean => motion.frames.some((f) => f[key] !== motion.frames[0]![key]);
    const transform: Record<string, unknown>[] = [];
    if (changes('x')) transform.push({ translateX: track('x', k) });
    else if (motion.frames[0]!.x) transform.push({ translateX: motion.frames[0]!.x * k });
    if (changes('y')) transform.push({ translateY: track('y', k) });
    else if (motion.frames[0]!.y) transform.push({ translateY: motion.frames[0]!.y * k });
    if (changes('r')) transform.push({ rotate: value.interpolate({ inputRange: input, outputRange: motion.frames.map((f) => `${f.r}deg`) }) });
    else if (motion.frames[0]!.r) transform.push({ rotate: `${motion.frames[0]!.r}deg` });
    if (changes('sx')) transform.push({ scaleX: track('sx') });
    else if (motion.frames[0]!.sx !== 1) transform.push({ scaleX: motion.frames[0]!.sx });
    if (changes('sy')) transform.push({ scaleY: track('sy') });
    else if (motion.frames[0]!.sy !== 1) transform.push({ scaleY: motion.frames[0]!.sy });
    return { opacity: changes('o') ? track('o') : motion.frames[0]!.o, transform };
  }, [motion, node.still, k, value]);
  const { box, origin } = node;
  return (
    <Animated.View
      style={[
        styles.node,
        { left: box.x * k, top: box.y * k, width: box.w * k, height: box.h * k, transformOrigin: `${origin[0] * 100}% ${origin[1] * 100}%` },
        moving as object,
      ]}
    >
      {node.sprite ? <SvgXml xml={sprites[node.sprite]} width={box.w * k} height={box.h * k} /> : null}
      {node.children?.map((c, i) => <LifeNode key={i} node={c} k={k} still={still} active={active} sprites={sprites} />)}
    </Animated.View>
  );
});

/** A still pose as a style, translation in points. */
function poseStyle(p: Pose, k: number): { opacity: number; transform: Record<string, number | string>[] } {
  return { opacity: p.o, transform: [{ translateX: p.x * k }, { translateY: p.y * k }, { rotate: `${p.r}deg` }, { scaleX: p.sx }, { scaleY: p.sy }] };
}

/** Where the sparkles fly out to as a building goes up, as shares of its box. */
const SPARKS: readonly [number, number, number][] = [
  [-0.38, -0.46, 0],
  [0.34, -0.52, 80],
  [-0.46, -0.08, 160],
  [0.44, -0.14, 60],
  [-0.14, -0.64, 120],
  [0.18, -0.34, 200],
];

/**
 * A building going up in the scene (RAISE_MS in all): its stage being built
 * shakes, dust rises, the scaffolding falls away, and the new stage pops up
 * with a squash and a stretch as sparkles fly off it. Drawn over a scene that
 * leaves the building off its plot; every value runs on the native driver.
 */
function Raise({ upgrade, dark, scale }: { upgrade: KingdomUpgrade; dark: boolean; scale: number }): React.JSX.Element {
  const art = useMemo(() => {
    const before = (upgrade.level - 1) as KingdomLevel;
    return {
      old: kingdomPlotSvg({ building: upgrade.building, level: before, rising: true, scaffold: 'none', dark }),
      scaffold: kingdomPlotSvg({ building: upgrade.building, level: before, rising: true, scaffold: 'only', dark }),
      next: kingdomPlotSvg({ building: upgrade.building, level: upgrade.level, dark }),
      dust: kingdomSpriteSvg('dust', { dark }),
      sparkle: kingdomSpriteSvg('sparkle', { dark }),
    };
  }, [upgrade, dark]);
  const shake = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const dust = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const timing = (v: Animated.Value, duration: number, delay = 0, easing = Easing.out(Easing.quad)): Animated.CompositeAnimation =>
      Animated.timing(v, { toValue: 1, duration, delay, easing, useNativeDriver: true });
    const all = Animated.parallel([timing(shake, 600, 0, Easing.linear), timing(dust, 1000, 450), timing(drop, 450, 650, Easing.in(Easing.quad)), timing(pop, 700, 900, Easing.linear), timing(spark, 900, 1150)]);
    all.start();
    return () => all.stop();
  }, [shake, drop, pop, dust, spark]);
  const box = kingdomPlotBox(upgrade.building);
  const w = box.w * scale;
  const h = box.h * scale;
  const wobble = shake.interpolate({ inputRange: [0, 0.2, 0.45, 0.7, 1], outputRange: ['0deg', '-1.4deg', '1.2deg', '-0.8deg', '0deg'] });
  const layer = { position: 'absolute' as const, left: 0, top: 0, width: w, height: h, transformOrigin: '50% 80%' };
  return (
    <View style={[styles.node, { left: box.x * scale, top: box.y * scale, width: w, height: h }]} pointerEvents="none" testID="kingdom-raise">
      <Animated.View style={[layer, { opacity: pop.interpolate({ inputRange: [0, 0.01, 1], outputRange: [1, 0, 0] }), transform: [{ rotate: wobble }] }]}>
        <SvgXml xml={art.old} width={w} height={h} />
      </Animated.View>
      <Animated.View style={[layer, { opacity: drop.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [0, h * 0.14] }) }, { rotate: wobble }] }]}>
        <SvgXml xml={art.scaffold} width={w} height={h} />
      </Animated.View>
      <Animated.View
        style={[
          layer,
          {
            opacity: pop.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 1] }),
            transform: [
              { scaleX: pop.interpolate({ inputRange: [0, 0.35, 0.6, 0.8, 1], outputRange: [1.12, 0.92, 1.05, 0.98, 1] }) },
              { scaleY: pop.interpolate({ inputRange: [0, 0.35, 0.6, 0.8, 1], outputRange: [0.6, 1.14, 0.95, 1.02, 1] }) },
            ],
          },
        ]}
      >
        <SvgXml xml={art.next} width={w} height={h} />
      </Animated.View>
      <Animated.View
        style={[
          styles.node,
          {
            left: w * 0.1,
            top: h * 0.6,
            width: w * 0.8,
            height: h * 0.34,
            transformOrigin: '50% 100%',
            opacity: dust.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }),
            transform: [{ translateY: dust.interpolate({ inputRange: [0, 1], outputRange: [0, -h * 0.04] }) }, { scaleX: dust.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.25] }) }, { scaleY: dust.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.15] }) }],
          },
        ]}
      >
        <SvgXml xml={art.dust} width={w * 0.8} height={h * 0.34} />
      </Animated.View>
      {SPARKS.map(([dx, dy, delay], i) => {
        const start = delay / 900;
        const at = (to: number): Animated.AnimatedInterpolation<number> => spark.interpolate({ inputRange: [0, start, Math.min(1, start + 0.8)], outputRange: [0, 0, to], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={[
              styles.node,
              {
                left: w * 0.46,
                top: h * 0.52,
                width: w * 0.08,
                height: w * 0.08,
                opacity: spark.interpolate({ inputRange: [0, start, Math.min(1, start + 0.24), Math.min(1, start + 0.8)], outputRange: [0, 0, 1, 0], extrapolate: 'clamp' }),
                transform: [{ translateX: at(dx * w) }, { translateY: at(dy * h) }],
              },
            ]}
          >
            <SvgXml xml={art.sparkle} width={w * 0.08} height={w * 0.08} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { paddingHorizontal: layout.gutter, gap: spacing.sm, maxWidth: layout.column + layout.gutter * 2, width: '100%', alignSelf: 'center' },
  stage: { width: '100%', overflow: 'hidden', backgroundColor: LAKE },
  canvas: { position: 'absolute' },
  node: { position: 'absolute' },
  plot: { position: 'absolute', minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET },
  hud: { position: 'absolute', left: 10, right: 10, alignItems: 'center', gap: 8 },
  hudRow: { alignItems: 'center', gap: 8 },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 2.5,
    borderBottomWidth: 4,
    borderColor: INK,
    backgroundColor: CREAM,
  },
  hudTitle: {
    flexShrink: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: 2.5,
    borderBottomWidth: 4,
    borderColor: INK,
    backgroundColor: CREAM,
    color: INK,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    overflow: 'hidden',
  },
  // on a narrow phone the title is said, not shown: the chips need the room
  hudTitleTight: { position: 'absolute', width: 1, height: 1, opacity: 0, padding: 0, borderWidth: 0 },
  chips: { marginStart: 'auto', gap: 6 },
  chip: {
    height: 36,
    alignItems: 'center',
    gap: 5,
    paddingStart: 7,
    paddingEnd: 10,
    borderRadius: radii.pill,
    borderWidth: 2.5,
    borderBottomWidth: 4,
    borderColor: INK,
    backgroundColor: CREAM,
  },
  chipText: { color: INK, fontSize: typography.sizes.md, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  badge: { position: 'absolute', width: 60, alignItems: 'center', gap: 2 },
  badgePill: { paddingHorizontal: 8, paddingTop: 1, paddingBottom: 2, borderRadius: radii.pill, borderWidth: 2, borderBottomWidth: 3, borderColor: INK, backgroundColor: CREAM },
  badgeText: { color: INK, fontSize: 12, fontWeight: typography.weights.bold },
  badgeBar: { width: 40, height: 7, borderRadius: radii.pill, borderWidth: 1.5, borderColor: INK, backgroundColor: CREAM_EDGE, overflow: 'hidden' },
  badgeFill: { position: 'absolute', top: 0, bottom: 0, backgroundColor: GOLD },
  intro: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 2.5,
    borderBottomWidth: 4,
    borderColor: INK,
    backgroundColor: CREAM,
  },
  introText: { color: INK, fontSize: typography.sizes.md, lineHeight: 22 },
  introBuilt: { color: INK, fontSize: typography.sizes.sm },
  list: { paddingTop: spacing.md },
  listTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, marginBottom: 2 },
  row: { alignItems: 'center', gap: spacing.md - 4, minHeight: MIN_TOUCH_TARGET + 24, borderRadius: radii.md, paddingHorizontal: spacing.md - 4, paddingVertical: spacing.sm },
  rowText: { flex: 1, gap: 4 },
  rowName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  rowLevel: { fontSize: typography.sizes.xs },
  pressed: { opacity: 0.7 },
  bar: { height: 6, borderRadius: radii.pill, overflow: 'hidden', alignSelf: 'stretch' },
  barFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: radii.pill },
  sheet: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.md },
  sheetLevel: { fontSize: typography.sizes.sm },
  sheetHeading: { ...sectionLabel, alignSelf: 'stretch', marginTop: spacing.sm },
  sheetText: { fontSize: typography.sizes.md, alignSelf: 'stretch' },
  sheetNext: { fontSize: typography.sizes.sm, alignSelf: 'stretch' },
});
