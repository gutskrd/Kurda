/**
 * The shop's backgrounds or its icons, as cards with their art: a background
 * at 16:9, an icon square on a checkerboard so what is see-through shows. Each
 * card says what it is called, what it costs, whether it is on sale and how
 * many people own it, with Edit and Delete under it.
 *
 * Retired items (deleted while people owned them) are left out unless asked
 * for: they are not in the shop any more, and what an admin manages here is
 * the shop.
 */
import { useMemo, useState } from 'react';
import { foldForSearch } from '@kurda/shared';
import { Badge, Button, EmptyState, ErrorState, Icon, Pagination, Section } from '../ui';
import { KIND_NAME, artSrc } from './art';
import { STATE, priceText, saleState, type ArtKind, type SaleState, type ShopItem } from './model';
import './shop.css';

type Show = 'listed' | 'on' | 'off' | 'retired';

const SHOW: Record<Show, string> = {
  listed: 'All but retired',
  on: 'On sale',
  off: 'Not on sale',
  retired: 'Retired',
};

const PAGE = 24;

/** What is on sale first, then what will be, then what is out of the shop — the order an admin looks for them in. */
const RANK: Record<SaleState, number> = { on: 0, scheduled: 1, off: 2, ended: 3, hidden: 4, retired: 5 };

function shows(item: ShopItem, show: Show): boolean {
  const s = saleState(item);
  if (show === 'retired') return s === 'retired';
  if (show === 'on') return s === 'on';
  if (show === 'off') return s !== 'on' && s !== 'retired';
  return s !== 'retired';
}

export function ArtCatalogue({
  kind,
  items,
  loading,
  error,
  onRetry,
  onAdd,
  onEdit,
  onRemove,
}: {
  kind: ArtKind;
  /** the whole catalogue, retired items included; null before it has loaded */
  items: readonly ShopItem[] | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onAdd: () => void;
  onEdit: (item: ShopItem) => void;
  onRemove: (item: ShopItem) => void;
}): React.JSX.Element {
  const names = KIND_NAME[kind];
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('listed');
  const [page, setPage] = useState(0);

  const mine = useMemo(() => (items ? items.filter((i) => i.category === kind) : null), [items, kind]);
  const counts = useMemo(() => {
    const c: Record<Show, number> = { listed: 0, on: 0, off: 0, retired: 0 };
    for (const i of mine ?? []) for (const s of Object.keys(c) as Show[]) if (shows(i, s)) c[s] += 1;
    return c;
  }, [mine]);
  const shown = useMemo(() => {
    if (!mine) return null;
    // (Kurdish letters folded, as the shop folds them: "seva" finds Şeva)
    const words = foldForSearch(q).split(/\s+/).filter(Boolean);
    return mine
      .filter((i) => shows(i, show) && words.every((w) => foldForSearch(`${i.name} ${i.sku} ${i.description ?? ''}`).includes(w)))
      .sort((a, b) => RANK[saleState(a)] - RANK[saleState(b)] || a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  }, [mine, q, show]);

  const total = shown?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE));
  const at = Math.min(page, pageCount - 1);
  const cards = shown ? shown.slice(at * PAGE, (at + 1) * PAGE) : null;

  let body: React.ReactNode;
  if (error && !mine) {
    body = <ErrorState error={error} onRetry={onRetry} what="the shop" />;
  } else if (!cards) {
    body = (
      <div role="status">
        <span className="sr-only">Loading…</span>
        <ul className={`art-grid is-${kind}`} aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="art-card is-placeholder">
              <div className={`art-thumb is-${kind} skeleton`} />
              <div className="art-card-body">
                <div className="skeleton" />
                <div className="skeleton" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (cards.length === 0) {
    body =
      mine && mine.length > 0 && (q || show !== 'listed') ? (
        <EmptyState compact icon="search" title={`No ${names.one} matches`}>
          Try other words, or show {show === 'listed' ? 'retired ones' : 'everything but retired'}.
        </EmptyState>
      ) : (
        <EmptyState
          title={`No ${names.plural.toLowerCase()} yet`}
          action={
            <Button variant="primary" icon="plus" onClick={onAdd}>
              New {names.one}
            </Button>
          }
        >
          Upload a picture to add the first one.
        </EmptyState>
      );
  } else {
    body = (
      <ul className={`art-grid is-${kind}${loading ? ' is-refreshing' : ''}`} aria-label={names.plural}>
        {cards.map((item) => (
          <ArtCard key={item.sku} kind={kind} item={item} onEdit={() => onEdit(item)} onRemove={() => onRemove(item)} />
        ))}
      </ul>
    );
  }

  return (
    <Section
      flush
      className="art-catalogue"
      title={mine ? `${names.plural} (${total.toLocaleString()}${total !== mine.length ? ` of ${mine.length.toLocaleString()}` : ''})` : names.plural}
    >
      <div className="table-tools">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input
            type="search"
            aria-label={`Search ${names.plural.toLowerCase()}`}
            placeholder="Search by name or SKU"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <select
          aria-label="Show"
          value={show}
          onChange={(e) => {
            setShow(e.target.value as Show);
            setPage(0);
          }}
        >
          {(Object.keys(SHOW) as Show[]).map((s) => (
            <option key={s} value={s}>
              {SHOW[s]}
              {mine ? ` (${counts[s].toLocaleString()})` : ''}
            </option>
          ))}
        </select>
      </div>
      {error && mine ? <ErrorState compact error={error} onRetry={onRetry} what="the shop" /> : null}
      {body}
      {pageCount > 1 && <Pagination page={at} pageCount={pageCount} onPage={setPage} total={total} pageSize={PAGE} />}
    </Section>
  );
}

function ArtCard({
  kind,
  item,
  onEdit,
  onRemove,
}: {
  kind: ArtKind;
  item: ShopItem;
  onEdit: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  const [broken, setBroken] = useState(false);
  const state = saleState(item);
  const src = artSrc(item.assetUrl);
  const owners = item.owners;
  return (
    <li className={`art-card${state === 'retired' ? ' is-retired' : ''}`}>
      <div className={`art-thumb is-${kind}`}>
        {src && !broken ? (
          <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
        ) : (
          <span className="art-thumb-missing">{src ? 'Picture not found' : 'No picture'}</span>
        )}
      </div>
      <div className="art-card-body">
        <div className="art-card-head">
          <h3 className="art-card-name">{item.name}</h3>
          <Badge tone={STATE[state].tone}>{STATE[state].text}</Badge>
        </div>
        <code className="art-card-sku">{item.sku}</code>
        {item.description && <p className="art-card-desc">{item.description}</p>}
        <div className="art-card-meta">
          <strong className="art-card-price">{priceText(item.price, item.currency)}</strong>
          {item.premiumOnly && <Badge tone="info">Premium</Badge>}
          {owners !== undefined && (
            <span className="art-card-owners">
              <Icon name="users" size={14} />
              {owners === 0 ? 'No owners' : `${owners.toLocaleString()} ${owners === 1 ? 'owner' : 'owners'}`}
            </span>
          )}
        </div>
      </div>
      <div className="art-card-actions">
        <Button icon="edit" onClick={onEdit} aria-label={`Edit “${item.name}”`}>
          Edit
        </Button>
        {state !== 'retired' && (
          <Button variant="danger" icon="trash" onClick={onRemove} aria-label={`Delete “${item.name}”`}>
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}
