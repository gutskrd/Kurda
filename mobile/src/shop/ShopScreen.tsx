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
  isWordTag,
  itemCategory,
  shopItemDescription,
  type BundlePurchaseResult,
  type BundleView,
  type BundlesView,
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
  ZER,
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
import { YourBird, useLettersHome } from './YourBird';
import { YourTree, useShopTree } from './YourTree';
import { MembersBox } from './MembersBox';
import { ZerValue, useZerValue } from './value';
import { BundleDetail, BundleRow, RarityText, partOf } from './Bundles';
import { BundleMoment } from './BundleMoment';
import { ProfilePreview, canTryOn, lookOf, type PreviewLook } from './ProfilePreview';
import { TagPill } from '../profile/TagPill';
import type { TranslationKey } from '../i18n/translations';
import { useNarrowPage } from '../theme/pageWidth';

/** Best-effort unique idempotency key for a purchase attempt. */
function attemptKey(sku: string): string {
  return `buy-${sku}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * The screen's side margin, which the edge-to-edge chip rows inset their first chip by: the app's gutter, so the list
 * lines up with the close button and the purse above it.
 */
const GUTTER = layout.gutter;

/**
 * The shop, sorted by kind: every item under its kind (Backgrounds, Icons, Frames, Tags, and "More" for an admin's own
 * categories) in the browser's order, each with a count and picture. Above the list, a search over names and meanings
 * ("cay" and "tea" both find Çay), one kind at a time, an order and "Within my Zêr"; received gifts sit above the
 * catalogue, and the search and kinds stick at the top once scrolled past. The bundles lead (Bundles.tsx), and over the
 * search are rows for your pen pal bird and your tree (YourBird, YourTree), read with the catalogue. Anything worn, and
 * any bundle, can be tried on your own profile from its sheet.
 *
 * Every purchase is final and the item's sheet says so beside Buy; dear items ask once more. Every price has its money
 * value beside it (`ZerValue`), and a Hevalo+ member finds the month's box above the catalogue.
 */
export function ShopScreen({ onExit, onEarnMore }: { onExit: () => void; onEarnMore: () => void }) {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  // A folded phone's cover screen leaves the title little room beside the purse.
  const narrow = useNarrowPage();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [balances, setBalances] = useState<Balances>({ zer: 0 });
  const value = useZerValue();
  // Whether the purse has been read: until it has, the bird and the tree go by the Zêr their own reads report.
  const [purseRead, setPurseRead] = useState(false);
  const letters = useLettersHome();
  const tree = useShopTree();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const [busy, setBusy] = useState(false);
  // The item just bought, while its sheet is still up saying so.
  const [bought, setBought] = useState<string | null>(null);
  const [gifting, setGifting] = useState<ShopItem | null>(null);
  // A gift from the shop goes into your chat with that friend: fly it there, then say where it is.
  const [sentGift, setSentGift] = useState<{ item: ShopItem; to: { userId: string; username: string; name: string }; flying: boolean } | null>(null);
  const [filter, setFilter] = useState<ItemFilter>(DEFAULT_ITEM_FILTER);
  // Bundles, priced for you; the one open in its sheet, why its purchase did not go through, and the one just bought.
  const [bundles, setBundles] = useState<BundlesView | null>(null);
  const [openBundle, setOpenBundle] = useState<BundleView | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [unwrapped, setUnwrapped] = useState<BundleView | null>(null);
  // A look being tried on, in the sheet it was opened from.
  const [trying, setTrying] = useState<PreviewLook | null>(null);
  const [affordableOnly, setAffordableOnly] = useState(false);
  // The search and the kinds are pinned once the received gifts have scrolled away; pinned, they (and the bar above)
  // take a fill and a hairline, as a navigation bar does over scrolled content.
  const [inboxHeight, setInboxHeight] = useState(0);
  const [stuck, setStuck] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const navigation = useNavigation<RootNavigation>();

  const load = useCallback(() => {
    return Promise.all([
      client.get<{ items: ShopItem[] }>('/shop'),
      client.get<{ balances: Balances }>('/me/wallet'),
      letters.reload(),
      tree.reload(),
      client.get<BundlesView>('/shop/bundles'),
    ]).then(([cat, wallet, , , bundled]) => {
      if (bundled.ok) {
        const fresh = bundled.data.bundles ?? [];
        setBundles({ bundles: fresh, nudges: bundled.data.nudges === true });
        // An open bundle shows its fresh price, after one changed.
        setOpenBundle((open) => (open ? (fresh.find((b) => b.id === open.id) ?? open) : open));
      }
      // Each description in the reader's language, so what is searched is what is read.
      if (cat.ok) setItems(cat.data.items.map((item) => ({ ...item, description: shopItemDescription(item, locale) })));
      if (wallet.ok) {
        setBalances(wallet.data.balances);
        setPurseRead(true);
      }
      setError(cat.ok ? null : cat.error); // The catalogue is the screen's core data.
      setLoading(false);
    });
  }, [client, locale, letters.reload, tree.reload]);
  /** The Zêr a new bird or a tree kind left, which the purse at the top and every price then go by. */
  const learnZer = useCallback((zer: number) => setBalances((b) => ({ ...b, zer })), []);
  const purse = purseRead ? balances.zer : null;

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // Pulled down, the catalogue and the purse are read again.
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
        // It is yours: felt as it lands, as a failed purchase is.
        haptic('tap');
        // Said in the sheet it was bought from, where its picture pops and the purse counts down; a system alert would
        // be a second thing to dismiss.
        setBought(item.sku);
        if (typeof res.data.balance === 'number') setBalances({ zer: res.data.balance });
        void load();
      } else if (res.error.code === 'PRICE_CHANGED') {
        setSelected(null);
        void load(); // Pull fresh prices.
        Alert.alert(t('shop.priceChanged'), t('shop.priceChangedBody'));
      } else if (!isMaintenance(res.error)) {
        // The purchase did not happen and nothing else will make it: felt as an error. Hevalo being offline is shown by
        // the screen over the app instead.
        haptic('error');
        Alert.alert(t('shop.purchaseFailed'), describeError(res.error, t));
      }
    },
    [client, load, t],
  );

  /** Buys the open bundle at the price shown; the server works the price out again and refuses one that changed. */
  const buyBundle = useCallback(
    async (bundle: BundleView) => {
      setBusy(true);
      setBundleError(null);
      const res = await client.post<BundlePurchaseResult>('/shop/bundles/purchase', {
        bundle: bundle.id,
        idempotencyKey: attemptKey(bundle.id),
        expectedPrice: bundle.quote.price,
      });
      setBusy(false);
      if (res.ok) {
        haptic('tap');
        setBalances({ zer: res.data.balance });
        setOpenBundle(null);
        setUnwrapped(bundle);
        void load();
        return;
      }
      const why: Record<string, TranslationKey> = {
        PRICE_CHANGED: 'bundle.priceChanged',
        BAG_FULL: 'bundle.bagFull',
        BUNDLE_UNAVAILABLE: 'bundle.unavailable',
        ALREADY_OWNED: 'bundle.complete',
      };
      const key = why[res.error.code ?? ''];
      if (!isMaintenance(res.error)) haptic('error');
      setBundleError(key ? t(key) : describeError(res.error, t));
      if (res.error.code === 'PRICE_CHANGED' || res.error.code === 'ALREADY_OWNED') void load();
    },
    [client, load, t],
  );

  /** Puts a bought bundle's whole set on at once; true when every part went on. */
  const wearSet = useCallback(
    async (bundle: BundleView): Promise<boolean> => {
      const kinds = ['background', 'icon', 'frame', 'tag'] as const;
      const results = await Promise.all(
        kinds.map((kind) => {
          const part = partOf(bundle, kind);
          return part ? client.put(`/me/cosmetics/${kind}`, { sku: part.sku }) : Promise.resolve({ ok: true as const });
        }),
      );
      return results.every((r) => r.ok);
    },
    [client],
  );

  /** The item's sheet goes, and with it the word that it was just bought. */
  const closeItem = useCallback(() => {
    setSelected(null);
    setBought(null);
    setTrying(null);
  }, []);

  const confirmBuy = useCallback(
    (item: ShopItem) => {
      if (needsConfirmation(item)) {
        Alert.alert(
          t('shop.confirmPurchase'),
          `${t('shop.spendOn', { price: formatNumber(item.price, locale), currency: ZER, name: item.name })} ${value(item.price)}\n\n${t('shop.finalNote')}`,
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('shop.buy'), onPress: () => void buy(item) },
          ],
        );
      } else {
        void buy(item);
      }
    },
    [buy, t, locale, value],
  );

  // The kinds on offer come from the catalogue, not the search, so a chip never vanishes from under a finger; a kind
  // with no matches says 0.
  const kinds = useMemo(() => categoriesIn(items), [items]);
  // A kind that has gone (the one tag, bought) falls back to all of them.
  const category: ItemCategory | 'all' = filter.category === 'all' || kinds.includes(filter.category) ? filter.category : 'all';
  const keep = useCallback((item: ShopItem) => !affordableOnly || canAfford(item, balances), [affordableOnly, balances]);
  const counts = useMemo(() => countByCategory(applyItemFilter(items, { ...filter, category: 'all' }, keep)), [items, filter, keep]);
  const shown = useMemo(() => applyItemFilter(items, { ...filter, category }, keep, locale), [items, filter, category, keep, locale]);
  const groups = useMemo(() => groupByCategory(shown), [shown]);
  const filtered = isFiltered({ ...filter, category }) || affordableOnly;
  const clear = useCallback(() => {
    setFilter(DEFAULT_ITEM_FILTER);
    setAffordableOnly(false);
  }, []);
  // A new filter shows its results from the top, under the pinned search, not at the old list's scroll position.
  const filterKey = JSON.stringify([filter, affordableOnly]);
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    if (scrollY.current > inboxHeight) scroller.current?.scrollTo({ y: inboxHeight, animated: false });
  }, [filterKey, inboxHeight]);

  const withinLabel = t('shop.filter.withinZer');

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
            // The purse names its currency; on the narrowest phones the coin alone names it, leaving the title room.
            <View style={styles.balances}>
              <View style={styles.balanceChip} accessible accessibilityLabel={`${formatNumber(balances.zer, locale)} Zêr`}>
                <Icon name="coin" size={18} color={colors.gold} />
                {loading ? (
                  <SkeletonText size={typography.sizes.text} width={40} />
                ) : (
                  <Counted value={balances.zer} style={[styles.balance, { color: colors.textPrimary }]} />
                )}
                {narrow ? null : <Text style={[styles.balanceUnit, { color: colors.textSecondary }]}>Zêr</Text>}
              </View>
            </View>
          }
        />

        {/*
          One scroll in three parts, the second sticky: received gifts with your bird and tree, then the search and kinds,
          then the catalogue. The first two are always rendered, empty or not, since the sticky index counts children, and
          the scroll stays while the catalogue loads, so the rows above it keep what they hold (an open sheet) when it lands.
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
            {/* Bundles lead the shop: a set that belongs together, priced for you. */}
            <BundleRow
              view={bundles}
              onOpen={(b) => {
                setBundleError(null);
                setTrying(null);
                setOpenBundle(b);
              }}
            />
            <MembersBox />
            <View style={styles.ownRows}>
              <YourBird home={letters} zer={purse} onZer={learnZer} />
              <YourTree tree={tree} zer={purse} onZer={learnZer} />
            </View>
          </View>

          <View
            style={[
              styles.toolbar,
              stuck ? { backgroundColor: colors.background, borderBottomColor: colors.separator } : null,
            ]}
          >
            {loading ? (
              <ToolbarSkeleton />
            ) : items.length > 0 ? (
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

          <AsyncBoundary loading={loading} error={items.length === 0 ? error : null} onRetry={load} skeleton={<CatalogueSkeleton />}>
            {items.length === 0 ? (
              <EmptyState title={t('shop.empty')} />
            ) : (
              <View style={[styles.catalogue, styles.column]}>
                <OptionRow inset={GUTTER}>
                  <SortChip value={filter.sort} onChange={(sort) => setFilter((f) => ({ ...f, sort }))} />
                  <ToggleChip label={withinLabel} value={affordableOnly} onChange={setAffordableOnly} />
                </OptionRow>
                <View style={styles.gutter}>
                  {/* With nothing to show, the empty state below carries the one Clear filters. */}
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
                      <View style={[styles.grid, { flexDirection: dir.row }]}>
                        {group.items.map((item) => (
                          <ShopCard key={item.sku} item={item} balances={balances} onPress={() => setSelected(item)} />
                        ))}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </AsyncBoundary>
        </ScrollView>

        {/* No title in the header: the item's own name heads the sheet, under its picture. */}
        <BottomSheet visible={selected !== null} onClose={closeItem} onBack={trying ? () => setTrying(null) : undefined}>
          {selected && trying ? (
            <ProfilePreview look={trying} />
          ) : selected ? (
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
              onTryOn={canTryOn(selected) ? () => setTrying(lookOf(selected)) : undefined}
            />
          ) : null}
        </BottomSheet>

        <BottomSheet
          visible={openBundle !== null}
          onClose={() => {
            if (busy) return;
            setOpenBundle(null);
            setTrying(null);
          }}
          onBack={trying ? () => setTrying(null) : undefined}
        >
          {openBundle && trying ? (
            <ProfilePreview look={trying} />
          ) : openBundle ? (
            <BundleDetail
              bundle={openBundle}
              nudges={bundles?.nudges === true}
              zer={balances.zer}
              busy={busy}
              error={bundleError}
              onBuy={() => void buyBundle(openBundle)}
              onTryOn={() => setTrying(Object.assign({}, ...openBundle.parts.map(lookOf)) as PreviewLook)}
              onEarnMore={onEarnMore}
            />
          ) : null}
        </BottomSheet>

        {unwrapped ? <BundleMoment bundle={unwrapped} onWear={() => wearSet(unwrapped)} onClose={() => setUnwrapped(null)} /> : null}

        {gifting ? (
          <GiftSheet
            item={{ sku: gifting.sku, name: gifting.name, price: gifting.price, currency: ZER }}
            onClose={() => setGifting(null)}
            onSent={(balance, to) => {
              const item = gifting;
              setGifting(null);
              setBalances({ zer: balance });
              setSentGift({ item, to, flying: true });
            }}
          />
        ) : null}

        {sentGift?.flying ? (
          <GiftSendAnimation
            // The shop's list does not say which items are limited, so a gift flies as a rare one here; the recipient's
            // unwrap shows its real tier.
            tier={giftTierFor({ price: sentGift.item.price, limited: false })}
            item={sentGift.item}
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

/** A row of chip placeholders at a chip's height, cut off at the screen's edge as the real row scrolls on past it. */
function ChipRowSkeleton({ widths }: { widths: readonly number[] }): React.JSX.Element {
  const dir = useDirection();
  return (
    <View style={[styles.skeletonChips, { flexDirection: dir.row }]}>
      {widths.map((w, i) => (
        <Skeleton key={i} width={w} height={MIN_TOUCH_TARGET} radius={radii.pill} />
      ))}
    </View>
  );
}

/** The search and the kinds while the catalogue loads, in the toolbar's own styles. */
function ToolbarSkeleton(): React.JSX.Element {
  return (
    <View style={[styles.column, styles.toolbarInner]}>
      <View style={styles.gutter}>
        <Skeleton height={MIN_TOUCH_TARGET} radius={radii.md} />
      </View>
      <ChipRowSkeleton widths={[72, 136, 84, 80]} />
    </View>
  );
}

/** The catalogue while it loads: sort and filter, the count, then a section of cards to the foot of the screen. */
function CatalogueSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const { height } = useWindowDimensions();
  // Cards enough to reach the foot of the screen, two to a row.
  const cards = Math.max(4, Math.ceil((height - 300) / CARD_HEIGHT) * 2);
  return (
    <View style={[styles.catalogue, styles.column]} accessibilityLabel={t('common.loading')}>
      <ChipRowSkeleton widths={[136, 180]} />
      <View style={[styles.gutter, styles.skeletonResults]}>
        <SkeletonText size={typography.sizes.text} width={64} />
      </View>
      <View style={[styles.section, styles.gutter]}>
        <SkeletonText size={typography.sizes.text} width={96} />
        <View style={[styles.grid, { flexDirection: dir.row }]}>
          {Array.from({ length: cards }, (_, i) => (
            <View key={i} style={[styles.card, { backgroundColor: colors.glassFill }]}>
              <Skeleton height={ART_HEIGHT} radius={radii.sm} />
              <SkeletonText size={typography.sizes.text} width={i % 2 ? '54%' : '68%'} />
              <SkeletonText size={typography.sizes.text} width="80%" />
              <SkeletonText size={typography.sizes.text} width={48} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** The price as it is read: "Free", or the number, Zêr (a name, never translated) and what it is worth. */
function priceWords(item: ShopItem, t: (key: 'shop.free') => string, locale: Locale, value: (zer: number) => string): string {
  if (item.price === 0) return t('shop.free');
  return `${formatNumber(item.price, locale)} ${ZER} · ${value(item.price)}`;
}

/**
 * A number in the purse, moving to its new value when it changes (straight there under Reduce Motion), grouped and in
 * the reader's own digits.
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

/** One item as a card in the grid: its picture, name, meaning and price, as the website's shop shows it. */
function ShopCard({ item, balances, onPress }: { item: ShopItem; balances: Balances; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const kind = itemCategory(item.category);
  const affordable = canAfford(item, balances);
  const value = useZerValue();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[item.name, item.description, priceWords(item, t, locale, value)].filter(Boolean).join(', ')}
      style={[styles.card, { backgroundColor: colors.glassFill }]}
    >
      {/* Every card's picture takes the same height, so names and prices line up across a row. */}
      <View style={styles.cardArt}>
        {kind === 'frame' && item.assetUrl ? (
          <FrameArt path={item.assetUrl} width={FRAME_ART} />
        ) : isWordTag(item) ? (
          <TagPill tag={{ label: item.name, meaning: null }} style={styles.tagArt} />
        ) : kind === 'background' ? (
          <ItemArt category={item.category} path={item.assetUrl} style={styles.stretch} />
        ) : (
          <ItemArt category={item.category} path={item.assetUrl} width={ICON_ART} />
        )}
      </View>
      {/* The names are Kurmancî and the meanings English whatever the app language, so they read in their own
         direction (`free`). No Premium crown, since Premium cannot be had in the app. A long name or meaning takes a
         second line rather than being cut. */}
      <Text style={[styles.itemName, dir.free, { color: colors.textPrimary }]} numberOfLines={2}>
        {item.name}
      </Text>
      {item.description ? (
        <Text style={[styles.itemDesc, dir.free, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
      <RarityText item={item} />
      <View style={[styles.priceRow, { flexDirection: dir.row }]}>
        {item.price === 0 ? (
          // A price like any other: green is for a right answer.
          <Text style={[styles.price, { color: colors.textPrimary }]}>{t('shop.free')}</Text>
        ) : (
          <>
            <Icon name="coin" size={16} color={colors.gold} />
            <Text style={[styles.price, { color: affordable ? colors.textPrimary : colors.textSecondary }]}>{formatNumber(item.price, locale)}</Text>
          </>
        )}
      </View>
      {item.price > 0 ? <ZerValue zer={item.price} style={dir.text} /> : null}
    </PressableScale>
  );
}

/**
 * One item in its sheet: what it is, what it costs, and Buy. Once bought, the sheet stays and says so: the picture
 * pops, "… is yours!" replaces the price, and the purse counts down, with one button to close (still under Reduce
 * Motion).
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
  onTryOn,
}: {
  item: ShopItem;
  balances: Balances;
  busy: boolean;
  /** Just bought, from this sheet. */
  bought: boolean;
  onDone: () => void;
  onBuy: (item: ShopItem) => void;
  onEarnMore: () => void;
  onGift: (item: ShopItem) => void;
  /** Lays it over your own profile, where it is something worn. */
  onTryOn?: () => void;
}) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { width } = useWindowDimensions();
  const affordable = canAfford(item, balances);
  const value = useZerValue();
  const wide = itemCategory(item.category) === 'background';
  // A background as wide as the sheet allows; a square item at a fixed size.
  const artWidth = wide ? Math.min(Math.min(width, SHEET_MAX_WIDTH) - layout.gutter * 2, 400) : 128;
  return (
    <View style={styles.detail}>
      <Pop when={bought}>
        {itemCategory(item.category) === 'frame' && item.assetUrl ? (
          <FrameArt path={item.assetUrl} width={160} style={styles.preview} />
        ) : isWordTag(item) ? (
          <TagPill tag={{ label: item.name, meaning: item.description }} style={styles.preview} />
        ) : (
          <ItemArt category={item.category} path={item.assetUrl} width={artWidth} style={styles.preview} />
        )}
      </Pop>
      <Text style={[styles.detailName, { color: colors.textPrimary }]} accessibilityRole="header">
        {item.name}
      </Text>
      {item.description ? <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>{item.description}</Text> : null}
      <RarityText item={item} />
      {bought ? null : (
        <Text style={[styles.detailPrice, { color: colors.textPrimary }]}>{priceWords(item, t, locale, value)}</Text>
      )}

      {bought ? (
        <>
          {/* Yours now: ticked in the ink of what is yours and chosen, not the green of a right answer. */}
          <View style={[styles.yours, { flexDirection: dir.row }]} accessibilityLiveRegion="polite" testID="shop-bought">
            <Icon name="check" size={20} color={colors.primary} />
            <Text style={[styles.yoursText, { color: colors.textPrimary }]}>{t('shop.itemIsYours', { name: item.name })}</Text>
          </View>
          {item.price > 0 ? (
            // What is left in the purse, counting down from what was there.
            <View style={[styles.left, { flexDirection: dir.row }]}>
              <Icon name="coin" size={18} color={colors.gold} />
              <Counted value={balances.zer} style={[styles.leftText, { color: colors.textPrimary }]} />
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
          {onTryOn ? <ClayButton label={t('shop.tryOn')} icon="eye" onPress={onTryOn} style={styles.stretch} /> : null}
          {/* Said where the money is spent: nothing bought can be handed back. */}
          {item.price > 0 ? <Text style={[styles.finalNote, { color: colors.textSecondary }]}>{t('shop.finalNote')}</Text> : null}
          {/* Buying it for somebody else costs the same, so it sits beside Buy (quieter, since most people buy for
             themselves). Not for a free item: the server refuses a free gift. */}
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
            {t('shop.notEnough', { currency: ZER })} {t('shop.earnMoreZer')}
          </Text>
          <ClayButton label={t('shop.earnZer')} tone="primary" onPress={onEarnMore} />
        </View>
      )}
    </View>
  );
}

/** A card's picture: a background fills it at 16:9; an icon sits square in it, and a frame round your face. */
const ART_HEIGHT = 92;
const ICON_ART = 64;
const FRAME_ART = 84;
/** A card's height with two lines of meaning, for the placeholder's count. */
const CARD_HEIGHT = ART_HEIGHT + 96;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Bought: the words, and what is left in the purse under them.
  yours: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  yoursText: { flexShrink: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, textAlign: 'center' },
  left: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  leftText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  balances: { flexDirection: 'row', gap: spacing.md },
  balanceChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  balance: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  balanceUnit: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  content: { paddingBottom: spacing.xxl },
  // On a tablet the list is a centred column, as the Season screen's is.
  column: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  gutter: { marginHorizontal: GUTTER },
  inbox: { paddingHorizontal: GUTTER },
  // Your bird and your tree, under the received gifts and over the search.
  ownRows: { gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  toolbar: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  toolbarInner: { gap: spacing.sm },
  catalogue: { paddingTop: spacing.xs },
  section: { gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm },
  skeletonChips: { gap: spacing.sm, paddingHorizontal: GUTTER, overflow: 'hidden' },
  skeletonResults: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  skeletonPrice: { paddingHorizontal: spacing.xs },
  // Two cards to a row, the gap between them what the two leave.
  grid: { flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm },
  card: { width: '48.5%', gap: 4, borderRadius: radii.md, padding: spacing.sm },
  cardArt: { height: ART_HEIGHT, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  itemName: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  itemDesc: { fontSize: typography.sizes.text, lineHeight: 22 },
  stretch: { alignSelf: 'stretch' },
  tagArt: { alignSelf: 'center' },
  // At the card's foot, so the prices of a row line up whatever their meanings' length.
  priceRow: { alignItems: 'center', gap: spacing.xs, marginTop: 'auto', paddingTop: spacing.xs },
  price: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  detail: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm },
  preview: { marginBottom: spacing.sm },
  detailName: { ...display(typography.sizes.title), textAlign: 'center' },
  detailDesc: { fontSize: typography.sizes.text, textAlign: 'center' },
  detailPrice: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, marginVertical: spacing.sm },
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
  giftText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  insufficient: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
  insufficientText: { textAlign: 'center', fontSize: typography.sizes.text },
  finalNote: { textAlign: 'center', fontSize: typography.sizes.text, lineHeight: 20 },
});
