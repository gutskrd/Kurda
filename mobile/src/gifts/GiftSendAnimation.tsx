import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { GIFT_BOX_SEND_ITEM, GIFT_BOX_SEND_MS, GIFT_SENT_FADE_MS, GIFT_SENT_LOOK, GIFT_SENT_MS, type GiftTier } from '@kurda/shared';
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
/** The box it is wrapped in: larger than the gift's square, since the drawing leaves room round the box. */
const BOX = 120;

/**
 * The sender's moment as a gift goes (shared gift-moment.ts): the gift springs in, smaller, in the same light it will
 * open in, with who it went to; then its tier's box drops over it, is tied and flies off (shared `GIFT_BOX_SEND`), and
 * the moment is gone. Under Reduce Motion the light is still and the gift simply shows, then goes. It never takes a
 * tap, and announces what happened once.
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
  // the gift goes into its box as the box lands over it, on the box's clock
  const wrap = useRef(new Animated.Value(0)).current;
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
    const wrapping = reduce ? null : Animated.timing(wrap, { toValue: 1, duration: GIFT_BOX_SEND_MS, easing: Easing.linear, useNativeDriver: true });
    wrapping?.start();
    return () => {
      run.stop();
      wrapping?.stop();
    };
  }, [announce, shown, art, wrap, reduce]);

  const uri = item ? assetUrl(item.assetUrl) : null;
  const scale = art.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const inputRange = GIFT_BOX_SEND_ITEM.map((k) => k.at);
  const into = reduce
    ? null
    : {
        opacity: wrap.interpolate({ inputRange, outputRange: GIFT_BOX_SEND_ITEM.map((k) => k.o), extrapolate: 'clamp' }),
        transform: [{ scale: wrap.interpolate({ inputRange, outputRange: GIFT_BOX_SEND_ITEM.map((k) => k.sx), extrapolate: 'clamp' }) }],
      };
  return (
    <View style={styles.overlay} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="gift-sent">
      <DarkScheme>
        <Animated.View style={[styles.overlay, { opacity: shown }]}>
          {/* the screen dims a little, to the night's own page colour, so the line reads in either scheme */}
          <View style={[styles.overlay, styles.dim, { backgroundColor: colors.background }]} />
          <GiftLight sku={item?.sku ?? ''} look={GIFT_SENT_LOOK} art={ART} lit still={reduce}>
            <View style={styles.stage}>
              <Animated.View style={{ opacity: art, transform: [{ scale }] }}>
                {uri ? (
                  <Animated.View style={into}>
                    <Image source={{ uri }} style={styles.art} resizeMode="contain" accessibilityIgnoresInvertColors />
                  </Animated.View>
                ) : (
                  <GiftBox size={ART} tier={tier} />
                )}
              </Animated.View>
              {uri && !reduce ? <GiftBox size={BOX} tier={tier} motion="send" style={styles.box} testID="gift-send-box" /> : null}
            </View>
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
  stage: { width: ART, height: ART },
  box: { position: 'absolute', left: (ART - BOX) / 2, top: (ART - BOX) / 2 },
  line: { marginTop: spacing.xs, fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textAlign: 'center' },
});
