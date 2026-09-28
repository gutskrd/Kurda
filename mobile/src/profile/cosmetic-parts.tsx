import { Image, StyleSheet, Text, View } from 'react-native';
import { assetUrl } from '../api/env';
import { radii, spacing, typography } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { ProfileBackground, ProfileIcon } from './types';

/**
 * The equipped cosmetics, drawn the way the browser draws them.
 *
 * Presentation only: whether somebody owns a thing, and whether a premium item
 * is theirs to wear today, is settled server-side long before any of this sees
 * a value. Kept in one file per app for the reason the browser keeps its own —
 * the popup and the full profile must not drift — and written against the same
 * shapes so the two apps cannot either.
 */

/**
 * An equipped background.
 *
 * `image` and `gif` both go through `Image`; a GIF animates on its own on iOS,
 * and on Android through the decoder Expo ships. `video` does not render at
 * all: playing one needs `expo-video`, a native module, and the phone would
 * have to be rebuilt to carry it. A still frame is not available either — the
 * server sends a URL and a type and no poster — so rather than draw a black
 * rectangle where a background should be, this draws nothing and the screen's
 * own gradient shows through.
 */
export function CosmeticBackground({
  background,
  style,
}: {
  background: ProfileBackground;
  style?: object;
}): React.JSX.Element | null {
  if (background.type === 'video') return null;
  return <Image source={{ uri: background.url }} style={style} resizeMode="cover" accessibilityElementsHidden />;
}

/**
 * The equipped premium icon, straddling the edge of the avatar.
 *
 * A layer over the avatar and never baked into it: the avatar is a photo
 * somebody uploaded, and the icon is a thing they are wearing on top of it.
 * `size` is the avatar's, and the icon is a third of it in the bottom-trailing
 * corner, which is where the browser's CSS puts it.
 */
export function IconOverlay({ icon, size }: { icon: ProfileIcon; size: number }): React.JSX.Element {
  const { t } = useI18n();
  const d = Math.round(size / 3);
  return (
    <Image
      source={{ uri: icon.url }}
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
      <Text style={[styles.premiumText, { color: colors.textOnPrimary }]}>{t('profile.premium')}</Text>
    </View>
  );
}

/**
 * Who gave them what they are wearing.
 *
 * Half the point of a gift is that it is seen to be from somebody. Without
 * this a gifted background is indistinguishable from a bought one the moment
 * it is equipped, which is a present with the card thrown away.
 *
 * Whole sentences rather than a noun plus " gifted by ": which word order that
 * takes, and whether the noun changes shape, is not the same in nine
 * languages. Nothing renders when nothing was gifted — a line saying so would
 * be noise on the great majority of profiles.
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
  const notes: string[] = [];
  if (background?.giftedBy) notes.push(t('profile.backgroundGiftedBy', { name: background.giftedBy.username }));
  if (icon?.giftedBy) notes.push(t('profile.iconGiftedBy', { name: icon.giftedBy.username }));
  if (notes.length === 0) return null;

  return (
    <View style={styles.gifts}>
      {notes.map((text) => (
        <View key={text} style={styles.gift}>
          <Icon name="gem" size={14} color={colors.gold} />
          <Text style={[styles.giftText, { color: colors.textSecondary }]}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Where a flag picture comes from.
 *
 * The roster itself is `@kurda/shared`, the same one the browser reads, so the
 * two apps cannot end up with different country lists. Flags come from
 * flagcdn as small cached PNGs, because emoji flags do not render on every
 * platform — except Kurdistan's, which no service that only knows about states
 * will serve, so Hevalo serves its own.
 */
export function flagUrl(code: string): string {
  if (code.toUpperCase() === 'KU') return assetUrl('/flags/kurdistan.png') ?? '';
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

/**
 * A poem or a story somebody put on their profile on purpose.
 *
 * Here rather than on a screen because two screens show it: your own profile and
 * somebody else's. It lived on `ProfileScreen` while only that one did, and the
 * moment a second screen needed it was the moment it would otherwise have been
 * copied — which is the drift this file exists to prevent.
 */
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
  gift: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  giftText: { fontSize: typography.sizes.xs },
  favorite: { alignSelf: 'stretch', gap: 2, marginTop: spacing.md },
  favoriteLabel: { fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  favoriteTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
});
