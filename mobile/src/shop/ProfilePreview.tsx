/**
 * Trying a look on before buying it: the top of your own profile as others see it, wearing what you have on now with
 * the item or the bundle laid over it. Nothing is saved and only you see it.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { itemCategory, isWordTag, type ProfileWordTag } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { Avatar, ownAvatarUrl } from '../profile/Avatar';
import { IconOverlay } from '../profile/cosmetic-parts';
import { FACE, FRAMED, ProfileHead } from '../profile/ProfileHead';
import type { ProfileBackground, ProfileIcon, LevelInfo } from '../profile/types';
import { Framed, frameTierOf } from '../ranks/art';
import { TIER_NAME_KEY } from '../ranks/format';
import { SHEET_MAX_WIDTH } from '../reports/sheet';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

/** What a preview lays over your profile; anything left out stays as you wear it now. */
export interface PreviewLook {
  background?: ProfileBackground;
  icon?: ProfileIcon;
  frame?: { sku: string; url: string };
  tag?: ProfileWordTag;
}

/** A shop item as the part of a look it would be on a profile; empty for an item that is not worn. */
export function lookOf(item: { sku: string; name: string; description: string | null; category: string; assetUrl: string | null }): PreviewLook {
  const kind = itemCategory(item.category);
  if (kind === 'tag') return isWordTag(item) ? { tag: { sku: item.sku, label: item.name, meaning: item.description } } : {};
  if (!item.assetUrl) return {};
  if (kind === 'background') return { background: { sku: item.sku, assetKey: item.sku, url: item.assetUrl, type: /\.(mp4|webm)$/i.test(item.assetUrl) ? 'video' : 'image' } };
  if (kind === 'icon') return { icon: { sku: item.sku, assetKey: item.sku, url: item.assetUrl } };
  if (kind === 'frame') return { frame: { sku: item.sku, url: item.assetUrl } };
  return {};
}

/** Whether an item can be tried on: something worn on a profile, with what it needs to be drawn. */
export function canTryOn(item: Parameters<typeof lookOf>[0]): boolean {
  return Object.keys(lookOf(item)).length > 0;
}

interface Mine {
  displayName?: string | null;
  avatarUrl?: string | null;
  background?: ProfileBackground | null;
  icon?: ProfileIcon | null;
  frameSku?: string | null;
  frameUrl?: string | null;
  tag?: ProfileWordTag | null;
  level?: LevelInfo | null;
}

export function ProfilePreview({ look }: { look: PreviewLook }): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const { width } = useWindowDimensions();
  const [mine, setMine] = useState<Mine | null>(null);

  // What you wear now, as your profile shows it to others.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void client.get<Mine>(`/users/${user.id}`).then((res) => {
      if (alive && res.ok) setMine(res.data);
    });
    return () => {
      alive = false;
    };
  }, [client, user]);

  const frameSku = look.frame?.sku ?? mine?.frameSku ?? null;
  const frameUrl = look.frame ? look.frame.url : (mine?.frameUrl ?? null);
  const icon = look.icon ?? mine?.icon ?? null;
  const name = mine?.displayName || user?.displayName || user?.username || '';
  const framed = !!frameTierOf(frameSku) || !!(frameSku && frameUrl);
  return (
    <View style={styles.wrap} testID="profile-preview">
      <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} accessibilityRole="header">
        {t('shop.previewTitle')}
      </Text>
      <ProfileHead
        seed={user?.id ?? 'preview'}
        width={Math.min(width, SHEET_MAX_WIDTH)}
        background={look.background ?? mine?.background ?? null}
        face={
          <Framed sku={frameSku} url={frameUrl} size={FRAMED} label={(tier) => t('season.frameOf', { tier: t(TIER_NAME_KEY[tier]) })}>
            <Avatar name={name} size={FACE} photoUrl={mine?.avatarUrl ?? ownAvatarUrl(user)} />
            {icon ? <IconOverlay icon={icon} size={FACE} /> : null}
          </Framed>
        }
        framed={framed}
        name={name}
        level={mine?.level ?? null}
        tag={look.tag ?? mine?.tag ?? null}
        handle={`@${user?.username ?? ''}`}
      />
      <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('shop.previewNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, paddingBottom: spacing.md },
  title: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  note: { fontSize: typography.sizes.text, lineHeight: 22 },
});
