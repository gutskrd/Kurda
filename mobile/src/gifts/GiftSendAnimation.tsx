import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { GIFT_SENT_FADE_MS, GIFT_SENT_LOOK, GIFT_SENT_MS, type GiftTier } from '@kurda/shared';
import { assetUrl } from '../api/env';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo } from '../theme/animate';
import { DarkScheme } from '../theme/ThemeProvider';
import { PALETTES } from '../theme/palette';
import { spacing, typography } from '../theme/tokens';
import { GiftBox } from './art';
import { GiftLight } from './GiftLight';

/** The picture's size in the sender's moment: the opened gift's, smaller. */
const ART = 96;

/**
 * The sender's moment as a gift goes (shared gift-moment.ts): the gift springs in, smaller, in the same light it will
 * open in, with who it went to, and is gone after a moment. Under Reduce Motion the light is still and it simply shows,
 * then goes. It never takes a tap, and announces what happened once.
 */
export function GiftSendAnimation({
  tier,
  item,
  announce,
  onDone,
}: {
  tier: GiftTier;
  /** what was sent: its picture, and its sku for its colour; without one the wrapped box shows */
  item?: { sku: string; assetUrl: string | null };
  /** Said aloud and shown under it: "Gift sent to Rojda". */
  announce: string;
  onDone: () => void;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const colors = PALETTES.dark;
  const shown = useRef(new Animated.Value(0)).current;
  const art = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(announce);
    const run = Animated.sequence([
      Animated.parallel([
        Animated.timing(shown, { toValue: 1, duration: reduce ? 0 : GIFT_SENT_FADE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        reduce ? Animated.delay(0) : springTo(art, 1, 'bouncy'),
      ]),
      Animated.delay(GIFT_SENT_MS),
      Animated.timing(shown, { toValue: 0, duration: reduce ? 0 : GIFT_SENT_FADE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    run.start(() => done.current());
    return () => run.stop();
  }, [announce, shown, art, reduce]);

  const uri = item ? assetUrl(item.assetUrl) : null;
  const scale = art.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <View style={styles.overlay} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="gift-sent">
      <DarkScheme>
        <Animated.View style={[styles.overlay, { opacity: shown }]}>
          {/* the screen dims a little, to the night's own page colour, so the line reads in either scheme */}
          <View style={[styles.overlay, styles.dim, { backgroundColor: colors.background }]} />
          <GiftLight sku={item?.sku ?? ''} look={GIFT_SENT_LOOK} art={ART} lit still={reduce}>
            <Animated.View style={{ opacity: art, transform: [{ scale }] }}>
              {uri ? (
                <Image source={{ uri }} style={styles.art} resizeMode="contain" accessibilityIgnoresInvertColors />
              ) : (
                <GiftBox size={ART} tier={tier} gold={colors.gold} />
              )}
            </Animated.View>
          </GiftLight>
          <Text style={[styles.line, { color: colors.textPrimary }]}>{announce}</Text>
        </Animated.View>
      </DarkScheme>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.55 },
  art: { width: ART, height: ART },
  line: { marginTop: spacing.xs, fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
});
