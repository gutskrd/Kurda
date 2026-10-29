import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ChestOpening, ChestTier } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useAuth } from '../auth/AuthContext';
import { useCelebrationHold } from '../badges/BadgeCelebrationHost';
import { TONES, mix } from '../coursemap/path';
import { haptic } from '../feedback/haptics';
import { formatNumber } from '../i18n/format';
import { useI18n } from '../i18n/I18nContext';
import { useScreenBottomInset, useScreenTopInset } from '../navigation/tabBarLayout';
import { useDirection } from '../reports/direction';
import { useCountUp } from '../theme/animate';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../theme/CelebrationParts';
import { BURST } from '../theme/celebration';
import { display } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { ChestArt } from './ChestArt';
import { CHEST_NAME, CHEST_TONE, CLAIM_WORDS, claimProblem, type ClaimProblem } from './model';

/** How long one bob of the waiting chest takes, up and back, and how far it goes. */
const BOB_MS = 1800;
const BOB = 6;
/** Where the sparkles round the waiting chest sit, from its middle, as shares of its size; and when each twinkles. */
const SPARKLES = [
  { x: -0.62, y: -0.42, size: 22, delay: 0 },
  { x: 0.6, y: -0.18, size: 16, delay: 500 },
  { x: 0.5, y: 0.5, size: 20, delay: 1000 },
  { x: -0.7, y: 0.3, size: 12, delay: 1400 },
];

/**
 * A quest's chest, on a screen of its own in the colour of what it holds:
 * its name, the chest bobbing gently with a few sparkles round it, and "Tap
 * to open". A tap asks the server to open it; the lid pops, gold bursts out,
 * and the Zêr it held arrives big, with the learner's Zêr counting up to its
 * new total in the corner — felt and heard once.
 *
 * Anything in the way is said plainly, with a way on: offline, the chest
 * stays shut and waits on Learn; already opened, nothing is lost. Nothing to
 * buy, nothing to watch, no "more": one chest, what was in it, and Continue.
 */
