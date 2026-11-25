import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { applyItemFilter, categoriesIn, countByCategory, groupByCategory, itemCategory, shopItemDescription } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { requestId } from '../lib/api';
import type { ApiError, PurchaseResult, ShopItem } from '../lib/types';
import { ErrorState } from '../components/states';
import { PickFriendSkeleton, ShopSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Avatar } from '../components/Avatar';
import { CoinIcon, GiftIcon } from '../components/icons';
import { giftsWereOpened } from '../shop/useUnseenGifts';
import { RefreshedNotice, type InventoryWithNotice } from '../shop/RefreshedItems';
import { BuyConfirm } from '../shop/BuyConfirm';
import { YourBird, useLettersHome } from '../shop/YourBird';
import { YourTree } from '../shop/YourTree';
import { ZerValue } from '../shop/ZerValue';
import { useTree } from '../tree/useTree';
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
import { ItemPicture } from '../shop/ItemPicture';
import { PictureFrame } from '../ranks/art';
import { useAvatarSrc } from '../art/overrides';
import { DEFAULT_SHOP_VIEW, shopViewFiltered, useShopView } from '../shop/useShopView';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { SendError } from '../reports/SendError';

/**
 * Why `POST /shop/gift` refused, in the chat gift picker's words; the generic copy would read the daily limit as "too
 * many requests". Account limits and funds are said by SendError.
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

/** A catalogue tile: the item plus whether the viewer already owns it. */
interface Tile {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  assetUrl: string | null;
  owned: boolean;
}

/** A friend as `GET /friends` sends one (`FriendSummary`); it has `userId`, not `id`. */
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
  /** Null when the sender's account is gone or a block stands between you, so they are not named. */
  from: { id: string; username: string; displayName?: string | null } | null;
  createdAt: string;
  seenAt: string | null;
}

/** What a purchase says once it is yours: where a thing of its kind is used. */
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
 * The Shop: browse, buy and gift by kind (backgrounds, icons, tags, and "More"), with counts on the tabs and a section
 * per kind under All. Search (with or without Kurdish letters), sort and filters (affordable, free) live in the address,
 * so they survive a reload and Back. Anything priced asks first and says purchases are final. Above the catalogue are
 * your bird and tree (shop/YourBird.tsx, shop/YourTree.tsx), bought or swapped here. Buying grants ownership; equipping
 * is in Edit Profile. The server owns prices, ownership and payment (POST /shop/purchase, /shop/gift).
 */
