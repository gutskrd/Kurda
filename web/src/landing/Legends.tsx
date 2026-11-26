import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { storyCoverPath } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { prefersReducedMotion } from '../lib/motion';
import { LEGENDS } from './samples';
import { Ku } from './parts';

/**
 * The legends the story library tells, each on the painting made for it. On a wide screen the row drifts a little
 * sideways as the page scrolls past, the paintings sliding by like a frieze; on a phone it is a row to swipe. The
 * paintings load only as they near the screen.
 */
export function Legends(): React.JSX.Element {
  const t = useT();
  const row = useRef<HTMLUListElement>(null);
  useDrift(row);
  return (
    <section id="legends" className="lp-section lp-legends" aria-labelledby="lp-legends-title">
      <div className="lp-wrap">
        <header className="lp-head lp-head--center lp-reveal">
          <h2 id="lp-legends-title" className="lp-h2">
            {t('landing.legends.title')}
          </h2>
          <p className="lp-lead">{t('landing.legends.lead')}</p>
        </header>
      </div>
      <div className="lp-legend-rail lp-reveal">
        <ul className="lp-legend-row" ref={row}>
          {LEGENDS.map((l) => {
            const name = t(l.name);
            return (
              <li className="lp-legend" key={l.cover}>
                <img
                  className="lp-legend-art"
                  src={storyCoverPath(l.cover) ?? undefined}
                  alt={t('landing.legends.painting', { name })}
                  width={1280}
                  height={720}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
                <span className="lp-legend-text">
                  <Ku className="lp-legend-ku">{l.ku}</Ku>
                  {/* For a Kurmancî reader the name is the title, so it is not said twice. */}
                  {name.toLocaleLowerCase('ku') !== l.ku.toLocaleLowerCase('ku') && <span className="lp-legend-name">{name}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="lp-wrap lp-center lp-reveal">
        <Link to="/app/learn/stories" className="btn btn-secondary btn-lg">
          {t('landing.legends.cta')}
        </Link>
      </div>
    </section>
  );
}

/** How far the row drifts each way, in pixels, as its section crosses the screen. */
const DRIFT_PX = 36;

/** Slides the row sideways with the scroll, on a wide screen with a fine pointer and motion allowed, and only while seen. */
function useDrift(ref: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    const wide = window.matchMedia?.('(min-width: 900px)');
    let frame = 0;
    const write = (): void => {
      frame = 0;
      if (!wide?.matches) {
        el.style.removeProperty('transform');
        return;
      }
      const r = el.getBoundingClientRect();
      const p = (r.top + r.height / 2) / window.innerHeight - 0.5;
      const rtl = document.documentElement.dir === 'rtl' ? -1 : 1;
      el.style.transform = `translate3d(${(Math.max(-1, Math.min(1, p)) * DRIFT_PX * rtl).toFixed(1)}px, 0, 0)`;
    };
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries[entries.length - 1]?.isIntersecting) {
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
      } else window.removeEventListener('scroll', onScroll);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
