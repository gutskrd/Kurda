import { useEffect, useState } from 'react';
import { applyItemFilter, countByCategory, DEFAULT_ITEM_FILTER, isFiltered, itemCategory, shopItemDescription, type ItemFilter } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError, requestId } from '../lib/api';
import type { ApiError, InventoryItem, MeProfile, PurchaseResult, ShopItem } from '../lib/types';
import { failureText, useOptimistic } from '../lib/optimistic';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { StarIcon } from '../components/icons';
import {
  ItemSearch,
  ItemSort,
  ItemToolbar,
  KindPanel,
  KindTabs,
  NoMatches,
  ResultsLine,
  SegmentedChoice,
  useIdPrefix,
} from '../shop/ItemBrowser';
import { ItemGlyph } from '../shop/ItemGlyph';
import { ItemPicture } from '../shop/ItemPicture';
import { ZerValue } from '../shop/ZerValue';
import { PictureFrame, SeasonFrame, frameTier } from '../ranks/art';
import { rankTierNamed } from '../ranks/names';
import { useAvatarSrc } from '../art/overrides';

/** The kinds the inventory keeps, in the shared order. Tags only appear once one is owned. */
type Kind = 'background' | 'icon' | 'frame' | 'tag';
/** The kinds that are worn on a profile, each through `PUT /me/cosmetics/<kind>`. */
type Wearable = Exclude<Kind, 'tag'>;
type Ownership = 'all' | 'owned' | 'notOwned';
type Currency = 'zer';

/** One thing in the inventory: owned, or on sale and not yet owned. */
interface Tile {
  sku: string;
  name: string;
  description: string | null;
  category: Kind;
  assetUrl: string | null;
  premiumOnly: boolean;
  owned: boolean;
  /** the catalogue price while it is buyable; none once owned */
  price?: number;
  currency: Currency;
}

/** What an empty tab says. The Tags tab is only there once a tag is owned, so it is never empty. */
const EMPTY: Readonly<Record<Wearable, MessageKey>> = {
  background: 'edit.noBackgrounds',
  icon: 'edit.noIcons',
  frame: 'edit.noFrames',
};

/**
 * Owned items (`/me/inventory`) then items for sale (`/shop`), since an owned unique item is not in the shop. Season
 * frames, given while game ranks ran, appear only once owned, and tags only as owned, since the tag on sale is bought in
 * the Shop.
 */
function mergeTiles(shop: ShopItem[], inventory: Array<InventoryItem & { description?: string | null }>, locale: string): Tile[] {
  const map = new Map<string, Tile>();
  for (const inv of inventory) {
    const kind = itemCategory(inv.category);
    // a gift sticker is kept as a gift, never worn
    if (kind === 'other' || kind === 'sticker') continue;
    map.set(inv.sku, {
      sku: inv.sku,
      name: inv.name,
      // not sent by /me/inventory today; read when it is
      description: shopItemDescription(inv, locale),
      category: kind,
      assetUrl: inv.assetUrl,
      premiumOnly: inv.premiumOnly,
      owned: true,
      currency: 'zer',
    });
  }
  for (const it of shop) {
    const kind = itemCategory(it.category);
    if ((kind !== 'background' && kind !== 'icon' && kind !== 'frame') || map.has(it.sku)) continue;
    map.set(it.sku, {
      sku: it.sku,
      name: it.name,
      description: shopItemDescription(it, locale),
      category: kind,
      assetUrl: it.assetUrl,
      premiumOnly: it.premiumOnly,
      owned: false,
      price: it.price,
      currency: it.currency,
    });
  }
  return [...map.values()];
}

/**
 * The reader's cosmetics in tabs by kind (backgrounds, icons, season frames, and tags once owned), owned first, with
 * a filter, search and sort. The server authorizes everything: the client sends a SKU to equip and the expected price
 * to buy, which is refused if the catalogue changed.
 */