export function Shop(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  // Stock, ownership and balance are fetched fresh: a remembered shelf would offer again what was just bought.
  const shop = useApiGet<{ items: ShopItem[] }>('/shop', { fresh: true });
  const inventory = useApiGet<InventoryWithNotice>('/me/inventory', { fresh: true });
  const wallet = useApiGet<{ balances: { zer: number } }>('/me/wallet', { fresh: true });
  const [view, setView] = useShopView();
  const ids = useIdPrefix('shop');
  // Your bird and tree are fetched with the catalogue, so they arrive together.
  const letters = useLettersHome();
  const tree = useTree();

  /** The Zêr learned since the wallet was read: a purchase or gift answers with the new balance. */
  const [known, setKnown] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok'; text: string } | { kind: 'err'; error: ApiError | string } | null>(null);
  /** The chat a gift just went to, where it waits wrapped. */
  const [giftChat, setGiftChat] = useState<Friend | null>(null);
  const [bought, setBought] = useState<Set<string>>(new Set());
  /** The tile that just succeeded, for the one-shot celebration. */
  const [celebrating, setCelebrating] = useState<string | null>(null);
  const [gifting, setGifting] = useState<Tile | null>(null);
  /** The item whose purchase is being confirmed. */
  const [asking, setAsking] = useState<Tile | null>(null);

  const zer = known ?? wallet.data?.balances?.zer ?? null;
  /** Whether this can be paid for now. */
  const canAfford = useCallback((tile: Tile): boolean => tile.price === 0 || (zer !== null && zer >= tile.price), [zer]);

  /** The Zêr left after a bird or tree purchase, which the balance and prices then use. */
  const learnZer = useCallback((left: number) => setKnown(left), []);

  const ownedSkus = useMemo(() => {
    const s = new Set((inventory.data?.items ?? []).map((i) => i.sku));
    for (const sku of bought) s.add(sku);
    return s;
  }, [inventory.data, bought]);

  // /shop hides owned unique items, so "owned" here is what was bought on this visit (or a repeatable item).
  const tiles: Tile[] = useMemo(
    () =>
      (shop.data?.items ?? []).map((i) => ({
        sku: i.sku,
        name: i.name,
        description: shopItemDescription(i, locale),
        category: i.category,
        price: i.price,
        assetUrl: i.assetUrl,
        owned: ownedSkus.has(i.sku),
      })),
    [shop.data, ownedSkus, locale],
  );

  /** Plays the celebration once, then clears it so it can play again. */
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
      setKnown(res.data.balance);
      setBought((prev) => new Set(prev).add(tile.sku));
      celebrate(tile.sku);
      setMsg({ kind: 'ok', text: t(boughtMessage(tile.category), { name: tile.name }) });
    } else {
      setMsg({ kind: 'err', error: res.error });
    }
  }

  /** Something priced asks first; something free is simply taken. */
  function askToBuy(tile: Tile): void {
    if (busy || tile.owned) return;
    if (tile.price === 0) {
      void buy(tile);
      return;
    }
    setMsg(null);
    setAsking(tile);
  }

  async function confirmBuy(): Promise<void> {
    const tile = asking;
    if (!tile) return;
    await buy(tile);
    setAsking(null);
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
      setKnown(res.data.balance);
      celebrate(tile.sku);
      setMsg({ kind: 'ok', text: t('shop.onItsWay', { name: tile.name, to: to.username }) });
      // Every gift arrives wrapped in the chat between the two of you.
      setGiftChat(to);
    } else {
      setMsg({ kind: 'err', error: shopGiftRefusal(res.error, to.username, t) ?? res.error });
    }
  }

  // The heading shows from the first frame; only the catalogue waits.
  const header = (
    <div className="page-header">
      <span className="eyebrow">{t('nav.profile')}</span>
      <h1 className="page-title">{t('nav.shop')}</h1>
      <p className="page-sub">
        {t('shop.subtitle')}{' '}
        {zer !== null && <strong>{zer.toLocaleString(locale)} Zêr</strong>}
      </p>
    </div>
  );

  if (shop.loading)
    return (
      <div className="container">
        {header}
        {/*
          The bird and the tree load on their own, so they stand in their places while the catalogue arrives. Keyed as
          below, so the same two carry over when it does, with a pick or a question in progress kept.
        */}
        <YourBird key="bird" home={letters} zer={zer} onZer={learnZer} />
        <YourTree key="tree" tree={tree} zer={zer} onZer={learnZer} />
        <ShopSkeleton label="shop.loading" />
      </div>
    );
  if (shop.error) return <ErrorState title={t('shop.loadFailed')} message={shop.error} onRetry={shop.reload} />;

  // ---- What is shown: the kinds on sale, and the items the view lets through ----
  const kinds = categoriesIn(tiles);
  const keep = (tile: Tile): boolean =>
    // An owned item stays, so nobody is told they cannot afford what they have.
    (!view.afford || tile.owned || canAfford(tile)) && (!view.free || tile.price === 0);
  // Every kind at once, searched, filtered and sorted: what the tabs count.
  const matching = applyItemFilter(tiles, { ...view, category: 'all' }, keep, locale);
  const counts = countByCategory(matching);
  // A kind the Shop has none of (an old link) shows everything instead of nothing.
  const active: KindTab = view.category !== 'all' && kinds.includes(view.category) ? view.category : 'all';
  const shown = active === 'all' ? matching : matching.filter((tile) => itemCategory(tile.category) === active);
  const filtered = shopViewFiltered(view);
  const anyFree = tiles.some((tile) => tile.price === 0);
  const clear = (): void => setView(DEFAULT_SHOP_VIEW);

  const grid = (list: Tile[]): React.JSX.Element => (
    <ShopGrid
      tiles={list}
      canAfford={canAfford}
      zer={zer}
      busy={busy}
      celebrating={celebrating}
      onBuy={askToBuy}
      onGift={setGifting}
    />
  );

  return (
    <div className="container">
      {header}

      {/* A refusal says what stopped it (SendError), such as an account limit with its end date. */}
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

      {/* The one-time notice about refreshed items. */}
      <RefreshedNotice inventory={inventory.data} />

      <GiftsReceived onEquipHint={() => setMsg(null)} />

      <YourBird key="bird" home={letters} zer={zer} onZer={learnZer} />
      <YourTree key="tree" tree={tree} zer={zer} onZer={learnZer} />

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

      <BuyConfirm item={asking && { ...asking, currency: 'zer' }} busy={busy !== null} onConfirm={() => void confirmBuy()} onCancel={() => setAsking(null)} />

      <Modal open={gifting !== null} onClose={() => setGifting(null)} label={t('shop.sendGift')}>
        {gifting && <GiftPicker tile={gifting} busy={busy !== null} onPick={(f) => void gift(gifting, f)} />}
      </Modal>
    </div>
  );
}

