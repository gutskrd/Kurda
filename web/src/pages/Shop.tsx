import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { describeError, requestId } from '../lib/api';
import type { InventoryItem, PurchaseResult, ShopItem } from '../lib/types';
import { ErrorState } from '../components/states';
import { FriendListSkeleton, TileGridSkeleton } from '../components/skeletons';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Avatar } from '../components/Avatar';
import { CoinIcon, GiftIcon } from '../components/icons';
import { giftsWereOpened } from '../shop/useUnseenGifts';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/** A catalog tile: the item plus whether the viewer already owns it. */
interface Tile {
  sku: string;
  name: string;
  price: number;
  currency: 'zer' | 'gems';
  assetUrl: string | null;
  owned: boolean;
}

interface Friend {
  id: string;
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
function currencyName(currency: 'zer' | 'gems', t: (key: MessageKey) => string): string {
  return currency === 'gems' ? t('shop.gems') : 'Zêr';
}

/** What the shop can be narrowed to. 'all' is first because it is the default. */
const CATEGORIES = [
  { key: 'all', labelKey: 'shop.filter.all' },
  { key: 'background', labelKey: 'shop.filter.backgrounds' },
  { key: 'icon', labelKey: 'shop.filter.icons' },
] as const satisfies ReadonlyArray<{ key: string; labelKey: MessageKey }>;
type Category = (typeof CATEGORIES)[number]['key'];

/**
 * Narrow the catalogue: by kind, by name, and by what the wallet can reach.
 *
 * Kept out of the component so it can be reasoned about on its own — the
 * affordability rule in particular, which has to leave owned items alone. You
 * already have those; hiding one because it costs more than you hold today
 * would be telling you that you cannot afford something you own.
 */
function narrow(tiles: Tile[], query: string, affordable: boolean, balance: number | null): Tile[] {
  const q = query.trim().toLowerCase();
  return tiles.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q)) return false;
    if (affordable && !t.owned && (balance === null || balance < t.price)) return false;
    return true;
  });
}

function tilesFor(cat: string, shop: ShopItem[], owned: Set<string>): Tile[] {
  // /shop hides owned unique items, so owned ones come from inventory (below).
  return shop
    .filter((i) => i.category === cat)
    .map((i) => ({ sku: i.sku, name: i.name, price: i.price, currency: i.currency, assetUrl: i.assetUrl, owned: owned.has(i.sku) }));
}

/**
 * Shop — browse, buy, and gift profile cosmetics with Zêr.
 *
 * Buying only grants ownership; equipping happens in Edit Profile. All prices,
 * ownership and payment are server-authoritative (POST /shop/purchase and
 * /shop/gift validate the price and move the money atomically); the client
 * displays and requests, and celebrates afterwards.
 */
