import { Image, StyleSheet, Text, View } from 'react-native';
import { assetUrl } from '../api/env';
import { radii, spacing, typography } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
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
 * Who gave them what they are wearing, so a gifted item is seen to be from somebody. Whole sentences rather than a noun
 * plus " gifted by ", since word order and noun forms differ across the nine languages. Nothing renders when nothing
 * was gifted.
 */
export function GiftedNote({
  background,
  icon,
}: {
  background?: ProfileBackground | null;
  icon?: ProfileIcon | null;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const notes: string[] = [];
  if (background?.giftedBy) notes.push(t('profile.backgroundGiftedBy', { name: background.giftedBy.username }));
  if (icon?.giftedBy) notes.push(t('profile.iconGiftedBy', { name: icon.giftedBy.username }));
  if (notes.length === 0) return null;

  /*
   * A quiet line, its mark in the line's own grey: a gift is not earned, which is what gold is kept for. Right to left,
   * the mark leads on the right.
   */
  return (
    <View style={styles.gifts}>
      {notes.map((text) => (
        <View key={text} style={[styles.gift, { flexDirection: dir.row }]}>
          <Icon name="gift" size={14} color={colors.textSecondary} />
          <Text style={[styles.giftText, dir.text, { color: colors.textSecondary }]}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Where a flag picture comes from. The country list is `@kurda/shared`'s, as the browser's. Flags are small cached PNGs
 * from a flag CDN, since emoji flags do not render on every platform; Kurdistan's is served by Hevalo, since services
 * that only know states do not have it.
 */
export function flagUrl(code: string): string {
  if (code.toUpperCase() === 'KU') return assetUrl('/flags/kurdistan.png') ?? '';
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

/** A poem or story somebody pinned to their profile, shared by your own profile and somebody else's. */
export function FavoriteRow({ label, title }: { label: string; title: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.favorite}>
      <Text style={[styles.favoriteLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.favoriteTitle, { color: colors.textPrimary }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  premium: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  premiumText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  gifts: { gap: 2, marginTop: spacing.xs },
  gift: { alignItems: 'center', gap: spacing.xs },
  giftText: { fontSize: typography.sizes.xs },
  favorite: { alignSelf: 'stretch', gap: 2, marginTop: spacing.md },
  favoriteLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  favoriteTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
});
