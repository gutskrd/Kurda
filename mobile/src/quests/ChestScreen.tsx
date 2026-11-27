import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
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
import { usePageWidth } from '../theme/pageWidth';

/** While the server is asked, the chest strains: pressed a little flat, shivering this fast. */
const STRAIN_MS = 110;
/**
 * The stage's height relative to the chest's width, with the chest centred, shared by the shut and open states so
 * nothing jumps between them.
 */
const STAGE_RATIO = 1.25;
/** A large button's height: what the bar under the chest is made for. */
const BUTTON_HEIGHT = 50;
/** When the opening chest lands from its hop (shared CHEST_HOP): the haptic, the ring and the thrown gold start here. */
const LAND_MS = CHEST_HOP_MS * CHEST_HOP_LAND;
/** How far the open chest's rays reach relative to the drawing's own: across most of the screen. */
const RAYS_REACH = 2.4;

/**
 * A quest's chest on its own screen, in the colour of what it holds: its name, the chest standing in a soft light
 * and knocking now and then with light at its seam (ChestArt's `shine`), and "Tap to open". A tap asks the server
 * to open it while the chest strains; then it hops open, the beams sway, gold is thrown, and the contents rise as a
 * tile with a count while the Zêr balance counts up, with one haptic and sound on landing.
 *
 * Problems are said plainly with a way on: offline, the chest stays shut and waits on Learn; already opened,
 * nothing is lost. Nothing to buy or watch: one chest, its contents, and Continue.
 */
