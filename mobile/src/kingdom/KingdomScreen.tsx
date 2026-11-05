import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent, type PanResponderGestureState } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KINGDOM_BUILDINGS,
  KINGDOM_LEVEL_TOTAL,
  KINGDOM_PLOTS,
  KINGDOM_SCENE,
  KINGDOM_SPRITES,
  kingdomActorReach,
  kingdomBuildingSvg,
  kingdomLevelCount,
  kingdomLevels,
  kingdomLife,
  kingdomPlotBox,
  kingdomPlotSvg,
  kingdomProgress,
  kingdomRising,
  kingdomSpriteSvg,
  kingdomTiles,
  kingdomWaterAt,
  praiseWords,
  villageCamera,
  villageProgress,
  type KingdomActor,
  type KingdomBuilding,
  type KingdomBuildingView,
  type KingdomFrame,
  type KingdomLevel,
  type KingdomMotion,
  type KingdomNode,
  type KingdomPlace,
  type KingdomSprite,
  type KingdomTap,
  type KingdomUpgrade,
  type KingdomView,
  type VillageCamera,
  type VillageStage,
} from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
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

const { cameraOn, canvasAt, clampCamera, openingCamera, panBy, transformOf, visibleRect, zoomAt } = villageCamera;
type Camera = VillageCamera;
type Stage = VillageStage;

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
/** The least a tap target in the village reaches across, in canvas units (about a thumb's width at the opening zoom). */
const HIT = 26;
const CREAM_2 = '#f6e8cc';
const CREAM_EDGE = '#e7d3ae';
const SAFFRON = '#ffd36b';
const GREEN = '#3fa45b';
const LAKE = '#4fb5e2';

/** How long a building takes to go up, when the new stage lands (and is felt), and when its badge ticks over, in milliseconds. */
const RAISE_MS = 2400;
const LAND_MS = 1150;
const TICK_MS = 1900;
/** How long a tapped building bounces before its card opens, and how long the camera takes to fly to one. */
const BOUNCE_MS = 420;
const FLY_MS = 600;
/** A press that moves less than this, in points, is a tap; two taps closer than this in time are a double tap. */
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 300;
/** The world is drawn again at a new scale once the camera settles this far from the scale it was last drawn at (in either direction). */
const REDRAW_AT = 1.3;

/** When the screen first ran: the clock every loop of the village's life keeps to, so an actor coming into view is where it would have been all along. */
const CLOCK = Date.now();

/**
 * The Village on the phone ("kingdom" in code): the learner's village,
 * Sêvan, each building at the level their own learning raised it to (GET
 * /kingdom; nothing is counted here), in a valley that fills in as the
 * village's total level rises.
 *
 * The screen is a game's home: a world much larger than the screen, drawn as
 * tiles of the shared isometric art, that the learner drags to pan (it glides
 * on after a flick) and pinches or double-taps to zoom, opening near on the
 * village's heart so its buildings are big. The world is moved as a whole by
 * native-driver transforms while a gesture lasts, and drawn again sharp at
 * its new scale once it settles, if it has gone far from the scale it was
 * drawn at; only the tiles and the life near the view are drawn at all. Over
 * the world: its life (shared life.ts), each node one native-driver loop,
 * still under Reduce Motion and held while the screen is out of sight; a level
 * badge and a thin bar under every building; a chunky top bar with the way
 * back, the village's level and its bar, and the learner's Zêr; round buttons
 * to re-centre and zoom; and a tray of cards, one for each building, which
 * is also the list a screen reader reads.
 *
 * A level reached since the last visit goes up in the scene — the camera flies
 * to it, dust, the scaffolding falling away, the new stage dropping in with a
 * bounce, sparkles, a buzz as it lands, the badge ticking over — and is then
 * celebrated once and marked seen as it is put away. The first visit opens
 * with the one sentence on how the village grows, quietly.
 */
export function KingdomScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { t } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [view, setView] = useState<KingdomView | null>(null);
  const [zer, setZer] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    void Promise.all([client.get<KingdomView>('/kingdom'), client.get<{ balances: { zer: number } }>('/me/wallet')]).then(([res, wallet]) => {
      if (!live) return;
      if (res.ok) setView(res.data);
      if (wallet.ok) setZer(wallet.data.balances.zer);
      setStatus(res.ok ? 'ready' : 'failed');
    });
    return () => {
      live = false;
    };
  }, [client, attempt]);

  const back = (
    <Pressable onPress={onExit} accessibilityRole="button" accessibilityLabel={t('common.back')} style={({ pressed }) => [styles.back, pressed && styles.pressed]} hitSlop={6}>
      <Icon name={dir.row === 'row-reverse' ? 'chevron-right' : 'chevron-left'} size={20} color={INK} />
    </Pressable>
  );

  if (status === 'failed' && !view) {
    return (
      <GradientBackground>
        <View style={[styles.column, { paddingTop: insets.top + spacing.md }]} testID="kingdom-screen">
          <View style={[styles.hudRow, { flexDirection: dir.row }]}>{back}</View>
          <ErrorRetry onRetry={() => setAttempt((n) => n + 1)} />
        </View>
      </GradientBackground>
    );
  }
  if (!view) {
    return (
      <GradientBackground>
        <View style={styles.screen} testID="kingdom-screen">
          <Skeleton height={Math.max(480, screenH)} radius={0} />
        </View>
      </GradientBackground>
    );
  }
  return <Village view={view} zer={zer} back={back} />;
}

