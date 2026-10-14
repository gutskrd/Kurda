import { useEffect, useRef, useState } from 'react';
import { localeDir, type FeedImage } from '@kurda/shared';
import { ChevronIcon, CloseIcon } from '../components/icons';
import { useI18n, useT } from '../i18n/I18nProvider';
import './pictures.css';

/**
 * A post's pictures, one to four, the way X lays them out: one picture at its
 * own shape (within limits), two side by side, three as one tall and two
 * stacked, four in a square. Each opens full size in the lightbox.
 *
 * What a screen reader hears is the author's description of the picture —
 * never the post's text, which the old card used as every picture's alt, so a
 * caption was read out twice and the picture not at all. A picture nobody
 * described is "Picture 2 of 3", which is at least true.
 */
export function PostPictures({ images, className }: { images: FeedImage[]; className?: string }): React.JSX.Element | null {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  const shown = images.slice(0, 4);
  if (shown.length === 0) return null;

  const single = shown.length === 1 ? shown[0]! : null;
  // one picture keeps its own shape, between a tall phone photo and a wide screenshot
  const ratio = single?.width && single.height ? Math.min(Math.max(single.width / single.height, 0.8), 1.91) : 16 / 10;

  return (
    <div className={className}>
      <div
        className={`pp-grid pp-n${shown.length}`}
        style={single ? { aspectRatio: String(ratio) } : undefined}
        role="group"
        aria-label={t('pictures.group', { count: shown.length })}
      >
        {shown.map((img, i) => (
          <button
            key={`${img.url}-${i}`}
            type="button"
            className="pp-cell"
            onClick={() => setOpen(i)}
            aria-label={
              img.alt
                ? t('pictures.openDescribed', { n: i + 1, total: shown.length, alt: img.alt })
                : t('pictures.open', { n: i + 1, total: shown.length })
            }
          >
            <img src={img.url} alt="" loading="lazy" decoding="async" />
            {img.alt && (
              <span className="pp-alt" aria-hidden="true">
                {t('composer.alt')}
              </span>
            )}
          </button>
        ))}
      </div>
      {open !== null && <Lightbox images={shown} start={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/**
 * One picture at a time, as large as the screen allows, with its description
 * under it. Arrow keys and the side buttons move between pictures (mirrored
 * for a right-to-left language, so "next" points the way the reader reads);
 * Escape, the × or a click outside the picture closes it, and focus goes back
 * to the picture that was opened.
 */
export function Lightbox({ images, start, onClose }: { images: FeedImage[]; start: number; onClose: () => void }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const rtl = localeDir(locale) === 'rtl';
  const [index, setIndex] = useState(start);
  const closeRef = useRef<HTMLButtonElement>(null);
  const many = images.length > 1;
  const img = images[index]!;

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      restore?.focus?.();
    };
  }, []);

  const go = (step: number): void => setIndex((i) => (i + step + images.length) % images.length);

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (many && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const forward = e.key === 'ArrowRight' ? !rtl : rtl;
      go(forward ? 1 : -1);
    } else if (e.key === 'Tab') {
      // the three buttons are all there is to reach; keep focus among them
      const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button')];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }

  return (
    <div
      className="pp-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={many ? t('pictures.viewerN', { n: index + 1, total: images.length }) : t('pictures.viewer')}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button ref={closeRef} type="button" className="pp-close" aria-label={t('common.close')} onClick={onClose}>
        <CloseIcon size={22} />
      </button>

      <figure className="pp-figure" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <img src={img.url} alt={img.alt ?? t('pictures.undescribed', { n: index + 1 })} />
        {(img.alt || many) && (
          <figcaption className="pp-caption">
            {many && <span className="pp-count">{t('pictures.position', { n: index + 1, total: images.length })}</span>}
            {img.alt && <span className="pp-caption-text">{img.alt}</span>}
          </figcaption>
        )}
      </figure>

      {many && (
        <>
          <button type="button" className="pp-nav pp-prev" aria-label={t('pictures.previous')} onClick={() => go(-1)}>
            <ChevronIcon size={26} />
          </button>
          <button type="button" className="pp-nav pp-next" aria-label={t('pictures.next')} onClick={() => go(1)}>
            <ChevronIcon size={26} />
          </button>
        </>
      )}
    </div>
  );
}