/** An item's picture, or its kind's glyph without one. A frame is shown round the shopper's own face. */
function TileArt({ assetUrl, category }: { assetUrl: string | null; category: string }): React.JSX.Element {
  const { user } = useAuth();
  const face = useAvatarSrc(user?.avatarUrl);
  if (assetUrl && itemCategory(category) === 'frame') {
    return (
      <span className="cosmetic-frame" aria-hidden="true">
        <PictureFrame src={assetUrl} size={104}>
          {face ? <img src={face} alt="" /> : <span className="art-frame-blank" />}
        </PictureFrame>
      </span>
    );
  }
  return assetUrl ? (
    <ItemPicture src={assetUrl} />
  ) : (
    <span className="item-glyph" aria-hidden="true">
      <ItemGlyph category={category} size={34} />
    </span>
  );
}

/**
 * Gifts you have been sent, above the catalogue only when there are some, so a gift notification lands somewhere that
 * shows it. Opening the page marks them seen, clearing the badge.
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
      // Reading the list is what opens them; otherwise the badge never clears.
      if (res.data.unseen > 0) {
        await client.post('/me/gifts/seen');
        // Tell the badge on the other screen now rather than at its next poll.
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
                {g.from ? t('gift.from', { name: g.from.displayName || g.from.username }) : t('gift.fromMember')}
              </span>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

/** Chooses which friend a gift goes to; the server allows friends only. */
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
        {t('shop.giftPaidByYou', { price: tile.price.toLocaleString(), currency: 'Zêr' })} <ZerValue zer={tile.price} />
      </p>
      {/* A gift is bought like anything else, and as final. */}
      <p className="muted">{t('shop.giftFinal')}</p>

      {friends === null ? (
        <PickFriendSkeleton />
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

/** One kind's items (or the chosen kind), as priced tiles. */
function ShopGrid({
  tiles,
  canAfford,
  zer,
  busy,
  celebrating,
  onBuy,
  onGift,
}: {
  tiles: Tile[];
  canAfford: (tile: Tile) => boolean;
  zer: number | null;
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
        const held = zer;
        return (
          <figure className={`shop-tile shop-tile-${kind}${celebrating === tile.sku ? ' shop-tile-won' : ''}`} key={tile.sku}>
            <div className={`shop-thumb shop-thumb-${kind}`}>
              <TileArt assetUrl={tile.assetUrl} category={tile.category} />
              {celebrating === tile.sku && <span className="shop-shine" aria-hidden />}
            </div>
            {/* The name is Kurdish and the line under it says what it is, as on the phone. */}
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
                {/* The price is on the tile, not only in the button, so an unaffordable item still says what to save for. */}
                <span className={`shop-price${affordable ? '' : ' is-short'}`}>
                  {/* What the Free filter calls it, rather than "0 Zêr", with no coin. */}
                  {tile.price === 0 ? (
                    t('items.free')
                  ) : (
                    <>
                      <CoinIcon size={14} />
                      {`${tile.price.toLocaleString(locale)} Zêr`}
                      <ZerValue zer={tile.price} />
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
                {/* Free items cannot be gifted (the API refuses: a notification at no cost). */}
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
