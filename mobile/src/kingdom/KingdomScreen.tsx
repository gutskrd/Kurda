import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import {
  KINGDOM_PLOTS,
  KINGDOM_SCENE,
  kingdomBuildingSvg,
  kingdomLevels,
  kingdomLife,
  kingdomLifeSvg,
  kingdomProgress,
  kingdomSceneSvg,
  type KingdomBuilding,
  type KingdomBuildingView,
  type KingdomLifeSpot,
  type KingdomPlace,
  type KingdomUpgrade,
  type KingdomView,
} from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
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

/**
 * Kurdish Kingdom on the phone: the learner's mountain village, each building
 * at the level their own learning raised it to (GET /kingdom; nothing is
 * counted here).
 *
 * The scene is one drawing (shared art/kingdom.ts) with a pressable laid over
 * each building, which opens its sheet: its level, what built it, what grows
 * it next and a button to that part of Learn. The six are listed under the
 * scene as well, for a screen reader and for anyone who would rather read
 * than look. Smoke rises from the chimneys, light moves on the spring and a
 * leaf stirs in the orchard, all of it still under Reduce Motion.
 *
 * A level reached since the last visit is celebrated once, one at a time, with
 * the buzz as it lands, and marked seen as it is put away. The first visit
 * opens with the one sentence on how the village grows, quietly.
 */