/** The game itself, once the village has been read: the stage, its world and camera, the bar, the tray, the sheet and the celebration. */
function Village({ view, zer, back }: { view: KingdomView; zer: number | null; back: React.ReactNode }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background');
  const [open, setOpen] = useState<KingdomBuilding | null>(null);
  const [queue, setQueue] = useState<KingdomUpgrade[]>(view.celebrate);
  const [introShown, setIntroShown] = useState(view.intro !== null);
  const [raised, setRaised] = useState<ReadonlySet<string>>(() => new Set());
  const [ticked, setTicked] = useState(false);
  const [trayH, setTrayH] = useState(196);
  const dark = scheme === 'dark';
  const number = useCallback((v: number) => new Intl.NumberFormat(locale).format(v), [locale]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // the stage: the whole screen; the bar covers its top and the tray its bottom
  const stage = useMemo<Stage>(() => ({ w: Math.max(screenW, 320), h: Math.max(screenH, 480), top: insets.top + 70, bottom: trayH + 6 }), [screenW, screenH, insets.top, trayH]);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const current = introShown ? undefined : queue[0];
  const currentKey = current ? `${current.building}:${current.level}` : null;
  const isRaising = currentKey !== null && !reduce && !raised.has(currentKey);

  // a level not yet celebrated still stands at the one before it, until it is raised
  const levels = useMemo(() => {
    const out = kingdomLevels(view.buildings);
    for (const u of queue) {
      if (u === current && !isRaising) continue;
      out[u.building] = Math.min(out[u.building], u.level - 1) as KingdomLevel;
    }
    return out;
  }, [view, queue, current, isRaising]);
  const rising = useMemo(() => kingdomRising(view.buildings), [view]);

  // ─── the camera: its pose in a ref, written to native-driver values; the scale the world is drawn at in state
  const camRef = useRef<Camera>(openingCamera(stage));
  const [drawnAt, setDrawnAt] = useState(() => camRef.current.s);
  const [near, setNear] = useState(() => visibleRect(camRef.current, stage, 0.35));
  const first = transformOf(camRef.current, stage);
  const tx = useRef(new Animated.Value(first.tx)).current;
  const ty = useRef(new Animated.Value(first.ty)).current;
  const sc = useRef(new Animated.Value(first.s)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);

  /** The camera settled (or, now and then, moving): note what is near the view, and draw the world again if its scale has gone far from the drawn one. */
  const settle = useCallback((c: Camera) => {
    setNear(visibleRect(c, stageRef.current, 0.35));
    setDrawnAt((r) => (c.s / r > REDRAW_AT || r / c.s > REDRAW_AT ? c.s : r));
  }, []);

  /** The camera put straight somewhere (a drag, a pinch). */
  const place = useCallback(
    (c: Camera) => {
      camRef.current = c;
      const tf = transformOf(c, stageRef.current);
      tx.setValue(tf.tx);
      ty.setValue(tf.ty);
      sc.setValue(tf.s);
    },
    [tx, ty, sc],
  );

  const stopMotion = useCallback(() => {
    running.current?.stop();
    running.current = null;
  }, []);

  /** The camera glides to another on the native driver (or, under Reduce Motion, jumps), then `done`. */
  const flyTo = useCallback(
    (to: Camera, done?: () => void, ms = FLY_MS, easing = Easing.inOut(Easing.cubic)) => {
      stopMotion();
      const target = clampCamera(to, stageRef.current);
      if (reduce) {
        place(target);
        settle(target);
        done?.();
        return;
      }
      const tf = transformOf(target, stageRef.current);
      camRef.current = target;
      const anim = Animated.parallel([
        Animated.timing(tx, { toValue: tf.tx, duration: ms, easing, useNativeDriver: true }),
        Animated.timing(ty, { toValue: tf.ty, duration: ms, easing, useNativeDriver: true }),
        Animated.timing(sc, { toValue: tf.s, duration: ms, easing, useNativeDriver: true }),
      ]);
      running.current = anim;
      anim.start(({ finished }) => {
        if (running.current === anim) running.current = null;
        if (!finished) return;
        settle(target);
        done?.();
      });
    },
    [place, reduce, settle, stopMotion, tx, ty, sc],
  );

  // the screen's size changing (a turn of the phone, the tray measured) keeps the camera inside the world
  useEffect(() => {
    const c = clampCamera(camRef.current, stage);
    place(c);
    settle(c);
  }, [stage, place, settle]);
  useEffect(() => () => stopMotion(), [stopMotion]);

  // ─── each new level goes up in the scene first, the camera flown to it, felt as it lands; then its celebration opens
  useEffect(() => {
    if (!isRaising || !currentKey || !current) return;
    setTicked(false);
    flyTo(cameraOn(KINGDOM_PLOTS[current.building].box, stageRef.current, camRef.current.s));
    const land = setTimeout(() => haptic('celebrate'), LAND_MS);
    const tick = setTimeout(() => setTicked(true), TICK_MS);
    const done = setTimeout(() => setRaised((r) => new Set(r).add(currentKey)), RAISE_MS);
    return () => {
      clearTimeout(land);
      clearTimeout(tick);
      clearTimeout(done);
    };
    // the camera is read once, as the raise starts, so only a new raise starts this again
  }, [isRaising, currentKey]);

  // ─── taps: a building bounces, then its card opens; the deer is happy; a person says a word of praise; an animal or a tree answers
  const [bouncing, setBouncing] = useState<KingdomBuilding | null>(null);
  const [reacting, setReacting] = useState<{ id: string; tap: KingdomTap } | null>(null);
  const [bits, setBits] = useState<{ key: number; kind: 'feathers' | 'leaf' | 'ripple'; x: number; y: number }[]>([]);
  const [said, setSaid] = useState<{ word: string; x: number; y: number } | null>(null);
  const actors = useMemo(() => kingdomLife(levels), [levels]);
  const openBuilding = useCallback(
    (b: KingdomBuilding) => {
      haptic('tap');
      if (reduce) {
        setOpen(b);
        return;
      }
      setBouncing(b);
      setTimeout(() => {
        setBouncing(null);
        setOpen(b);
      }, BOUNCE_MS);
    },
    [reduce],
  );
  const goTo = useCallback((b: KingdomBuilding) => flyTo(cameraOn(KINGDOM_PLOTS[b].box, stageRef.current, camRef.current.s), () => openBuilding(b)), [flyTo, openBuilding]);
  const tapAt = useCallback(
    (px: number, py: number) => {
      const at = canvasAt(camRef.current, stageRef.current, px, py);
      const bit = (kind: 'feathers' | 'leaf' | 'ripple', x: number, y: number, ms: number): void => {
        const key = Date.now() + Math.random();
        setBits((list) => [...list, { key, kind, x, y }]);
        setTimeout(() => setBits((list) => list.filter((b) => b.key !== key)), ms);
      };
      // what stands where it was tapped, at this moment of its loop, its target reaching a little round it to be big enough for a thumb
      const hits = (a: KingdomActor): boolean => {
        const pose = a.motion && !reduce ? poseNow(a.motion) : a.still;
        const padX = Math.max(3, (HIT - a.box.w) / 2);
        const padY = Math.max(3, (HIT - a.box.h) / 2);
        const x = a.box.x + pose.x;
        const y = a.box.y + pose.y;
        return at.x >= x - padX && at.x <= x + a.box.w + padX && at.y >= y - padY && at.y <= y + a.box.h + padY;
      };
      const answer = (a: KingdomActor, tap: KingdomTap): void => {
        if (tap === 'person') {
          const words = praiseWords(null);
          const pose = a.motion && !reduce ? poseNow(a.motion) : a.still;
          setSaid({ word: words[Math.floor(Date.now() / 1000) % words.length]!, x: a.box.x + pose.x + a.box.w / 2, y: a.box.y + pose.y - 2 });
          setTimeout(() => setSaid(null), 2200);
        }
        if (reduce) return;
        haptic('tap');
        setReacting({ id: a.id, tap });
        setTimeout(() => setReacting((r) => (r?.id === a.id ? null : r)), tap === 'deer' ? 1400 : 900);
        if (tap === 'flutter') bit('feathers', at.x, at.y, 900);
        if (tap === 'rustle') bit('leaf', at.x, at.y - 10, 2200);
      };
      // the people and the animals first, front to back; then a building; then a tree (which may stand in front of one); then the water
      const front = [...actors].reverse();
      const living = front.find((a) => a.tap && a.tap !== 'rustle' && hits(a));
      if (living) return answer(living, living.tap!);
      const hit = KINGDOM_BUILDINGS.find((b) => {
        const box = KINGDOM_PLOTS[b].box;
        return at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h;
      });
      if (hit) return openBuilding(hit);
      const tree = front.find((a) => a.tap === 'rustle' && hits(a));
      if (tree) return answer(tree, 'rustle');
      if (!reduce && kingdomWaterAt(at.x, at.y)) bit('ripple', at.x, at.y, 1200);
    },
    [actors, openBuilding, reduce],
  );

  // ─── the gestures: a drag pans and glides on after a flick, two fingers pinch, a double tap zooms in
  const gesture = useRef<{ last: { x: number; y: number }; pinch: { d: number; c: Camera; mid: { x: number; y: number } } | null; moved: boolean; lastTap: number }>({ last: { x: 0, y: 0 }, pinch: null, moved: false, lastTap: 0 });
  const handlers = useRef({ tapAt, flyTo, place, settle, stopMotion, reduce });
  handlers.current = { tapAt, flyTo, place, settle, stopMotion, reduce };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          handlers.current.stopMotion();
          const g = gesture.current;
          g.moved = false;
          g.pinch = null;
          g.last = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          // a glide stopped by a touch stays where it had got to
          const tf = { tx: valueOf(tx), ty: valueOf(ty), s: valueOf(sc) };
          if (tf.s > 0) camRef.current = clampCamera({ s: tf.s, x: (stageRef.current.w / 2 - tf.tx) / tf.s, y: (stageRef.current.top + (stageRef.current.h - stageRef.current.top - stageRef.current.bottom) / 2 - tf.ty) / tf.s }, stageRef.current);
        },
        onPanResponderMove: (e: GestureResponderEvent, s: PanResponderGestureState) => {
          const g = gesture.current;
          const touches = e.nativeEvent.touches ?? [];
          if (touches.length >= 2) {
            const [a, b] = [touches[0]!, touches[1]!];
            const d = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            const mid = { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
            if (!g.pinch) g.pinch = { d, c: camRef.current, mid };
            g.moved = true;
            const zoomed = zoomAt(g.pinch.c, stageRef.current, g.pinch.mid.x, g.pinch.mid.y, d / Math.max(1, g.pinch.d));
            handlers.current.place(panBy(zoomed, stageRef.current, mid.x - g.pinch.mid.x, mid.y - g.pinch.mid.y));
            return;
          }
          if (g.pinch) {
            // one finger lifted from a pinch: carry on panning from here
            g.pinch = null;
            g.last = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
            return;
          }
          if (!g.moved && Math.hypot(s.dx, s.dy) < TAP_SLOP) return;
          g.moved = true;
          const p = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          handlers.current.place(panBy(camRef.current, stageRef.current, p.x - g.last.x, p.y - g.last.y));
          g.last = p;
        },
        onPanResponderRelease: (e: GestureResponderEvent, s: PanResponderGestureState) => {
          const g = gesture.current;
          const h = handlers.current;
          if (!g.moved) {
            const now = Date.now();
            const x = e.nativeEvent.pageX;
            const y = e.nativeEvent.pageY;
            if (now - g.lastTap < DOUBLE_TAP_MS) {
              g.lastTap = 0;
              h.flyTo(zoomAt(camRef.current, stageRef.current, x, y, 1.7), undefined, 300);
            } else {
              g.lastTap = now;
              h.tapAt(x, y);
            }
            return;
          }
          // a flick glides on, slowing, on the native driver; under Reduce Motion it stops where it is let go
          const speed = Math.hypot(s.vx, s.vy);
          if (h.reduce || speed < 0.1 || g.pinch) {
            g.pinch = null;
            h.settle(camRef.current);
            return;
          }
          const glide = 320;
          h.flyTo(panBy(camRef.current, stageRef.current, s.vx * glide, s.vy * glide), undefined, 700, Easing.out(Easing.cubic));
        },
        onPanResponderTerminate: () => {
          gesture.current.pinch = null;
          handlers.current.settle(camRef.current);
        },
      }),
    [tx, ty, sc],
  );

  const zoomBy = (factor: number): void => {
    const v = stageRef.current;
    flyTo(zoomAt(camRef.current, v, v.w / 2, v.top + (v.h - v.top - v.bottom) / 2, factor), undefined, 280);
  };
  const recentre = (): void => flyTo(openingCamera(stageRef.current));

  // ─── what is drawn: the tiles and the life near the view, at the scale the world was last drawn at
  const tiles = useMemo(() => kingdomTiles({ levels, rising, dark, moving: true, without: isRaising ? current?.building : undefined }), [levels, rising, dark, isRaising, current]);
  const r = drawnAt;
  // a word bubble in scale with the person who says it (about half their height), and never smaller than can be read
  const bubble = Math.max(8.5 * r, 11) / 15;
  const total = kingdomLevelCount(KINGDOM_BUILDINGS.map((id) => ({ level: levels[id] })));
  const pending = new Set(queue.map((u) => u.building));
  const openView = view.buildings.find((b) => b.id === open) ?? null;
  const rtl = dir.row === 'row-reverse';

  const dismissIntro = (): void => {
    setIntroShown(false);
    void client.post('/kingdom/seen', { intro: true });
  };
  const celebrated = (u: KingdomUpgrade): void => {
    void client.post('/kingdom/seen', { levels: [{ building: u.building, level: u.level }] });
    setQueue((q) => q.slice(1));
  };

  return (
    <GradientBackground>
      <View style={styles.screen} testID="kingdom-screen">
        <View style={[styles.stage, { backgroundColor: LAKE }]} {...responder.panHandlers} testID="kingdom-stage" accessible accessibilityRole="image" accessibilityLabel={t('kingdom.title')}>
          <Animated.View style={[styles.world, { width: KINGDOM_SCENE.width * r, height: KINGDOM_SCENE.height * r, transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }] }]} testID="kingdom-scene" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {/* the world drawn at `r` points to the unit, brought back to one by this static scale so the whole stays at the camera's */}
            <View style={[styles.drawn, { width: KINGDOM_SCENE.width * r, height: KINGDOM_SCENE.height * r, transform: [{ scale: 1 / r }] }]}>
              {tiles.map((tile) =>
                overlaps(tile, near) ? (
                  <View key={`${tile.x},${tile.y}`} style={[styles.node, { left: tile.x * r, top: tile.y * r, width: tile.w * r, height: tile.h * r }]} pointerEvents="none">
                    <SvgXml xml={tile.svg} width={tile.w * r} height={tile.h * r} />
                  </View>
                ) : null,
              )}
              <KingdomLife actors={actors} near={near} dark={dark} scale={r} still={reduce} active={focused && appActive} reacting={reacting} />
              {bits.map((b) => (
                <Bit key={b.key} kind={b.kind} x={b.x * r} y={b.y * r} scale={r} />
              ))}
              {isRaising && current ? <Raise upgrade={current} dark={dark} scale={r} /> : null}
              {bouncing ? <Bounce building={bouncing} level={levels[bouncing]} rising={rising.includes(bouncing)} dark={dark} scale={r} /> : null}
              {view.buildings.map((b) => {
                const plot = KINGDOM_PLOTS[b.id];
                const shown = isRaising && current?.building === b.id ? (ticked ? current.level : current.level - 1) : levels[b.id];
                return (
                  <Badge
                    key={b.id}
                    id={b.id}
                    share={shown < b.level ? 1 : kingdomProgress(b)}
                    label={t('kingdom.lv', { level: shown })}
                    left={plot.badge.x * r}
                    top={plot.badge.y * r}
                    rtl={rtl}
                    bounce={isRaising && current?.building === b.id && ticked && !reduce}
                  />
                );
              })}
              {said ? (
                <View style={[styles.bubble, { left: said.x * r - 60 * bubble, top: said.y * r - 40 * bubble, width: 120 * bubble }]} pointerEvents="none">
                  <Text style={[styles.bubbleText, { fontSize: 15 * bubble, paddingHorizontal: 12 * bubble, paddingVertical: 4 * bubble, borderWidth: 2.5 * bubble }]}>{said.word}</Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
        </View>

        <View style={[styles.hud, { top: insets.top + 10, flexDirection: dir.row }]}>
          {back}
          <View style={[styles.level, { flexDirection: dir.row }]} accessible accessibilityRole="image" accessibilityLabel={t('kingdom.hud.levels', { count: number(total), total: number(KINGDOM_LEVEL_TOTAL) })} testID="kingdom-levels">
            <LevelBadge text={number(total)} bounce={ticked && isRaising && !reduce} />
            <View style={styles.levelBar}>
              <View style={[styles.levelFill, { width: `${Math.round((total >= KINGDOM_LEVEL_TOTAL ? 1 : villageProgress(view.buildings)) * 100)}%` }, rtl ? { right: 0 } : { left: 0 }]} />
            </View>
          </View>
          <Text style={styles.hudTitle} accessibilityRole="header">
            {t('kingdom.title')}
          </Text>
          {zer !== null ? (
            <View style={[styles.chip, { flexDirection: dir.row }]} accessible accessibilityLabel={`${number(zer)} Zêr`} testID="kingdom-zer">
              <Icon name="coin" size={20} />
              <Text style={styles.chipText}>{number(zer)}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.controls, rtl ? { left: 12 } : { right: 12 }, { bottom: trayH + 12 }]}>
          <RoundButton label={t('kingdom.recentre')} onPress={recentre} testID="kingdom-recentre">
            <Icon name="target" size={22} color={INK} />
          </RoundButton>
          <RoundButton label={t('kingdom.zoomIn')} onPress={() => zoomBy(1.35)} testID="kingdom-zoom-in">
            <Icon name="plus" size={22} color={INK} />
          </RoundButton>
          <RoundButton label={t('kingdom.zoomOut')} onPress={() => zoomBy(1 / 1.35)} testID="kingdom-zoom-out">
            <View style={styles.minus} />
          </RoundButton>
        </View>

        <View style={[styles.tray, { paddingBottom: Math.max(insets.bottom, 10) }]} onLayout={(e) => setTrayH(Math.round(e.nativeEvent.layout.height))} testID="kingdom-tray">
          <Text style={styles.srOnly} accessibilityRole="header">
            {t('kingdom.list')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.cards, { flexDirection: dir.row }]}>
            {view.buildings.map((b) => (
              <Card
                key={b.id}
                building={b}
                dark={dark}
                ready={pending.has(b.id)}
                rtl={rtl}
                onGo={() => goTo(b.id)}
                onLearn={() => goToPlace(navigation, b.place)}
              />
            ))}
          </ScrollView>
        </View>

        {introShown && view.intro ? (
          <View style={[styles.intro, { bottom: trayH + 8 }]} testID="kingdom-intro">
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

      <BottomSheet visible={openView !== null} onClose={() => setOpen(null)} title={openView ? t(buildingNameKey(openView.id)) : undefined} testID="kingdom-sheet">
        {openView ? (
          <View style={styles.sheet}>
            <SvgXml xml={kingdomBuildingSvg({ building: openView.id, level: openView.level, rising: rising.includes(openView.id), size: 148, dark, idPrefix: `kgsheet${openView.id}` })} width={148} height={148} />
            <Text style={[styles.sheetLevel, { color: colors.textSecondary }]}>{levelText(t, openView)}</Text>
            <Text style={[styles.sheetHeading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('kingdom.builtBy')}
            </Text>
            <Text style={[styles.sheetText, dir.text, { color: colors.textPrimary }]}>{t(countKey(openView.id), { count: number(openView.count) })}</Text>
            <Text style={[styles.sheetHeading, dir.text, { color: colors.textSecondary }]} accessibilityRole="header">
              {t('kingdom.nextUp')}
            </Text>
            <Text style={[styles.sheetText, dir.text, { color: colors.textPrimary }]}>{t(growsKey(openView.id))}</Text>
            <Bar share={kingdomProgress(openView)} track={colors.controlTrack} rtl={rtl} />
            <Text style={[styles.sheetNext, dir.text, { color: colors.textSecondary }]}>
              {openView.next === null ? t('kingdom.full') : t('kingdom.toNext', { remaining: number(openView.remaining), level: openView.level + 1 })}
            </Text>
            <ClayButton
              label={t(GO_KEY[openView.place])}
              tone="primary"
              size="large"
              onPress={() => {
                const place = openView.place;
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

type Translate = ReturnType<typeof useI18n>['t'];

const levelText = (t: Translate, b: KingdomBuildingView): string => (b.level === 0 ? t('kingdom.empty') : t('kingdom.levelOf', { level: b.level }));

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** An animated value's current number (the camera reads it back when a touch stops a glide). */
function valueOf(v: Animated.Value): number {
  let out = 0;
  v.stopAnimation((n) => {
    out = n;
  });
  return out;
}

/** Where a loop is at this moment of the village's clock: the pose an actor stands in now. */
function poseNow(m: KingdomMotion): Omit<KingdomFrame, 't'> {
  const f = ((Date.now() - CLOCK) % m.period) / m.period;
  const frames = m.frames;
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1]!.t <= f) i++;
  const a = frames[i]!;
  const b = frames[i + 1] ?? a;
  const k = b.t > a.t ? (f - a.t) / (b.t - a.t) : 0;
  const mix = (p: keyof Omit<KingdomFrame, 't'>): number => a[p] + (b[p] - a[p]) * k;
  return { x: mix('x'), y: mix('y'), r: mix('r'), sx: mix('sx'), sy: mix('sy'), o: mix('o') };
}

/** A round camera button over the world. */
function RoundButton({ label, onPress, children, testID }: { label: string; onPress: () => void; children: React.ReactNode; testID: string }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={({ pressed }) => [styles.round, pressed && styles.roundPressed]} hitSlop={4}>
      {children}
    </Pressable>
  );
}

/** The village's level in the top bar: a saffron badge that bounces as it ticks over. */
function LevelBadge({ text, bounce }: { text: string; bounce: boolean }): React.JSX.Element {
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!bounce) return;
    pop.setValue(1);
    Animated.sequence([Animated.timing(pop, { toValue: 1.4, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true })]).start();
  }, [bounce, pop]);
  return (
    <Animated.View style={[styles.levelBadge, { transform: [{ rotate: '-4deg' }, { scale: pop }] }]}>
      <Text style={styles.levelText}>{text}</Text>
    </Animated.View>
  );
}

/**
 * One building's card in the tray: its picture at its stage, its name, its
 * state (not begun, growing, a new level ready to see, finished), a bar to its
 * next level, what grows it in plain words, and the way into that part of
 * Learn. Its face is a button that flies the camera to the building and opens
 * what built it.
 */
const Card = memo(function Card({ building: b, dark, ready, rtl, onGo, onLearn }: { building: KingdomBuildingView; dark: boolean; ready: boolean; rtl: boolean; onGo: () => void; onLearn: () => void }): React.JSX.Element {
  const { t, locale } = useI18n();
  const number = (v: number): string => new Intl.NumberFormat(locale).format(v);
  const state = ready ? 'ready' : b.next === null ? 'done' : b.level === 0 ? 'new' : 'growing';
  const stateText = state === 'ready' ? t('kingdom.tray.ready') : state === 'done' ? t('kingdom.full') : levelText(t, b);
  const picture = useMemo(() => kingdomBuildingSvg({ building: b.id, level: b.level, size: 60, dark, idPrefix: `kgcard${b.id}` }), [b.id, b.level, dark]);
  return (
    <View style={[styles.card, ready && styles.cardReady]} testID={`kingdom-card-${b.id}`}>
      <Pressable onPress={onGo} accessibilityRole="button" accessibilityLabel={`${t(buildingNameKey(b.id))}, ${stateText}`} testID={`kingdom-row-${b.id}`} style={({ pressed }) => [styles.cardFace, { flexDirection: rtl ? 'row-reverse' : 'row' }, pressed && styles.pressed]}>
        <SvgXml xml={picture} width={60} height={60} />
        <View style={styles.cardHead} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.cardName} numberOfLines={1}>
            {t(buildingNameKey(b.id))}
          </Text>
          <View style={[styles.cardState, state === 'ready' && { backgroundColor: SAFFRON }, state === 'done' && { backgroundColor: GREEN }]}>
            <Text style={[styles.cardStateText, state === 'done' && { color: '#ffffff' }]}>{state === 'growing' ? t('kingdom.lv', { level: b.level }) : stateText}</Text>
          </View>
        </View>
      </Pressable>
      {b.next !== null ? (
        <>
          <View style={styles.cardBar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.cardFill, { width: `${Math.round(kingdomProgress(b) * 100)}%` }, rtl ? { right: 0 } : { left: 0 }]} />
          </View>
          <Text style={styles.cardNext}>{t('kingdom.toNext', { remaining: number(b.remaining), level: b.level + 1 })}</Text>
        </>
      ) : null}
      <Text style={styles.cardGrows} numberOfLines={2}>
        {t(growsKey(b.id))}
      </Text>
      <Pressable onPress={onLearn} accessibilityRole="button" accessibilityLabel={t(GO_KEY[b.place])} style={({ pressed }) => [styles.cardGo, pressed && styles.cardGoPressed]}>
        <Text style={styles.cardGoText}>{t(GO_KEY[b.place])}</Text>
      </Pressable>
    </View>
  );
});