export function CosmeticCustomizer({
  me,
  frameSku,
  onChanged,
}: {
  me: MeProfile;
  /** The frame worn, which /me does not say: the page reads it from your own public profile. */
  frameSku: string | null;
  onChanged: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const ids = useIdPrefix('cosmetics');
  const [shop, setShop] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [balances, setBalances] = useState<Partial<Record<Currency, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [tab, setTab] = useState<Kind>('background');
  const [ownership, setOwnership] = useState<Ownership>('all');
  const [filter, setFilter] = useState<ItemFilter>(DEFAULT_ITEM_FILTER);

  async function load(): Promise<void> {
    const [s, inv, w] = await Promise.all([
      client.get<{ items: ShopItem[] }>('/shop'),
      client.get<{ items: InventoryItem[] }>('/me/inventory'),
      client.get<{ balances: { zer: number } }>('/me/wallet'),
    ]);
    if (s.ok) setShop(s.data.items ?? []);
    if (inv.ok) setInventory(inv.data.items ?? []);
    if (w.ok) setBalances({ zer: w.data.balances?.zer });
    if (!s.ok && !inv.ok) setError(describeError(s.ok ? inv.error : s.error, t));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // load once on mount; equip/buy refresh explicitly
  }, [client]);

  /*
   * What is worn, one line per kind (lib/optimistic.ts): on at once, quick choices ending in the last one, and back to
   * what the server has with the reason if refused.
   */
  const wearing = (kind: Wearable) => ({
    send: (sku: string | null) => client.put(`/me/cosmetics/${kind}`, { sku }),
    options: {
      onSaved: (_: unknown, sku: string | null) => {
        setMsg({ kind: 'ok', text: sku ? t('edit.equippedMsg') : t('edit.removedMsg') });
        onChanged();
      },
      onFailed: (error: ApiError) => setMsg({ kind: 'err', text: failureText(error, t) }),
    },
  });
  const background = wearing('background');
  const icon = wearing('icon');
  const frame = wearing('frame');
  const lines = {
    background: useOptimistic(me.equippedBackgroundSku ?? null, background.send, background.options),
    icon: useOptimistic(me.equippedIconSku ?? null, icon.send, icon.options),
    frame: useOptimistic(frameSku, frame.send, frame.options),
  };
  const worn: Record<Wearable, string | null> = { background: lines.background[0], icon: lines.icon[0], frame: lines.frame[0] };
  const [iconEnabled, wantIconEnabled] = useOptimistic(me.premiumIconEnabled ?? true, (enabled) => client.put('/me/cosmetics/icon/visibility', { enabled }), {
    onSaved: onChanged,
    onFailed: (error) => setMsg({ kind: 'err', text: failureText(error, t) }),
  });

  function equip(kind: Wearable, sku: string | null): void {
    setMsg(null);
    lines[kind][1](sku);
  }

  async function buy(tile: Tile): Promise<void> {
    if (busy || tile.price == null) return;
    setBusy(tile.sku);
    setMsg(null);
    const res = await client.post<PurchaseResult>('/shop/purchase', {
      sku: tile.sku,
      idempotencyKey: requestId(),
      expectedPrice: tile.price,
    });
    if (res.ok) {
      // the answer is the Zêr left
      setBalances((b) => ({ ...b, [tile.currency]: res.data.balance }));
      await load(); // the item is now owned → becomes equippable
      setMsg({ kind: 'ok', text: tile.price > 0 ? t('edit.purchased', { name: tile.name }) : t('edit.gotFree', { name: tile.name }) });
      onChanged();
    } else {
      setMsg({ kind: 'err', text: describeError(res.error, t) });
    }
    setBusy(null);
  }

  function toggleIconVisibility(enabled: boolean): void {
    setMsg(null);
    wantIconEnabled(enabled);
  }

  if (loading) return <section className="card" style={{ marginTop: 24 }}><p className="muted">{t('edit.loadingCosmetics')}</p></section>;
  if (error) return <section className="card" style={{ marginTop: 24 }}><div className="msg msg-error">{error}</div></section>;

  const tiles = mergeTiles(shop, inventory, locale);
  // a frame goes by its tier's name in the reader's language ("Gir season frame"), not its catalogue label
  const named = tiles.map((tile) => {
    const tier = tile.category === 'frame' ? frameTier(tile.sku) : null;
    return tier ? { ...tile, name: t('seasons.frameTitle', { tier: rankTierNamed(t, tier).name }) } : tile;
  });
  const kinds: Kind[] = ['background', 'icon', 'frame', ...(named.some((tile) => tile.category === 'tag') ? (['tag'] as const) : [])];
  const active: Kind = kinds.includes(tab) ? tab : 'background';
  const keep = (tile: Tile): boolean => ownership === 'all' || (ownership === 'owned') === tile.owned;
  // every kind, searched and narrowed and sorted: what the tabs count
  const matching = applyItemFilter(named, { ...filter, category: 'all' }, keep, locale);
  const counts = countByCategory(matching);
  const isWorn = (tile: Tile): boolean => tile.category !== 'tag' && worn[tile.category] === tile.sku;
  const inTab = matching.filter((tile) => tile.category === active);
  // what you own (or wear: a Premium item can be worn unbought) comes first, in the chosen order within each
  const yours = (tile: Tile): boolean => tile.owned || isWorn(tile);
  const shown = [...inTab.filter(yours), ...inTab.filter((tile) => !yours(tile))];
  const anyInTab = named.some((tile) => tile.category === active);
  // the tab is where you are, not a narrowing: clearing keeps you on it
  const filtered = isFiltered({ ...filter, category: 'all' }) || ownership !== 'all';
  const clear = (): void => {
    setFilter(DEFAULT_ITEM_FILTER);
    setOwnership('all');
  };

  return (
    <section className="card cosmetics" style={{ marginTop: 24 }} aria-labelledby={`${ids}-title`}>
      <div className="cosmetics-head">
        <h2 id={`${ids}-title`} className="friend-heading" style={{ margin: 0 }}>
          {t('edit.cosmetics')}
        </h2>
        <span className="field-hint">{balances.zer === undefined ? '' : t('edit.zerAmount', { amount: balances.zer.toLocaleString(locale) })}</span>
      </div>
      {msg && <div className={`msg ${msg.kind === 'ok' ? 'msg-success' : 'msg-error'}`} role="status">{msg.text}</div>}

      <KindTabs kinds={kinds} value={active} counts={counts} idPrefix={ids} onChange={(kind) => setTab(kind as Kind)} />
      <ItemToolbar>
        <SegmentedChoice<Ownership>
          label={t('shop.show')}
          value={ownership}
          onChange={setOwnership}
          options={[
            { value: 'all', label: t('items.show.all') },
            { value: 'owned', label: t('items.show.owned') },
            { value: 'notOwned', label: t('items.show.notOwned') },
          ]}
        />
        <ItemSearch
          value={filter.query}
          label={t('edit.searchLabel')}
          placeholder={t('items.searchByName')}
          onChange={(query) => setFilter((f) => ({ ...f, query }))}
        />
        <ItemSort value={filter.sort} onChange={(sort) => setFilter((f) => ({ ...f, sort }))} />
      </ItemToolbar>
      <ResultsLine count={shown.length} filtered={filtered && shown.length > 0} onClear={clear} />

      <KindPanel idPrefix={ids} kind={active}>
        {!anyInTab ? (
          <EmptyKind kind={active} />
        ) : shown.length === 0 ? (
          <NoMatches onClear={clear} />
        ) : (
          <div className="cosmetic-grid">
            {shown.map((tile) => (
              <CosmeticTile
                key={tile.sku}
                tile={tile}
                avatarUrl={me.avatarUrl ?? null}
                premium={me.premium ?? false}
                equipped={isWorn(tile)}
                balance={balances[tile.currency]}
                busy={busy}
                onEquip={(sku) => {
                  if (tile.category !== 'tag') equip(tile.category, sku);
                }}
                onBuy={() => void buy(tile)}
              />
            ))}
          </div>
        )}
        {active === 'tag' && <p className="item-note">{t('edit.tagsNote')}</p>}
        {/* whether the icon shows is a thing about icons, so it lives on their tab */}
        {active === 'icon' && worn.icon && (
          <label className="icon-visibility">
            <input
              type="checkbox"
              checked={iconEnabled}
              onChange={(e) => toggleIconVisibility(e.target.checked)}
            />
            <span>{t('edit.showPremiumIcon')}</span>
          </label>
        )}
      </KindPanel>
    </section>
  );
}

