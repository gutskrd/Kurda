import type { ReactNode } from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { CoinIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { ZerValue } from './ZerValue';
import './buyConfirm.css';

/** What the dialog needs of the item being bought. */
interface BuyConfirmItem {
  name: string;
  price: number;
  currency: 'zer';
}

/**
 * The confirmation before a purchase: the item, its price with what it is worth, and that purchases are final, since
 * nothing can be refunded. Free items skip it. The bird and tree sections use it too, adding a picture, the balance
 * beside the price and any shortfall, which disables the confirm. Planting a tree is free and shows what it replaces
 * instead of the note; a zero price is not shown.
 */
export function BuyConfirm({
  item,
  busy,
  onConfirm,
  onCancel,
  title,
  art,
  balance = null,
  short = null,
  note,
  error = null,
  confirmLabel,
  cancelLabel,
}: {
  item: BuyConfirmItem | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** The question, in place of "Buy {name}?". */
  title?: string;
  /** A picture of the item, above the question. */
  art?: ReactNode;
  /** The Zêr balance, shown under the price. */
  balance?: number | null;
  /** How many are missing when the balance does not reach the price. */
  short?: string | null;
  /** What to know before confirming, in place of the note that purchases are final. */
  note?: ReactNode;
  /** Why the last try did not go through. */
  error?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const heading = item ? (title ?? t('shop.confirmTitle', { name: item.name })) : '';
  return (
    <Modal open={item !== null} onClose={() => !busy && onCancel()} label={heading}>
      {item && (
        <div className={`buy-confirm${art ? ' has-art' : ''}`}>
          {art && (
            <div className="buy-confirm-art" aria-hidden="true">
              {art}
            </div>
          )}
          <h2 className="buy-confirm-title">{heading}</h2>
          {item.price > 0 && (
            <p className="buy-confirm-price">
              <CoinIcon size={16} />
              {/* Zêr keeps its Kurmancî name in every language, as a currency does. */}
              {`${item.price.toLocaleString(locale)} Zêr`}
              <ZerValue zer={item.price} />
            </p>
          )}
          {item.price > 0 && balance !== null && <p className="buy-confirm-balance">{t('shop.balance', { zer: balance.toLocaleString(locale) })}</p>}
          {short && <p className="buy-confirm-short">{short}</p>}
          <p className="buy-confirm-note">{note ?? t('shop.finalNote')}</p>
          {error && (
            <p className="buy-confirm-error" role="alert">
              {error}
            </p>
          )}
          <div className="buy-confirm-actions">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              {cancelLabel ?? t('common.cancel')}
            </Button>
            <Button onClick={onConfirm} disabled={busy || Boolean(short)}>
              {confirmLabel ?? t('shop.buy')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