/** A thin bar of how far a building is toward its next level. */
function Bar({ share, track, rtl }: { share: number; track: string; rtl: boolean }): React.JSX.Element {
  return (
    <View style={[styles.bar, { backgroundColor: track }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: GOLD }, rtl ? { right: 0 } : { left: 0 }]} />
    </View>
  );
}

/** A building's level badge under it, and its thin bar to the next level, the same size on the screen at any zoom; it bounces once as it ticks over. */
function Badge({ id, share, label, left, top, rtl, bounce }: { id: string; share: number; label: string; left: number; top: number; rtl: boolean; bounce: boolean }): React.JSX.Element {
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
    <View style={[styles.badge, { left: left - 30, top }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`kingdom-plot-${id}`}>
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
 * The village's life over the world: the actors near the view only, each of
 * their nodes an animated view placed where the drawing says, moved by one
 * value looping on the native driver through the node's own frames, started
 * where the village's clock says it is. Still under Reduce Motion (each node
 * at its still pose), and held where it is while the screen is out of sight
 * or the app is in the background. The deer, tapped, hops with smiling eyes.
 */
function KingdomLife({ actors, near, dark, scale, still, active, reacting }: { actors: readonly KingdomActor[]; near: { x: number; y: number; w: number; h: number }; dark: boolean; scale: number; still: boolean; active: boolean; reacting: { id: string; tap: KingdomTap } | null }): React.JSX.Element {
  const sprites = spritesFor(dark);
  const laid = useMemo(() => actors.filter((a) => overlaps(kingdomActorReach(a), near)), [actors, near]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="kingdom-life">
      {laid.map((a) => {
        const tap = reacting?.id === a.id ? reacting.tap : null;
        return (
          <Reaction key={a.id} tap={tap} scale={scale}>
            {(turn) => <LifeNode node={a} k={scale} still={still} active={active} sprites={sprites} happy={tap === 'deer'} turn={turn} />}
          </Reaction>
        );
      })}
    </View>
  );
}

/**
 * What a tap makes an actor do, laid round it: the deer and the sheep hop, a
 * hen flutters up, the dog wriggles, a tree shakes; and the turn its head or
 * its wing takes (the cow looking round, the hen's wing beating), handed to
 * the actor to add to that part's own loop.
 */
function Reaction({ tap, scale, children }: { tap: KingdomTap | null; scale: number; children: (turn: { role: 'head' | 'wing'; value: Animated.AnimatedInterpolation<string> } | null) => React.ReactNode }): React.JSX.Element {
  const y = useRef(new Animated.Value(0)).current;
  const x = useRef(new Animated.Value(0)).current;
  const part = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!tap) return;
    const k = scale;
    const to = (v: Animated.Value, value: number, duration: number): Animated.CompositeAnimation => Animated.timing(v, { toValue: value, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    if (tap === 'deer' || tap === 'hop' || tap === 'flutter') {
      Animated.sequence([Animated.timing(y, { toValue: (tap === 'flutter' ? -6 : -5) * k, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.spring(y, { toValue: 0, friction: 3, useNativeDriver: true })]).start();
    }
    if (tap === 'wag' || tap === 'rustle') Animated.sequence([0.8, -0.8, 0.8, -0.8, 0.5, 0].map((v) => to(x, v * k, 100))).start();
    if (tap === 'flutter') Animated.sequence([0, 1, 0, 1, 0, 1, 0].map((v) => to(part, v, 120))).start();
    if (tap === 'turn') Animated.sequence([to(part, 1, 260), Animated.delay(380), to(part, 0, 260)]).start();
  }, [tap, scale, x, y, part]);
  const turn = tap === 'turn' ? { role: 'head' as const, value: part.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-24deg'] }) } : tap === 'flutter' ? { role: 'wing' as const, value: part.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '60deg'] }) } : null;
  return <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: x }, { translateY: y }] }]}>{children(turn)}</Animated.View>;
}