export function ChestScreen({
  questId,
  tier,
  onDone,
}: {
  questId: string;
  tier: ChestTier;
  /** on Continue: whether the chest is open now (just opened, or found open already) or still shut */
  onDone: (open: boolean) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { scheme } = useTheme();
  const { t } = useI18n();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const { width } = useWindowDimensions();
  const tone = TONES[scheme][CHEST_TONE[tier]];
  const size = Math.min(220, width * 0.55);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<ChestOpening | null>(null);
  const [problem, setProblem] = useState<ClaimProblem | null>(null);

  const open = async (): Promise<void> => {
    if (busy || opened) return;
    haptic('tap');
    setBusy(true);
    setProblem(null);
    const res = await client.post<ChestOpening>(`/me/quests/${encodeURIComponent(questId)}/claim`);
    setBusy(false);
    if (res.ok) setOpened(res.data);
    else {
      const why = claimProblem(res.error);
      setProblem(why);
      AccessibilityInfo.announceForAccessibility?.(t(CLAIM_WORDS[why]));
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: tone.fill, paddingTop: top }]} testID="quest-chest">
      {/* the tier's colour, deepening a little towards the foot */}
      <LinearGradient colors={[tone.fill, mix(tone.fill, tone.lip, 0.35)]} start={{ x: 0, y: 0.3 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      {opened ? (
        <Opened opening={opened} tier={tier} size={size} ink={tone.ink} />
      ) : (
        <View style={styles.middle}>
          <Text style={[styles.name, { color: tone.ink }]} accessibilityRole="header">
            {t(CHEST_NAME[tier])}
          </Text>
          <Pressable
            onPress={open}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('quests.chest.open')}
            accessibilityState={{ busy, disabled: busy }}
            style={[styles.stage, { width: size * 1.6, height: size * 1.25 }]}
          >
            <SoftGlow colour="#FFFFFF" size={size * 1.25} id="chest-glow" />
            <Sparkles size={size} />
            <Bobbing still={busy}>
              <ChestArt tier={tier} size={size} />
            </Bobbing>
          </Pressable>
          {problem ? null : <Text style={[styles.tap, { color: tone.ink, opacity: busy ? 0.6 : 1 }]}>{t('quests.chest.tap')}</Text>}
          {problem ? (
            <Text style={[styles.problem, { color: tone.ink }]} accessibilityLiveRegion="polite">
              {t(CLAIM_WORDS[problem])}
            </Text>
          ) : null}
        </View>
      )}
      <View style={[styles.bar, { paddingBottom: bottom }]}>
        {problem === 'offline' || problem === 'failed' ? <ClayButton label={t('common.retry')} tone="primary" size="large" busy={busy} onPress={open} /> : null}
        {opened || problem ? (
          <ClayButton
            label={t('common.continue')}
            tone="primary"
            variant={problem === 'offline' || problem === 'failed' ? 'outline' : 'solid'}
            size="large"
            onPress={() => onDone(opened !== null || problem === 'claimed')}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The chest just opened: the lid pops on a spring, a ring and a burst of
 * gold leave it, then "+N Zêr" arrives, and the balance in the corner counts
 * up to what the server says it now is. The celebration (theme/celebration.ts)
 * is felt and heard once as the lid goes; badges wait for it.
 */
function Opened({ opening, tier, size, ink }: { opening: ChestOpening; tier: ChestTier; size: number; ink: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  // the balance sits in the far corner from where the reading starts
  const dir = useDirection();
  const moment = useCelebration({ sound: 'reward' });
  useCelebrationHold(moment.playing);
  const { plan } = moment;
  const balance = useCountUp(opening.balance, { from: Math.max(0, opening.balance - opening.amount), delayMs: plan.detailsDelayMs });
  const reward = t('quests.chest.reward', { amount: formatNumber(opening.amount, locale) });

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(reward);
    // said once, as it opens
  }, []);

  // the lid pops on the spring; under Reduce Motion it is simply open, and only the gold under it fades in
  const lid = plan.travel
    ? {
        transform: [
          { translateY: moment.art.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.2] }) },
          { rotate: moment.art.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-14deg'] }) },
        ],
      }
    : undefined;
  const light = moment.art.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const lift = plan.travel ? moment.details.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) : 0;

  return (
    <>
      <View style={[styles.corner, { alignItems: dir.row === 'row-reverse' ? 'flex-start' : 'flex-end' }]} accessible accessibilityLabel={t('quests.chest.balance', { count: formatNumber(opening.balance, locale) })}>
        <View style={[styles.balance, { flexDirection: dir.row, backgroundColor: 'rgba(0,0,0,0.14)' }]}>
          <Icon name="coin" size={18} color={colors.gold} />
          <Text style={[styles.balanceText, { color: ink }]}>{formatNumber(balance, locale)}</Text>
        </View>
      </View>
      <View style={styles.middle}>
        <Pressable
          onPress={moment.playing ? moment.skip : undefined}
          disabled={!moment.playing}
          accessible={moment.playing}
          accessibilityRole={moment.playing ? 'button' : undefined}
          accessibilityLabel={moment.playing ? t('common.skip') : undefined}
          style={[styles.stage, { width: size * 1.6, height: size * 1.25 }]}
        >
          <SoftGlow colour={colors.gold} size={size * 1.25} id="chest-open-glow" />
          {plan.travel ? <GlowRing progress={moment.ring} colour="#FFFFFF" size={size * 0.9} /> : null}
          <ChestArt tier={tier} size={size} open={!plan.travel} lid={lid} light={light} />
          {plan.travel ? (
            // the gold comes out of the open top, in front of the chest
            <View style={[StyleSheet.absoluteFill, { transform: [{ translateY: -size * 0.12 }] }]} pointerEvents="none">
              <ConfettiBurst progress={moment.burst} count={BURST.badge} seed={opening.amount * 7 + 3} colours={[colors.gold, '#FFE16A', '#FFBD1F', '#FFFFFF']} reach={size * 0.75} />
            </View>
          ) : null}
        </Pressable>
        <Animated.View style={[styles.reward, { opacity: moment.details, transform: [{ translateY: lift }] }]}>
          <Icon name="coin" size={40} color={colors.gold} />
          <Text style={[styles.amount, { color: ink }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
            {reward}
          </Text>
        </Animated.View>
      </View>
    </>
  );
}

/** The waiting chest, rising and settling gently for as long as it waits; still under Reduce Motion, or while it is being opened. */
function Bobbing({ still, children }: { still: boolean; children: React.ReactNode }): React.JSX.Element {
  const reduce = useReducedMotion();
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || still) {
      bob.setValue(0);
      return;
    }
    const half = BOB_MS / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(bob, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, still, bob]);
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [BOB / 2, -BOB / 2] });
  return <Animated.View style={{ transform: [{ translateY }] }}>{children}</Animated.View>;
}

/** A few white sparkles round the waiting chest, each twinkling in its turn; simply there under Reduce Motion. */
function Sparkles({ size }: { size: number }): React.JSX.Element {
  return (
    <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {SPARKLES.map((s, i) => (
        <Twinkle key={i} delay={s.delay} x={s.x * size} y={s.y * size}>
          <Icon name="sparkle" size={s.size} color="#FFFFFF" />
        </Twinkle>
      ))}
    </View>
  );
}

function Twinkle({ delay, x, y, children }: { delay: number; x: number; y: number; children: React.ReactNode }): React.JSX.Element {
  const reduce = useReducedMotion();
  const glint = useRef(new Animated.Value(reduce ? 1 : 0.25)).current;
  useEffect(() => {
    if (reduce) {
      glint.setValue(0.8);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(glint, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(glint, { toValue: 0.25, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.delay(1800 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, delay, glint]);
  const scale = glint.interpolate({ inputRange: [0.25, 1], outputRange: [0.8, 1.1] });
  return <Animated.View style={[styles.sparkle, { opacity: glint, transform: [{ translateX: x }, { translateY: y }, { scale }] }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  centre: { alignItems: 'center', justifyContent: 'center' },
  sparkle: { position: 'absolute' },
  name: { ...display(typography.sizes.xxl), textAlign: 'center' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  tap: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  problem: { fontSize: typography.sizes.md, lineHeight: 23, textAlign: 'center', maxWidth: 340 },
  corner: { paddingHorizontal: spacing.lg },
  balance: { alignItems: 'center', gap: spacing.xs, borderRadius: radii.pill, paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.xs + 2 },
  balanceText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  reward: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  amount: { ...display(44), textAlign: 'center', fontVariant: ['tabular-nums'] },
  bar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, minHeight: 50 + spacing.sm },
});
