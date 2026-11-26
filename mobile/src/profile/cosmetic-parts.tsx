import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { flagSvg } from '@kurda/shared/src/flags';
import { assetUrl } from '../api/env';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { ProfileBackground, ProfileIcon } from './types';

/**
 * The equipped cosmetics, drawn as the browser draws them. Presentation only: ownership and whether a premium item may
 * be worn today are settled server-side. One file per app, written against the same shapes as the browser's, so the
 * popup and the full profile cannot drift.
 */

/**
 * An equipped background. `image` and `gif` go through `Image` (a GIF animates on its own on iOS, and on Android
 * through Expo's decoder). `video` is not drawn: it would need `expo-video`, a native module, and the server sends no
 * poster frame, so the screen's own gradient shows through instead of a black rectangle. The URL goes through
 * `assetUrl`, since shipped backgrounds arrive as site paths and admin-added ones as whole CDN addresses.
 */
export function CosmeticBackground({
  background,
  style,
}: {
  background: ProfileBackground;
  style?: object;
}): React.JSX.Element | null {
  const uri = assetUrl(background.url);
  if (background.type === 'video' || !uri) return null;
  return <Image source={{ uri }} style={style} resizeMode="cover" accessibilityElementsHidden />;
}

/**
 * The equipped premium icon straddling the avatar's edge: a layer over the avatar, never baked into the photo. `size`
 * is the avatar's; the icon is a third of it in the bottom-trailing corner, as the browser's CSS places it.
 */
export function IconOverlay({ icon, size }: { icon: ProfileIcon; size: number }): React.JSX.Element | null {
  const { t } = useI18n();
  const d = Math.round(size / 3);
  // A site path for shipped icons, a CDN address for uploaded ones (as the background above).
  const uri = assetUrl(icon.url);
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      accessibilityRole="image"
      accessibilityLabel={t('profile.premiumIcon')}
      style={{ position: 'absolute', right: -d / 6, bottom: -d / 6, width: d, height: d }}
      resizeMode="contain"
    />
  );
}

/** A gold pill, for an account that is paying. */
export function PremiumPill(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.premium, { backgroundColor: colors.gold }]}>
      <Text style={[styles.premiumText, { color: colors.textOnGold }]}>{t('profile.premium')}</Text>
    </View>
  );
}

/**
 * A country's small flag before its name, drawn by Hevalo (shared/src/flags.ts), so it shows at once, offline too, and
 * no outside service learns who looked. Left out for a code with no flag. Decorative: the name beside it says it.
 */
export function Flag({ code }: { code: string }): React.JSX.Element | null {
  const { colors } = useTheme();
  const xml = useMemo(() => flagSvg(code), [code]);
  if (!xml) return null;
  return (
    <View style={[styles.flag, { borderColor: colors.separator }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={xml} width={FLAG_W} height={FLAG_H} preserveAspectRatio="xMidYMid slice" />
    </View>
  );
}

/** A flag's size: 3:2, as tall as a capital letter. */
const FLAG_W = 21;
const FLAG_H = 14;

const styles = StyleSheet.create({
  premium: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  premiumText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  // A hairline so a white band keeps its edge on a white page, as on the website.
  flag: { width: FLAG_W, height: FLAG_H, borderRadius: radii.none, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