/** What a tap leaves behind it for a moment: a puff of feathers, a leaf falling, a ring on the water. */
function Bit({ kind, x, y, scale }: { kind: 'feathers' | 'leaf' | 'ripple'; x: number; y: number; scale: number }): React.JSX.Element {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: kind === 'leaf' ? 2200 : kind === 'ripple' ? 1200 : 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [kind, t]);
  const k = scale;
  if (kind === 'ripple') {
    return (
      <Animated.View
        pointerEvents="none"
        style={[styles.node, styles.ring, { left: x - 8 * k, top: y - 3 * k, width: 16 * k, height: 6 * k, borderWidth: k, opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.4] }) }] }]}
      />
    );
  }
  if (kind === 'leaf') {
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.node,
          styles.leaf,
          {
            left: x,
            top: y,
            width: 3.2 * k,
            height: 2 * k,
            borderWidth: 0.5 * k,
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 0.35, 0.65, 1], outputRange: [0, 4 * k, -2 * k, 3 * k] }) },
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, 18 * k] }) },
              { rotate: t.interpolate({ inputRange: [0, 0.35, 0.65, 1], outputRange: ['0deg', '60deg', '-30deg', '40deg'] }) },
            ],
          },
        ]}
      />
    );
  }
  const out: [number, number, string][] = [[-7, -6, CREAM], [6, -8, CREAM], [-3, -10, CREAM], [8, -3, '#c8703f'], [-8, -2, '#c8703f']];
  return (
    <>
      {out.map(([dx, dy, colour], i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.node,
            styles.feather,
            {
              left: x - 1.2 * k,
              top: y - 0.7 * k,
              width: 2.4 * k,
              height: 1.4 * k,
              borderWidth: 0.5 * k,
              backgroundColor: colour,
              opacity: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, dx * k, dx * k] }) },
                { translateY: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, dy * k, (dy + 5) * k] }) },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '140deg'] }) },
              ],
            },
          ]}
        />
      ))}
    </>
  );
}

