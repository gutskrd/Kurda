import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  shouldShowRefreshNotice,
  type ItemRefund,
  type RefreshedInventory,
  type ReturnItemResult,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { describeError } from '../lib/api';
import type { ApiError, InventoryItem } from '../lib/types';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import './refreshed.css';

/**
 * Backgrounds and icons whose art was replaced, from their owner's side
 * (shared/src/cosmetics.ts has the whole flow).
 *
 * The owner is told once that their items have new art and that they may hand
 * back any they bought, for what they paid. The notice stays until it is
 * dismissed — "once" means once read, not once rendered on a page scrolled
 * past — and dismissing it is what tells the server. Returning lives in the
 * Shop, under the catalogue's own tiles, because the notice says it does.
 */

/** `GET /me/inventory` as this needs it: items say what returning them gives back. */
export interface InventoryWithRefunds extends Partial<RefreshedInventory> {
  items: Array<InventoryItem & { refund?: ItemRefund | null }>;
}

/** What a refund is counted in. Zêr keeps its name in every language, as a currency does. */
function amountLabel(refund: ItemRefund, t: (key: MessageKey) => string): string {
  return `${refund.amount.toLocaleString()} ${refund.currency === 'gems' ? t('shop.gems') : 'Zêr'}`;
}

/** The one-time "we refreshed your items" notice, wherever the inventory has already been loaded. */
export function RefreshedNotice({
  inventory,
  linkToShop = false,
}: {
  inventory: InventoryWithRefunds | null | undefined;
  /** on a page other than the Shop, say where returning happens */
  linkToShop?: boolean;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const t = useT();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !shouldShowRefreshNotice(inventory)) return null;
  const canReturn = (inventory?.items ?? []).some((i) => i.refund);

  function dismiss(): void {
    setDismissed(true);
    // fire and forget: if it fails, the notice comes back next time, which is
    // the better way round for something about money
    void client.post('/me/inventory/refreshed/seen');
  }

  return (
    <section className="refresh-notice" aria-labelledby="refresh-notice-title">
      <div className="refresh-notice-text">
        <h2 id="refresh-notice-title" className="refresh-notice-title">
          {t('refresh.title')}
        </h2>
        <p className="refresh-notice-body">{canReturn ? t('refresh.body') : t('refresh.bodyKeep')}</p>
      </div>
      <div className="refresh-notice-actions">
        {linkToShop && canReturn && (
          <Link to="/app/shop#returns" className="btn btn-secondary">
            {t('refresh.goToShop')}
          </Link>
        )}
        <Button onClick={dismiss}>
          {t('refresh.gotIt')}
        </Button>
      </div>
    </section>
  );
}

/** The notice for a page that has not loaded the inventory itself (Edit Profile). */
export function RefreshedNoticeLoader(): React.JSX.Element | null {
  const inventory = useApiGet<InventoryWithRefunds>('/me/inventory');
  return <RefreshedNotice inventory={inventory.data} linkToShop />;
}

/** Why a return was refused, in words; the codes are shared/src/cosmetics.ts's. */
const RETURN_ERROR_COPY: Record<string, MessageKey> = {
  ITEM_NOT_FOUND: 'refresh.error.notReturnable',
  NOT_RETURNABLE: 'refresh.error.notReturnable',
  NOTHING_TO_REFUND: 'refresh.error.nothingToRefund',
  RETURN_CONFLICT: 'refresh.error.conflict',
};

/**
 * The owner's refreshed items that can be handed back, each with a Return
 * button that asks first and says exactly what comes back.
 */
export function ReturnableItems({
  inventory,
  onReturned,
}: {
  inventory: InventoryWithRefunds | null | undefined;
  /** the item has gone and the refund is in: update the balance, reload the inventory */
  onReturned: (result: ReturnItemResult) => void;
}): React.JSX.Element | null {
  const { client } = useAuth();
  const t = useT();
  const [asking, setAsking] = useState<(InventoryItem & { refund: ItemRefund }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { hash } = useLocation();
  const sectionRef = useRef<HTMLElement>(null);

  const returnable = (inventory?.items ?? []).filter((i): i is InventoryItem & { refund: ItemRefund } => !!i.refund);
  const shown = returnable.length > 0 || !!done;

  // the notice on Edit Profile links here; the router does not scroll to a
  // hash by itself, and the section only exists once the inventory is in
  useEffect(() => {
    if (shown && hash === '#returns') sectionRef.current?.scrollIntoView({ block: 'start' });
  }, [shown, hash]);

  if (!shown) return null;

  function close(): void {
    if (busy) return;
    setAsking(null);
    setError(null);
  }

  async function confirm(): Promise<void> {
    if (!asking || busy) return;
    setBusy(true);
    setError(null);
    const res = await client.post<ReturnItemResult>(`/shop/items/${encodeURIComponent(asking.sku)}/return`);
    setBusy(false);
    if (res.ok) {
      setDone(t('refresh.returned', { name: asking.name, amount: amountLabel(res.data.refund, t) }));
      setAsking(null);
      onReturned(res.data);
    } else {
      setError(returnError(res.error, t));
    }
  }

  return (
    <section className="friend-section" id="returns" ref={sectionRef} aria-labelledby="returns-title">
      <h2 className="friend-heading" id="returns-title">
        {t('refresh.sectionTitle')}
      </h2>
      <p className="muted refresh-lead">{t('refresh.sectionLead')}</p>
      {done && (
        <div className="msg msg-success refresh-done" role="status">
          {done}
        </div>
      )}
      {returnable.length > 0 && (
        <div className="shop-grid">
          {returnable.map((item) => (
            <figure className={`shop-tile shop-tile-${item.category}`} key={item.sku}>
              <div className={`shop-thumb shop-thumb-${item.category}`}>
                {item.assetUrl ? (
                  <img src={item.assetUrl} alt="" loading="lazy" />
                ) : (
                  <span className="shop-thumb-empty" aria-hidden="true" />
                )}
              </div>
              <figcaption className="shop-name" title={item.name}>
                {item.name}
              </figcaption>
              <Button
                variant="secondary"
                className="refresh-return"
                aria-haspopup="dialog"
                aria-label={t('refresh.returnItem', { name: item.name, amount: amountLabel(item.refund, t) })}
                onClick={() => {
                  setDone(null);
                  setAsking(item);
                }}
              >
                {t('refresh.returnFor', { amount: amountLabel(item.refund, t) })}
              </Button>
            </figure>
          ))}
        </div>
      )}

      <Modal open={asking !== null} onClose={close} label={asking ? t('refresh.confirmTitle', { name: asking.name }) : ''}>
        {asking && (
          <div className="refresh-confirm">
            <h2 className="friend-heading refresh-confirm-title">{t('refresh.confirmTitle', { name: asking.name })}</h2>
            <p className="refresh-confirm-amount">
              {t('refresh.confirmAmount', { amount: amountLabel(asking.refund, t) })}
            </p>
            <p className="muted">{t('refresh.confirmBody')}</p>
            {error && (
              <div className="msg msg-error" role="alert">
                {error}
              </div>
            )}
            <div className="refresh-confirm-actions">
              <Button variant="secondary" onClick={close} disabled={busy}>
                {t('refresh.keep')}
              </Button>
              <Button onClick={() => void confirm()} disabled={busy}>
                {busy ? t('refresh.returning') : t('refresh.confirm')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

function returnError(error: ApiError, t: ReturnType<typeof useT>): string {
  const key = error.code ? RETURN_ERROR_COPY[error.code] : undefined;
  return key ? t(key) : describeError(error, t);
}
