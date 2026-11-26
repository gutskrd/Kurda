/**
 * The moment a bundle is bought, in the spirit of a gift's (gifts/GiftMoment.tsx): the screen dims to night, and in
 * the bundle's own light you stand wearing the set — your face in its frame over a disc of its background, the icon on
 * your shoulder, the tag under your name — with what came and where the gifts went. Wear the set puts all of it on at
 * once. Under Reduce Motion the light is there and nothing moves.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GIFT_MOMENT_LOOK, bundleGlow, type BundleView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useAvatarSrc } from '../art/overrides';
import { Button } from '../components/Button';
import { CheckIcon } from '../components/icons';
import { wrapTab } from '../components/Sheet';
import { GiftLight } from '../gifts/GiftMoment';
import { useT } from '../i18n/I18nProvider';
import { lockPageScroll } from '../lib/scrollLock';
import { prefersReducedMotion } from '../lib/motion';
import { PictureFrame } from '../ranks/art';
import { TagPill } from '../profile/TagPill';
import { ItemPicture } from './ItemPicture';
import { partOf } from './Bundles';

const ART = 176;

export function BundleMoment({
  bundle,
  onWear,
  onClose,
}: {
  bundle: BundleView;
  /** puts the whole set on; resolves false when that did not go through */
  onWear: () => Promise<boolean>;
  onClose: () => void;
}): React.JSX.Element {
  const t = useT();
  const { user } = useAuth();
  const face = useAvatarSrc(user?.avatarUrl);
  const still = prefersReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [worn, setWorn] = useState<'no' | 'busy' | 'yes' | 'failed'>('no');
  const background = partOf(bundle, 'background');
  const frame = partOf(bundle, 'frame');
  const icon = partOf(bundle, 'icon');
  const tag = partOf(bundle, 'tag');

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const unlock = lockPageScroll();
    title.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent): void => {
      if (stage.current) wrapTab(e, stage.current);
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      unlock();
      restore?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div ref={stage} className="gift-moment scheme-night is-revealed bundle-moment" role="dialog" aria-modal="true" aria-label={t('bundle.isYours', { name: bundle.name })}>
      <div className="gift-moment-panel">
        <h2 className="gift-moment-title" ref={title} tabIndex={-1}>
          {t('bundle.isYours', { name: bundle.name })}
        </h2>
        <GiftLight sku={bundle.id} look={GIFT_MOMENT_LOOK.rare} art={ART} lit still={still} glow={bundleGlow(bundle.id)}>
          <span className={`bundle-moment-set${still ? '' : ' is-popping'}`}>
            {background?.assetUrl && (
              <span className="bundle-moment-disc" aria-hidden="true">
                <ItemPicture src={background.assetUrl} lazy={false} />
              </span>
            )}
            <span className="bundle-moment-face" aria-hidden="true">
              {frame?.assetUrl ? (
                <PictureFrame src={frame.assetUrl} size={ART}>
                  {face ? <img src={face} alt="" /> : <span className="art-frame-blank" />}
                </PictureFrame>
              ) : null}
              {icon?.assetUrl && <img className="bundle-show-icon" src={icon.assetUrl} alt="" />}
            </span>
          </span>
        </GiftLight>
        <div className="gift-moment-words">
          {tag && <TagPill tag={{ label: tag.name, meaning: tag.description }} className="bundle-moment-tag" />}
          <ul className="bundle-moment-list">
            {bundle.parts.map((p) => (
              <li key={p.sku} lang="ku">
                {p.name}
              </li>
            ))}
          </ul>
          {bundle.gifts.length > 0 && <p className="gift-moment-name">{t('bundle.giftsLanded')}</p>}
          <div className="gift-moment-actions">
            {worn === 'yes' ? (
              <span className="gift-done" role="status">
                <CheckIcon size={15} /> {t('bundle.wearing')}
              </span>
            ) : (
              <Button
                size="lg"
                disabled={worn === 'busy'}
                onClick={() => {
                  setWorn('busy');
                  void onWear().then((ok) => setWorn(ok ? 'yes' : 'failed'));
                }}
              >
                {t('bundle.wearAll')}
              </Button>
            )}
            {worn === 'failed' && (
              <p className="gift-moment-error" role="alert">
                {t('gift.actionFailed')}
              </p>
            )}
            <Button variant="ghost" onClick={onClose}>
              {t('common.done')}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
