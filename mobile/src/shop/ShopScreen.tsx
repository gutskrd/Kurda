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
import { describeError } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
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
  const { colors } = useTheme();
  const topInset = useScreenTopInset();
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
        Alert.alert('Purchase failed', describeError(res.error).message);
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
    <GradientBackground>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: topInset }]}>
          <Pressable onPress={onExit} hitSlop={10}>
            <Text style={[styles.close, { color: colors.textSecondary }]}>✕</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.primary }]}>Shop</Text>
          <View style={styles.balances}>
            <View style={styles.balanceChip}>
              <Icon name="coin" size={18} color={colors.gold} />
              <Text style={[styles.balance, { color: colors.textPrimary }]}>{balances.zer}</Text>
            </View>
            <View style={styles.balanceChip}>
              <Icon name="gem" size={18} color={colors.accent} />
              <Text style={[styles.balance, { color: colors.textPrimary }]}>{balances.gems}</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(i) => i.sku}
            contentContainerStyle={styles.list}
            renderSectionHeader={({ section }) => <Text style={[styles.section, { color: colors.textSecondary }]}>{section.title}</Text>}
            renderItem={({ item }) => (
              <Pressable style={[styles.row, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]} onPress={() => setSelected(item)}>
                <View style={styles.rowMain}>
                  <Text style={[styles.itemName, { color: colors.textPrimary }]}>{item.name}</Text>
                  {item.description ? <Text style={[styles.itemDesc, { color: colors.textSecondary }]} numberOfLines={1}>{item.description}</Text> : null}
                </View>
                <View style={styles.priceRow}>
                  <Text style={[styles.price, { color: canAfford(item, balances) ? colors.textPrimary : colors.textSecondary }]}>
                    {item.price}
                  </Text>
                  <Icon name={item.currency === 'zer' ? 'coin' : 'gem'} size={16} color={item.currency === 'zer' ? colors.gold : colors.accent} />
                </View>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>The shop is empty right now — check back soon.</Text>}
            stickySectionHeadersEnabled={false}
          />
        )}

        <Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
          <Pressable style={styles.backdrop} onPress={() => setSelected(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.glassBorder }]} onPress={() => undefined}>
              {selected ? <ItemDetail item={selected} balances={balances} busy={busy} onBuy={confirmBuy} onEarnMore={onEarnMore} /> : null}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </GradientBackground>
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
  const { colors } = useTheme();
  const affordable = canAfford(item, balances);
  return (
    <View style={styles.detail}>
      {/* preview placeholder until item art lands with the design pass */}
      <View style={[styles.preview, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder, borderWidth: StyleSheet.hairlineWidth }]}>
        <Icon
          name={item.category === 'freeze' ? 'ice' : item.category === 'powerup' ? 'bolt' : 'sparkle'}
          size={44}
          color={colors.primary}
        />
      </View>
      <Text style={[styles.detailName, { color: colors.textPrimary }]}>{item.name}</Text>
      {item.description ? <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>{item.description}</Text> : null}
      <Text style={[styles.detailPrice, { color: colors.accent }]}>{item.price} {currencyLabel(item.currency)}</Text>

      {affordable ? (
        <Pressable style={[styles.buy, { backgroundColor: colors.primary }]} disabled={busy} onPress={() => onBuy(item)}>
          {busy ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={[styles.buyText, { color: colors.textOnPrimary }]}>Buy</Text>}
        </Pressable>
      ) : (
        <View style={styles.insufficient}>
          <Text style={[styles.insufficientText, { color: colors.textSecondary }]}>
            Not enough {currencyLabel(item.currency)}.
            {item.currency === 'zer' ? ' Play and learn to earn more!' : ' Gem packs are coming soon.'}
          </Text>
          {item.currency === 'zer' ? (
            <Pressable style={[styles.earn, { backgroundColor: colors.accent }]} onPress={onEarnMore}>
              <Text style={[styles.earnText, { color: colors.textOnPrimary }]}>Earn Zêr</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md },
  close: { fontSize: typography.sizes.lg },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, flex: 1 },
  balances: { flexDirection: 'row', gap: spacing.md },
  balanceChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  balance: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  list: { padding: spacing.lg, gap: spacing.xs },
  section: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.md, padding: spacing.md, borderWidth: StyleSheet.hairlineWidth },
  rowMain: { flex: 1, gap: 2 },
  itemName: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  itemDesc: { fontSize: typography.sizes.sm },
  price: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.xl },
  detail: { alignItems: 'center', gap: spacing.sm },
  preview: { width: 96, height: 96, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  detailName: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  detailDesc: { fontSize: typography.sizes.md, textAlign: 'center' },
  detailPrice: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, marginVertical: spacing.sm },
  buy: { alignSelf: 'stretch', paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  buyText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  insufficient: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
  insufficientText: { textAlign: 'center', fontSize: typography.sizes.sm },
  earn: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radii.md },
  earnText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
