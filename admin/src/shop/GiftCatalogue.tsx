/**
 * The gifts (shared gift-catalogue.ts) as cards with their drawn pictures, each with its Kurmancî name and what it
 * means, its shelf, its price with what that is worth, and its sale state. A gift whose picture is not drawn yet is
 * listed and says it is not offered, since the apps offer only drawn gifts; a seasonal one says its months, as the
 * server offers it only then, every year (UTC). Prices change through the item form, where one of 500 Zêr or more goes
 * to Approvals as for any item; gifts are never deleted, since one may wait in a bag.
 */
import { useMemo } from 'react';
import { formatZerValue, giftMeaning, giftOfSku } from '@kurda/shared';
import { Badge, Button, EmptyState, ErrorState, Section } from '../ui';
import { artSrc } from './art';
import { STATE, priceText, saleState, type ShopItem } from './model';
import './shop.css';

/** "March only": the months a seasonal gift is offered in. */
function seasonText(months: readonly number[]): string {
  const names = months.map((m) => new Date(Date.UTC(2000, m - 1, 1)).toLocaleString('en', { month: 'long', timeZone: 'UTC' }));
  return `${names.join(', ')} only`;
}

const SHELF: Record<string, string> = {
  warm: 'Tea and treats',
  flowers: 'Flowers',
  animals: 'Animals',
  music: 'Music',
  sky: 'The sky',
  boats: 'Boats',
  houses: 'Houses',
  legends: 'Legends',
};

export function GiftCatalogue({
  items,
  error,
  onRetry,
  onEdit,
}: {
  /** The whole catalogue; null before it has loaded. */
  items: readonly ShopItem[] | null;
  error: unknown;
  onRetry: () => void;
  onEdit: (item: ShopItem) => void;
}): React.JSX.Element {
  const gifts = useMemo(() => (items ? items.filter((i) => i.category === 'gift').sort((a, b) => a.price - b.price || a.displayOrder - b.displayOrder) : null), [items]);
  if (error && !gifts) return <ErrorState error={error} onRetry={onRetry} what="the gifts" />;
  if (!gifts) return <div role="status">Loading…</div>;
  if (gifts.length === 0) return <EmptyState title="No gifts yet">The gifts are added by the server’s migration.</EmptyState>;
  const drawn = gifts.filter((g) => g.assetUrl).length;
  return (
    <Section flush className="art-catalogue" title={`Gifts (${gifts.length}, ${drawn} drawn and offered)`}>
      <ul className="art-grid is-icon" aria-label="Gifts">
        {gifts.map((item) => {
          const state = saleState(item);
          const src = artSrc(item.assetUrl);
          const def = giftOfSku(item.sku);
          return (
            <li key={item.sku} className={`art-card${state === 'retired' ? ' is-retired' : ''}`}>
              <div className="art-thumb is-icon">{src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <span className="art-thumb-missing">Not drawn yet</span>}</div>
              <div className="art-card-body">
                <div className="art-card-head">
                  <h3 className="art-card-name" lang="ku">
                    {item.name}
                  </h3>
                  <Badge tone={STATE[state].tone}>{STATE[state].text}</Badge>
                </div>
                <code className="art-card-sku">{item.sku}</code>
                <p className="art-card-desc">
                  {giftMeaning(item.sku, 'en') ?? item.description ?? ''}
                  {def ? ` · ${SHELF[def.group] ?? def.group}` : ''}
                </p>
                <div className="art-card-meta">
                  <strong className="art-card-price">{priceText(item.price, item.currency)}</strong>
                  <span>{formatZerValue(item.price, 'en')}</span>
                  {def?.earnedFree && <Badge tone="info">Earned in the bag</Badge>}
                  {def?.months && <Badge tone="info">{seasonText(def.months)}</Badge>}
                  {!src && <Badge tone="warn">Not offered</Badge>}
                </div>
              </div>
              <div className="art-card-actions">
                <Button icon="edit" onClick={() => onEdit(item)} aria-label={`Edit “${item.name}”`}>
                  Edit
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
