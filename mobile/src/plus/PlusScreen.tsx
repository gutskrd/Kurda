import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MEMBERS_BOX_FREE_GIFTS,
  MEMBERS_BOX_ZER,
  PLUS_HERO_VIEW,
  PLUS_PLANS,
  formatEuros,
  planMonthlyCents,
  planSavingPercent,
  plusHeroFigure,
  plusHeroSky,
  plusHeroSparkles,
  type PlusPlan,
  type PlusPlanId,
} from '@kurda/shared';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useAuth } from '../auth/AuthContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useDirection } from '../reports/direction';
import { Pressable } from '../theme/Pressable';
import { Icon, type IconName } from '../theme/Icon';
import { PlusButton } from '../theme/PlusButton';
import { HeaderButton } from '../navigation/HeaderButton';
import { display } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { openLegal } from '../legal/links';

const MONTHLY = PLUS_PLANS.find((p) => p.id === 'monthly')!;
const FAMILY_PEOPLE = PLUS_PLANS.find((p) => p.id === 'family')!.people;

/**
 * The Hevalo+ page, matching the website's: the deer under a warm sky, what members get today, the three plans with the
 * price each one bills standing largest, and the gold button with the renewal terms, restore and the legal links
 * beneath it. Nothing is sold until the stores are connected, so the button says so. A child's profile never sees it.
 */
export function PlusScreen({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const dir = useDirection();
  const [chosen, setChosen] = useState<PlusPlanId>('yearly');
  const [told, setTold] = useState(false);
  const child = user?.kind === 'child';
  useEffect(() => {
    if (child) onClose();
  }, [child, onClose]);
  if (child) return null;

  const price = (cents: number): string => formatEuros(cents, locale);
  const perks: { icon: IconName; text: string }[] = [
    { icon: 'gift', text: t('plus.perk.box', { zer: MEMBERS_BOX_ZER, gifts: MEMBERS_BOX_FREE_GIFTS }) },
    { icon: 'sparkle', text: t('plus.perk.earn') },
    { icon: 'ice', text: t('plus.perk.streak') },
    { icon: 'palette', text: t('plus.perk.looks') },
    { icon: 'people', text: t('plus.perk.family', { count: FAMILY_PEOPLE }) },
  ];
  const gold = scheme === 'dark' ? colors.gold : colors.goldText;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        <Hero dark={scheme === 'dark'} />
        <View style={[styles.body, dir.text]}>
          <View style={styles.head}>
            <View style={[styles.wordmark, { flexDirection: dir.row }]}>
              <Icon name="crown" size={28} color={gold} />
              <Text style={[styles.wordmarkText, { color: gold }]} accessibilityRole="header">
                {t('profile.premium')}
              </Text>
            </View>
            <Text style={[styles.promise, { color: colors.textSecondary }]}>{t('plus.promise')}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.separator }]}>
            {perks.map((perk) => (
              <View key={perk.icon} style={[styles.perk, { flexDirection: dir.row }]}>
                <View style={[styles.perkIcon, { backgroundColor: `${colors.gold}29` }]}>
                  <Icon name={perk.icon} size={20} color={gold} />
                </View>
                <Text style={[styles.perkText, dir.text, { color: colors.textPrimary }]}>{perk.text}</Text>
              </View>
            ))}
            <Rim />
          </View>

          <View accessibilityRole="radiogroup" accessibilityLabel={t('plus.choosePlan')} style={styles.plans}>
            {PLUS_PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} chosen={plan.id === chosen} onChoose={() => setChosen(plan.id)} price={price} t={t} />
            ))}
          </View>

          <PlusButton label={t('plus.cta')} onJoin={() => setTold(true)} />
          {told ? (
            <Text accessibilityLiveRegion="polite" style={[styles.told, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}>
              {t('plus.notYet')}
            </Text>
          ) : null}
          <Text style={[styles.fine, { color: colors.textSecondary }]}>{t('plus.renews')}</Text>
          <FineLink label={t('plus.restore')} onPress={() => setTold(true)} />
          <View style={[styles.links, { flexDirection: dir.row }]}>
            <FineLink label={t('auth.legal.terms')} onPress={() => openLegal('terms')} />
            <Text style={[styles.dot, { color: colors.textSecondary }]}>·</Text>
            <FineLink label={t('auth.legal.privacy')} onPress={() => openLegal('privacy')} />
          </View>
        </View>
      </ScrollView>
      <View style={[styles.close, { top: insets.top + spacing.sm, [dir.rtl ? 'left' : 'right']: spacing.md }]}>
        <HeaderButton icon="close" label={t('common.close')} onPress={onClose} testID="plus-close" />
      </View>
    </View>
  );
}

