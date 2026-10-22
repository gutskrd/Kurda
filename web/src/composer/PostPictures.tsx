import { useEffect, useRef, useState } from 'react';
import { localeDir, type FeedImage } from '@kurda/shared';
import { ChevronIcon, CloseIcon } from '../components/icons';
import { useI18n, useT } from '../i18n/I18nProvider';
import './pictures.css';

/** How long one click on a picture waits for a second before it opens the picture. */
const DOUBLE_MS = 260;

/**
 * A post's pictures, one to four: one picture at its own shape (within
 * limits), two side by side, three as one tall and two stacked, four in a
 * square. Each opens full size in the lightbox.
 *
 * On the wall (`strip`) two or more come one at a time instead, each whole and
 * the full width of the post, swiped or scrolled sideways (see `Strip` below).
 *
 * What a screen reader hears is the author's description of the picture —
 * never the post's text, which the old card used as every picture's alt, so a
 * caption was read out twice and the picture not at all. A picture nobody
 * described is "Picture 2 of 3", which is at least true.
 */
export function PostPictures({
  images,
  className,
  strip = false,
  onDoubleActivate,
}: {
  images: FeedImage[];
  className?: string;
  /** one at a time, side by side in a row that is swiped, rather than in a grid (the wall) */
  strip?: boolean;
  /**
   * Two quick clicks or taps on a picture (the wall likes the post with it).
   * When it is given, one click waits a moment to be sure it is not the first
   * of two before opening the picture; Enter or Space opens it at once.
   */
  onDoubleActivate?: () => void;
}): React.JSX.Element | null {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    },
    [],
  );
  const shown = images.slice(0, 4);
  if (shown.length === 0) return null;

  const single = shown.length === 1 ? shown[0]! : null;

  const cell = (img: FeedImage, i: number, extra = ''): React.JSX.Element => (
    <button
      key={`${img.url}-${i}`}
      type="button"
      className={`pp-cell${extra}`}
      onClick={(e) => {
        if (pending.current !== null) window.clearTimeout(pending.current);
        pending.current = null;
        // detail is how many clicks in a row this one is; a key press is 0
        if (!onDoubleActivate || e.detail === 0) setOpen(i);
        else if (e.detail === 2) onDoubleActivate();
        else if (e.detail === 1) {
          pending.current = window.setTimeout(() => {
            pending.current = null;
            setOpen(i);
          }, DOUBLE_MS);
        }
      }}
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
  );

  return (
    <div className={className}>
      {strip && !single ? (
        <Strip images={shown} cell={cell} />
      ) : (
        <div
          className={`pp-grid pp-n${shown.length}`}
          style={single ? { aspectRatio: String(singleRatio(single)) } : undefined}
          role="group"
          aria-label={t('pictures.group', { count: shown.length })}
        >
          {shown.map((img, i) => cell(img, i))}
        </div>
      )}
      {open !== null && <Lightbox images={shown} start={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** One picture's shape, kept between a tall phone photo and a wide screenshot. */
function singleRatio(img: FeedImage): number {
  return img.width && img.height ? Math.min(Math.max(img.width / img.height, 0.8), 1.91) : 16 / 10;
}

/**
 * A wall post's pictures, one at a time, each whole and the full width of the
 * post, in a row that snaps from one to the next as it is swiped. All of them
 * take the first one's shape, so the post does not change height while it is
 * swiped. Where you are is said twice, small: "2/3" in the top corner and a dot
 * for each along the bottom, the one shown filled. Neither is read out — each
 * picture already says "Picture 2 of 3", or what it shows.
 *
 * With a mouse there is nothing to swipe, so a round button at each side
 * moves one picture (shown on hover or focus, and not at the ends). In Soranî
 * the first picture is on the right and the next comes in from the left, as a
 * page is turned.
 */
function Strip({
  images,
  cell,
}: {
  images: FeedImage[];
  cell: (img: FeedImage, i: number, extra?: string) => React.JSX.Element;
}): React.JSX.Element {
  const t = useT();
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const last = images.length - 1;

  // a right-to-left row scrolls into negative numbers, so it is measured by its size
  const onScroll = (): void => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.min(last, Math.max(0, Math.round(Math.abs(el.scrollLeft) / el.clientWidth))));
  };

  const go = (to: number): void => {
    const el = track.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo?.({ left: (rtl ? -1 : 1) * to * el.clientWidth, behavior: still ? 'auto' : 'smooth' });
    setIndex(to);
  };

  return (
    <div
      className="pp-strip"
      style={{ aspectRatio: String(singleRatio(images[0]!)) }}
      role="group"
      aria-label={t('pictures.group', { count: images.length })}
    >
      <div className="pp-track" ref={track} onScroll={onScroll}>
        {images.map((img, i) => cell(img, i, ' pp-slide'))}
      </div>
      <span className="pp-counter" aria-hidden="true">
        {index + 1}/{images.length}
      </span>
      <span className="pp-dots" aria-hidden="true">
        {images.map((img, i) => (
          <span key={`${img.url}-${i}`} className={`pp-dot${i === index ? ' is-on' : ''}`} />
        ))}
      </span>
      {index > 0 && (
        <button type="button" className="pp-step pp-step-prev" aria-label={t('pictures.previous')} onClick={() => go(index - 1)}>
          <ChevronIcon size={16} weight="bold" />
        </button>
      )}
      {index < last && (
        <button type="button" className="pp-step pp-step-next" aria-label={t('pictures.next')} onClick={() => go(index + 1)}>
          <ChevronIcon size={16} weight="bold" />
        </button>
      )}
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
            {img.alt && (
              <span className="pp-caption-text" dir="auto">
                {img.alt}
              </span>
            )}
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
