import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { leagueWin, tierAbove, tierBelow, type LeagueTier, type LeagueWeekResult } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { sayReactionLater } from '../characters/reactions';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import { LeagueEmblem } from '../ranks/art';
import { leagueTint } from '../ranks/tint';
import { useDirection } from '../reports/direction';
import { ShareWin } from '../share/ShareWin';
import { leagueShare } from '../share/winText';
import { springTo, timing } from '../theme/animate';
import { BURST, celebrationPlan } from '../theme/celebration';
import { ConfettiBurst, GlowRing, SoftGlow } from '../theme/CelebrationParts';
import { display, sectionLabel } from '../theme/fonts';
import { ClayButton } from '../theme/glass';
import { duration } from '../theme/motion';
import { ReachReset } from '../theme/Pressable';
import { DarkScheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { ceremonyLine, leagueLabel, leagueMeaning, leagueName, moveUpRule, type Ceremony } from './format';

/** The night backdrop the moment is staged on in either scheme, as for every celebration in the app. */
const STAGE = '#07080c';
/** An emblem's drawn size before the strip scales it: the centre one grows past it, the two beside it shrink. */
const BASE = 120;
const SCALE = { middle: [0.82, 1.1], side: 0.72 } as const;
/** When the strip has all but landed: the light knock, and the burst, come then. */
const LAND_MS = 260;

/**
 * The week's ceremony in two beats, each with Continue. First the ladder slides until the current league is
 * centred, landing on a spring with a light haptic (and the burst for a promotion or the trophy), with one line
 * on what happened; a demotion reads as a fresh start. Then the league's name, its meaning and how to move up.
 * Nothing counts down. Under Reduce Motion the text fades in and nothing travels. A week worth sharing (shared
 * `leagueWin`) gets a quiet Share under the first Continue, naming only the league and place.
 */
export function LeagueCeremony({
  week,
  ceremony,
  promoteCount,
  goalXp,
  onClose,
}: {
  week: LeagueWeekResult;
  ceremony: Ceremony;
  /** The learner's new group's promotion places and goal, for the rule the second beat ends on. */
  promoteCount: number;
  goalXp: number;
  onClose: () => void;
}): React.JSX.Element {
  const { t, locale } = useI18n();
  const reduce = useReducedMotion();
  const dir = useDirection();
  const { width } = useWindowDimensions();
  const [beat, setBeat] = useState<1 | 2>(1);
  const { kind, from, now } = ceremony;
  const [light, strong] = leagueTint(now, 'dark');
  const plan = useMemo(() => celebrationPlan(reduce), [reduce]);
  const burstKind = kind === 'promoted' || kind === 'trophy';
  // What of this week is worth telling somebody, if anything is.
  const win = leagueWin(week);

  const stage = Math.min(width, 420);
  const slot = Math.floor(stage / 3);
  const glowSize = Math.min(stage, 300);
  // Lower leagues toward the start side, as the ladder reads; the row mirrors for right-to-left languages.
  const mirrored = dir.row === 'row-reverse';
  const start = (kind === 'promoted' ? slot : kind === 'demoted' ? -slot : 0) * (mirrored ? -1 : 1);
  // What stands either side of the current league; the previous league is always one of the two.
  const below: LeagueTier | null = kind === 'promoted' ? from : now === tierBelow(now) ? null : tierBelow(now);
  const above: LeagueTier | null = kind === 'demoted' ? from : now === tierAbove(now) ? null : tierAbove(now);

  const slide = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const parts: Animated.CompositeAnimation[] = [];
    if (plan.travel) {
      parts.push(springTo(slide, 1, 'bouncy'));
      if (burstKind) {
        parts.push(timing(ring, 1, plan.ringMs, { delay: LAND_MS + plan.ringDelayMs, easing: Easing.out(Easing.quad) }));
        parts.push(
          Animated.timing(burst, { toValue: 1, duration: plan.burstMs, delay: LAND_MS + plan.burstDelayMs, easing: Easing.linear, useNativeDriver: true }),
        );
      }
    } else {
      slide.setValue(1);
    }
    parts.push(timing(words, 1, plan.detailsMs, { delay: plan.travel ? LAND_MS + 120 : 0 }));
    const run = Animated.parallel(parts);
    run.start();
    // The knock of the emblem landing, only when it travelled to get there.
    const knock = plan.travel ? setTimeout(() => haptic('tap'), LAND_MS) : null;
    return () => {
      run.stop();
      if (knock) clearTimeout(knock);
    };
    // Plays as the stage opens; the Reduce Motion answer can arrive a moment late, and then it replays that way.
  }, [plan, burstKind, slide, words, ring, burst]);

  // Moving up, Xezo says a word for it once the words have landed (shared reactions.ts).
  useEffect(
    () => (burstKind ? sayReactionLater((plan.travel ? LAND_MS + 120 : 0) + plan.detailsMs, { moment: 'promoted' }) : undefined),
    [burstKind, plan],
  );

  const line = ceremonyLine(t, week, ceremony);
  const title = t('leagues.ceremony.inLeague', { tier: leagueName(t, now) });
  const meaning = leagueMeaning(t, now);
  const rule = moveUpRule(t, { tier: now, promoteCount, goalXp });
  const kicker =
    kind === 'promoted'
      ? t('leagues.celebrate.up')
      : kind === 'demoted'
        ? t('leagues.ceremony.freshStart')
        : kind === 'trophy'
          ? t('leagues.ceremony.trophy')
          : t('leagues.lastWeek.title');
  const detail = [t('leagues.xpCount', { xp: formatNumber(week.weeklyXp, locale) }), week.zer > 0 ? t('leagues.zer', { count: week.zer }) : null]
    .filter(Boolean)
    .join(' · ');

  // The second beat's words take the first's place: the first fade out is the same fade, run again.
  useEffect(() => {
    if (beat === 1) return;
    words.setValue(0);
    const run = timing(words, 1, duration.base + 80);
    run.start();
    return () => run.stop();
  }, [beat, words]);

  // Said as each beat opens, in the order the lines are read.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(beat === 1 ? `${kicker}. ${line}` : [title, meaning, rule].filter(Boolean).join('. '));
  }, [beat, kicker, line, title, meaning, rule]);

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [start, 0] });
  const middleScale = slide.interpolate({ inputRange: [0, 1], outputRange: [SCALE.middle[0], SCALE.middle[1]] });
  // The league they came from starts as large as the middle one and shrinks as it slides to its side.
  const fromScale = slide.interpolate({ inputRange: [0, 1], outputRange: [SCALE.middle[1], SCALE.side] });
  const farOpacity = slide.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.2, 1], extrapolate: 'clamp' });
  const lift = plan.travel ? words.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) : 0;

  const side = (tier: LeagueTier | null, isFrom: boolean, locked: boolean): React.JSX.Element => (
    <View style={[styles.slot, { width: slot }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {tier ? (
        <Animated.View style={{ opacity: isFrom ? 0.85 : farOpacity, transform: [{ scale: isFrom ? fromScale : SCALE.side }] }}>
          <LeagueEmblem tier={tier} size={BASE} label={leagueLabel(t, tier)} locked={locked} />
        </Animated.View>
      ) : null}
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Drawn over the page, not beside its controls: their groups' caps stop here. */}
      <ReachReset>
        <DarkScheme>
          <View style={[styles.backdrop, { backgroundColor: STAGE }]} accessibilityViewIsModal>
            <View style={[styles.column, { maxWidth: 420 }]}>
              <View style={[styles.artStage, { width: stage, height: glowSize }]}>
                <SoftGlow colour={strong} size={glowSize} id="league-glow" />
                {plan.travel && burstKind ? <GlowRing progress={ring} colour={strong} size={glowSize * 0.62} testID="league-ring" /> : null}
                {plan.travel && burstKind ? (
                  <ConfettiBurst
                    progress={burst}
                    count={BURST.league}
                    seed={week.weekKey.length * 53 + now.length}
                    colours={[light, strong, '#ffffff']}
                    reach={Math.min(stage * 0.48, 190)}
                    testID="league-burst"
                  />
                ) : null}
                <Animated.View style={[styles.strip, { flexDirection: dir.row, transform: [{ translateX }] }]} testID="league-strip">
                  {side(below, kind === 'promoted', false)}
                  <View style={[styles.slot, { width: slot }]}>
                    <Animated.View style={{ transform: [{ scale: middleScale }] }}>
                      <LeagueEmblem tier={now} size={BASE} label={leagueLabel(t, now)} />
                    </Animated.View>
                  </View>
                  {side(above, kind === 'demoted', true)}
                </Animated.View>
              </View>

              <Animated.View style={[styles.words, { opacity: words, transform: [{ translateY: lift }] }]}>
                {beat === 1 ? (
                  <>
                    <Text style={[sectionLabel, styles.kicker, { color: light }]}>{kicker}</Text>
                    <Text style={styles.line} accessibilityRole="header">
                      {line}
                    </Text>
                    <View style={styles.detail}>
                      <Text style={styles.detailText}>{detail}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[sectionLabel, styles.kicker, { color: light }]}>{t('leagues.thisWeek')}</Text>
                    <Text style={styles.title} accessibilityRole="header">
                      {title}
                    </Text>
                    {meaning ? <Text style={styles.subtitle}>{meaning}</Text> : null}
                    {rule ? <Text style={styles.rule}>{rule}</Text> : null}
                  </>
                )}
                <View style={styles.actions}>
                  <ClayButton label={t('common.continue')} tone="primary" size="large" onPress={beat === 1 ? () => setBeat(2) : onClose} />
                  {beat === 1 && win ? <ShareWin text={leagueShare(t, win, leagueName(t, win.tier))} testID="league-share" /> : null}
                </View>
              </Animated.View>
            </View>
          </View>
        </DarkScheme>
      </ReachReset>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  column: { width: '100%', alignItems: 'center' },
  artStage: { alignItems: 'center', justifyContent: 'center' },
  strip: { alignItems: 'center' },
  slot: { alignItems: 'center', justifyContent: 'center' },
  words: { alignItems: 'center', alignSelf: 'stretch', gap: spacing.xs },
  kicker: { letterSpacing: 2 },
  line: { ...display(typography.sizes.title), color: '#FFFFFF', textAlign: 'center', paddingHorizontal: spacing.sm },
  title: { ...display(typography.sizes.title), color: '#FFFFFF', textAlign: 'center' },
  subtitle: { fontSize: typography.sizes.text, color: 'rgba(255,255,255,0.78)', textAlign: 'center' },
  rule: { fontSize: typography.sizes.text, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20, marginTop: spacing.sm, maxWidth: 320 },
  detail: { marginTop: spacing.md, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  detailText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, color: '#FFFFFF', textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.xl },
});
