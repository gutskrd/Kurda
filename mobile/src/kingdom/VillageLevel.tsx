import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { VILLAGE_LEVELS, kingdomSpriteSvg, type VillageFeature, type VillageStanding } from '@kurda/shared';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { radii } from '../theme/tokens';

/**
 * The village's own level on the phone: the badge and bar in the top bar with
 * a hint of what comes next, the list of every level and what it brings, the
 * banner and sparkle of a level just reached, and the memory, on this device,
 * of the last level the learner was shown.
 */

const INK = '#4a2a1a';
const CREAM = '#fff7e6';
const CREAM_2 = '#f6e8cc';
const CREAM_EDGE = '#e7d3ae';
const SAFFRON = '#ffd36b';
const GOLD = '#f2b632';
const GREEN = '#3fa45b';

type Translate = ReturnType<typeof useI18n>['t'];
const unlockKey = (f: VillageFeature): TranslationKey => `kingdom.unlock.${f}` as TranslationKey;

/** What a level brings, in words. */
export function unlockText(t: Translate, unlocks: readonly VillageFeature[]): string {
  return unlocks.map((f) => t(unlockKey(f))).join(' · ');
}

/**
 * The last village level this learner was shown on this device (null while it
 * is read), kept so a level-up is celebrated once. A device that has never
 * shown the village starts at the level the village stands at now, so a new
 * device does not replay old levels; storage that fails only means nothing is
 * celebrated there.
 */
export function useVillageSeen(user: string | null, level: number, store: DeviceStore = deviceStore): { seen: number | null; markSeen: (level: number) => void } {
  const key = `village.seen.${user ?? 'guest'}`;
  const [seen, setSeen] = useState<number | null>(null);
  const first = useRef(level);
  useEffect(() => {
    let live = true;
    void store.get(key).then((kept) => {
      if (!live) return;
      const n = Number(kept);
      if (kept !== null && Number.isInteger(n) && n >= 1) setSeen(Math.min(n, Math.max(first.current, 1)));
      else {
        setSeen(first.current);
        void store.set(key, String(first.current));
      }
    });
    return () => {
      live = false;
    };
  }, [key, store]);
  const markSeen = useCallback(
    (l: number) => {
      setSeen(l);
      void store.set(key, String(l));
    },
    [key, store],
  );
  return { seen, markSeen };
}

/** The badge in the top bar: the level on a saffron shield, a bar to the next, and what the next brings; a tap opens the levels. */
export function LevelBadge({ standing, shown, bump, onOpen }: { standing: VillageStanding; shown: number; bump: boolean; onOpen: () => void }): React.JSX.Element {
  const { t, locale } = useI18n();
  const dir = useDirection();
  const number = (v: number): string => new Intl.NumberFormat(locale).format(v);
  const behind = shown < standing.level;
  const share = behind ? 1 : standing.share;
  const next = behind ? VILLAGE_LEVELS[shown] : standing.next;
  const hint = next ? t('kingdom.village.next', { thing: t(unlockKey(next.unlocks[0]!)) }) : t('kingdom.village.top');
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(share);
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!bump) return;
    pop.setValue(1);
    Animated.sequence([Animated.timing(pop, { toValue: 1.4, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true })]).start();
  }, [bump, pop]);
  return (
    <Pressable
      onPress={onOpen}
      style={[styles.level, { flexDirection: dir.row }]}
      accessibilityRole="button"
      accessibilityLabel={`${t('kingdom.village.level', { level: number(shown) })}. ${next ? t('kingdom.village.bar', { percent, level: number(next.level) }) : ''} ${hint}`}
      testID="kingdom-levels"
    >
      <Animated.View style={[styles.badge, { transform: [{ rotate: '-4deg' }, { scale: pop }] }]}>
        <Text style={styles.badgeText}>{number(shown)}</Text>
      </Animated.View>
      <View style={styles.board}>
        <View style={styles.bar}>
          <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }, dir.row === 'row-reverse' ? { right: 0 } : { left: 0 }]} />
        </View>
        <Text style={[styles.next, dir.text]} numberOfLines={1}>
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}

