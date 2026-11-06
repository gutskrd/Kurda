import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { shouldShowRefreshNotice, type RefreshedInventory } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import type { InventoryItem } from '../profile/cosmetics';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';

/**
 * Items whose art was redrawn (shared/src/cosmetics.ts).
 *
 * The shop's backgrounds and icons are drawn by code now. Every item somebody
 * already owned got new art in the same mood and stayed theirs, and they are
 * told so once. That is all: a purchase is final, so there is nothing to hand
 * back and nowhere this sends them to do it.
 */

type Inventory = { items: InventoryItem[] } & Partial<RefreshedInventory>;

const getInventory = (client: ApiClient): Promise<ApiResult<Inventory>> => client.get('/me/inventory');
const markSeen = (client: ApiClient): Promise<ApiResult<{ seen: boolean }>> => client.post('/me/inventory/refreshed/seen');

/**
 * "We refreshed some backgrounds and icons — they're still yours", once.
 *
 * Mounted beside the screens. It asks the inventory when the app opens; when
 * there is something the person has not been told about, a small sheet says
 * so. Closing it marks it seen, on every device.
 */
export function RefreshedNotice(): React.JSX.Element | null {
  const { client, user, isGuest } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // a guest owns nothing from the shop, and the inventory is refused to one
    if (!user || isGuest) return;
    let active = true;
    void getInventory(client).then((res) => {
      if (active && res.ok && shouldShowRefreshNotice(res.data)) setOpen(true);
    });
    return () => {
      active = false;
    };
  }, [client, user, isGuest]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    void markSeen(client);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]} accessibilityViewIsModal>
          <View style={[styles.badge, { backgroundColor: colors.controlTrack }]}>
            <Icon name="palette" size={28} tone="primary" />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('shop.refreshed.title')}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{t('shop.refreshed.bodyKeep')}</Text>
          <ClayButton label={t('shop.refreshed.ok')} tone="primary" onPress={close} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    gap: spacing.sm,
    alignItems: 'stretch',
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  badge: { width: 56, height: 56, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, textAlign: 'center' },
  body: { fontSize: typography.sizes.sm, lineHeight: 20, textAlign: 'center' },
});
