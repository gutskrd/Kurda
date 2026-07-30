import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing, typography } from '../theme/tokens';
import {
  canAfford,
  currencyLabel,
  groupByCategory,
  needsConfirmation,
  type Balances,
  type ShopItem,
} from './format';

/** Best-effort unique idempotency key for a purchase attempt. */
function attemptKey(sku: string): string {
  return `buy-${sku}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Categorized shop with balances, item detail, and purchase confirmation (KUR-070). */
export function ShopScreen({ onExit, onEarnMore }: { onExit: () => void; onEarnMore: () => void }) {
  const { client } = useAuth();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [balances, setBalances] = useState<Balances>({ zer: 0, gems: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void Promise.all([
      client.get<{ items: ShopItem[] }>('/shop'),
      client.get<{ balances: Balances }>('/me/wallet'),
    ]).then(([cat, wallet]) => {
      if (cat.ok) setItems(cat.data.items);
      if (wallet.ok) setBalances(wallet.data.balances);
      setLoading(false);
    });
  }, [client]);

  useFocusEffect(useCallback(() => load(), [load]));

  const buy = useCallback(
    async (item: ShopItem) => {
      setBusy(true);
      const res = await client.post<{ purchased: boolean; balance: number }>('/shop/purchase', {
        sku: item.sku,
        idempotencyKey: attemptKey(item.sku),
        expectedPrice: item.price,
      });
      setBusy(false);
      if (res.ok) {
        setSelected(null);
        load();
        Alert.alert('Purchased', `${item.name} is yours!`);
      } else if (res.error.code === 'PRICE_CHANGED') {
        setSelected(null);
        load(); // pull fresh prices
        Alert.alert('Price changed', 'This item’s price changed. Please review and try again.');
      } else {
        Alert.alert('Purchase failed', res.error.message);
      }
    },
    [client, load],
  );

  const confirmBuy = useCallback(
    (item: ShopItem) => {
      if (needsConfirmation(item)) {
        Alert.alert('Confirm purchase', `Spend ${item.price} ${currencyLabel(item.currency)} on ${item.name}?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy', onPress: () => void buy(item) },
        ]);
      } else {
        void buy(item);
      }
    },
    [buy],
  );

  const sections = groupByCategory(items);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onExit} hitSlop={10}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
        <Text style={styles.title}>Shop</Text>
        <View style={styles.balances}>
          <Text style={styles.balance}>🪙 {balances.zer}</Text>
          <Text style={styles.balance}>💎 {balances.gems}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(i) => i.sku}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => setSelected(item)}>
              <View style={styles.rowMain}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.description ? <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text> : null}
              </View>
              <Text style={[styles.price, !canAfford(item, balances) && styles.priceUnaffordable]}>
                {item.price} {item.currency === 'zer' ? '🪙' : '💎'}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>The shop is empty right now — check back soon.</Text>}
          stickySectionHeadersEnabled={false}
        />
      )}

      <Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            {selected ? <ItemDetail item={selected} balances={balances} busy={busy} onBuy={confirmBuy} onEarnMore={onEarnMore} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ItemDetail({
  item,
  balances,
  busy,
  onBuy,
  onEarnMore,
}: {
  item: ShopItem;
  balances: Balances;
  busy: boolean;
  onBuy: (item: ShopItem) => void;
  onEarnMore: () => void;
}) {
  const affordable = canAfford(item, balances);
  return (
    <View style={styles.detail}>
      {/* preview placeholder until item art lands with the design pass */}
      <View style={styles.preview}>
        <Text style={styles.previewEmoji}>{item.category === 'freeze' ? '🧊' : item.category === 'powerup' ? '⚡' : '✨'}</Text>
      </View>
      <Text style={styles.detailName}>{item.name}</Text>
      {item.description ? <Text style={styles.detailDesc}>{item.description}</Text> : null}
      <Text style={styles.detailPrice}>{item.price} {currencyLabel(item.currency)}</Text>

      {affordable ? (
        <Pressable style={styles.buy} disabled={busy} onPress={() => onBuy(item)}>
          {busy ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.buyText}>Buy</Text>}
        </Pressable>
      ) : (
        <View style={styles.insufficient}>
          <Text style={styles.insufficientText}>
            Not enough {currencyLabel(item.currency)}.
            {item.currency === 'zer' ? ' Play and learn to earn more!' : ' Gem packs are coming soon.'}
          </Text>
          {item.currency === 'zer' ? (
            <Pressable style={styles.earn} onPress={onEarnMore}>
              <Text style={styles.earnText}>Earn Zêr</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md },
  close: { fontSize: typography.sizes.lg, color: colors.textSecondary },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.primary, flex: 1 },
  balances: { flexDirection: 'row', gap: spacing.md },
  balance: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary },
  list: { padding: spacing.lg, gap: spacing.xs },
  section: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: colors.textSecondary, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  rowMain: { flex: 1, gap: 2 },
  itemName: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary },
  itemDesc: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  price: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary },
  priceUnaffordable: { color: colors.textSecondary },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xl },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.xl },
  detail: { alignItems: 'center', gap: spacing.sm },
  preview: { width: 96, height: 96, borderRadius: radii.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  previewEmoji: { fontSize: 48 },
  detailName: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary },
  detailDesc: { fontSize: typography.sizes.md, color: colors.textSecondary, textAlign: 'center' },
  detailPrice: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.accent, marginVertical: spacing.sm },
  buy: { alignSelf: 'stretch', backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  buyText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  insufficient: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
  insufficientText: { color: colors.textSecondary, textAlign: 'center', fontSize: typography.sizes.sm },
  earn: { backgroundColor: colors.accent, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  earnText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