/** The deer under the sky, floating a little, with sparkles that twinkle; all still under Reduce Motion. */
function Hero({ dark }: { dark: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const alive = useMotionAlive();
  const float = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;
  const art = useMemo(() => ({ sky: plusHeroSky({ dark, idPrefix: 'plus-screen-sky' }), figure: plusHeroFigure({ idPrefix: 'plus-screen-deer' }), sparkles: plusHeroSparkles({ dark }) }), [dark]);
  useEffect(() => {
    if (reduce || !alive) {
      float.setValue(0);
      twinkle.setValue(0);
      return;
    }
    const wave = (value: Animated.Value, ms: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
          Animated.timing(value, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        ]),
      );
    const loops = Animated.parallel([wave(float, 2600), wave(twinkle, 1700)]);
    loops.start();
    return () => loops.stop();
  }, [reduce, alive, float, twinkle]);
  const layer = (xml: string) => <SvgXml xml={xml} width="100%" height="100%" />;
  return (
    <View style={styles.hero} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={StyleSheet.absoluteFill}>{layer(art.sky)}</View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }]}>
        {layer(art.figure)}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) }]}>{layer(art.sparkles)}</Animated.View>
      {/* The picture melts into the page instead of ending at an edge. */}
      <LinearGradient colors={[`${colors.background}00`, colors.background]} style={styles.heroFade} pointerEvents="none" />
    </View>
  );
}

/** One plan to choose: what it bills, standing largest, then what that is a month, its saving or the people it covers. */
function PlanCard({
  plan,
  chosen,
  onChoose,
  price,
  t,
}: {
  plan: PlusPlan;
  chosen: boolean;
  onChoose: () => void;
  price: (cents: number) => string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const reduce = useReducedMotion();
  const dir = useDirection();
  const scale = useRef(new Animated.Value(chosen ? 1.015 : 1)).current;
  useEffect(() => {
    const to = chosen ? 1.015 : 1;
    if (reduce) scale.setValue(1);
    else Animated.spring(scale, { toValue: to, friction: 6, tension: 160, useNativeDriver: true }).start();
  }, [chosen, reduce, scale]);
  const name: TranslationKey = plan.id === 'yearly' ? 'plus.plan.yearly' : plan.id === 'monthly' ? 'plus.plan.monthly' : 'plus.plan.family';
  const billed = t(plan.period === 'year' ? 'plus.price.year' : 'plus.price.month', { price: price(plan.priceCents) });
  const saving = plan.id === 'yearly' ? planSavingPercent(plan, MONTHLY) : 0;
  const lines = [
    plan.period === 'year' ? t('plus.price.month', { price: price(planMonthlyCents(plan)) }) : null,
    plan.introCents !== undefined ? t('plus.firstMonth', { price: price(plan.introCents) }) : null,
    plan.people > 1 ? t('plus.people', { count: plan.people }) : null,
  ].filter((line): line is string => line !== null);
  const gold = scheme === 'dark' ? colors.gold : colors.goldText;
  const edge = chosen ? colors.gold : colors.separator;
  return (
    <Pressable onPress={onChoose} accessibilityRole="radio" accessibilityState={{ checked: chosen }} aria-checked={chosen} accessibilityLabel={[t(name), billed, ...lines].join(', ')} testID={`plus-plan-${plan.id}`}>
      <Animated.View
        style={[
          styles.plan,
          { backgroundColor: chosen ? `${colors.gold}1A` : colors.surface, borderColor: edge, borderWidth: chosen ? 2 : 1.5, transform: [{ scale }] },
        ]}
      >
        <View style={[styles.planTop, { flexDirection: dir.row }]}>
          <Text style={[styles.planName, { color: colors.textPrimary }]}>{t(name)}</Text>
          {saving > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.gold }]}>
              <Text style={[styles.badgeText, { color: colors.textOnGold }]}>{t('plus.bestValue')}</Text>
            </View>
          ) : null}
          <View style={[styles.tick, { borderColor: chosen ? colors.gold : colors.switchOff, backgroundColor: chosen ? colors.gold : 'transparent' }]}>
            {chosen ? <Icon name="check" size={14} color={colors.textOnGold} /> : null}
          </View>
        </View>
        <Text style={[styles.planPrice, dir.text, { color: colors.textPrimary }]}>{billed}</Text>
        <View style={[styles.planLines, { flexDirection: dir.row }]}>
          {lines.length > 0 ? <Text style={[styles.planLine, { color: colors.textSecondary }]}>{lines.join(' · ')}</Text> : null}
          {saving > 0 ? <Text style={[styles.planSave, { color: gold }]}>{t('plus.save', { percent: saving })}</Text> : null}
        </View>
        {scheme === 'dark' ? <Rim /> : null}
      </Animated.View>
    </Pressable>
  );
}

