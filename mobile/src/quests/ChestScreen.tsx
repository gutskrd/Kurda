import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CHEST_HOP_LAND, CHEST_HOP_MS, celebrationPlan, type ChestOpening, type ChestTier } from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
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
import { CHEST_RATIO, ChestArt } from './ChestArt';
import { CHEST_NAME, CHEST_TONE, CLAIM_WORDS, claimProblem, type ClaimProblem } from './model';

/** How long one bob of the waiting chest takes, up and back, and how far it goes. */
const BOB_MS = 1800;
const BOB = 6;
/** While the server is asked, the chest strains: pressed a little flat, shivering this fast. */
const STRAIN_MS = 110;
/**
 * The stage's height against the chest's width, shut and open alike, with
 * the chest in its middle: the one layout both states share, so the chest
 * hops from where it stood and nothing jumps as the screen changes under it.
 */
const STAGE_RATIO = 1.25;
/** A large button's height: what the bar under the chest is made for. */
const BUTTON_HEIGHT = 50;
/** When the opening chest lands out of its hop (shared CHEST_HOP): the moment it is felt, the ring widens and the gold is thrown. */
const LAND_MS = CHEST_HOP_MS * CHEST_HOP_LAND;
/** Where the sparkles round the waiting chest sit, from its middle, as shares of its size; and when each twinkles. */
const SPARKLES = [
  { x: -0.62, y: -0.42, size: 22, delay: 0 },
  { x: 0.6, y: -0.18, size: 16, delay: 500 },
  { x: 0.5, y: 0.5, size: 20, delay: 1000 },
  { x: -0.7, y: 0.3, size: 12, delay: 1400 },
];
/** How far the rays out of the open chest reach, against the drawing's own: across most of the screen. */
const RAYS_REACH = 2.4;

/**
 * A quest's chest, on a screen of its own in the colour of what it holds:
 * its name, the chest bobbing gently with a few sparkles round it and a glint
 * now and then on its lock, and "Tap to open". A tap asks the server to open
 * it, and the chest strains while it waits; then it hops: it crouches,
 * springs up and the lid bursts open at the top, it lands, light bursts out
 * of it in rays that turn slowly, gold is thrown, and what it held rises out
 * of it as a tile with its count, with the learner's Zêr counting up to its
 * new total in the corner — felt and heard once, as it lands.
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
        <>
          {/* the balance's corner, kept empty, so the chest stands in the same place shut and open */}
          <View style={styles.corner} />
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
              style={[styles.stage, { width: size * 1.6, height: size * STAGE_RATIO }]}
            >
              <SoftGlow colour="#FFFFFF" size={size * 1.25} id="chest-glow" />
              <Sparkles size={size} />
              <Bobbing straining={busy}>
                <ChestArt tier={tier} size={size} shine={!busy} testID="chest-art" />
              </Bobbing>
            </Pressable>
            <View style={styles.words}>
              {problem ? null : <Text style={[styles.tap, { color: tone.ink, opacity: busy ? 0.6 : 1 }]}>{t('quests.chest.tap')}</Text>}
              {problem ? (
                <Text style={[styles.problem, { color: tone.ink }]} accessibilityLiveRegion="polite">
                  {t(CLAIM_WORDS[problem])}
                </Text>
              ) : null}
            </View>
          </View>
        </>
      )}
      {/* the bar keeps the height it has with a button in it, so the chest above stands in the same place with and without one */}
      <View style={[styles.bar, { paddingBottom: bottom, minHeight: BUTTON_HEIGHT + spacing.sm + bottom }]}>
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
 * The chest just opened: it hops (the shared CHEST_HOP, one second) — a
 * crouch, a spring up with the lid bursting open at the top, a landing — and
 * as it lands the celebration (theme/celebration.ts) goes off: it is felt and
 * heard, a ring and a burst of gold leave it and a few stars flash, the light
 * inside blooms and a fan of rays rises out of it and keeps turning, then
 * what it held rises out of the chest as a tile with its count ("× 40") and
 * "+N Zêr" lands under it, while the balance in the corner counts up to what
 * the server says it now is. Badges wait for it. Under Reduce Motion the
 * chest simply stands open and the gold fades in, its rays still.
 */
