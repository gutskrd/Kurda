import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { shouldShowRefreshNotice, type ItemRefund, type RefreshedInventory, type ReturnItemResult } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import { describeError } from '../api/errors';
import { assetUrl } from '../api/env';
import type { RootNavigation } from '../navigation/rootStack';
import type { InventoryItem } from '../profile/cosmetics';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ClayButton } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { currencyLabel } from './format';

/**
 * Items whose art was redrawn, and handing one back (shared/src/cosmetics.ts).
 *
 * The shop's backgrounds and icons are drawn by code now. Every item somebody
 * already owned got new art in the same mood and stayed theirs; they are told
 * once, and any item they paid for can be returned for what they paid. Two
 * pieces: the one-time notice, wherever the app is when it loads, and the
 * list with the Return buttons at the top of the Shop, which stays for as
 * long as there is something to return.
 */

type Inventory = { items: Array<InventoryItem & { refund?: ItemRefund | null }> } & Partial<RefreshedInventory>;

const getInventory = (client: ApiClient): Promise<ApiResult<Inventory>> => client.get('/me/inventory');
const markSeen = (client: ApiClient): Promise<ApiResult<{ seen: boolean }>> => client.post('/me/inventory/refreshed/seen');
const returnItem = (client: ApiClient, sku: string): Promise<ApiResult<ReturnItemResult>> =>
  client.post(`/shop/items/${encodeURIComponent(sku)}/return`);

const RETURN_COPY: Record<string, TranslationKey> = {
  NOTHING_TO_REFUND: 'shop.return.nothing',
  NOT_RETURNABLE: 'shop.return.notReturnable',
  ITEM_NOT_FOUND: 'shop.return.notReturnable',
  RETURN_CONFLICT: 'shop.return.failed',
};

/**
 * "We refreshed some backgrounds and icons", once.
 *
 * Mounted beside the screens. It asks the inventory when the app opens; when
 * there is something the person has not been told about, a small sheet says
 * so with a way to the Shop. Either button marks it seen, on every device.
 */
export function RefreshedNotice(): React.JSX.Element | null {
  const { client, user } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void getInventory(client).then((res) => {
      if (active && res.ok && shouldShowRefreshNotice(res.data)) setOpen(true);
    });
    return () => {
      active = false;
    };
  }, [client, user]);

  if (!open) return null;

  const close = (toShop: boolean) => {
    setOpen(false);
    void markSeen(client);
    if (toShop) navigation.navigate('Shop');
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]} accessibilityViewIsModal>
          <View style={[styles.badge, { backgroundColor: colors.controlTrack }]}>
            <Icon name="palette" size={28} tone="primary" />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('shop.refreshed.title')}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{t('shop.refreshed.body')}</Text>
          <ClayButton label={t('shop.refreshed.open')} tone="primary" onPress={() => close(true)} />
          <ClayButton label={t('shop.refreshed.ok')} onPress={() => close(false)} />
        </View>
      </View>
    </Modal>
  );
}

/**
 * The refreshed items you can hand back, at the top of the Shop. Nothing at
 * all when there are none.
 */
export function RefreshedItems({
  onReturned,
}: {
  /** the balance in the refund's currency after a return */
  onReturned?: (currency: ItemRefund['currency'], balance: number) => void;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [items, setItems] = useState<Array<InventoryItem & { refund: ItemRefund }>>([]);
  const [asking, setAsking] = useState<(InventoryItem & { refund: ItemRefund }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await getInventory(client);
    if (!res.ok) return;
    setItems(res.data.items.filter((i): i is InventoryItem & { refund: ItemRefund } => !!i.refund));
    // the Shop itself is where the notice points: being here is being told
    if (shouldShowRefreshNotice(res.data)) void markSeen(client);
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async () => {
    if (!asking || busy) return;
    const item = asking;
    setBusy(true);
    const res = await returnItem(client, item.sku);
    setBusy(false);
    setAsking(null);
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.sku !== item.sku));
      setMessage({
        ok: true,
        text: t('shop.return.done', { amount: res.data.refund.amount, currency: currencyLabel(res.data.refund.currency) }),
      });
      onReturned?.(res.data.refund.currency, res.data.balance);
      return;
    }
    const key = res.error.code ? RETURN_COPY[res.error.code] : undefined;
    setMessage({ ok: false, text: key ? t(key) : describeError(res.error, t) });
    // what the server says now wins: a present, or one already returned elsewhere, leaves the list
    void load();
  };

  if (items.length === 0 && !message) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.glassFill }]}>
      {items.length > 0 ? (
        <>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]} accessibilityRole="header">
            {t('shop.refreshed.section')}
          </Text>
          <Text style={[styles.body, styles.left, { color: colors.textSecondary }]}>{t('shop.refreshed.sectionHint')}</Text>
        </>
      ) : null}
      {items.map((item) => {
        const refund = { amount: item.refund.amount, currency: currencyLabel(item.refund.currency) };
        return (
          <View key={item.sku} style={styles.row}>
            {assetUrl(item.assetUrl) ? (
              // the art lives on the website, by a path; the phone needs the whole address
              <Image source={{ uri: assetUrl(item.assetUrl)! }} style={styles.thumb} accessibilityIgnoresInvertColors />
            ) : (
              <View style={[styles.thumb, { backgroundColor: colors.controlTrack }]} />
            )}
            <View style={styles.rowMain}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.refund, { color: colors.textSecondary }]}>{t('shop.return.refund', refund)}</Text>
            </View>
            <Pressable
              onPress={() => {
                setMessage(null);
                setAsking(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('shop.return.label', { name: item.name, ...refund })}
              style={[styles.returnButton, { backgroundColor: colors.controlTrack }]}
            >
              <Text style={[styles.returnText, { color: colors.primary }]}>{t('shop.return')}</Text>
            </Pressable>
          </View>
        );
      })}
      {message ? (
        <Text
          style={[styles.message, { color: message.ok ? colors.success : colors.danger }]}
          accessibilityLiveRegion="polite"
        >
          {message.text}
        </Text>
      ) : null}

      <Modal visible={asking !== null} transparent animationType="fade" onRequestClose={() => setAsking(null)}>
        <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
          {asking ? (
            <View style={[styles.sheet, { backgroundColor: colors.background }]} accessibilityViewIsModal>
              <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
                {t('shop.return.confirmTitle', { name: asking.name })}
              </Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {t('shop.return.confirmBody', { amount: asking.refund.amount, currency: currencyLabel(asking.refund.currency) })}
              </Text>
              <ClayButton label={t('shop.return.confirm')} tone="primary" busy={busy} onPress={() => void confirm()} />
              <ClayButton label={t('shop.return.keep')} onPress={() => setAsking(null)} />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
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
  left: { textAlign: 'auto' },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.md },
  cardTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thumb: { width: 44, height: 44, borderRadius: radii.sm },
  rowMain: { flex: 1, gap: 2 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  refund: { fontSize: typography.sizes.sm },
  returnButton: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: radii.pill, justifyContent: 'center' },
  returnText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  message: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