export function Shop(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const shop = useApiGet<{ items: ShopItem[] }>('/shop');
  const inventory = useApiGet<{ items: InventoryItem[] }>('/me/inventory');
  const wallet = useApiGet<{ balances: { zer: number } }>('/me/wallet');

  const [zer, setZer] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [bought, setBought] = useState<Set<string>>(new Set());
  /** the tile that just succeeded — drives the one-shot celebration */
  const [celebrating, setCelebrating] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [affordable, setAffordable] = useState(false);
  const [gifting, setGifting] = useState<Tile | null>(null);

  const balance = zer ?? wallet.data?.balances?.zer ?? null;
  const ownedSkus = useMemo(() => {
    const s = new Set((inventory.data?.items ?? []).map((i) => i.sku));
    for (const sku of bought) s.add(sku);
    return s;
  }, [inventory.data, bought]);

  const items = shop.data?.items ?? [];
  const backgrounds = narrow(tilesFor('background', items, ownedSkus), query, affordable, balance);
  const icons = narrow(tilesFor('icon', items, ownedSkus), query, affordable, balance);
  const showing = { background: category !== 'icon', icon: category !== 'background' };
  const nothingMatches =
    (!showing.background || backgrounds.length === 0) && (!showing.icon || icons.length === 0);

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
      setZer(res.data.balance);
      setBought((prev) => new Set(prev).add(tile.sku));
      celebrate(tile.sku);
      setMsg({ kind: 'ok', text: t('shop.isYours', { name: tile.name }) });
    } else {
      setMsg({ kind: 'err', text: describeError(res.error, t) });
    }
  }

  async function gift(tile: Tile, to: Friend): Promise<void> {
    setBusy(tile.sku);
    setMsg(null);
    const res = await client.post<{ balance: number }>('/shop/gift', {
      sku: tile.sku,
      toUserId: to.id,
      idempotencyKey: requestId(),
      expectedPrice: tile.price,
    });
    setBusy(null);
    setGifting(null);
    if (res.ok) {
      setZer(res.data.balance);
      celebrate(tile.sku);
      setMsg({ kind: 'ok', text: t('shop.onItsWay', { name: tile.name, to: to.username }) });
    } else {
      setMsg({ kind: 'err', text: describeError(res.error, t) });
    }
  }

  if (shop.loading)
    return (
      <div className="container">
        <TileGridSkeleton label="shop.loading" />
      </div>
    );
  if (shop.error) return <ErrorState title={t('shop.loadFailed')} message={shop.error} onRetry={shop.reload} />;

  return (
    <div className="container">
      <div className="page-header">
        <span className="eyebrow">{t('shop.eyebrow')}</span>
        <h1 className="page-title">{t('nav.shop')}</h1>
        <p className="page-sub">
          {t('shop.subtitle')}{' '}
          {balance !== null && <strong>{balance.toLocaleString()} Zêr</strong>}
        </p>
      </div>

      {msg && (
        <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`} role="status" style={{ marginBottom: 16 }}>
          {msg.text}
        </div>
      )}

      <GiftsReceived onEquipHint={() => setMsg(null)} />

      {/* the catalogue only grows, and scrolling all of it to find one thing is
          not browsing — it is searching, badly */}
      <div className="shop-filters">
        <div className="seg" role="group" aria-label={t('shop.show')}>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`seg-btn${category === c.key ? ' is-active' : ''}`}
              aria-pressed={category === c.key}
              onClick={() => setCategory(c.key)}
            >
              {t(c.labelKey)}
            </button>
          ))}
        </div>

        <input
          type="search"
          className="input shop-search"
          value={query}
          placeholder={t('shop.searchPlaceholder')}
          aria-label={t('shop.searchLabel')}
          onChange={(e) => setQuery(e.target.value)}
        />

        <label className="shop-afford">
          <input type="checkbox" checked={affordable} onChange={(e) => setAffordable(e.target.checked)} />
          {t('shop.withinMyZer')}
        </label>
      </div>

      {nothingMatches && (
        <p className="muted">{t('shop.noMatches')}</p>
      )}

      {showing.background && (
        <ShopSection
          title={t('shop.profileBackgrounds')}
          cat="background"
          tiles={backgrounds}
          balance={balance}
          busy={busy}
          celebrating={celebrating}
          onBuy={(t) => void buy(t)}
          onGift={setGifting}
        />
      )}
      {showing.icon && (
        <ShopSection
          title={t('shop.premiumIcons')}
          cat="icon"
          tiles={icons}
          balance={balance}
          busy={busy}
          celebrating={celebrating}
          onBuy={(t) => void buy(t)}
          onGift={setGifting}
        />
      )}

      <Modal open={gifting !== null} onClose={() => setGifting(null)} label={t('shop.sendGift')}>
        {gifting && <GiftPicker tile={gifting} busy={busy !== null} onPick={(f) => void gift(gifting, f)} />}
      </Modal>
    </div>
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
        {gifts.map((g) => (
          <figure className={`shop-tile shop-tile-${g.category} gift-tile${g.seenAt ? '' : ' gift-new'}`} key={g.id}>
            <div className={`shop-thumb shop-thumb-${g.category}`}>
              {g.assetUrl ? <img src={g.assetUrl} alt="" loading="lazy" /> : <span className="shop-thumb-empty" aria-hidden="true" />}
            </div>
            <figcaption className="shop-name" title={g.name}>
              {g.name}
            </figcaption>
            <span className="gift-from" onClick={onEquipHint}>
              {g.from ? t('shop.giftFrom', { name: g.from.username }) : t('shop.giftFromFormer')}
            </span>
          </figure>
        ))}
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
              <li key={f.id}>
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

function ShopSection({
  title,
  cat,
  tiles,
  balance,
  busy,
  celebrating,
  onBuy,
  onGift,
}: {
  title: string;
  cat: string;
  tiles: Tile[];
  balance: number | null;
  busy: string | null;
  celebrating: string | null;
  onBuy: (tile: Tile) => void;
  onGift: (tile: Tile) => void;
}): React.JSX.Element {
  const t = useT();
  return (
    <section className="friend-section">
      <h2 className="friend-heading">{title}</h2>
      {tiles.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>{t('shop.nothingYet')}</p>
      ) : (
        <div className="shop-grid">
          {tiles.map((tile) => {
            const canAfford = balance !== null && balance >= tile.price;
            return (
              <figure
                className={`shop-tile shop-tile-${cat}${celebrating === tile.sku ? ' shop-tile-won' : ''}`}
                key={tile.sku}
              >
                <div className={`shop-thumb shop-thumb-${cat}`}>
                  {tile.assetUrl ? <img src={tile.assetUrl} alt="" loading="lazy" /> : <span className="shop-thumb-empty" aria-hidden="true" />}
                  {celebrating === tile.sku && <span className="shop-shine" aria-hidden />}
                </div>
                <figcaption className="shop-name" title={tile.name}>{tile.name}</figcaption>
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
                    <span className={`shop-price${canAfford ? '' : ' is-short'}`}>
                      <CoinIcon size={14} />
                      {tile.price.toLocaleString()} {currencyName(tile.currency, t)}
                      {!canAfford && balance !== null && (
                        <span className="shop-short">
                          {t('shop.amountMore', { amount: (tile.price - balance).toLocaleString() })}
                        </span>
                      )}
                    </span>
                    <Button size="sm" disabled={busy !== null || !canAfford} onClick={() => onBuy(tile)}>
                      {t('shop.buy')}
                    </Button>
                    <button
                      type="button"
                      className="shop-gift-btn"
                      disabled={busy !== null || !canAfford}
                      onClick={() => onGift(tile)}
                      title={t('shop.giftTo', { name: tile.name })}
                      aria-label={t('shop.giftTo', { name: tile.name })}
                    >
                      <GiftIcon size={17} />
                    </button>
                  </div>
                )}
              </figure>
            );
          })}
        </div>
      )}
    </section>
  );
}