/** A faint warm light along a card's top edge by night (palette `cardRim`). */
function Rim(): React.JSX.Element | null {
  const { colors, scheme } = useTheme();
  return scheme === 'dark' ? <View pointerEvents="none" style={[styles.rim, { backgroundColor: colors.cardRim }]} /> : null;
}

/** A small link in the fine print, a fingertip tall. */
function FineLink({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={styles.link}>
      <Text style={[styles.linkText, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hero: { width: '100%', aspectRatio: PLUS_HERO_VIEW.w / PLUS_HERO_VIEW.h, overflow: 'hidden' },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '24%' },
  close: { position: 'absolute' },
  body: { paddingHorizontal: spacing.md, gap: spacing.lg, marginTop: -spacing.md },
  head: { alignItems: 'center', gap: spacing.sm },
  wordmark: { alignItems: 'center', gap: spacing.sm },
  wordmarkText: { ...display(typography.sizes.title), fontWeight: typography.weights.bold },
  promise: { fontSize: typography.sizes.text, lineHeight: 23, textAlign: 'center', maxWidth: 320 },
  card: { borderRadius: radii.xl, borderWidth: 1, padding: spacing.md, gap: spacing.md, overflow: 'hidden' },
  perk: { alignItems: 'center', gap: spacing.md },
  perkIcon: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  perkText: { flex: 1, fontSize: typography.sizes.text, lineHeight: 22 },
  plans: { gap: spacing.md },
  plan: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs, overflow: 'hidden' },
  planTop: { alignItems: 'center', gap: spacing.sm },
  planName: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  badge: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 2 },
  badgeText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  tick: { width: 24, height: 24, borderRadius: radii.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginStart: 'auto' },
  planPrice: { ...display(typography.sizes.title), fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  planLines: { flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  planLine: { fontSize: typography.sizes.text },
  planSave: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  told: { fontSize: typography.sizes.text, textAlign: 'center', borderRadius: radii.md, padding: spacing.md, overflow: 'hidden' },
  fine: { fontSize: typography.sizes.text, textAlign: 'center', marginTop: -spacing.sm },
  links: { justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: -spacing.lg },
  dot: { fontSize: typography.sizes.text },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'center', paddingHorizontal: spacing.xs },
  linkText: { fontSize: typography.sizes.text, textDecorationLine: 'underline' },
  rim: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
});
