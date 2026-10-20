import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { applyItemFilter, categoriesIn, countByCategory, groupByCategory, itemCategory } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { requestId } from '../lib/api';
import type { ApiError, PurchaseResult, ShopItem } from '../lib/types';
import { ErrorState } from '../components/states';
import { FriendListSkeleton, TileGridSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Avatar } from '../components/Avatar';
import { CoinIcon, GemIcon, GiftIcon } from '../components/icons';
import { giftsWereOpened } from '../shop/useUnseenGifts';
import { RefreshedNotice, ReturnableItems, type InventoryWithRefunds } from '../shop/RefreshedItems';
import {
  FilterToggle,
  ItemSearch,
  ItemSort,
  ItemToolbar,
  KindHeading,
  KindPanel,
  KindTabs,
  NoMatches,
  ResultsLine,
  useIdPrefix,
  type KindTab,
} from '../shop/ItemBrowser';
import { ItemGlyph } from '../shop/ItemGlyph';
import { DEFAULT_SHOP_VIEW, shopViewFiltered, useShopView } from '../shop/useShopView';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { SendError } from '../reports/SendError';

/**
 * Why `POST /shop/gift` did not give it, in the words the chat's gift picker
 * uses. The route answers a skipped friend with its own codes; the app's
 * generic copy read the daily limit's 429 as "too many requests" and the rest
 * as "something went wrong". Anything else (a limit on the account, funds) is
 * said by SendError.
 */
function shopGiftRefusal(error: ApiError, name: string, t: (key: MessageKey, vars?: Record<string, string>) => string): string | null {
  switch (error.code) {
    case 'ALREADY_OWNED':
      return t('gift.skipped.owned', { name });
    case 'GIFT_DAILY_LIMIT':
      return t('gift.skipped.limit', { name });
    case 'GIFT_NOT_ALLOWED':
      return t('gift.skipped.notYet', { name });
    case 'NOT_FRIENDS':
      return t('gift.error.friendsOnly');
    case 'NOT_GIFTABLE':
    case 'ITEM_UNAVAILABLE':
      return t('gift.error.unavailable');
    case 'INSUFFICIENT_FUNDS':
      return t('gift.error.funds');
    default:
      return null;
  }
}

/** A catalog tile: the item plus whether the viewer already owns it. */
interface Tile {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  currency: 'zer' | 'gems';
  assetUrl: string | null;
  owned: boolean;
}

type Currency = Tile['currency'];

/**
 * A friend as `GET /friends` sends one (`FriendSummary`). It was declared with
 * `id`, which the API has never sent: every gift posted `toUserId: undefined`
 * and was refused with a validation error, so a gift from the web never went.
 */
