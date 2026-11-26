/**
 * The moment a bundle is bought, in the spirit of a gift's (gifts/GiftUnwrap.tsx): the screen dims to night and, in the
 * bundle's own light, you stand wearing the set — your face in its frame over a disc of its background, the icon on your
 * shoulder, the tag under you — with what came and where the gifts went. Wear the set puts it all on at once. Under
 * Reduce Motion the light is there and nothing moves.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Modal, StyleSheet, Text, View } from 'react-native';
import { GIFT_MOMENT_LOOK, bundleGlow, type BundleView } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { assetUrl } from '../api/env';
import { GiftLight } from '../gifts/GiftLight';
import { useI18n } from '../i18n/I18nContext';
import { TagPill } from '../profile/TagPill';
import { useDirection } from '../reports/direction';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { display } from '../theme/fonts';
import { PALETTES } from '../theme/palette';
import { ReachReset } from '../theme/Pressable';
import { DarkScheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { WornFace, partOf } from './Bundles';

const ART = 176;

export function BundleMoment({
  bundle,
  onWear,
  onClose,
}: {
  bundle: BundleView;
  /** puts the whole set on; resolves false when that did not go through */
  onWear: () => Promise<boolean>;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  // The moment is night in either scheme.
  const colors = PALETTES.dark;
  const [worn, setWorn] = useState<'no' | 'busy' | 'yes' | 'failed'>('no');
  const pop = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const background = assetUrl(partOf(bundle, 'background')?.assetUrl);
  const tag = partOf(bundle, 'tag');

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(t('bundle.isYours', { name: bundle.name }));
    if (reduce) return;
    const spring = Animated.spring(pop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true });
    spring.start();
    return () => spring.stop();
  }, [bundle.name, pop, reduce, t]);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <Modal visible transparent animationType={reduce ? 'none' : 'fade'} onRequestClose={onClose}>
      <ReachReset>
        <DarkScheme>
          <View style={styles.backdrop}>
            <View style={[styles.fill, styles.dim, { backgroundColor: colors.background }]} pointerEvents="none" />
            <View style={styles.panel} accessibilityViewIsModal testID="bundle-moment">
              <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
                {t('bundle.isYours', { name: bundle.name })}
              </Text>
              <GiftLight sku={bundle.id} look={GIFT_MOMENT_LOOK.rare} art={ART} lit still={reduce} glow={bundleGlow(bundle.id)}>
                <Animated.View style={[styles.set, { opacity: pop, transform: [{ scale }] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {background ? <Image source={{ uri: background }} style={styles.disc} resizeMode="cover" /> : null}
                  <WornFace frameUrl={partOf(bundle, 'frame')?.assetUrl} iconUrl={partOf(bundle, 'icon')?.assetUrl} size={ART} />
                </Animated.View>
              </GiftLight>
              {tag ? <TagPill tag={{ label: tag.name, meaning: tag.description }} solid style={styles.center} /> : null}
              <View style={[styles.list, { flexDirection: dir.row }]}>
                {bundle.parts.map((p) => (
                  <Text key={p.sku} style={[styles.line, { color: colors.textSecondary }]} accessibilityLanguage="ku">
                    {p.name}
                  </Text>
                ))}
              </View>
              {bundle.gifts.length > 0 ? <Text style={[styles.line, { color: colors.textSecondary }]}>{t('bundle.giftsLanded')}</Text> : null}
              <View style={styles.actions}>
                {worn === 'yes' ? (
                  <View style={[styles.done, { flexDirection: dir.row }]} accessibilityLiveRegion="polite">
                    <Icon name="check" size={18} color={colors.textPrimary} />
                    <Text style={[styles.line, { color: colors.textPrimary }]}>{t('bundle.wearing')}</Text>
                  </View>
                ) : (
                  <ClayButton
                    label={t('bundle.wearAll')}
                    tone="primary"
                    size="large"
                    busy={worn === 'busy'}
                    onPress={() => {
                      setWorn('busy');
                      void onWear().then((ok) => setWorn(ok ? 'yes' : 'failed'));
                    }}
                  />
                )}
                {worn === 'failed' ? <Text style={[styles.line, { color: colors.danger }]}>{t('common.tryAgain')}</Text> : null}
                <ClayButton label={t('common.done')} variant="outline" onPress={onClose} />
              </View>
            </View>
          </View>
        </DarkScheme>
      </ReachReset>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  dim: { opacity: 0.9 },
  panel: { width: '100%', maxWidth: 420, alignItems: 'center', gap: spacing.sm },
  title: { ...display(typography.sizes.title), textAlign: 'center' },
  set: { width: ART, height: ART, alignItems: 'center', justifyContent: 'center' },
  disc: { position: 'absolute', top: ART * 0.08, left: ART * 0.08, width: ART * 0.84, height: ART * 0.84, borderRadius: radii.pill },
  center: { alignSelf: 'center' },
  list: { flexWrap: 'wrap', justifyContent: 'center', columnGap: spacing.md, rowGap: 2 },
  line: { fontSize: typography.sizes.text, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  done: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 50 },
});
