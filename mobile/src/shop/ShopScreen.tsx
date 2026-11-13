import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type TextStyle } from 'react-native';
import { Pop, PressableScale } from '../theme/MotionParts';
import { useCountUp } from '../theme/animate';
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
import { haptic } from '../feedback/haptics';
import { describeError, isMaintenance } from '../api/errors';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { usePullRefresh } from '../net/usePullRefresh';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { BottomSheet } from '../theme/BottomSheet';
import { display } from '../theme/fonts';
import { ClayButton, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { SearchField } from '../theme/SearchField';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
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
import { formatNumber } from '../i18n/format';
import type { Locale } from '../i18n/translations';
import { GiftSheet } from './GiftSheet';
import { ReceivedGifts } from './ReceivedGifts';
import { EmptyState } from '../theme/EmptyState';
import type { RootNavigation } from '../navigation/rootStack';
import { GiftSendAnimation } from '../gifts/GiftSendAnimation';
import { GiftSentNote } from '../gifts/GiftSentNote';
import { FrameArt } from './FrameArt';
import { ItemArt, KindChips, KindHeading, OptionRow, ResultsLine, SEARCH_MAX, SortChip, ToggleChip } from './ItemFilters';

/** Best-effort unique idempotency key for a purchase attempt. */
function attemptKey(sku: string): string {
  return `buy-${sku}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** The screen's side margin, which the edge-to-edge chip rows inset their first chip by. */
const GUTTER = spacing.lg;

/**
 * The shop, sorted by kind (KUR-070).
 *
 * Every item sits under its kind — Backgrounds, Icons, Frames, Tags, and "More" for
 * anything an admin files under a category of their own — in the order the
 * browser shows them, each with a count and its picture. Above the list, a
 * search over names and meanings ("cay" finds Çay, "tea" finds it
 * too), one kind at a time, an order, and "Within my Zêr". What arrived for you
 * (gifts) stays above the catalogue; the search and the kinds stay at the top
 * of the screen once you scroll past it.
 *
 * Every purchase is final, and the item's sheet says so beside Buy; the dear
 * ones, and anything bought with gems, ask once more, saying it again.
 */
export function ShopScreen({ onExit, onEarnMore }: { onExit: () => void; onEarnMore: () => void }) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [balances, setBalances] = useState<Balances>({ zer: 0, gems: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const [busy, setBusy] = useState(false);
  // the item just bought, while its sheet is still up saying so
  const [bought, setBought] = useState<string | null>(null);
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
    return Promise.all([
      client.get<{ items: ShopItem[] }>('/shop'),
      client.get<{ balances: Balances }>('/me/wallet'),
    ]).then(([cat, wallet]) => {
      if (cat.ok) setItems(cat.data.items);
      if (wallet.ok) setBalances(wallet.data.balances);
      setError(cat.ok ? null : cat.error); // the catalog is the screen's core data
      setLoading(false);
    });
  }, [client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // pulled down, the catalogue and the purse are read again
  const pull = usePullRefresh(load);

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
        // it is yours: felt as it lands, as a failure to buy it is
        haptic('tap');
        // said in the sheet it was bought from, where its picture pops and the purse counts down to what is left
        // (a system box saying "Purchased" over the shop was a second thing to dismiss, with nothing in it to see)
        setBought(item.sku);
        if (typeof res.data.balance === 'number') setBalances((b) => ({ ...b, [item.currency]: res.data.balance }));
        void load();
      } else if (res.error.code === 'PRICE_CHANGED') {
        setSelected(null);
        void load(); // pull fresh prices
        Alert.alert(t('shop.priceChanged'), t('shop.priceChangedBody'));
      } else if (!isMaintenance(res.error)) {
        // the purchase did not happen and nothing else will make it: felt as an error
        // (Hevalo offline for a while is said by the screen over the app instead)
        haptic('error');
        Alert.alert(t('shop.purchaseFailed'), describeError(res.error, t));
      }
    },
    [client, load, t],
  );

  /** The item's sheet goes, and with it the word that it was just bought. */
  const closeItem = useCallback(() => {
    setSelected(null);
    setBought(null);
  }, []);

  const confirmBuy = useCallback(
    (item: ShopItem) => {
      if (needsConfirmation(item)) {
        Alert.alert(
          t('shop.confirmPurchase'),
          `${t('shop.spendOn', { price: formatNumber(item.price, locale), currency: currencyLabel(t, item.currency), name: item.name })}\n\n${t('shop.finalNote')}`,
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('shop.buy'), onPress: () => void buy(item) },
          ],
        );
      } else {
        void buy(item);
      }
    },
    [buy, t, locale],
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
                {loading ? (
                  <SkeletonText size={typography.sizes.md} width={40} />
                ) : (
                  <Counted value={balances.zer} style={[styles.balance, { color: colors.textPrimary }]} />
                )}
              </View>
              <View style={styles.balanceChip}>
                <Icon name="gem" size={18} color={colors.primary} />
                {loading ? (
                  <SkeletonText size={typography.sizes.md} width={20} />
                ) : (
                  <Counted value={balances.gems} style={[styles.balance, { color: colors.textPrimary }]} />
                )}
              </View>
            </View>
          }
        />

        <AsyncBoundary loading={loading} error={items.length === 0 ? error : null} onRetry={load} skeleton={<ShopSkeleton />}>
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
            refreshControl={pull}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
              setStuck(scrollY.current > inboxHeight + 0.5);
            }}
          >
            <View style={[styles.inbox, styles.column]} onLayout={(e) => setInboxHeight(e.nativeEvent.layout.height)}>
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
                    onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
                    label={t('shop.search.label')}
                    maxLength={SEARCH_MAX}
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

        {/* no title in the header: the item's own name heads the sheet, under its picture */}
        <BottomSheet visible={selected !== null} onClose={closeItem}>
          {selected ? (
            <ItemDetail
              item={selected}
              balances={balances}
              busy={busy}
              bought={bought === selected.sku}
              onDone={closeItem}
              onBuy={confirmBuy}
              onEarnMore={onEarnMore}
              onGift={(it) => {
                setSelected(null);
                setGifting(it);
              }}
            />
          ) : null}
        </BottomSheet>

        {gifting ? (
          <GiftSheet
            item={{ sku: gifting.sku, name: gifting.name, price: gifting.price, currency: currencyLabel(t, gifting.currency) }}
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

/**
 * The shop while it loads, laid out by its own styles: the search, the kinds,
 * the order and the filter, the count, and two kinds of rows — a background's
 * wide picture and an icon's square one — so the catalogue lands in place.
 */
function ShopSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const { height } = useWindowDimensions();
  // rows enough to reach the foot of the screen, shared between the two kinds shown
  const perKind = Math.max(3, Math.ceil((height - 300) / (64 + spacing.sm) / 2));
  const chips = (widths: number[]) => (
    <View style={[styles.skeletonChips, { flexDirection: dir.row }]}>
      {widths.map((w, i) => (
        <Skeleton key={i} width={w} height={MIN_TOUCH_TARGET} radius={radii.pill} />
      ))}
    </View>
  );
  const start = { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' } as const;
  return (
    <View style={styles.content} accessibilityLabel={t('common.loading')}>
      <View style={styles.toolbar}>
        <View style={[styles.column, styles.toolbarInner]}>
          <View style={styles.gutter}>
            <Skeleton height={MIN_TOUCH_TARGET} radius={radii.md} />
          </View>
          {chips([72, 136, 84, 80])}
        </View>
      </View>
      <View style={[styles.catalogue, styles.column]}>
        {chips([136, 180])}
        <View style={[styles.gutter, styles.skeletonResults, start]}>
          <SkeletonText size={typography.sizes.sm} width={64} />
        </View>
        {[THUMB, ICON_THUMB].map((thumb) => (
          <View key={thumb} style={[styles.section, styles.gutter]}>
            <SkeletonText size={typography.sizes.xs} width={96} style={start} />
            <View style={styles.rows}>
              {Array.from({ length: perKind }, (_, i) => (
                <View key={i} style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.glassFill }]}>
                  <View style={styles.thumb}>
                    <Skeleton width={thumb} height={thumb === THUMB ? Math.round((THUMB * 9) / 16) : ICON_THUMB} radius={radii.sm} />
                  </View>
                  <View style={styles.rowMain}>
                    <SkeletonText size={typography.sizes.md} width={i % 2 ? '44%' : '58%'} style={start} />
                    <SkeletonText size={typography.sizes.sm} width="72%" style={start} />
                  </View>
                  <SkeletonText size={typography.sizes.md} width={48} style={styles.skeletonPrice} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The price as it is read: "Free", or the number and the currency (Zêr keeps its name; gems are translated, as the gift picker says them). */
function priceWords(item: ShopItem, t: (key: 'shop.free' | 'gift.picker.gems') => string, locale: Locale): string {
  if (item.price === 0) return t('shop.free');
  return `${formatNumber(item.price, locale)} ${item.currency === 'zer' ? 'Zêr' : t('gift.picker.gems')}`;
}

/**
 * A number in the purse, moving to its new value when it changes: bought
 * something, and the Zêr are seen to go down to what is left (straight there
 * under Reduce Motion). Grouped and in the reader's own digits, as every
 * number in the app is.
 */
function Counted({ value, style }: { value: number; style: StyleProp<TextStyle> }): React.JSX.Element {
  const { locale } = useI18n();
  const [span, setSpan] = useState({ from: value, to: value });
  if (span.to !== value) setSpan({ from: span.to, to: value });
  const shown = useCountUp(span.to, { from: span.from });
  return (
    <Text style={style} accessibilityLabel={formatNumber(value, locale)}>
      {formatNumber(shown, locale)}
    </Text>
  );
}

/** One item in the list: its picture, name, meaning and price. */
function ShopRow({ item, balances, onPress }: { item: ShopItem; balances: Balances; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const wide = itemCategory(item.category) === 'background';
  const affordable = canAfford(item, balances);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[item.name, item.description, priceWords(item, t, locale)].filter(Boolean).join(', ')}
      style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.glassFill }]}
    >
      {/* one column wide enough for a background, so every name starts at the same place */}
      <View style={styles.thumb}>
        {itemCategory(item.category) === 'frame' && item.assetUrl ? (
          <FrameArt path={item.assetUrl} width={FRAME_THUMB} />
        ) : (
          <ItemArt category={item.category} path={item.assetUrl} width={wide ? THUMB : ICON_THUMB} />
        )}
      </View>
      <View style={styles.rowMain}>
        {/*
          The names are Kurmancî and the meanings English whatever the app is
          in, so they read in their own direction (`free`), lined up with the
          screen.

          No Premium crown: Premium cannot be had in the app, and a mark for
          something nobody can get is an advert for nothing.
        */}
        <View style={[styles.nameRow, { flexDirection: dir.row }]}>
          <Text style={[styles.itemName, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
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
            <Text style={[styles.price, { color: affordable ? colors.textPrimary : colors.textSecondary }]}>{formatNumber(item.price, locale)}</Text>
            <Icon name={item.currency === 'zer' ? 'coin' : 'gem'} size={16} color={item.currency === 'zer' ? colors.gold : colors.primary} />
          </>
        )}
      </View>
    </PressableScale>
  );
}

/**
 * One item, in its sheet: what it is, what it costs, and Buy.
 *
 * Bought, the sheet stays and says so itself: the picture pops, as anything
 * just earned does, "… is yours!" takes the price's place, and the purse
 * counts down to what is left, with one button to close. Still under Reduce
 * Motion, where the words and the new number say it.
 */
function ItemDetail({
  item,
  balances,
  busy,
  bought,
  onDone,
  onBuy,
  onEarnMore,
  onGift,
}: {
  item: ShopItem;
  balances: Balances;
  busy: boolean;
  /** just bought, from this sheet */
  bought: boolean;
  onDone: () => void;
  onBuy: (item: ShopItem) => void;
  onEarnMore: () => void;
  onGift: (item: ShopItem) => void;
}) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { width } = useWindowDimensions();
  const affordable = canAfford(item, balances);
  const wide = itemCategory(item.category) === 'background';
  // a background as wide as the sheet allows (it is what you would be buying); a square item at a fixed size
  const artWidth = wide ? Math.min(Math.min(width, SHEET_MAX_WIDTH) - layout.gutter * 2, 400) : 128;
  return (
    <View style={styles.detail}>
      <Pop when={bought}>
        {itemCategory(item.category) === 'frame' && item.assetUrl ? (
          <FrameArt path={item.assetUrl} width={160} style={styles.preview} />
        ) : (
          <ItemArt category={item.category} path={item.assetUrl} width={artWidth} style={styles.preview} />
        )}
      </Pop>
      <Text style={[styles.detailName, { color: colors.textPrimary }]} accessibilityRole="header">
        {item.name}
      </Text>
      {item.description ? <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>{item.description}</Text> : null}
      {bought ? null : (
        <Text style={[styles.detailPrice, { color: item.price === 0 ? colors.success : colors.textPrimary }]}>{priceWords(item, t, locale)}</Text>
      )}

      {bought ? (
        <>
          <View style={[styles.yours, { flexDirection: dir.row }]} accessibilityLiveRegion="polite" testID="shop-bought">
            <Icon name="check" size={20} color={colors.success} />
            <Text style={[styles.yoursText, { color: colors.textPrimary }]}>{t('shop.itemIsYours', { name: item.name })}</Text>
          </View>
          {item.price > 0 ? (
            // what is left in the purse, counting down from what was there
            <View style={[styles.left, { flexDirection: dir.row }]}>
              <Icon name={item.currency === 'zer' ? 'coin' : 'gem'} size={18} color={item.currency === 'zer' ? colors.gold : colors.primary} />
              <Counted value={balances[item.currency]} style={[styles.leftText, { color: colors.textPrimary }]} />
            </View>
          ) : null}
          <ClayButton label={t('common.done')} tone="primary" size="large" onPress={onDone} style={styles.stretch} />
        </>
      ) : affordable ? (
        <>
          <ClayButton
            label={item.price === 0 ? t('shop.getFree') : t('shop.buy')}
            tone="primary"
            size="large"
            busy={busy}
            onPress={() => onBuy(item)}
            style={styles.stretch}
          />
          {/* said where the money is spent: nothing bought can be handed back */}
          {item.price > 0 ? <Text style={[styles.finalNote, { color: colors.textSecondary }]}>{t('shop.finalNote')}</Text> : null}
          {/*
           * Buying it for somebody else costs the same and lands the same, so
           * it sits beside Buy rather than behind a menu — quieter, because
           * most people are buying for themselves. Not for something free: a
           * gift is something paid for, and the server refuses a free one.
           */}
          {canGift(item) ? (
            <PressableScale
              style={[styles.gift, { backgroundColor: colors.controlTrack }]}
              disabled={busy}
              onPress={() => onGift(item)}
              accessibilityRole="button"
            >
              <Icon name="gift" size={16} color={colors.gold} />
              <Text style={[styles.giftText, { color: colors.textSecondary }]}>{t('shop.sendGift')}</Text>
            </PressableScale>
          ) : null}
        </>
      ) : (
        <View style={styles.insufficient}>
          <Text style={[styles.insufficientText, { color: colors.textSecondary }]}>
            {t('shop.notEnough', { currency: currencyLabel(t, item.currency) })}{' '}
            {item.currency === 'zer' ? t('shop.earnMoreZer') : t('shop.earnMoreGems')}
          </Text>
          {item.currency === 'zer' ? (
            <ClayButton label={t('shop.earnZer')} tone="primary" onPress={onEarnMore} />
          ) : null}
        </View>
      )}
    </View>
  );
}

/** A background's thumbnail (16:9) and an icon's (square) — the column is the wider of the two. */
const THUMB = 72;
const ICON_THUMB = 52;
/** A frame is shown round a face, which needs more room than an icon: as wide as its column allows. */
const FRAME_THUMB = 68;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // bought: the words, and what is left in the purse under them
  yours: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  yoursText: { flexShrink: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, textAlign: 'center' },
  left: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  leftText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
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
  skeletonChips: { gap: spacing.sm, paddingHorizontal: GUTTER, overflow: 'hidden' },
  skeletonResults: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  skeletonPrice: { paddingHorizontal: spacing.xs },
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
  detail: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm },
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
  finalNote: { textAlign: 'center', fontSize: typography.sizes.sm, lineHeight: 20 },
});
