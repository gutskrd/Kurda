import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { DarkScheme } from '../theme/ThemeProvider';
import { display, sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { ConfettiBurst, GlowRing, SoftGlow, useCelebration } from '../theme/CelebrationParts';
import { useI18n } from '../i18n/I18nContext';

/** The night the moment is staged on, in either scheme. */
const STAGE = '#07080c';

/**
 * A moment on its own stage: a new division, a new tier, a first placement,
 * a new league, a badge. Night-dark whatever the scheme (the art is light on
 * dark), and the same short sequence every time (theme/celebration.ts): the
 * thing earned springs in, a ring of its colour widens once behind it, a
 * light handful of flecks in its colours is thrown out and falls away, it is
 * felt once as it lands, and then the words fade in. All of it is over in
 * about a second and a half and a tap on the art skips to the end; after
 * that nothing moves while the words are read. Under Reduce Motion it is a
 * fade.
 *
 * Nothing here asks for anything back. One button continues, and the
 * backdrop does not trap anybody: the system back closes it too.
 *
 * It is felt only when the person just did the thing it celebrates. One that
 * is shown rather than caused — a badge earned before the app was opened, a
 * league moved up while nobody was watching — plays the same and stays still
 * in the hand: a buzz on opening the app is a buzz nobody asked for.
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
  /** the emblem or medallion, drawn at ~168pt */
  art: ReactNode;
  /** the glow behind it, and the ring */
  glow: string;
  /** how many flecks are thrown (0 for none) */
  flecks: number;
  fleckColours: string[];
  /** keeps the same moment looking the same */
  seed: number;
  /** "NEW TIER" */
  kicker: string;
  /** "Gir I" */
  title: string;
  /** "Hill" */
  subtitle?: string | null;
  /** what earned it: "+26 · you beat a higher-ranked player" */
  detail?: string | null;
  /** a line under it: the shield, a badge's tier */
  note?: string | null;
  /** buttons; a Continue is the caller's to give */
  actions: ReactNode;
  /** what a screen reader hears as it opens */
  announce: string;
  onClose: () => void;
  /** false for a moment the person did not just cause (see above) */
  felt?: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const moment = useCelebration({ feel: felt });
  const stage = Math.min(width, 420);
  const glowSize = Math.min(stage, 300);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(announce);
    // said once, as it opens
  }, []);

  const scale = moment.plan.travel ? moment.art.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) : 1;
  const opacity = moment.art.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const lift = moment.plan.travel ? moment.details.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) : 0;

  return (
    // the scrim fades either way; under Reduce Motion the moment is that fade and nothing else
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <DarkScheme>
        <View style={[styles.backdrop, { backgroundColor: STAGE }]} accessibilityViewIsModal>
          <View style={[styles.column, { maxWidth: 420 }]}>
            <Pressable
              onPress={moment.playing ? moment.skip : undefined}
              disabled={!moment.playing}
              // a skip while it plays; afterwards only the picture, not a nameless button
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  column: { width: '100%', alignItems: 'center' },
  artStage: { alignItems: 'center', justifyContent: 'center' },
  words: { alignItems: 'center', alignSelf: 'stretch', gap: spacing.xs },
  kicker: { letterSpacing: 2 },
  title: { ...display(typography.sizes.xxl + 6), color: '#FFFFFF', textAlign: 'center' },
  subtitle: { fontSize: typography.sizes.lg, color: 'rgba(255,255,255,0.78)', textAlign: 'center' },
  detail: { marginTop: spacing.md, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  detailText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#FFFFFF', textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20, marginTop: spacing.sm, maxWidth: 320 },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.xl },
});
