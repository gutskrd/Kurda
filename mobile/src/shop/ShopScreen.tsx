import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  DEFAULT_ITEM_FILTER,
  applyItemFilter,
  categoriesIn,
  countByCategory,
  giftTierFor,
  groupByCategory,
  isFiltered,
  itemCategory,
  type ItemCategory,
  type ItemFilter,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useDirection } from '../reports/direction';
import { SHEET_MAX_WIDTH } from '../reports/sheet';
import {
  KIND_LABEL,
  canAfford,
  canGift,
  currencyLabel,
  kindWithCount,
  needsConfirmation,
  type Balances,
  type ShopItem,
} from './format';
import { useI18n } from '../i18n/I18nContext';
import { GiftSheet } from './GiftSheet';
import { ReceivedGifts } from './ReceivedGifts';
import { RefreshedItems } from './RefreshedItems';
import { EmptyState } from '../theme/EmptyState';
import type { RootNavigation } from '../navigation/rootStack';
import { GiftSendAnimation } from '../gifts/GiftSendAnimation';
import { GiftSentNote } from '../gifts/GiftSentNote';
import { ItemArt, KindChips, KindHeading, OptionRow, PremiumPill, ResultsLine, SearchField, SortChip, ToggleChip } from './ItemFilters';

/** Best-effort unique idempotency key for a purchase attempt. */
function attemptKey(sku: string): string {
  return `buy-${sku}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** The screen's side margin, which the edge-to-edge chip rows inset their first chip by. */
const GUTTER = spacing.lg;

/**
 * The shop, sorted by kind (KUR-070).
 *
 * Every item sits under its kind — Backgrounds, Icons, Tags, and "More" for
 * anything an admin files under a category of their own — in the order the
 * browser shows them, each with a count and its picture. Above the list, a
 * search over names and meanings ("istikan" finds Îstîkan, "tea" finds it
 * too), one kind at a time, an order, and "Within my Zêr". What arrived for you
 * (refreshed items to return, gifts) stays above the catalogue; the search and
 * the kinds stay at the top of the screen once you scroll past it.
 */
export function ShopScreen({ onExit, onEarnMore }: { onExit: () => void; onEarnMore: () => void }) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [balances, setBalances] = useState<Balances>({ zer: 0, gems: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [gifting, setGifting] = useState<ShopItem | null>(null);
  // a gift from the shop goes into your chat with that friend: fly it there, then say where it is
  const [sentGift, setSentGift] = useState<{ item: ShopItem; to: { userId: string; username: string; name: string }; flying: boolean } | null>(null);
  const [filter, setFilter] = useState<ItemFilter>(DEFAULT_ITEM_FILTER);
  const [affordableOnly, setAffordableOnly] = useState(false);
  // the search and the kinds are pinned once what arrived for you has scrolled
  // away; pinned, they (and the bar above) take a fill and a hairline, as a
  // navigation bar does when content runs under it
  const [inboxHeight, setInboxHeight] = useState(0);
  const [stuck, setStuck] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const navigation = useNavigation<RootNavigation>();

  const load = useCallback(() => {
    void Promise.all([
      client.get<{ items: ShopItem[] }>('/shop'),
      client.get<{ balances: Balances }>('/me/wallet'),
    ]).then(([cat, wallet]) => {
      if (cat.ok) setItems(cat.data.items);
      if (wallet.ok) setBalances(wallet.data.balances);
      setError(cat.ok ? null : cat.error); // the catalog is the screen's core data
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
        Alert.alert(t('shop.purchased'), t('shop.itemIsYours', { name: item.name }));
      } else if (res.error.code === 'PRICE_CHANGED') {
        setSelected(null);
        load(); // pull fresh prices
        Alert.alert(t('shop.priceChanged'), t('shop.priceChangedBody'));
      } else {
        Alert.alert(t('shop.purchaseFailed'), describeError(res.error, t));
      }
    },
    [client, load, t],
  );

  const confirmBuy = useCallback(
    (item: ShopItem) => {
      if (needsConfirmation(item)) {
        Alert.alert(
          t('shop.confirmPurchase'),
          t('shop.spendOn', { price: item.price, currency: currencyLabel(item.currency), name: item.name }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('shop.buy'), onPress: () => void buy(item) },
          ],
        );
      } else {
        void buy(item);
      }
    },
    [buy, t],
  );

  // the kinds on offer — fixed by the catalogue, not by what is typed, so a
  // chip never vanishes from under a finger; a kind with no matches says 0
  const kinds = useMemo(() => categoriesIn(items), [items]);
  // a kind that has gone (the one tag, bought) falls back to all of them
  const category: ItemCategory | 'all' = filter.category === 'all' || kinds.includes(filter.category) ? filter.category : 'all';
  // what each currency covers: a gem item against the gems, never against the Zêr
  const keep = useCallback((item: ShopItem) => !affordableOnly || canAfford(item, balances), [affordableOnly, balances]);
  const counts = useMemo(() => countByCategory(applyItemFilter(items, { ...filter, category: 'all' }, keep)), [items, filter, keep]);
  const shown = useMemo(() => applyItemFilter(items, { ...filter, category }, keep, locale), [items, filter, category, keep, locale]);
  const groups = useMemo(() => groupByCategory(shown), [shown]);
  const filtered = isFiltered({ ...filter, category }) || affordableOnly;
  const clear = useCallback(() => {
    setFilter(DEFAULT_ITEM_FILTER);
    setAffordableOnly(false);
  }, []);
  // a new filter shows its results from the top, under the pinned search,
  // rather than wherever the old, longer list had been scrolled to
  const filterKey = JSON.stringify([filter, affordableOnly]);
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    if (scrollY.current > inboxHeight) scroller.current?.scrollTo({ y: inboxHeight, animated: false });
  }, [filterKey, inboxHeight]);

  // "Within my Zêr" while everything is priced in Zêr; "my balance" once gems are on sale too
  const withinLabel = items.some((i) => i.currency === 'gems') ? t('shop.filter.withinBalance') : t('shop.filter.withinZer');

  const kindOptions = useMemo(
    () =>
      (['all', ...kinds] as const).map((k) => ({
        key: k,
        label: t(KIND_LABEL[k]),
        count: counts[k],
        a11y: kindWithCount(t, k, counts[k]),
      })),
    [kinds, counts, t],
  );

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader
          title={t('profile.shop')}
          onBack={onExit}
          leading="close"
          style={stuck ? { backgroundColor: colors.background } : null}
          right={
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
          }
        />

        <AsyncBoundary loading={loading} error={items.length === 0 ? error : null} onRetry={load}>
          {/*
            One scroll, three parts, and the second sticks: what arrived for
            you, then the search and the kinds (which stay at the top once the
            first has scrolled away), then the catalogue. Both of the first two
            are always there, empty or not — the sticky index counts children,
            and a missing one would pin the wrong thing.
          */}
          <ScrollView
            ref={scroller}
            stickyHeaderIndices={[1]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.content}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
              setStuck(scrollY.current > inboxHeight + 0.5);
            }}
          >
            <View style={[styles.inbox, styles.column]} onLayout={(e) => setInboxHeight(e.nativeEvent.layout.height)}>
              {/* items you own whose art was redrawn, and a way to hand them back */}
              <RefreshedItems onReturned={(currency, balance) => setBalances((b) => ({ ...b, [currency]: balance }))} />
              <ReceivedGifts />
            </View>

            <View
              style={[
                styles.toolbar,
                stuck ? { backgroundColor: colors.background, borderBottomColor: colors.separator } : null,
              ]}
            >
              {items.length > 0 ? (
                <View style={[styles.column, styles.toolbarInner]}>
                  <SearchField
                    value={filter.query}
                    onChange={(query) => setFilter((f) => ({ ...f, query }))}
                    label={t('shop.search.label')}
                    style={styles.gutter}
                  />
                  <KindChips
                    options={kindOptions}
                    value={category}
                    onChange={(next) => setFilter((f) => ({ ...f, category: next }))}
                    label={t('shop.kind.label')}
                    inset={GUTTER}
                  />
                </View>
              ) : null}
            </View>

            {items.length === 0 ? (
              <EmptyState title={t('shop.empty')} />
            ) : (
              <View style={[styles.catalogue, styles.column]}>
                <OptionRow inset={GUTTER}>
                  <SortChip value={filter.sort} onChange={(sort) => setFilter((f) => ({ ...f, sort }))} />
                  <ToggleChip label={withinLabel} value={affordableOnly} onChange={setAffordableOnly} />
                </OptionRow>
                <View style={styles.gutter}>
                  {/* with nothing to show, the empty state below carries the one Clear filters */}
                  <ResultsLine count={shown.length} onClear={filtered && shown.length > 0 ? clear : undefined} />
                </View>

                {groups.length === 0 ? (
                  <EmptyState
                    title={t('shop.noMatches.title')}
                    body={t('shop.noMatches.body')}
                    action={{ label: t('shop.filter.clear'), onPress: clear }}
                  />
                ) : (
                  groups.map((group) => (
                    <View key={group.category} style={[styles.section, styles.gutter]}>
                      <KindHeading kind={group.category} count={group.items.length} />
                      <View style={styles.rows}>
                        {group.items.map((item) => (
                          <ShopRow key={item.sku} item={item} balances={balances} onPress={() => setSelected(item)} />
                        ))}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        </AsyncBoundary>

        <Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
          <View style={styles.backdrop}>
            {/*
              Beside the sheet, not around it: a pressable wrapping the sheet
              would read as one button. A tap away for a finger; a screen
              reader has the ✕ in the sheet and the escape gesture instead.
            */}
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
              onPress={() => setSelected(null)}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <View
              style={[styles.sheet, { backgroundColor: colors.background }]}
              accessibilityViewIsModal
              onAccessibilityEscape={() => setSelected(null)}
            >
              {/* inside the sheet: a screen reader kept in it by accessibilityViewIsModal cannot reach the backdrop */}
              <View style={[styles.sheetHead, { flexDirection: dir.row }]}>
                <Pressable
                  onPress={() => setSelected(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t('social.close')}
                  style={({ pressed }) => [styles.close, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Icon name="close" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
              {selected ? (
                <ItemDetail
                  item={selected}
                  balances={balances}
                  busy={busy}
                  onBuy={confirmBuy}
                  onEarnMore={onEarnMore}
                  onGift={(it) => {
                    setSelected(null);
                    setGifting(it);
                  }}
                />
              ) : null}
            </View>
          </View>
        </Modal>

        {gifting ? (
          <GiftSheet
            item={{ sku: gifting.sku, name: gifting.name, price: gifting.price, currency: currencyLabel(gifting.currency) }}
            onClose={() => setGifting(null)}
            onSent={(balance, to) => {
              const item = gifting;
              setGifting(null);
              // the balance that moved is the item's currency, which is not always Zêr
              setBalances((b) => ({ ...b, [item.currency]: balance }));
              setSentGift({ item, to, flying: true });
            }}
          />
        ) : null}

        {sentGift?.flying ? (
          <GiftSendAnimation
            // the shop's list does not say which items are limited, so a Newroz
            // item flies as a rare one here; the recipient's unwrap has its real tier
            tier={giftTierFor({ currency: sentGift.item.currency, price: sentGift.item.price, limited: false })}
            announce={t('gift.sent', { name: sentGift.to.name })}
            onDone={() => setSentGift((g) => (g ? { ...g, flying: false } : g))}
          />
        ) : sentGift ? (
          <GiftSentNote
            itemName={sentGift.item.name}
            to={sentGift.to.name}
            onOpenChat={() => {
              const to = sentGift.to;
              setSentGift(null);
              navigation.navigate('Chat', { userId: to.userId, username: to.username });
            }}
            onDismiss={() => setSentGift(null)}
          />
        ) : null}
      </View>
    </GradientBackground>
  );
}

/** The price as it is read: "Free", or the number and the currency (Zêr keeps its name; gems are translated, as the gift picker says them). */
function priceWords(item: ShopItem, t: (key: 'shop.free' | 'gift.picker.gems') => string): string {
  if (item.price === 0) return t('shop.free');
  return `${item.price} ${item.currency === 'zer' ? 'Zêr' : t('gift.picker.gems')}`;
}

/** One item in the list: its picture, name, meaning, Premium where it is, and its price. */
function ShopRow({ item, balances, onPress }: { item: ShopItem; balances: Balances; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const wide = itemCategory(item.category) === 'background';
  const affordable = canAfford(item, balances);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[item.name, item.description, priceWords(item, t), item.premiumOnly ? t('profile.premium') : null]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [styles.row, { flexDirection: dir.row, backgroundColor: colors.glassFill, opacity: pressed ? 0.8 : 1 }]}
    >
      {/* one column wide enough for a background, so every name starts at the same place */}
      <View style={styles.thumb}>
        <ItemArt category={item.category} path={item.assetUrl} width={wide ? THUMB : ICON_THUMB} />
      </View>
      <View style={styles.rowMain}>
        {/*
          The names are Kurmancî and the meanings English whatever the app is
          in, so they read in their own direction (`free`), lined up with the
          screen. Premium is a crown beside the name: nearly everything on sale
          is, and a pill on every row said it forty times; the item's own sheet
          says it in words.
        */}
        <View style={[styles.nameRow, { flexDirection: dir.row }]}>
          <Text style={[styles.itemName, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.premiumOnly ? <Icon name="crown" size={14} color={colors.gold} /> : null}
        </View>
        {item.description ? (
          <Text style={[styles.itemDesc, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.priceRow, { flexDirection: dir.row }]}>
        {item.price === 0 ? (
          <Text style={[styles.price, { color: colors.success }]}>{t('shop.free')}</Text>
        ) : (
          <>
            <Text style={[styles.price, { color: affordable ? colors.textPrimary : colors.textSecondary }]}>{item.price}</Text>
            <Icon name={item.currency === 'zer' ? 'coin' : 'gem'} size={16} color={item.currency === 'zer' ? colors.gold : colors.accent} />
          </>
        )}
      </View>
    </Pressable>
  );
}

function ItemDetail({
  item,
  balances,
  busy,
  onBuy,
  onEarnMore,
  onGift,
}: {
  item: ShopItem;
  balances: Balances;
  busy: boolean;
  onBuy: (item: ShopItem) => void;
  onEarnMore: () => void;
  onGift: (item: ShopItem) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const affordable = canAfford(item, balances);
  const wide = itemCategory(item.category) === 'background';
  // a background as wide as the sheet allows (it is what you would be buying); a square item at a fixed size
  const artWidth = wide ? Math.min(Math.min(width, SHEET_MAX_WIDTH) - spacing.xl * 2, 400) : 128;
  return (
    <View style={styles.detail}>
      <ItemArt category={item.category} path={item.assetUrl} width={artWidth} style={styles.preview} />
      <Text style={[styles.detailName, { color: colors.textPrimary }]} accessibilityRole="header">
        {item.name}
      </Text>
      {item.premiumOnly ? <PremiumPill /> : null}
      {item.description ? <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>{item.description}</Text> : null}
      <Text style={[styles.detailPrice, { color: item.price === 0 ? colors.success : colors.accent }]}>{priceWords(item, t)}</Text>

      {affordable ? (
        <>
          <ClayButton
            label={item.price === 0 ? t('shop.getFree') : t('shop.buy')}
            tone="primary"
            size="large"
            busy={busy}
            onPress={() => onBuy(item)}
            style={styles.stretch}
          />
          {/*
           * Buying it for somebody else costs the same and lands the same, so
           * it sits beside Buy rather than behind a menu — quieter, because
           * most people are buying for themselves. Not for something free: a
           * gift is something paid for, and the server refuses a free one.
           */}
          {canGift(item) ? (
            <Pressable
              style={[styles.gift, { backgroundColor: colors.controlTrack }]}
              disabled={busy}
              onPress={() => onGift(item)}
              accessibilityRole="button"
            >
              <Icon name="gift" size={16} color={colors.gold} />
              <Text style={[styles.giftText, { color: colors.textSecondary }]}>{t('shop.sendGift')}</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <View style={styles.insufficient}>
          <Text style={[styles.insufficientText, { color: colors.textSecondary }]}>
            {t('shop.notEnough', { currency: currencyLabel(item.currency) })}{' '}
            {item.currency === 'zer' ? t('shop.earnMoreZer') : t('shop.gemPacksSoon')}
          </Text>
          {item.currency === 'zer' ? (
            <ClayButton label={t('shop.earnZer')} tone="accent" onPress={onEarnMore} />
          ) : null}
        </View>
      )}
    </View>
  );
}

/** A background's thumbnail (16:9) and an icon's (square) — the column is the wider of the two. */
const THUMB = 72;
const ICON_THUMB = 52;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  balances: { flexDirection: 'row', gap: spacing.md },
  balanceChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  balance: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  content: { paddingBottom: spacing.xxl },
  // on a tablet the list is a column in the middle, as the Season screen's is, not a band across the screen
  column: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  gutter: { marginHorizontal: GUTTER },
  inbox: { paddingHorizontal: GUTTER },
  toolbar: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  toolbarInner: { gap: spacing.sm },
  catalogue: { paddingTop: spacing.xs },
  section: { gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm },
  rows: { gap: spacing.sm },
  row: { alignItems: 'center', gap: spacing.md, borderRadius: radii.md, padding: spacing.sm, minHeight: 64 },
  thumb: { width: THUMB, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, gap: 2 },
  nameRow: { alignItems: 'center', gap: 6 },
  itemName: { flexShrink: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  itemDesc: { fontSize: typography.sizes.sm },
  stretch: { alignSelf: 'stretch' },
  priceRow: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  price: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: SHEET_MAX_WIDTH,
    alignSelf: 'center',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  // the ✕ on the closing side, pulled into the corner
  sheetHead: { justifyContent: 'flex-end', marginHorizontal: -spacing.md },
  close: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detail: { alignItems: 'center', gap: spacing.sm },
  preview: { marginBottom: spacing.sm },
  detailName: { ...display(typography.sizes.xl), textAlign: 'center' },
  detailDesc: { fontSize: typography.sizes.md, textAlign: 'center' },
  detailPrice: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, marginVertical: spacing.sm },
  gift: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.sm,
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
  giftText: { fontSize: 15, fontWeight: typography.weights.semibold },
  insufficient: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
  insufficientText: { textAlign: 'center', fontSize: typography.sizes.sm },
});