/** A kind with nothing in it yet. */
function EmptyKind({ kind }: { kind: Kind }): React.JSX.Element | null {
  const t = useT();
  if (kind === 'tag') return null;
  return (
    <p className="muted" style={{ margin: 0 }}>
      {t(EMPTY[kind])}
    </p>
  );
}

function CosmeticTile({
  tile,
  avatarUrl,
  premium,
  equipped,
  balance,
  busy,
  onEquip,
  onBuy,
}: {
  tile: Tile;
  avatarUrl: string | null;
  premium: boolean;
  equipped: boolean;
  balance: number | undefined;
  busy: string | null;
  onEquip: (sku: string | null) => void;
  onBuy: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const equippable = tile.category !== 'tag' && (tile.owned || (tile.premiumOnly && premium));
  // A free item goes through the buy path, which the server grants without charging, so no balance is needed.
  const buyable = !tile.owned && tile.price != null && tile.price >= 0;
  const free = tile.price === 0;
  const canAfford = free || (balance != null && tile.price != null && balance >= tile.price);
  const disabled = busy !== null;
  const tier = tile.category === 'frame' ? frameTier(tile.sku) : null;
  const face = useAvatarSrc(avatarUrl);

  return (
    <figure className={`cosmetic-tile${equipped ? ' is-equipped' : ''}`}>
      <div className={`cosmetic-thumb cosmetic-thumb-${tile.category}`}>
        {tier ? (
          // the frame round your own face, as everyone else will see it
          <span className="cosmetic-frame" aria-hidden="true">
            <SeasonFrame tier={tier} size={88} title={tile.name}>
              {face ? <img src={face} alt="" /> : <span className="art-frame-blank" />}
            </SeasonFrame>
          </span>
        ) : tile.category === 'frame' && tile.assetUrl ? (
          // one of the shop's frames, round your own face too
          <span className="cosmetic-frame" aria-hidden="true">
            <PictureFrame src={tile.assetUrl} size={88}>
              {face ? <img src={face} alt="" /> : <span className="art-frame-blank" />}
            </PictureFrame>
          </span>
        ) : tile.assetUrl ? (
          <ItemPicture src={tile.assetUrl} />
        ) : (
          <span className="item-glyph" aria-hidden="true">
            <ItemGlyph category={tile.category} size={30} />
          </span>
        )}
        {(equipped || tile.owned) && (
          <span className={`cosmetic-state${equipped ? ' is-equipped' : ''}`}>{equipped ? t('edit.equipped') : t('shop.owned')}</span>
        )}
        {tile.premiumOnly && (
          <span className="cosmetic-badge" title={t('profile.premium')}>
            <StarIcon size={12} weight="fill" />
          </span>
        )}
      </div>
      <figcaption className="cosmetic-caption">
        <span className="cosmetic-name" title={tile.name}>
          {tile.name}
        </span>
        {tile.description && (
          <span className="cosmetic-desc" title={tile.description}>
            {tile.description}
          </span>
        )}
      </figcaption>
      {tile.category === 'tag' ? (
        // a tag is not worn from here: it is shown and hidden under Tags, further down this page
        <a href="#tags" className="btn btn-secondary btn-sm cosmetic-action">
          {t('edit.manageTags')}
        </a>
      ) : equipped ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm cosmetic-action"
          disabled={disabled}
          aria-label={t('edit.takeOffNamed', { name: tile.name })}
          onClick={() => onEquip(null)}
        >
          {t('edit.takeOff')}
        </button>
      ) : equippable ? (
        <button type="button" className="btn btn-secondary btn-sm cosmetic-action" disabled={disabled} onClick={() => onEquip(tile.sku)}>
          {t('edit.equip')}
        </button>
      ) : buyable ? (
        <>
          <button type="button" className="btn btn-secondary btn-sm cosmetic-action" disabled={disabled || !canAfford} onClick={onBuy}>
            {free
              ? t('edit.getFree')
              : !canAfford
                ? t('edit.notEnoughZer')
                : t('edit.buyFor', { price: tile.price!.toLocaleString(locale) })}
          </button>
          {/* what the price is worth, beside the button rather than in its name */}
          {!free && <ZerValue zer={tile.price!} />}
        </>
      ) : (
        <span className="cosmetic-locked">{t('profile.premium')}</span>
      )}
    </figure>
  );
}