interface Friend {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

interface ReceivedGift {
  id: string;
  sku: string;
  name: string;
  category: string;
  assetUrl: string | null;
  from: { id: string; username: string } | null;
  createdAt: string;
  seenAt: string | null;
}

/**
 * Items can be priced in either currency, so never hardcode one on a label.
 *
 * Zêr is the app's own currency and keeps its Kurmancî name in every language,
 * the way a currency does; gems are a common noun and get translated.
 */
function currencyName(currency: Currency, t: (key: MessageKey) => string): string {
  return currency === 'gems' ? t('shop.gems') : 'Zêr';
}

/** What a purchase says once it is yours: where a thing of its kind is put to use. */
function boughtMessage(category: string): MessageKey {
  switch (itemCategory(category)) {
    case 'tag':
      return 'shop.isYoursTag';
    case 'background':
    case 'icon':
    case 'frame':
      return 'shop.isYours';
    default:
      return 'shop.isYoursOther';
  }
}

/**
 * Shop — browse, buy, and gift what is on sale, by kind.
 *
 * Everything the API sends is shown, under its kind (backgrounds, icons, tags,
 * and anything else under "More"), with a count on each tab; under All each
 * kind has its own titled section. It can be searched (name and description,
 * with or without the Kurdish letters), sorted, and narrowed to what the
 * balance reaches or to what is free — and all of that is kept in the address,
 * so a narrowed Shop survives a reload and Back.
 *
 * Buying only grants ownership; equipping happens in Edit Profile. All prices,
 * ownership and payment are server-authoritative (POST /shop/purchase and
 * /shop/gift validate the price and move the money atomically); the client
 * displays and requests, and celebrates afterwards.
 */
export function Shop(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const shop = useApiGet<{ items: ShopItem[] }>('/shop');
  const inventory = useApiGet<InventoryWithRefunds>('/me/inventory');
  const wallet = useApiGet<{ balances: { zer: number; gems?: number } }>('/me/wallet');
  const [view, setView] = useShopView();
  const ids = useIdPrefix('shop');

  /** balances learned since the wallet was read: a purchase, a gift or a return answers with the new one */
  const [known, setKnown] = useState<Partial<Record<Currency, number>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok'; text: string } | { kind: 'err'; error: ApiError | string } | null>(null);
  /** the chat a gift just went to, where it now waits wrapped */
  const [giftChat, setGiftChat] = useState<Friend | null>(null);
  const [bought, setBought] = useState<Set<string>>(new Set());
  /** the tile that just succeeded — drives the one-shot celebration */
  const [celebrating, setCelebrating] = useState<string | null>(null);
  const [gifting, setGifting] = useState<Tile | null>(null);

  const balanceOf = useCallback(
    (currency: Currency): number | null => known[currency] ?? wallet.data?.balances?.[currency] ?? null,
    [known, wallet.data],
  );
  /**
   * Whether this can be paid for now — in its own currency. "Within my Zêr"
   * used to hold a gem-priced item against the Zêr balance.
   */
  const canAfford = useCallback(
    (tile: Tile): boolean => {
      if (tile.price === 0) return true;
      const held = balanceOf(tile.currency);
      return held !== null && held >= tile.price;
    },
    [balanceOf],
  );

  const ownedSkus = useMemo(() => {
    const s = new Set((inventory.data?.items ?? []).map((i) => i.sku));
    for (const sku of bought) s.add(sku);
    return s;
  }, [inventory.data, bought]);

  // /shop hides owned unique items, so "owned" here is what was bought on this visit
  // (or an item that can be owned more than once)
  const tiles: Tile[] = useMemo(
    () =>
      (shop.data?.items ?? []).map((i) => ({
        sku: i.sku,
        name: i.name,
        description: i.description ?? null,
        category: i.category,
        price: i.price,
        currency: i.currency,
        assetUrl: i.assetUrl,
        owned: ownedSkus.has(i.sku),
      })),
    [shop.data, ownedSkus],
  );

  /** Play the celebration once, then clear it so it can play again later. */
  const celebrate = useCallback((sku: string) => {
    setCelebrating(sku);
    setTimeout(() => setCelebrating((c) => (c === sku ? null : c)), 1100);
  }, []);

  async function buy(tile: Tile): Promise<void> {
    if (busy || tile.owned) return;
    setBusy(tile.sku);
    setMsg(null);
    const res = await client.post<PurchaseResult>('/shop/purchase', {
      sku: tile.sku,
      idempotencyKey: requestId(),
      expectedPrice: tile.price,
    });
    setBusy(null);
    if (res.ok) {
      // the answer is the balance of the item's own currency
      setKnown((k) => ({ ...k, [tile.currency]: res.data.balance }));
      setBought((prev) => new Set(prev).add(tile.sku));
      celebrate(tile.sku);
      setMsg({ kind: 'ok', text: t(boughtMessage(tile.category), { name: tile.name }) });
    } else {
      setMsg({ kind: 'err', error: res.error });
    }
  }

  async function gift(tile: Tile, to: Friend): Promise<void> {
    setBusy(tile.sku);
    setMsg(null);
    setGiftChat(null);
    const res = await client.post<{ balance: number }>('/shop/gift', {
      sku: tile.sku,
      toUserId: to.userId,
      idempotencyKey: requestId(),
      expectedPrice: tile.price,
    });
    setBusy(null);
    setGifting(null);
    if (res.ok) {
      // the answer is the balance of the item's own currency: a gift bought
      // with gems must not overwrite the Zêr shown at the top
      setKnown((k) => ({ ...k, [tile.currency]: res.data.balance }));
      celebrate(tile.sku);
      setMsg({ kind: 'ok', text: t('shop.onItsWay', { name: tile.name, to: to.username }) });
      // every gift arrives in the chat between the two of you, wrapped
      setGiftChat(to);
    } else {
      setMsg({ kind: 'err', error: shopGiftRefusal(res.error, to.username, t) ?? res.error });
    }
  }

  if (shop.loading)
    return (
      <div className="container">
        <TileGridSkeleton label="shop.loading" />
      </div>
    );
  if (shop.error) return <ErrorState title={t('shop.loadFailed')} message={shop.error} onRetry={shop.reload} />;

  // ---- what is shown: the kinds on sale, and the items the view lets through ----
  const kinds = categoriesIn(tiles);
  const keep = (tile: Tile): boolean =>
    // an owned item stays: hiding it for costing more than is held today would
    // be telling someone they cannot afford what they already have
    (!view.afford || tile.owned || canAfford(tile)) && (!view.free || tile.price === 0);
  // every kind at once, searched, narrowed and sorted: what the tabs count
  const matching = applyItemFilter(tiles, { ...view, category: 'all' }, keep, locale);
  const counts = countByCategory(matching);
  // a kind the Shop has none of (an old link) shows everything instead of nothing
  const active: KindTab = view.category !== 'all' && kinds.includes(view.category) ? view.category : 'all';
  const shown = active === 'all' ? matching : matching.filter((tile) => itemCategory(tile.category) === active);
  const filtered = shopViewFiltered(view);
  const anyFree = tiles.some((tile) => tile.price === 0);
  const gemPriced = tiles.some((tile) => tile.currency === 'gems');
  const zer = balanceOf('zer');
  const gems = balanceOf('gems');
  const clear = (): void => setView(DEFAULT_SHOP_VIEW);

  const grid = (list: Tile[]): React.JSX.Element => (
    <ShopGrid
      tiles={list}
      canAfford={canAfford}
      balanceOf={balanceOf}
      busy={busy}
      celebrating={celebrating}
      onBuy={(tile) => void buy(tile)}
      onGift={setGifting}
    />
  );

  return (
    <div className="container">
      <div className="page-header">
        <span className="eyebrow">{t('nav.profile')}</span>
        <h1 className="page-title">{t('nav.shop')}</h1>
        <p className="page-sub">
          {t('shop.subtitle')}{' '}
          {zer !== null && <strong>{zer.toLocaleString(locale)} Zêr</strong>}
          {gemPriced && gems !== null && (
            <>
              {' · '}
              <strong>
                {gems.toLocaleString(locale)} {t('shop.gems')}
              </strong>
            </>
          )}
        </p>
      </div>

      {/* a refusal says what stopped it — a limit on the account with when it
          ends and where the reasons are (SendError) — rather than "try again" */}
      {msg?.kind === 'err' && <SendError error={msg.error} role="status" className="shop-msg" />}
      {msg?.kind === 'ok' && (
        <div className="msg msg-success" role="status" style={{ marginBottom: 16 }}>
          {msg.text}
          {giftChat && (
            <>
              {' '}
              <Link
                className="send-error-link"
                to={`/app/messages?to=${giftChat.userId}&name=${encodeURIComponent(giftChat.username)}`}
              >
                {t('shop.giftInChat')}
              </Link>
            </>
          )}
        </div>
      )}

      {/* refreshed items: the one-time notice (contract-3 §S) */}
      <RefreshedNotice inventory={inventory.data} />

      <GiftsReceived onEquipHint={() => setMsg(null)} />

      {/* refreshed items the owner can hand back, above the catalogue, where the notice sends them (contract-3 §S) */}
      <ReturnableItems
        inventory={inventory.data}
        onReturned={(r) => {
          setKnown((k) => ({ ...k, [r.refund.currency]: r.balance }));
          inventory.reload();
        }}
      />

      {/* the catalogue only grows, and scrolling all of it to find one thing is
          not browsing — it is searching, badly */}
      {tiles.length === 0 ? (
        <p className="muted">{t('shop.nothingYet')}</p>
      ) : (
        <>
          <KindTabs
            kinds={['all', ...kinds]}
            value={active}
            counts={counts}
            idPrefix={ids}
            onChange={(category) => setView({ ...view, category })}
          />
          <ItemToolbar>
            <ItemSearch
              value={view.query}
              label={t('shop.searchLabel')}
              placeholder={t('shop.searchPlaceholder')}
              onChange={(query) => setView({ ...view, query }, { replace: true })}
            />
            <ItemSort value={view.sort} onChange={(sort) => setView({ ...view, sort })} />
            <div className="item-toggles">
              <FilterToggle checked={view.afford} onChange={(afford) => setView({ ...view, afford })}>
                {t('items.withinBalance')}
              </FilterToggle>
              {(anyFree || view.free) && (
                <FilterToggle checked={view.free} onChange={(free) => setView({ ...view, free })}>
                  {t('items.free')}
                </FilterToggle>
              )}
            </div>
          </ItemToolbar>
          <ResultsLine count={shown.length} filtered={filtered && shown.length > 0} onClear={clear} />

          <KindPanel idPrefix={ids} kind={active} className="shop-catalogue">
            {shown.length === 0 ? (
              <NoMatches onClear={clear} />
            ) : active === 'all' ? (
              groupByCategory(shown).map((group) => (
                <section key={group.category} className="item-section" aria-labelledby={`${ids}-${group.category}`}>
                  <KindHeading kind={group.category} count={group.items.length} id={`${ids}-${group.category}`} />
                  {grid(group.items)}
                </section>
              ))
            ) : (
              grid(shown)
            )}
          </KindPanel>
        </>
      )}

      <Modal open={gifting !== null} onClose={() => setGifting(null)} label={t('shop.sendGift')}>
        {gifting && <GiftPicker tile={gifting} busy={busy !== null} onPick={(f) => void gift(gifting, f)} />}
      </Modal>
    </div>
  );
}

/** An item's picture, or its kind's glyph when it has none (the Kurdish tag). */
function TileArt({ assetUrl, category }: { assetUrl: string | null; category: string }): React.JSX.Element {
  return assetUrl ? (
    <img src={assetUrl} alt="" loading="lazy" />
  ) : (
    <span className="item-glyph" aria-hidden="true">
      <ItemGlyph category={category} size={34} />
    </span>
  );
}

/**
 * Gifts you have been sent.
 *
 * Sits above the catalog and only appears when there is something in it, so the
 * notification ("someone sent you a gift") lands somewhere that acknowledges it
 * rather than dropping you into a shop that looks unchanged. Opening the page
 * marks them seen, which clears the badge.
 */
function GiftsReceived({ onEquipHint }: { onEquipHint: () => void }): React.JSX.Element | null {
  const { client } = useAuth();
  const t = useT();
  const [gifts, setGifts] = useState<ReceivedGift[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await client.get<{ gifts: ReceivedGift[]; unseen: number }>('/me/gifts');
      if (cancelled || !res.ok) return;
      setGifts(res.data.gifts);
      // reading the list IS opening them; anything else leaves a badge that
      // never clears no matter what you do
      if (res.data.unseen > 0) {
        await client.post('/me/gifts/seen');
        // and tell the badge, which is on another screen and would otherwise go
        // on claiming there are unopened gifts until its next poll
        giftsWereOpened();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!gifts || gifts.length === 0) return null;

  return (
    <section className="friend-section">
      <h2 className="friend-heading">{t('shop.yourGifts')}</h2>
      <div className="shop-grid">
        {gifts.map((g) => {
          const kind = itemCategory(g.category);
          return (
            <figure className={`shop-tile shop-tile-${kind} gift-tile${g.seenAt ? '' : ' gift-new'}`} key={g.id}>
              <div className={`shop-thumb shop-thumb-${kind}`}>
                <TileArt assetUrl={g.assetUrl} category={g.category} />
              </div>
              <figcaption className="shop-caption">
                <span className="shop-name" title={g.name}>
                  {g.name}
                </span>
              </figcaption>
              <span className="gift-from" onClick={onEquipHint}>
                {g.from ? t('shop.giftFrom', { name: g.from.username }) : t('shop.giftFromFormer')}
              </span>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

/** Choose which friend a gift goes to. Gifting is friends-only, server-side. */
function GiftPicker({
  tile,
  busy,
  onPick,
}: {
  tile: Tile;
  busy: boolean;
  onPick: (friend: Friend) => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    void (async () => {
      const res = await client.get<{ friends: Friend[] }>('/friends');
      setFriends(res.ok ? res.data.friends : []);
    })();
  }, [client]);

  const shown = (friends ?? []).filter((f) => f.username.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>
        {t('shop.sendItem', { name: tile.name })}
      </h2>
      <p className="muted">
        {t('shop.giftPaidByYou', {
          price: tile.price.toLocaleString(),
          currency: currencyName(tile.currency, t),
        })}
      </p>

      {friends === null ? (
        <FriendListSkeleton count={4} />
      ) : friends.length === 0 ? (
        <p className="muted">{t('shop.noFriendsToGift')}</p>
      ) : (
        <>
          {friends.length > 6 && (
            <input
              className="input"
              placeholder={t('shop.searchFriends')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t('shop.searchFriendsLabel')}
              style={{ marginBottom: 12 }}
            />
          )}
          <ul className="gift-friends">
            {shown.map((f) => (
              <li key={f.userId}>
                <button type="button" className="gift-friend" disabled={busy} onClick={() => onPick(f)}>
                  <Avatar url={f.avatarUrl} glyphSize={18} />
                  <span className="gift-friend-name">{f.username}</span>
                  <GiftIcon size={17} className="gift-friend-go" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** One kind's items (or the one kind chosen), as priced tiles. */
function ShopGrid({
  tiles,
  canAfford,
  balanceOf,
  busy,
  celebrating,
  onBuy,
  onGift,
}: {
  tiles: Tile[];
  canAfford: (tile: Tile) => boolean;
  balanceOf: (currency: Currency) => number | null;
  busy: string | null;
  celebrating: string | null;
  onBuy: (tile: Tile) => void;
  onGift: (tile: Tile) => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="shop-grid">
      {tiles.map((tile) => {
        const kind = itemCategory(tile.category);
        const affordable = canAfford(tile);
        const held = balanceOf(tile.currency);
        return (
          <figure className={`shop-tile shop-tile-${kind}${celebrating === tile.sku ? ' shop-tile-won' : ''}`} key={tile.sku}>
            <div className={`shop-thumb shop-thumb-${kind}`}>
              <TileArt assetUrl={tile.assetUrl} category={tile.category} />
              {celebrating === tile.sku && <span className="shop-shine" aria-hidden />}
            </div>
            {/* the name is Kurdish and the line under it says what it is, as
                the phone has always shown it */}
            <figcaption className="shop-caption">
              <span className="shop-name" title={tile.name}>
                {tile.name}
              </span>
              {tile.description && (
                <span className="shop-desc" title={tile.description}>
                  {tile.description}
                </span>
              )}
            </figcaption>
            {tile.owned ? (
              <span className="shop-owned">{t('shop.owned')}</span>
            ) : (
              <div className="shop-actions">
                {/*
                  The price is on the tile, not only inside the button. It used
                  to live in the button's label, which meant an item you could
                  not yet afford said "Not enough Zêr" and nothing else — so
                  the one thing you needed to know, what to save towards, was
                  the one thing the shop would not tell you.
                */}
                <span className={`shop-price${affordable ? '' : ' is-short'}`}>
                  {/* what the Free filter calls it, rather than "0 Zêr" — and no coin beside it */}
                  {tile.price === 0 ? (
                    t('items.free')
                  ) : (
                    <>
                      {tile.currency === 'gems' ? <GemIcon size={14} /> : <CoinIcon size={14} />}
                      {`${tile.price.toLocaleString(locale)} ${currencyName(tile.currency, t)}`}
                    </>
                  )}
                  {!affordable && held !== null && (
                    <span className="shop-short">
                      {t('shop.amountMore', { amount: (tile.price - held).toLocaleString(locale) })}
                    </span>
                  )}
                </span>
                <Button size="sm" disabled={busy !== null || !affordable} onClick={() => onBuy(tile)}>
                  {tile.price === 0 ? t('edit.getFree') : t('shop.buy')}
                </Button>
                {/* a free item is not a gift (the API refuses it: it would be a
                    notification in someone's face at no cost) */}
                {tile.price > 0 && (
                  <button
                    type="button"
                    className="shop-gift-btn"
                    disabled={busy !== null || !affordable}
                    onClick={() => onGift(tile)}
                    title={t('shop.giftTo', { name: tile.name })}
                    aria-label={t('shop.giftTo', { name: tile.name })}
                  >
                    <GiftIcon size={17} />
                  </button>
                )}
              </div>
            )}
          </figure>
        );
      })}
    </div>
  );
}
