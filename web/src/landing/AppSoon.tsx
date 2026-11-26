import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { DEFAULT_PAPER, paperColors } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { AndroidIcon, IosIcon } from '../components/icons';
import { wrapTab } from '../components/Sheet';
import { lockPageScroll } from '../lib/scrollLock';
import { prefersReducedMotion, useSlidingCapsule } from '../lib/motion';
import type { SoonFrame } from './soonArt';
import './soon.css';

/**
 * What a tap on "Download for iOS" or "Download for Android" opens while the phone apps are not out: the page blurs and
 * dims, a card rises from the button that was tapped, and the pen-pal pigeon flies in with a letter that unfolds to say
 * the apps are coming and that everything can start here today. It opens on the platform that was tapped, and a switch
 * at its top turns it to the other, the letter's words crossing over softly. Escape, a tap
 * on the dim, a swipe down and Close all put it away, focus stays inside it, and returns to the button. Under Reduce
 * Motion it simply appears, with the pigeon already perched and the letter open. It asks for nothing: no address, no
 * list to join.
 */

export type AppPlatform = 'ios' | 'android';

/** The pigeon's pictures, fetched once, the first time someone might open the card. */
let art: Promise<typeof import('./soonArt')> | null = null;
function preloadArt(): void {
  art ??= import('./soonArt');
  art.catch(() => (art = null));
}

/**
 * A button that opens the card. Every iOS and Android link on the public pages is one of these: a dark store button
 * on the front page (`store`), or a line of the footer (`line`).
 */
