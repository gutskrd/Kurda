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
 */
export function BuyConfirm({
  item,
  busy,
  onConfirm,
  onCancel,
}: {
  item: BuyConfirmItem | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const title = item ? t('shop.confirmTitle', { name: item.name }) : '';
  return (
    <Modal open={item !== null} onClose={() => !busy && onCancel()} label={title}>
      {item && (
        <div className="buy-confirm">
          <h2 className="buy-confirm-title">{title}</h2>
          <p className="buy-confirm-price">
            {item.currency === 'gems' ? <GemIcon size={16} /> : <CoinIcon size={16} />}
            {/* Zêr keeps its Kurmancî name in every language, as a currency does */}
            {`${item.price.toLocaleString(locale)} ${item.currency === 'gems' ? t('shop.gems') : 'Zêr'}`}
          </p>
          <p className="buy-confirm-note">{t('shop.finalNote')}</p>
          <div className="buy-confirm-actions">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onConfirm} disabled={busy}>
              {t('shop.buy')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
