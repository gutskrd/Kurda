import { useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { useI18n } from '../i18n/I18nContext';
import { assetUrl } from '../api/env';
import { useArtOverrides } from '../art/overrides';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import type { SessionUser } from '../auth/AuthContext';
import { DEFAULT_AVATAR_PATH, profilePictureUrl } from './cosmetics';

/** Your own avatar from the session: as others see it once /me has answered, your photo or the default until then. */
export function ownAvatarUrl(user: Pick<SessionUser, 'avatarUrl' | 'profilePhotoUrl'> | null | undefined): string | null {
  return user?.avatarUrl ?? user?.profilePhotoUrl ?? null;
}

/**
 * A round avatar: the person's picture, or the default deer everyone without one wears, as on the website. The server
 * sends site-relative paths for the default avatars, and one replaced in the admin is tried before the shipped file. If
 * no picture loads at all (offline on a first run), a person glyph stands in.
 */
export function Avatar({
  name,
  size = 44,
  style,
  photoUrl,
}: {
  /** Whose avatar it is, for screen readers; empty for a picture that stands for nobody yet (the avatar picker). */
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Their picture as the server resolved it; absent or null falls back to the default deer. */
  photoUrl?: string | null;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const overrides = useArtOverrides();
  const [broken, setBroken] = useState<readonly string[]>([]);

  const resolved = [photoUrl, DEFAULT_AVATAR_PATH]
    .flatMap((url) => [profilePictureUrl(url, overrides), assetUrl(url)])
    .find((url): url is string => !!url && !broken.includes(url));
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (resolved) {
    return (
      <Image
        source={{ uri: resolved }}
        onError={() => setBroken((b) => [...b, resolved])}
        accessibilityRole="image"
        accessibilityLabel={name ? t('profile.avatarOf', { name }) : t('profile.photoLabel')}
        style={[round, { backgroundColor: colors.controlTrack }, style as StyleProp<ImageStyle>]}
      />
    );
  }
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? t('profile.avatarOf', { name }) : t('profile.avatar')}
      style={[round, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.controlTrack }, style]}
    >
      <Icon name="person" size={Math.round(size * 0.5)} tone="secondary" />
    </View>
  );
}
