/**
 * Bundles in the shop (shared shop-bundles.ts): the row they lead the shop with, each as a card showing its set worn
 * together — your own face in its frame, its icon, its word tag, over its background — with its gifts beside it, and
 * what it costs you. The saving and "Best value" are computed by the server and shared code, and shown only to a known
 * adult (`nudges`); anyone else sees the same bundles and prices plainly.
 */
import { bestValueBundle, bundleWords, type BundleView, type BundlesView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useAvatarSrc } from '../art/overrides';
import { Button } from '../components/Button';
import { CoinIcon } from '../components/icons';
import { PictureFrame } from '../ranks/art';
import { TagPill } from '../profile/TagPill';
import { useLocale, useT } from '../i18n/I18nProvider';
import { ItemPicture } from './ItemPicture';
import { ZerValue, useZerValue } from './ZerValue';
import './bundles.css';

/** The part of a bundle of one kind, if it has one. */
export function partOf(bundle: BundleView, kind: 'background' | 'frame' | 'icon' | 'tag'): BundleView['parts'][number] | undefined {
  return bundle.parts.find((p) => p.category === kind);
}

/**
 * The set worn together: the background behind, your face in the frame with the icon on its shoulder and the tag under
 * it, and the gifts in a column beside. Decorative: the card says the same in words.
 */
export function BundleShowcase({ bundle, size = 'card' }: { bundle: BundleView; size?: 'card' | 'large' }): React.JSX.Element {
  const { user } = useAuth();
  const face = useAvatarSrc(user?.avatarUrl);
  const background = partOf(bundle, 'background');
  const frame = partOf(bundle, 'frame');
  const icon = partOf(bundle, 'icon');
  const tag = partOf(bundle, 'tag');
  const ring = size === 'large' ? 150 : 120;
  return (
    <div className={`bundle-show bundle-show-${size}`} aria-hidden="true">
      {background?.assetUrl && (
        <span className="bundle-show-bg">
          <ItemPicture src={background.assetUrl} />
        </span>
      )}
      <span className="bundle-show-wearer">
        <span className="bundle-show-face">
          {frame?.assetUrl ? (
            <PictureFrame src={frame.assetUrl} size={ring}>
              {face ? <img src={face} alt="" /> : <span className="art-frame-blank" />}
            </PictureFrame>
          ) : (
            <span className="bundle-show-plain" style={{ width: ring * 0.67, height: ring * 0.67 }}>
              {face && <img src={face} alt="" />}
            </span>
          )}
          {icon?.assetUrl && <img className="bundle-show-icon" src={icon.assetUrl} alt="" />}
        </span>
        {tag && <TagPill tag={{ label: tag.name, meaning: tag.description }} className="bundle-show-tag" />}
      </span>
      {bundle.gifts.length > 0 && (
        <ul className="bundle-show-gifts">
          {bundle.gifts.map((g) => (
            <li key={g.sku}>
              {g.assetUrl ? <img src={g.assetUrl} alt="" /> : null}
              <span>{`×${g.count}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What a bundle costs you: its price with what it is worth in money, and to an adult the parts' worth struck through. */
export function BundlePrice({ bundle, nudges }: { bundle: BundleView; nudges: boolean }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const value = useZerValue();
  const { price, worth, saving } = bundle.quote;
  const struck = nudges && saving > 0;
  return (
    <div className="bundle-price">
      <span className="shop-price">
        {struck && (
          <>
            <s className="bundle-worth" aria-hidden="true">{`${worth.toLocaleString(locale)} Zêr`}</s>
            <span className="sr-only">{t('bundle.worthSpoken', { zer: worth.toLocaleString(locale) })}</span>
          </>
        )}
        <CoinIcon size={14} />
        {`${price.toLocaleString(locale)} Zêr`}
        <ZerValue zer={price} />
      </span>
      {struck && <span className="bundle-save">{t('bundle.save', { zer: saving.toLocaleString(locale), value: value(saving) })}</span>}
    </div>
  );
}

function BundleCard({ bundle, nudges, best, onOpen }: { bundle: BundleView; nudges: boolean; best: boolean; onOpen: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const words = bundleWords(bundle.id, bundle.name, locale);
  const { quote } = bundle;
  return (
    <article className={`bundle-card${quote.complete ? ' is-complete' : ''}`} aria-labelledby={`bundle-${bundle.id}`}>
      <BundleShowcase bundle={bundle} />
      <div className="bundle-card-body">
        <div className="bundle-card-head">
          <h3 className="bundle-name" id={`bundle-${bundle.id}`} lang="ku">
            {bundle.name}
          </h3>
          {best && nudges && <span className="bundle-best">{t('bundle.bestValue')}</span>}
        </div>
        {words?.title && <p className="bundle-title">{words.title}</p>}
        {quote.complete ? (
          <span className="shop-owned">{t('bundle.complete')}</span>
        ) : (
          <>
            <BundlePrice bundle={bundle} nudges={nudges} />
            {quote.owned > 0 && <p className="bundle-owned">{t('bundle.ownedSome', { owned: quote.owned.toLocaleString(locale), total: bundle.parts.length.toLocaleString(locale) })}</p>}
            <Button size="sm" variant="secondary" onClick={onOpen} aria-label={t('bundle.openNamed', { name: bundle.name })}>
              {t('bundle.open')}
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

/** The bundles the shop leads with, in a row that scrolls sideways on a phone; nothing while there are none. */
export function BundleRow({ view, onOpen }: { view: BundlesView | null; onOpen: (bundle: BundleView) => void }): React.JSX.Element | null {
  const t = useT();
  const bundles = view?.bundles ?? [];
  if (bundles.length === 0) return null;
  const best = bestValueBundle(bundles);
  return (
    <section className="bundle-row" aria-labelledby="bundles-heading">
      <h2 className="friend-heading" id="bundles-heading">
        {t('bundle.heading')}
      </h2>
      <p className="muted bundle-row-sub">{t('bundle.subtitle')}</p>
      <div className="bundle-track">
        {bundles.map((b) => (
          <BundleCard key={b.id} bundle={b} nudges={view?.nudges === true} best={best === b.id} onOpen={() => onOpen(b)} />
        ))}
      </div>
    </section>
  );
}