function Opened({ opening, tier, size, ink }: { opening: ChestOpening; tier: ChestTier; size: number; ink: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  // the balance sits in the far corner from where the reading starts
  const dir = useDirection();
  // the celebration is timed from the landing, not from the first frame: it is felt as the chest hits the ground
  const reduce = useReducedMotion();
  const timing = celebrationPlan(reduce);
  const moment = useCelebration({ sound: 'reward', delayMs: timing.travel ? LAND_MS - timing.hapticAtMs : 0 });
  useCelebrationHold(moment.playing);
  const { plan } = moment;
  // the hop, straight through the shared frames; a skip puts the chest down where it ends
  const hop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!plan.travel) return;
    const run = Animated.timing(hop, { toValue: 1, duration: CHEST_HOP_MS, easing: Easing.linear, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [plan.travel, hop]);
  const skip = (): void => {
    hop.setValue(1);
    moment.skip();
  };
  const balance = useCountUp(opening.balance, { from: Math.max(0, opening.balance - opening.amount), delayMs: plan.detailsDelayMs });
  const amount = formatNumber(opening.amount, locale);
  const reward = t('quests.chest.reward', { amount });

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(reward);
    // said once, as it opens
  }, []);

  // the lid, the light and the stars follow the hop; under Reduce Motion it is simply open, and only the gold fades in
  const motion = plan.travel ? { hop } : { light: moment.art.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }) };
  // the tile rises out of the chest's mouth to its place over the lid, where the tier's name was
  const rise = plan.travel ? moment.details.interpolate({ inputRange: [0, 1], outputRange: [size * 0.32, 0] }) : 0;
  const chestHeight = size * CHEST_RATIO;
  const stageHeight = size * STAGE_RATIO;

  return (
    <>
      <View style={[styles.corner, { alignItems: dir.row === 'row-reverse' ? 'flex-start' : 'flex-end' }]} accessible accessibilityLabel={t('quests.chest.balance', { count: formatNumber(opening.balance, locale) })}>
        <View style={[styles.balance, { flexDirection: dir.row, backgroundColor: 'rgba(0,0,0,0.14)' }]}>
          <Icon name="coin" size={18} color={colors.gold} />
          <Text style={[styles.balanceText, { color: ink }]}>{formatNumber(balance, locale)}</Text>
        </View>
      </View>
      <View style={styles.middle}>
        {/* the tier's name keeps its room but gives way to what the chest held, which rises into it */}
        <Text style={[styles.name, styles.gone]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {t(CHEST_NAME[tier])}
        </Text>
        <Pressable
          onPress={moment.playing ? skip : undefined}
          disabled={!moment.playing}
          accessible={moment.playing}
          accessibilityRole={moment.playing ? 'button' : undefined}
          accessibilityLabel={moment.playing ? t('common.skip') : undefined}
          style={[styles.stage, { width: size * 1.6, height: stageHeight }]}
        >
          <SoftGlow colour={colors.gold} size={size * 1.4} id="chest-open-glow" />
          {plan.travel ? <GlowRing progress={moment.ring} colour="#FFFFFF" size={size * 0.9} /> : null}
          <ChestArt tier={tier} size={size} open={!plan.travel} motion={motion} rays={plan.travel ? 'turning' : 'still'} reach={RAYS_REACH} testID="chest-art" />
          {plan.travel ? (
            // the gold comes out of the open top, in front of the chest
            <View style={[StyleSheet.absoluteFill, { transform: [{ translateY: -size * 0.12 }] }]} pointerEvents="none">
              <ConfettiBurst progress={moment.burst} count={BURST.badge} seed={opening.amount * 7 + 3} colours={[colors.gold, '#FFE16A', '#FFBD1F', '#FFFFFF']} reach={size * 0.75} />
            </View>
          ) : null}
          <Animated.View
            style={[styles.tile, { bottom: (stageHeight + chestHeight) / 2 + spacing.sm, backgroundColor: colors.surface, opacity: moment.details, transform: [{ translateY: rise }] }]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Icon name="coin" size={44} color={colors.gold} />
            <Text style={[styles.count, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
              {`× ${amount}`}
            </Text>
          </Animated.View>
        </Pressable>
        <Animated.View style={[styles.words, { opacity: moment.details }]}>
          <Text style={[styles.amount, { color: ink }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
            {reward}
          </Text>
        </Animated.View>
      </View>
    </>
  );
}

/**
 * The waiting chest, rising and settling gently for as long as it waits.
 * While the server is asked it strains instead — pressed a little flat on
 * its foot and shivering, as if what is inside wanted out — which is the
 * crouch the hop then springs from. Still under Reduce Motion, and when
 * nobody is looking.
 */
function Bobbing({ straining, children }: { straining: boolean; children: React.ReactNode }): React.JSX.Element {
  const alive = useMotionAlive();
  const bob = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const shiver = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!alive) {
      bob.setValue(0);
      press.setValue(0);
      shiver.setValue(0);
      return;
    }
    const step = (value: Animated.Value, to: number, duration: number): Animated.CompositeAnimation =>
      Animated.timing(value, { toValue: to, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false });
    const run = straining
      ? Animated.parallel([
          step(press, 1, STRAIN_MS),
          Animated.loop(Animated.sequence([step(shiver, 1, STRAIN_MS), step(shiver, -1, STRAIN_MS * 2), step(shiver, 0, STRAIN_MS)])),
        ])
      : Animated.loop(Animated.sequence([step(bob, 1, BOB_MS / 2), step(bob, 0, BOB_MS / 2)]));
    if (straining) bob.setValue(0);
    else {
      press.setValue(0);
      shiver.setValue(0);
    }
    run.start();
    return () => run.stop();
  }, [alive, straining, bob, press, shiver]);
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [BOB / 2, -BOB / 2] });
  // the strain presses the chest flat about its foot (the shadow is drawn below it), tilting it a little each way
  const scaleX = press.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const scaleY = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });
  const rotate = shiver.interpolate({ inputRange: [-1, 1], outputRange: ['-3deg', '3deg'] });
  return <Animated.View style={{ transformOrigin: '50% 88%', transform: [{ translateY }, { scaleX }, { scaleY }, { rotate }] }}>{children}</Animated.View>;
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
  const alive = useMotionAlive();
  const glint = useRef(new Animated.Value(reduce ? 1 : 0.25)).current;
  useEffect(() => {
    if (!alive) {
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
  }, [alive, delay, glint]);
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
  // the tile sits over the open lid, its foot a little above the chest's top (where is set by the sizes)
  tile: { position: 'absolute', alignItems: 'center', gap: spacing.xs, borderRadius: radii.lg, paddingHorizontal: spacing.md + 4, paddingVertical: spacing.sm + 4, minWidth: 96 },
  // what is said under the chest — "Tap to open", a problem, or what it held — in one slot tall enough for the biggest of them
  words: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  gone: { opacity: 0 },
  count: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'], writingDirection: 'ltr' },
  tap: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  problem: { fontSize: typography.sizes.md, lineHeight: 23, textAlign: 'center', maxWidth: 340 },
  corner: { paddingHorizontal: spacing.lg, minHeight: 36 },
  balance: { alignItems: 'center', gap: spacing.xs, borderRadius: radii.pill, paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.xs + 2 },
  balanceText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  amount: { ...display(44), textAlign: 'center', fontVariant: ['tabular-nums'] },
  bar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
