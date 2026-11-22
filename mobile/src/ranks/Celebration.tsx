import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable, ReachReset } from '../theme/Pressable';
import { DarkScheme } from '../theme/ThemeProvider';
import { display, sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../theme/CelebrationParts';
import { useI18n } from '../i18n/I18nContext';

/** The night the moment is staged on, in either scheme. */
const STAGE = '#07080c';

/**
 * A moment on its own night-dark stage (a new division or tier, a first placement, a new league, a badge), in the app's
 * one sequence (theme/celebration.ts): the thing earned springs in, a ring widens, flecks fly, a haptic as it lands,
 * then the words. It is over in about a second and a half, and a tap on the art skips to the end; under Reduce Motion
 * it is a fade. One button continues, and system back closes it too.
 *
 * The haptic plays only when the person just did the thing: a moment shown rather than caused (a badge earned before
 * the app opened) stays still in the hand.
 */
export function Celebration({
  art,
  glow,
  flecks,
  fleckColours,
  seed,
  kicker,
  title,
  subtitle,
  detail,
  note,
  actions,
  announce,
  onClose,
  felt = true,
}: {
  /** The emblem or medallion, drawn at ~168pt. */
  art: ReactNode;
  /** The glow behind it, and the ring. */
  glow: string;
  /** How many flecks are thrown (0 for none). */
  flecks: number;
  fleckColours: string[];
  /** Keeps the same moment looking the same. */
  seed: number;
  /** "NEW TIER" */
  kicker: string;
  /** "Gir I" */
  title: string;
  /** "Hill" */
  subtitle?: string | null;
  /** What earned it: "+26 · you beat a higher-ranked player" */
  detail?: string | null;
  /** A line under it: the shield, a badge's tier. */
  note?: string | null;
  /** Buttons; a Continue is the caller's to give. */
  actions: ReactNode;
  /** What a screen reader hears as it opens. */
  announce: string;
  onClose: () => void;
  /** False for a moment the person did not just cause (see above). */
  felt?: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const moment = useCelebration({ feel: felt });
  const stage = Math.min(width, 420);
  const glowSize = Math.min(stage, 300);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(announce);
    // Said once, as it opens.
  }, []);

  const scale = moment.plan.travel ? moment.art.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) : 1;
  const opacity = moment.art.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const lift = moment.plan.travel ? moment.details.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) : 0;

  return (
    // The scrim fades either way; under Reduce Motion the moment is that fade and nothing else.
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Drawn over the page, not beside its controls: their groups' caps stop here. */}
      <ReachReset>
        <DarkScheme>
          <View style={[styles.backdrop, { backgroundColor: STAGE }]} accessibilityViewIsModal>
            <View style={[styles.column, { maxWidth: 420 }]}>
              <Pressable
                onPress={moment.playing ? moment.skip : undefined}
                disabled={!moment.playing}
                // A skip while it plays; afterwards only the picture, not a nameless button.
                accessible={moment.playing}
                accessibilityRole={moment.playing ? 'button' : undefined}
                accessibilityLabel={moment.playing ? t('common.skip') : undefined}
                style={[styles.artStage, { width: stage, height: glowSize }]}
              >
                <SoftGlow colour={glow} size={glowSize} />
                {moment.plan.travel ? <GlowRing progress={moment.ring} colour={glow} size={glowSize * 0.62} /> : null}
                {moment.plan.travel ? (
                  <ConfettiBurst progress={moment.burst} count={flecks} seed={seed} colours={fleckColours} reach={Math.min(stage * 0.48, 190)} />
                ) : null}
                <Animated.View style={{ opacity, transform: [{ scale }] }}>{art}</Animated.View>
              </Pressable>
              <Animated.View style={[styles.words, { opacity: moment.details, transform: [{ translateY: lift }] }]}>
                <Text style={[sectionLabel, styles.kicker, { color: glow }]}>{kicker}</Text>
                <Text style={styles.title} accessibilityRole="header">
                  {title}
                </Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                {detail ? (
                  <View style={styles.detail}>
                    <Text style={styles.detailText}>{detail}</Text>
                  </View>
                ) : null}
                {note ? <Text style={styles.note}>{note}</Text> : null}
                <View style={styles.actions}>{actions}</View>
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
  words: { alignItems: 'center', alignSelf: 'stretch', gap: spacing.xs },
  kicker: { letterSpacing: 2 },
  title: { ...display(typography.sizes.title), color: '#FFFFFF', textAlign: 'center' },
  subtitle: { fontSize: typography.sizes.text, color: 'rgba(255,255,255,0.78)', textAlign: 'center' },
  detail: { marginTop: spacing.md, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  detailText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, color: '#FFFFFF', textAlign: 'center' },
  note: { fontSize: typography.sizes.text, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20, marginTop: spacing.sm, maxWidth: 320 },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.xl },
});