/** Every level: those reached ticked, the next one lit, the rest still to come as silhouettes; and how the village earns its experience. */
export function LevelList({ level, textColor }: { level: number; textColor: string }): React.JSX.Element {
  const { t, locale } = useI18n();
  const dir = useDirection();
  const number = (v: number): string => new Intl.NumberFormat(locale).format(v);
  return (
    <View style={styles.list} testID="kingdom-level-list">
      <Text style={[styles.how, dir.text, { color: textColor }]}>{t('kingdom.village.how')}</Text>
      {VILLAGE_LEVELS.map((l) => {
        const state = l.level <= level ? 'reached' : l.level === level + 1 ? 'next' : 'later';
        return (
          <View
            key={l.level}
            style={[styles.row, { flexDirection: dir.row }, state === 'next' ? styles.rowNext : state === 'later' ? styles.rowLater : null]}
            accessible
            accessibilityLabel={`${t('kingdom.village.level', { level: number(l.level) })}: ${state === 'later' ? t('kingdom.village.locked') : `${unlockText(t, l.unlocks)}${state === 'reached' ? `, ${t('kingdom.village.reached')}` : ''}`}`}
            testID={`kingdom-level-${l.level}-${state}`}
          >
            <View style={[styles.n, state === 'reached' ? { backgroundColor: GREEN } : null]}>
              <Text style={[styles.nText, state === 'reached' ? { color: '#fff' } : null]}>{state === 'reached' ? '✓' : number(l.level)}</Text>
            </View>
            <View style={styles.what}>
              <Text style={[styles.whatLevel, dir.text]}>{t('kingdom.village.level', { level: number(l.level) })}</Text>
              {state === 'later' ? (
                <View style={[styles.silhouette, { flexDirection: dir.row }]}>
                  {l.unlocks.map((f) => (
                    <View key={f} style={styles.shape} />
                  ))}
                </View>
              ) : (
                <Text style={[styles.unlock, dir.text]}>{unlockText(t, l.unlocks)}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The banner of a level just reached, over the village while the camera shows what it brought. */
export function LevelUp({ level, unlocks, top }: { level: number; unlocks: readonly VillageFeature[]; top: number }): React.JSX.Element {
  const { t, locale } = useI18n();
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(grow, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  }, [grow]);
  return (
    <Animated.View style={[styles.banner, { top, opacity: grow, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]} accessibilityLiveRegion="polite" accessibilityRole="alert" testID="kingdom-levelup">
      <Text style={styles.bannerKicker}>{t('kingdom.celebrate.kicker')}</Text>
      <Text style={styles.bannerTitle}>{t('kingdom.village.level', { level: new Intl.NumberFormat(locale).format(level) })}</Text>
      <Text style={styles.bannerNew}>{t('kingdom.village.new', { thing: unlockText(t, unlocks) })}</Text>
    </Animated.View>
  );
}

const SPARKLE = kingdomSpriteSvg('sparkle');
const BURST: readonly [number, number, number][] = [
  [-38, -32, 0],
  [36, -38, 80],
  [50, -6, 160],
  [-52, 3, 120],
  [-18, -52, 220],
  [18, -58, 40],
  [30, 18, 260],
  [-32, 20, 300],
];
/** A sparkle's size, and the ring's, in canvas units. */
const SPARK = 14;

/** The sparkle where what a new level brought appears, and a ring popping out from it; `k` points to the canvas unit. */
export function Sparkles({ x, y, k }: { x: number; y: number; k: number }): React.JSX.Element {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1700, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill]}>
      <Animated.View
        style={[
          styles.ring,
          { left: x - 40 * k, top: y - 24 * k, width: 80 * k, height: 48 * k, borderWidth: 3 * k, opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] }), transform: [{ scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 1.6, 1.6] }) }] },
        ]}
      />
      {BURST.map(([dx, dy, delay], i) => {
        const s = delay / 1700;
        const local = t.interpolate({ inputRange: [0, s, Math.min(1, s + 0.8), 1], outputRange: [0, 0, 1, 1] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: x - (SPARK / 2) * k,
              top: y - (SPARK / 2) * k,
              width: SPARK * k,
              height: SPARK * k,
              opacity: local.interpolate({ inputRange: [0, 0.01, 0.25, 1], outputRange: [0, 0.3, 1, 0] }),
              transform: [
                { translateX: local.interpolate({ inputRange: [0, 1], outputRange: [0, dx * k] }) },
                { translateY: local.interpolate({ inputRange: [0, 1], outputRange: [0, dy * k] }) },
                { scale: local.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.3, 1.3, 0.6] }) },
                { rotate: local.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '120deg'] }) },
              ],
            }}
          >
            <SvgXml xml={SPARKLE} width={SPARK * k} height={SPARK * k} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  level: { alignItems: 'center', flexShrink: 1, minWidth: 0 },
  badge: { zIndex: 1, width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, borderWidth: 3, borderBottomWidth: 5, borderColor: INK, backgroundColor: SAFFRON },
  badgeText: { color: INK, fontSize: 21, fontWeight: '900', fontVariant: ['tabular-nums'] },
  board: { flexShrink: 1, minWidth: 96, maxWidth: 176, gap: 3, marginStart: -12, paddingStart: 18, paddingEnd: 10, paddingTop: 5, paddingBottom: 6, borderRadius: radii.md, borderWidth: 2.5, borderBottomWidth: 4, borderColor: INK, backgroundColor: CREAM },
  bar: { height: 11, borderRadius: radii.pill, borderWidth: 1.5, borderColor: INK, backgroundColor: CREAM_EDGE, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, backgroundColor: GOLD },
  next: { color: INK, fontSize: 12, fontWeight: '800' },
  list: { gap: 6 },
  how: { fontSize: 15, lineHeight: 21, marginBottom: 8 },
  row: { alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md, borderWidth: 2, borderColor: CREAM_EDGE, backgroundColor: CREAM },
  rowNext: { borderColor: INK, borderBottomWidth: 4, backgroundColor: SAFFRON },
  rowLater: { backgroundColor: CREAM_2 },
  n: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, borderWidth: 2, borderColor: INK, backgroundColor: CREAM },
  nText: { color: INK, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  what: { flex: 1, gap: 2 },
  whatLevel: { color: INK, fontSize: 12, fontWeight: '800', opacity: 0.75 },
  unlock: { color: INK, fontSize: 15, fontWeight: '800' },
  silhouette: { gap: 6, paddingVertical: 3 },
  shape: { width: 54, height: 12, borderRadius: radii.pill, backgroundColor: INK, opacity: 0.28 },
  banner: { position: 'absolute', alignSelf: 'center', alignItems: 'center', maxWidth: '90%', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 12, borderRadius: radii.lg, borderWidth: 3, borderBottomWidth: 5, borderColor: INK, backgroundColor: CREAM },
  bannerKicker: { color: INK, fontSize: 13, fontWeight: '800', opacity: 0.75 },
  bannerTitle: { color: INK, fontSize: 24, fontWeight: '900' },
  bannerNew: { color: INK, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  ring: { position: 'absolute', borderColor: '#ffffff', borderRadius: radii.pill },
});