type Pose = Omit<KingdomFrame, 't'>;
type PoseKey = keyof Pose;

type Turn = { role: 'head' | 'wing'; value: Animated.AnimatedInterpolation<string> } | null;

const LifeNode = memo(function LifeNode({ node, k, still, active, sprites, happy, turn }: { node: KingdomNode; k: number; still: boolean; active: boolean; sprites: Record<KingdomSprite, string>; happy: boolean; turn: Turn }): React.JSX.Element {
  const value = useRef(new Animated.Value(0)).current;
  const motion = still || (happy && node.role === 'happy') ? undefined : node.motion;
  useEffect(() => {
    if (!motion || !active) return;
    // start where the village's clock has the loop now, finish this round, then loop from the top
    const at = ((Date.now() - CLOCK) % motion.period) / motion.period;
    value.setValue(at);
    let run: Animated.CompositeAnimation = Animated.timing(value, { toValue: 1, duration: motion.period * (1 - at), easing: Easing.linear, useNativeDriver: true });
    let live = true;
    run.start(({ finished }) => {
      if (!finished || !live) return;
      value.setValue(0);
      run = Animated.loop(Animated.timing(value, { toValue: 1, duration: motion.period, easing: Easing.linear, useNativeDriver: true }));
      run.start();
    });
    return () => {
      live = false;
      run.stop();
    };
  }, [motion, active, value]);
  const moving = useMemo(() => {
    if (!motion) return poseStyle(happy && node.role === 'happy' ? { ...node.still, o: 1 } : node.still, k);
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
  }, [motion, node.still, node.role, happy, k, value]);
  // a tap's turn of the head or the wing, on top of the part's own loop
  const turned = turn && node.role === turn.role ? { ...(moving as { opacity: unknown; transform: unknown[] }), transform: [...(moving as { transform: unknown[] }).transform, { rotate: turn.value }] } : moving;
  const { box, origin } = node;
  return (
    <Animated.View
      style={[
        styles.node,
        { left: box.x * k, top: box.y * k, width: box.w * k, height: box.h * k, transformOrigin: `${origin[0] * 100}% ${origin[1] * 100}%` },
        node.clip ? { overflow: 'hidden' } : null,
        turned as object,
      ]}
    >
      {node.sprite ? <SvgXml xml={sprites[node.sprite]} width={box.w * k} height={box.h * k} /> : null}
      {node.children?.map((c, i) => <LifeNode key={i} node={c} k={k} still={still} active={active} sprites={sprites} happy={happy} turn={turn} />)}
    </Animated.View>
  );
});