export function KingdomScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { width: screen } = useWindowDimensions();
  const bottom = useScreenBottomInset(spacing.lg);
  const [view, setView] = useState<KingdomView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<KingdomBuilding | null>(null);
  const [queue, setQueue] = useState<KingdomUpgrade[]>([]);
  const [introShown, setIntroShown] = useState(true);
  const dark = scheme === 'dark';

  useEffect(() => {
    let live = true;
    setStatus('loading');
    void client.get<KingdomView>('/kingdom').then((res) => {
      if (!live) return;
      if (res.ok) {
        setView(res.data);
        setQueue(res.data.celebrate);
        setIntroShown(res.data.intro !== null);
      }
      setStatus(res.ok ? 'ready' : 'failed');
    });
    return () => {
      live = false;
    };
  }, [client, attempt]);

  const levels = useMemo(() => (view ? kingdomLevels(view.buildings) : null), [view]);
  // a window not measured yet (the first frame, a test) still gets a scene of a phone's width
  const sceneWidth = Math.min(Math.max(screen, 360) - layout.gutter * 2, layout.column);
  const sceneHeight = (sceneWidth * KINGDOM_SCENE.height) / KINGDOM_SCENE.width;
  const scene = useMemo(() => (levels ? kingdomSceneSvg({ levels, dark, width: sceneWidth, title: t('kingdom.title') }) : null), [levels, dark, sceneWidth, t]);
  const number = useCallback((v: number) => new Intl.NumberFormat(locale).format(v), [locale]);

  const levelText = (b: KingdomBuildingView): string => (b.level === 0 ? t('kingdom.empty') : t('kingdom.levelOf', { level: b.level }));
  const openBuilding = view?.buildings.find((b) => b.id === open) ?? null;
  const current = introShown ? undefined : queue[0];

  const dismissIntro = (): void => {
    setIntroShown(false);
    void client.post('/kingdom/seen', { intro: true });
  };
  const celebrated = (u: KingdomUpgrade): void => {
    void client.post('/kingdom/seen', { levels: [{ building: u.building, level: u.level }] });
    setQueue((q) => q.slice(1));
  };

  let body: React.ReactNode;
  if (status === 'failed' && !view) {
    body = <ErrorRetry onRetry={() => setAttempt((n) => n + 1)} />;
  } else if (!view || !scene || !levels) {
    body = <Skeleton height={sceneHeight} radius={radii.xl} />;
  } else {
    body = (
      <>
        {introShown && view.intro ? (
          <View style={[styles.intro, { backgroundColor: colors.surface }]} testID="kingdom-intro">
            <Text style={[styles.introText, dir.text, { color: colors.textPrimary }]}>{t('kingdom.intro')}</Text>
            {view.intro.levels > 0 ? (
              <Text style={[styles.introBuilt, dir.text, { color: colors.textSecondary }]}>
                {view.intro.zer > 0 ? `${t('kingdom.intro.built')} ${t('kingdom.celebrate.zer', { zer: number(view.intro.zer) })}` : t('kingdom.intro.built')}
              </Text>
            ) : null}
            <ClayButton label={t('kingdom.intro.go')} tone="primary" onPress={dismissIntro} />
          </View>
        ) : null}

        <View style={[styles.scene, { width: sceneWidth, height: sceneHeight }]} testID="kingdom-scene">
          <SvgXml xml={scene} width={sceneWidth} height={sceneHeight} />
          <KingdomLife levels={levels} width={sceneWidth} />
          {view.buildings.map((b) => {
            const box = KINGDOM_PLOTS[b.id].box;
            const k = sceneWidth / KINGDOM_SCENE.width;
            return (
              <Pressable
                key={b.id}
                onPress={() => setOpen(b.id)}
                accessibilityRole="button"
                accessibilityLabel={`${t(buildingNameKey(b.id))}, ${levelText(b)}`}
                testID={`kingdom-plot-${b.id}`}
                style={({ pressed }) => [
                  styles.plot,
                  { left: box.x * k, top: box.y * k, width: box.w * k, height: box.h * k },
                  pressed && { backgroundColor: 'rgba(255,255,255,0.18)' },
                ]}
              />
            );
          })}
        </View>

        <View style={styles.list}>
          {view.buildings.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => setOpen(b.id)}
              accessibilityRole="button"
              accessibilityLabel={`${t(buildingNameKey(b.id))}, ${levelText(b)}`}
              testID={`kingdom-row-${b.id}`}
              style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, flexDirection: dir.row }, pressed && styles.pressed]}
            >
              <SvgXml xml={kingdomBuildingSvg({ building: b.id, level: b.level, size: 48, dark, idPrefix: `kgrow${b.id}` })} width={48} height={48} />
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
        <ScreenHeader title={t('kingdom.title')} onBack={onExit} backLabel={t('common.back')} />
        <ScrollView style={styles.screen} contentContainerStyle={[styles.column, { paddingBottom: bottom }]}>
          {body}
        </ScrollView>
      </View>

      <BottomSheet visible={openBuilding !== null} onClose={() => setOpen(null)} title={openBuilding ? t(buildingNameKey(openBuilding.id)) : undefined} testID="kingdom-sheet">
        {openBuilding ? (
          <View style={styles.sheet}>
            <SvgXml xml={kingdomBuildingSvg({ building: openBuilding.id, level: openBuilding.level, size: 132, dark, idPrefix: `kgsheet${openBuilding.id}` })} width={132} height={132} />
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

      {current ? (
        <Celebration
          key={`${current.building}:${current.level}`}
          art={<SvgXml xml={kingdomBuildingSvg({ building: current.building, level: current.level, size: 168, title: t(buildingNameKey(current.building)) })} width={168} height={168} />}
          glow={GOLD}
          flecks={FLECKS.badge}
          fleckColours={[GOLD_LIGHT, GOLD, '#ffffff']}
          seed={current.level * 31 + current.building.length}
          kicker={t('kingdom.celebrate.kicker')}
          title={t('kingdom.celebrate.title', { building: t(buildingNameKey(current.building)), level: current.level })}
          detail={current.zer > 0 ? t('kingdom.celebrate.zer', { zer: number(current.zer) }) : null}
          note={t(growsKey(current.building))}
          announce={`${t('kingdom.celebrate.kicker')}: ${t('kingdom.celebrate.title', { building: t(buildingNameKey(current.building)), level: current.level })}`}
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

/**
 * The village's life over the drawing: each puff, glint and leaf a small
 * sprite where the drawing says, moved in a slow loop. Nothing at all under
 * Reduce Motion.
 */
function KingdomLife({ levels, width }: { levels: ReturnType<typeof kingdomLevels>; width: number }): React.JSX.Element | null {
  const reduce = useReducedMotion();
  const spots = useMemo(() => kingdomLife(levels), [levels]);
  if (reduce) return null;
  const k = width / KINGDOM_SCENE.width;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {spots.map((s, i) => (
        <LifeSprite key={`${s.building}${i}`} spot={s} k={k} delay={(i * 700) % 3000} />
      ))}
    </View>
  );
}

const SPRITES = { smoke: kingdomLifeSvg('smoke'), water: kingdomLifeSvg('water'), leaf: kingdomLifeSvg('leaf') };
const PERIOD: Readonly<Record<KingdomLifeSpot['kind'], number>> = { smoke: 4800, water: 2600, leaf: 3400 };

function LifeSprite({ spot, k, delay }: { spot: KingdomLifeSpot; k: number; delay: number }): React.JSX.Element {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: PERIOD[spot.kind], easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: spot.kind === 'smoke' ? 0 : PERIOD[spot.kind], easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, delay, spot.kind]);
  const size = spot.size * k;
  const style =
    spot.kind === 'smoke'
      ? { opacity: t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.85, 0] }), transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.6] }) }] }
      : spot.kind === 'water'
        ? { opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.95] }), transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.06, size * 0.06] }) }] }
        : { transform: [{ rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '8deg'] }) }] };
  return (
    <Animated.View style={[styles.sprite, { left: spot.x * k - size / 2, top: spot.y * k - size / 2, width: size, height: size }, style]}>
      <SvgXml xml={SPRITES[spot.kind]} width={size} height={size} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, gap: spacing.md, maxWidth: layout.column + layout.gutter * 2, width: '100%', alignSelf: 'center' },
  intro: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  introText: { fontSize: typography.sizes.md, lineHeight: 22 },
  introBuilt: { fontSize: typography.sizes.sm },
  scene: { alignSelf: 'center', borderRadius: radii.xl, overflow: 'hidden' },
  plot: { position: 'absolute', borderRadius: radii.lg, minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET },
  sprite: { position: 'absolute' },
  list: { gap: spacing.sm },
  row: { alignItems: 'center', gap: spacing.md - 4, minHeight: MIN_TOUCH_TARGET + 20, borderRadius: radii.md, paddingHorizontal: spacing.md - 4, paddingVertical: spacing.sm },
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