export function ChestScreen({
  questId,
  tier,
  onDone,
}: {
  questId: string;
  tier: ChestTier;
  /** On Continue: whether the chest is open now (just opened, or already open) or still shut. */
  onDone: (open: boolean) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const { scheme } = useTheme();
  const { t } = useI18n();
  const top = useScreenTopInset();
  const bottom = useScreenBottomInset(spacing.lg);
  const width = usePageWidth();
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
      {/* The tier's colour, deepening a little towards the foot. */}
      <LinearGradient colors={[tone.fill, mix(tone.fill, tone.lip, 0.35)]} start={{ x: 0, y: 0.3 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      {opened ? (
        <Opened opening={opened} tier={tier} size={size} ink={tone.ink} />
      ) : (
        <>
          {/* The balance's corner, kept empty, so the chest stands in the same place shut and open. */}
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
              <Straining straining={busy}>
                <ChestArt tier={tier} size={size} shine={!busy} testID="chest-art" />
              </Straining>
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
      {/* The bar keeps its button height either way, so the chest above stays put. */}
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
 * The chest just opened: a one-second hop (shared CHEST_HOP), and on landing the celebration
 * (theme/celebration.ts): haptic and sound, a ring and a burst of gold, a few stars, the inner light, and turning
 * rays. Then the contents rise as a tile with a count ("× 40") and "+N Zêr" lands under it while the corner
 * balance counts up to the server's new total. Badges wait for it. Under Reduce Motion the chest stands open and
 * the gold fades in, rays still. For someone who does not earn Zêr it says, once, that Zêr is a members' perk instead
 * of counting none.
 */
function Opened({ opening, tier, size, ink }: { opening: ChestOpening; tier: ChestTier; size: number; ink: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  // The balance sits in the far corner from where the reading starts.
  const dir = useDirection();
  // The celebration is timed from the landing, not the first frame.
  const reduce = useReducedMotion();
  const timing = celebrationPlan(reduce);
  const moment = useCelebration({ sound: 'reward', delayMs: timing.travel ? LAND_MS - timing.hapticAtMs : 0 });
  useCelebrationHold(moment.playing);
  const { plan } = moment;
  // The hop, straight through the shared frames; a skip puts the chest down where it ends.
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
  const reward = opening.earnsZer ? t('quests.chest.reward', { amount }) : t('quests.chest.membersZer');

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(reward);
    // Said once, as it opens.
  }, []);

  // The lid, light and stars follow the hop; under Reduce Motion it is just open and only the gold fades in.
  const motion = plan.travel ? { hop } : { light: moment.art.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }) };
  // The tile rises from the chest's mouth to its place over the lid, where the tier's name was.
  const rise = plan.travel ? moment.details.interpolate({ inputRange: [0, 1], outputRange: [size * 0.32, 0] }) : 0;
  const chestHeight = size * CHEST_RATIO;
  const stageHeight = size * STAGE_RATIO;

  return (
    <>
      {opening.earnsZer ? (
        <View style={[styles.corner, { alignItems: dir.row === 'row-reverse' ? 'flex-start' : 'flex-end' }]} accessible accessibilityLabel={t('quests.chest.balance', { count: formatNumber(opening.balance, locale) })}>
          <View style={[styles.balance, { flexDirection: dir.row, backgroundColor: 'rgba(0,0,0,0.14)' }]}>
            <Icon name="coin" size={18} color={colors.gold} />
            <Text style={[styles.balanceText, { color: ink }]}>{formatNumber(balance, locale)}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.middle}>
        {/* The tier's name keeps its room but gives way to what the chest held, which rises into it. */}
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
          <ChestArt tier={tier} size={size} open={!plan.travel} motion={motion} rays={plan.travel ? 'swaying' : 'still'} reach={RAYS_REACH} testID="chest-art" />
          {plan.travel ? (
            // The gold comes out of the open top, in front of the chest.
            <View style={[StyleSheet.absoluteFill, { transform: [{ translateY: -size * 0.12 }] }]} pointerEvents="none">
              <ConfettiBurst progress={moment.burst} count={BURST.badge} seed={opening.amount * 7 + 3} colours={[colors.gold, '#FFE16A', '#FFBD1F', '#FFFFFF']} reach={size * 0.75} />
            </View>
          ) : null}
          {opening.earnsZer ? (
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
          ) : null}
        </Pressable>
        <Animated.View style={[styles.words, { opacity: moment.details }]}>
          <Text style={[opening.earnsZer ? styles.amount : styles.members, { color: ink }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
            {reward}
          </Text>
        </Animated.View>
      </View>
    </>
  );
}

/**
 * While the server is asked, the chest strains (squatting on its foot and shivering), which is the crouch the hop
 * springs from. A waiting chest stands on the ground and knocks (ChestArt). Still under Reduce Motion and when the
 * screen is not focused.
 */
function Straining({ straining, children }: { straining: boolean; children: React.ReactNode }): React.JSX.Element {
  const alive = useMotionAlive();
  const press = useRef(new Animated.Value(0)).current;
  const shiver = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!alive || !straining) {
      press.setValue(0);
      shiver.setValue(0);
      return;
    }
    const step = (value: Animated.Value, to: number, duration: number): Animated.CompositeAnimation =>
      Animated.timing(value, { toValue: to, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false });
    const run = Animated.parallel([
      step(press, 1, STRAIN_MS),
      Animated.loop(Animated.sequence([step(shiver, 1, STRAIN_MS), step(shiver, -1, STRAIN_MS * 2), step(shiver, 0, STRAIN_MS)])),
    ]);
    run.start();
    return () => run.stop();
  }, [alive, straining, press, shiver]);
  // The strain squashes the chest about its foot (the shadow is drawn below it), tilting it a little each way.
  const scaleX = press.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const scaleY = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] });
  const rotate = shiver.interpolate({ inputRange: [-1, 1], outputRange: ['-1.5deg', '1.5deg'] });
  return <Animated.View style={{ transformOrigin: '50% 92%', transform: [{ scaleX }, { scaleY }, { rotate }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  name: { ...display(typography.sizes.title), textAlign: 'center' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  // The tile sits over the open lid, its foot a little above the chest's top.
  tile: { position: 'absolute', alignItems: 'center', gap: spacing.xs, borderRadius: radii.lg, paddingHorizontal: spacing.md + 4, paddingVertical: spacing.sm + 4, minWidth: 96 },
  // What is said under the chest ("Tap to open", a problem, or the contents), in one slot tall enough for the largest.
  words: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  gone: { opacity: 0 },
  count: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'], writingDirection: 'ltr' },
  tap: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
  problem: { fontSize: typography.sizes.text, lineHeight: 23, textAlign: 'center', maxWidth: 340 },
  corner: { paddingHorizontal: spacing.lg, minHeight: 36 },
  balance: { alignItems: 'center', gap: spacing.xs, borderRadius: radii.pill, paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.xs + 2 },
  balanceText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  amount: { ...display(44), textAlign: 'center', fontVariant: ['tabular-nums'] },
  members: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center', maxWidth: 320 },
  bar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
