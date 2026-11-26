/**
 * A bundle opened from its card: the set worn together, its story, every part with what it costs alone and its rarity,
 * the gifts for the bag, and the sum — to a known adult with the parts' worth struck through and the saving, worked
 * out by the server. Buy is here, beside the note that purchases are final, so this is the one question asked.
 */
import { bundleWords, giftMeaning, shopItemDescription, type BundleView } from '@kurda/shared';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { CoinIcon, EyeIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { PictureFrame } from '../ranks/art';
import { useAuth } from '../auth/AuthProvider';
import { useAvatarSrc } from '../art/overrides';
import { BundlePrice, BundleShowcase } from './Bundles';
import { ItemPicture } from './ItemPicture';
import { RarityLabel } from './Rarity';
import { ZerValue } from './ZerValue';

/** A part's picture in the list, at a row's size: a frame round your face, a tag as its pill. */
function PartArt({ part }: { part: BundleView['parts'][number] }): React.JSX.Element {
  const { user } = useAuth();
  const face = useAvatarSrc(user?.avatarUrl);
  // the word itself is beside it, so the tag is shown by its pill's mark alone
  if (part.category === 'tag') return <span className="tag-pill tag-pill-mark-only"><span className="tag-pill-mark" /></span>;
  if (part.category === 'frame' && part.assetUrl) {
    return (
      <PictureFrame src={part.assetUrl} size={56}>
        {face ? <img src={face} alt="" /> : <span className="art-frame-blank" />}
      </PictureFrame>
    );
  }
  return part.assetUrl ? <ItemPicture src={part.assetUrl} /> : <span />;
}

export function BundleSheet({
  bundle,
  nudges,
  zer,
  busy,
  error,
  onBuy,
  onPreview,
  onClose,
}: {
  bundle: BundleView | null;
  nudges: boolean;
  /** the buyer's Zêr, once known */
  zer: number | null;
  busy: boolean;
  /** why the last try did not go through */
  error: string | null;
  onBuy: (bundle: BundleView) => void;
  onPreview: (bundle: BundleView) => void;
  onClose: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const words = bundle ? bundleWords(bundle.id, bundle.name, locale) : null;
  const short = bundle && zer !== null && zer < bundle.quote.price ? bundle.quote.price - zer : 0;
  const blocked = bundle ? !bundle.onSale || bundle.bagFull || bundle.quote.complete : true;
  return (
    <Modal open={bundle !== null} onClose={() => !busy && onClose()} label={bundle?.name ?? ''}>
      {bundle && (
        <div className="bundle-sheet">
          <BundleShowcase bundle={bundle} size="large" />
          <h2 className="bundle-sheet-name" lang="ku">
            {bundle.name}
          </h2>
          {words?.title && <p className="bundle-title">{words.title}</p>}
          {words && <p className="bundle-story">{words.story}</p>}

          <h3 className="bundle-sheet-heading">{t('bundle.inside')}</h3>
          <ul className="bundle-parts">
            {bundle.parts.map((p) => {
              const meaning = shopItemDescription(p, locale);
              return (
                <li key={p.sku} className={`bundle-part bundle-part-${p.category}`}>
                  <span className="bundle-part-art" aria-hidden="true">
                    <PartArt part={p} />
                  </span>
                  <span className="bundle-part-words">
                    <span className="bundle-part-name" lang="ku">
                      {p.name}
                    </span>
                    {meaning && <span className="bundle-part-desc">{meaning}</span>}
                  </span>
                  <span className="bundle-part-side">
                    <RarityLabel item={p} />
                    {p.owned ? (
                      <span className="bundle-part-owned">{t('shop.owned')}</span>
                    ) : (
                      <span className="bundle-part-alone">{t('bundle.alone', { zer: p.price.toLocaleString(locale) })}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {bundle.gifts.length > 0 && (
            <>
              <h3 className="bundle-sheet-heading">{t('bundle.gifts')}</h3>
              <ul className="bundle-gifts">
                {bundle.gifts.map((g) => (
                  <li key={g.sku}>
                    <span className="bundle-gift-art" aria-hidden="true">
                      {g.assetUrl && <img src={g.assetUrl} alt="" />}
                    </span>
                    <span className="bundle-part-words">
                      <span className="bundle-part-name">{t('bundle.giftCount', { count: g.count.toLocaleString(locale), name: g.name })}</span>
                      {giftMeaning(g.sku, locale) && <span className="bundle-part-desc">{giftMeaning(g.sku, locale)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted bundle-note">{t('bundle.giftsNote')}</p>
            </>
          )}

          <div className="bundle-sum">
            <BundlePrice bundle={bundle} nudges={nudges} />
            {bundle.quote.owned > 0 && !bundle.quote.complete && (
              <p className="bundle-owned">{t('bundle.ownedSome', { owned: bundle.quote.owned.toLocaleString(locale), total: bundle.parts.length.toLocaleString(locale) })}</p>
            )}
          </div>

          {bundle.bagFull && <p className="bundle-warn">{t('bundle.bagFull')}</p>}
          {!bundle.onSale && <p className="bundle-warn">{t('bundle.unavailable')}</p>}
          {error && (
            <p className="buy-confirm-error" role="alert">
              {error}
            </p>
          )}
          <p className="buy-confirm-note">{t('shop.finalNote')}</p>
          <div className="bundle-sheet-actions">
            <Button variant="secondary" onClick={() => onPreview(bundle)} disabled={busy}>
              <EyeIcon size={18} /> {t('bundle.preview')}
            </Button>
            <Button onClick={() => onBuy(bundle)} disabled={busy || blocked || short > 0}>
              <CoinIcon size={16} /> {t('bundle.buyFor', { zer: bundle.quote.price.toLocaleString(locale) })}
            </Button>
          </div>
          {short > 0 && !blocked && (
            <p className="shop-short bundle-short">
              {t('shop.amountMore', { amount: short.toLocaleString(locale) })} <ZerValue zer={short} />
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