export function AppSoonButton({ platform, look, children }: { platform: AppPlatform; look: 'store' | 'line'; children: ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={look === 'store' ? 'fp-store' : 'soon-footer reach-line'}
        aria-haspopup="dialog"
        onPointerEnter={preloadArt}
        onFocus={preloadArt}
        onTouchStart={preloadArt}
        onClick={() => {
          preloadArt();
          setOpen(true);
        }}
      >
        {children}
      </button>
      {open && <AppSoonCard platform={platform} opener={ref} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The pigeon's square, in pixels: the bird stands about a fifth of the card's width tall on its edge. */
const BIRD_PX = 132;
/** How far a finger has to pull the card down, or how fast, for it to go. */
const SWIPE = { px: 90, speed: 0.6 } as const;

const PLATFORMS: readonly { key: AppPlatform; label: 'landing.soon.optionIos' | 'landing.soon.optionAndroid'; name: 'landing.soon.ios' | 'landing.soon.android' }[] = [
  { key: 'ios', label: 'landing.soon.optionIos', name: 'landing.soon.ios' },
  { key: 'android', label: 'landing.soon.optionAndroid', name: 'landing.soon.android' },
];

function AppSoonCard({ platform: tapped, opener, onClose }: { platform: AppPlatform; opener: RefObject<HTMLElement | null>; onClose: () => void }): React.JSX.Element {
  const t = useT();
  const id = useId().replace(/[^A-Za-z0-9]/g, '');
  const [platform, setPlatform] = useState(tapped);
  const [switched, setSwitched] = useState(false);
  const which = useRef<HTMLFieldSetElement>(null);
  const capsule = useRef<HTMLSpanElement>(null);
  useSlidingCapsule(which, capsule, '.is-active', platform);
  const card = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [still] = useState(prefersReducedMotion);
  const [frames, setFrames] = useState<Record<SoonFrame, string> | null>(null);
  const done = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let live = true;
    preloadArt();
    art
      ?.then((m) => {
        if (live) setFrames(m.soonFrames(BIRD_PX, `soon${id}`));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id]);

  /** Where the card is going back to: the button it came from, if it is still on screen. */
  const towardOpener = useCallback((): string => {
    const from = opener.current?.getBoundingClientRect();
    const to = card.current?.getBoundingClientRect();
    if (!from || !to || from.width === 0 || from.bottom < 0 || from.top > window.innerHeight) return 'translateY(24px) scale(0.96)';
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const s = Math.max(0.3, Math.min(1, from.width / to.width));
    return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(3)})`;
  }, [opener]);

  const close = useCallback(
    (leave?: Keyframe[]) => {
      if (done.current) return;
      done.current = true;
      const el = card.current;
      overlay.current?.classList.add('is-leaving');
      if (!el || still || typeof el.animate !== 'function') {
        closeRef.current();
        return;
      }
      const frames = leave ?? [
        { transform: 'none', opacity: 1 },
        { transform: towardOpener(), opacity: 0 },
      ];
      const a = el.animate(frames, { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
      a.onfinish = () => closeRef.current();
      a.oncancel = () => closeRef.current();
    },
    [still, towardOpener],
  );

  // It rises from the button that was tapped.
  useLayoutEffect(() => {
    const el = card.current;
    if (!el || still || typeof el.animate !== 'function') return;
    el.animate(
      [
        { transform: towardOpener(), opacity: 0 },
        { opacity: 1, offset: 0.3 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
  }, [still, towardOpener]);

  // Held still underneath, Escape and Tab caught first, and focus back where it was when it goes.
  useEffect(() => {
    const unlock = lockPageScroll();
    const back = opener.current;
    card.current?.querySelector<HTMLElement>('.soon-start')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (card.current) wrapTab(e, card.current);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      unlock();
      back?.focus?.({ preventScroll: true });
    };
  }, [close, opener]);

  // A finger can pull it down and away.
  const drag = useRef<{ id: number; y0: number; t0: number; dy: number; on: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.pointerType === 'mouse' || done.current) return;
    drag.current = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0, on: false };
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current;
    const el = card.current;
    if (!d || !el || e.pointerId !== d.id) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    if (!d.on && d.dy > 8) {
      d.on = true;
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('is-dragged');
    }
    if (d.on) el.style.transform = `translateY(${d.dy.toFixed(1)}px)`;
  };
  const onPointerUp = (e: React.PointerEvent): void => {
    const d = drag.current;
    const el = card.current;
    drag.current = null;
    if (!d || !el || !d.on || e.pointerId !== d.id) return;
    el.classList.remove('is-dragged');
    const speed = d.dy / Math.max(1, performance.now() - d.t0);
    if (d.dy > SWIPE.px || speed > SWIPE.speed) {
      el.style.transform = '';
      close([
        { transform: `translateY(${d.dy}px)`, opacity: 1 },
        { transform: `translateY(${d.dy + 260}px)`, opacity: 0 },
      ]);
      return;
    }
    el.style.transform = '';
    el.animate?.([{ transform: `translateY(${d.dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' });
  };

  const paper = paperColors({ ...DEFAULT_PAPER, style: 'plain' });
  const style = { '--soon-paper': paper.sheet, '--soon-ink': paper.ink, '--soon-muted': paper.muted, '--soon-edge': paper.edge, '--soon-bird': `${BIRD_PX}px` } as CSSProperties;

  return createPortal(
    <div
      ref={overlay}
      className={`soon-overlay${still ? ' is-still' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={card}
        className={`soon-card is-${platform}${frames ? ' has-bird' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="soon-grip" aria-hidden="true" />
        {frames && <SoonBird frames={frames} />}
        {/* Which phone: real radios under the segments, so arrow keys and screen readers work. */}
        <fieldset ref={which} className="soon-which">
          <legend className="sr-only">{t('landing.soon.which')}</legend>
          <span ref={capsule} className="seg-capsule soon-which-capsule" aria-hidden="true" />
          {PLATFORMS.map((p) => (
            <label key={p.key} className={`soon-which-btn${p.key === platform ? ' is-active' : ''}`}>
              <input type="radio" name={`${id}-which`} value={p.key} checked={p.key === platform} onChange={() => (setPlatform(p.key), setSwitched(true))} />
              {p.key === 'ios' ? <IosIcon size={18} /> : <AndroidIcon size={18} />}
              <span>{t(p.label)}</span>
            </label>
          ))}
        </fieldset>
        <div className="soon-letter">
          <p className={`soon-kicker${switched ? ' is-switched' : ''}`} key={platform}>
            {t(PLATFORMS.find((p) => p.key === platform)!.name)}
          </p>
          <h2 id={`${id}-title`} className="soon-title">
            {t('landing.soon.title')}
          </h2>
          <p id={`${id}-body`} className="soon-body">
            {t('landing.soon.body')}
          </p>
          <p className="soon-sign" aria-hidden="true">
            Hevalo
          </p>
        </div>
        <div className="soon-actions">
          <Link to="/register" className="btn btn-primary btn-lg btn-block soon-start" onClick={() => closeRef.current()}>
            {t('landing.soon.start')}
          </Link>
          <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={() => close()}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The pigeon: in through the air with the letter, onto the card's edge, the letter set down, then pleased with itself. */
function SoonBird({ frames }: { frames: Record<SoonFrame, string> }): React.JSX.Element {
  const frame = (name: SoonFrame): React.JSX.Element => <span className={`soon-frame is-${name}`} dangerouslySetInnerHTML={{ __html: frames[name] }} />;
  return (
    <span className="soon-bird" aria-hidden="true">
      <span className="soon-flight">
        {frame('up')}
        {frame('down')}
      </span>
      {frame('holding')}
      {frame('perched')}
      {frame('happy')}
      {frame('blink')}
    </span>
  );
}
