import type { ReactNode } from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { CoinIcon, GemIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import './buyConfirm.css';

/** What the dialog needs of the item being bought. */
export interface BuyConfirmItem {
  name: string;
  price: number;
  currency: 'zer' | 'gems';
}

/**
 * The moment before something is bought: what it is, what it costs, and that
 * the purchase is final.
 *
 * Nothing bought in the shop can be handed back for Zêr or gems, so the place
 * to say so is here, before the money moves, in the calm voice of a shop
 * assistant rather than the small print of a receipt. Free items skip this:
 * nothing is spent, so there is nothing to be sure about.
 *
 * The bird and the tree on the same page ask here too, with a little more:
 * a picture of what is being had, the Zêr there are beside the price, and how
 * many are missing when they do not reach it, which keeps the confirm from
 * being pressed. Planting a tree costs nothing and says what it replaces in
 * place of the note about purchases; a price of nothing is not shown at all.
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
  /** what the dialog asks, in place of "Buy {name}?" */
  title?: string;
  /** a picture of what is being had, over the question */
  art?: ReactNode;
  /** the Zêr there are, said under the price so the cost is read against what is held */
  balance?: number | null;
  /** how many are missing, when the balance does not reach the price */
  short?: string | null;
  /** what there is to know before saying yes, in place of the note that a purchase is final */
  note?: ReactNode;
  /** why the last try did not go through */
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
              {item.currency === 'gems' ? <GemIcon size={16} /> : <CoinIcon size={16} />}
              {/* Zêr keeps its Kurmancî name in every language, as a currency does */}
              {`${item.price.toLocaleString(locale)} ${item.currency === 'gems' ? t('shop.gems') : 'Zêr'}`}
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