/** A still pose as a style, translation in points. */
function poseStyle(p: Pose, k: number): { opacity: number; transform: Record<string, number | string>[] } {
  return { opacity: p.o, transform: [{ translateX: p.x * k }, { translateY: p.y * k }, { rotate: `${p.r}deg` }, { scaleX: p.sx }, { scaleY: p.sy }] };
}

/** A tapped building's squash and bounce: a copy laid over it that only ever grows, so the one under it never shows round its edge. */
function Bounce({ building, level, rising, dark, scale }: { building: KingdomBuilding; level: KingdomLevel; rising: boolean; dark: boolean; scale: number }): React.JSX.Element {
  const art = useMemo(() => kingdomPlotSvg({ building, level, rising: rising && level < 5, dark }), [building, level, rising, dark]);
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: BOUNCE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);
  const box = kingdomPlotBox(building);
  const w = box.w * scale;
  const h = box.h * scale;
  return (
    <Animated.View
      style={[
        styles.node,
        {
          left: box.x * scale,
          top: box.y * scale,
          width: w,
          height: h,
          transformOrigin: '50% 82%',
          transform: [{ scaleX: t.interpolate({ inputRange: [0, 0.28, 0.55, 0.78, 1], outputRange: [1, 1.14, 1, 1.04, 1] }) }, { scaleY: t.interpolate({ inputRange: [0, 0.28, 0.55, 0.78, 1], outputRange: [1, 1, 1.12, 1, 1] }) }],
        },
      ]}
      pointerEvents="none"
    >
      <SvgXml xml={art} width={w} height={h} />
    </Animated.View>
  );
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
 * shakes, dust rises, the scaffolding falls away, and the new stage drops in
 * from above and lands with a squash and a stretch as sparkles fly off it.
 * Drawn over a scene that leaves the building off its plot; every value runs
 * on the native driver.
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
    const all = Animated.parallel([timing(shake, 700, 150, Easing.linear), timing(dust, 1100, 600), timing(drop, 500, 800, Easing.in(Easing.quad)), timing(pop, 900, 1050, Easing.linear), timing(spark, 900, 1350)]);
    all.start();
    return () => all.stop();
  }, [shake, drop, pop, dust, spark]);
  const box = kingdomPlotBox(upgrade.building);
  const w = box.w * scale;
  const h = box.h * scale;
  const wobble = shake.interpolate({ inputRange: [0, 0.2, 0.45, 0.7, 1], outputRange: ['0deg', '-1.6deg', '1.4deg', '-0.9deg', '0deg'] });
  const layer = { position: 'absolute' as const, left: 0, top: 0, width: w, height: h, transformOrigin: '50% 82%' };
  return (
    <View style={[styles.node, { left: box.x * scale, top: box.y * scale, width: w, height: h }]} pointerEvents="none" testID="kingdom-raise">
      <Animated.View style={[layer, { opacity: pop.interpolate({ inputRange: [0, 0.01, 1], outputRange: [1, 0, 0] }), transform: [{ rotate: wobble }] }]}>
        <SvgXml xml={art.old} width={w} height={h} />
      </Animated.View>
      <Animated.View style={[layer, { opacity: drop.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [0, h * 0.18] }) }, { rotate: wobble }] }]}>
        <SvgXml xml={art.scaffold} width={w} height={h} />
      </Animated.View>
      <Animated.View
        style={[
          layer,
          {
            opacity: pop.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 1] }),
            transform: [
              { translateY: pop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [-h * 0.38, 0, 0] }) },
              { scaleX: pop.interpolate({ inputRange: [0, 0.3, 0.5, 0.7, 0.85, 1], outputRange: [0.92, 1.16, 0.94, 1.04, 0.99, 1] }) },
              { scaleY: pop.interpolate({ inputRange: [0, 0.3, 0.5, 0.7, 0.85, 1], outputRange: [1.08, 0.78, 1.1, 0.97, 1.01, 1] }) },
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
            left: w * 0.04,
            top: h * 0.58,
            width: w * 0.92,
            height: h * 0.38,
            transformOrigin: '50% 100%',
            opacity: dust.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }),
            transform: [{ translateY: dust.interpolate({ inputRange: [0, 1], outputRange: [0, -h * 0.05] }) }, { scaleX: dust.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.3] }) }, { scaleY: dust.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] }) }],
          },
        ]}
      >
        <SvgXml xml={art.dust} width={w * 0.92} height={h * 0.38} />
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
                width: w * 0.09,
                height: w * 0.09,
                opacity: spark.interpolate({ inputRange: [0, start, Math.min(1, start + 0.24), Math.min(1, start + 0.8)], outputRange: [0, 0, 1, 0], extrapolate: 'clamp' }),
                transform: [{ translateX: at(dx * w) }, { translateY: at(dy * h) }],
              },
            ]}
          >
            <SvgXml xml={art.sparkle} width={w * 0.09} height={w * 0.09} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { paddingHorizontal: layout.gutter, gap: spacing.sm, maxWidth: layout.column + layout.gutter * 2, width: '100%', alignSelf: 'center' },
  stage: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  world: { position: 'absolute', left: 0, top: 0, transformOrigin: '0% 0%' },
  drawn: { position: 'absolute', left: 0, top: 0, transformOrigin: '0% 0%' },
  node: { position: 'absolute' },
  hud: { position: 'absolute', left: 10, right: 10, alignItems: 'center', gap: 8 },
  hudRow: { alignItems: 'center', gap: 8 },
  back: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 2.5,
    borderBottomWidth: 4,
    borderColor: INK,
    backgroundColor: CREAM,
  },
  // the title is said, not shown: the bar's room goes to the level and the Zêr
  hudTitle: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  level: { alignItems: 'center' },
  levelBadge: { zIndex: 1, width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, borderWidth: 3, borderBottomWidth: 5, borderColor: INK, backgroundColor: SAFFRON },
  levelText: { color: INK, fontSize: 21, fontWeight: '900', fontVariant: ['tabular-nums'] },
  levelBar: { width: 72, height: 20, marginStart: -10, borderRadius: radii.pill, borderWidth: 2.5, borderBottomWidth: 4, borderColor: INK, backgroundColor: CREAM_EDGE, overflow: 'hidden' },
  levelFill: { position: 'absolute', top: 0, bottom: 0, backgroundColor: GOLD },
  chip: {
    height: 40,
    alignItems: 'center',
    gap: 6,
    marginStart: 'auto',
    paddingStart: 8,
    paddingEnd: 12,
    borderRadius: radii.pill,
    borderWidth: 2.5,
    borderBottomWidth: 4,
    borderColor: INK,
    backgroundColor: CREAM,
  },
  chipText: { color: INK, fontSize: typography.sizes.md, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  controls: { position: 'absolute', gap: 8 },
  round: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, borderWidth: 2.5, borderBottomWidth: 4, borderColor: INK, backgroundColor: CREAM },
  roundPressed: { borderBottomWidth: 2.5, transform: [{ translateY: 1.5 }] },
  minus: { width: 16, height: 3, borderRadius: radii.pill, backgroundColor: INK },
  badge: { position: 'absolute', width: 60, alignItems: 'center', gap: 2 },
  badgePill: { paddingHorizontal: 9, paddingTop: 1, paddingBottom: 2, borderRadius: radii.pill, borderWidth: 2, borderBottomWidth: 3, borderColor: INK, backgroundColor: CREAM },
  badgeText: { color: INK, fontSize: 13, fontWeight: typography.weights.bold },
  badgeBar: { width: 44, height: 8, borderRadius: radii.pill, borderWidth: 1.5, borderColor: INK, backgroundColor: CREAM_EDGE, overflow: 'hidden' },
  badgeFill: { position: 'absolute', top: 0, bottom: 0, backgroundColor: GOLD },
  bubble: { position: 'absolute', alignItems: 'center' },
  ring: { borderColor: 'rgba(255,255,255,0.9)', borderRadius: radii.pill },
  leaf: { borderColor: INK, backgroundColor: '#6fae3e', borderTopLeftRadius: radii.pill, borderBottomRightRadius: radii.pill },
  feather: { borderColor: INK, borderRadius: radii.pill },
  bubbleText: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radii.md, borderWidth: 2.5, borderColor: INK, backgroundColor: CREAM, color: INK, fontSize: 15, fontWeight: '800', overflow: 'hidden' },
  tray: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, borderTopWidth: 3, borderColor: INK, backgroundColor: CREAM_2 },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  cards: { gap: 10, paddingHorizontal: 12 },
  card: { width: 214, gap: 4, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 9, borderRadius: radii.lg, borderWidth: 2.5, borderBottomWidth: 4, borderColor: INK, backgroundColor: CREAM },
  cardReady: { borderColor: '#c98a14' },
  cardFace: { alignItems: 'center', gap: 8, minHeight: MIN_TOUCH_TARGET },
  cardHead: { flex: 1, gap: 4 },
  cardName: { color: INK, fontSize: 16, fontWeight: '800' },
  cardState: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingTop: 1, paddingBottom: 2, borderRadius: radii.pill, borderWidth: 2, borderColor: INK, backgroundColor: CREAM_2 },
  cardStateText: { color: INK, fontSize: 12, fontWeight: '800' },
  cardBar: { height: 8, borderRadius: radii.pill, borderWidth: 1.5, borderColor: INK, backgroundColor: CREAM_EDGE, overflow: 'hidden' },
  cardFill: { position: 'absolute', top: 0, bottom: 0, backgroundColor: GOLD },
  cardNext: { color: INK, fontSize: 12, fontWeight: '700' },
  cardGrows: { color: INK, opacity: 0.82, fontSize: 12, lineHeight: 16, minHeight: 32 },
  cardGo: { minHeight: 36, alignItems: 'center', justifyContent: 'center', marginTop: 2, borderRadius: radii.md, borderWidth: 2.5, borderBottomWidth: 4, borderColor: INK, backgroundColor: GREEN },
  cardGoPressed: { borderBottomWidth: 2.5, transform: [{ translateY: 1.5 }] },
  cardGoText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  intro: {
    position: 'absolute',
    left: 12,
    right: 12,
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
  pressed: { opacity: 0.7 },
  bar: { height: 6, borderRadius: radii.pill, overflow: 'hidden', alignSelf: 'stretch' },
  barFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: radii.pill },
  sheet: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.md },
  sheetLevel: { fontSize: typography.sizes.sm },
  sheetHeading: { ...sectionLabel, alignSelf: 'stretch', marginTop: spacing.sm },
  sheetText: { fontSize: typography.sizes.md, alignSelf: 'stretch' },
  sheetNext: { fontSize: typography.sizes.sm, alignSelf: 'stretch' },
});
