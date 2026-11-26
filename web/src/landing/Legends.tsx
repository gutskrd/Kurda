import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { storyCoverPath } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { playsMotion } from '../lib/motion';
import { LEGENDS } from './samples';
import { Ku } from './parts';

/**
 * The legends the story library tells, each on the painting made for it, in a row that drifts slowly and without end:
 * the set is drawn twice, side by side, and the row slides back by exactly one set's width as the first leaves, so the
 * seam never shows. It rests while pointed at, focused or held, and off screen; a finger can push it along and it
 * drifts on from there. Only the first set is read out. Under Reduce Motion, or where nothing can be animated, it is a
 * still row to scroll by hand. The paintings load only as they near the screen.
 */
export function Legends(): React.JSX.Element {
  const t = useT();
  const rail = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [moving] = useState(playsMotion);
  useEndless(rail, row, moving);
  const set = (copy: boolean): React.JSX.Element => (
    <ul className="fp-legend-row" aria-hidden={copy || undefined}>
      {LEGENDS.map((l) => {
        const name = t(l.name);
        return (
          <li className="fp-legend" key={l.cover}>
            <img
              className="fp-legend-art"
              src={storyCoverPath(l.cover) ?? undefined}
              alt={copy ? '' : t('landing.legends.painting', { name })}
              width={1280}
              height={720}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            <span className="fp-legend-text">
              <Ku className="fp-legend-ku">{l.ku}</Ku>
              {/* For a Kurmancî reader the name is the title, so it is not said twice. */}
              {name.toLocaleLowerCase('ku') !== l.ku.toLocaleLowerCase('ku') && <span className="fp-legend-name">{name}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
  return (
    <section id="legends" className="fp-section fp-legends" aria-labelledby="fp-legends-title">
      <div className="fp-wrap">
        <header className="fp-head fp-head--center fp-reveal">
          <h2 id="fp-legends-title" className="fp-h2">
            {t('landing.legends.title')}
          </h2>
          <p className="fp-lead">{t('landing.legends.lead')}</p>
        </header>
      </div>
      <div className={`fp-legend-rail fp-reveal${moving ? ' is-endless' : ''}`} ref={rail}>
        <div className="fp-legend-track" ref={row}>
          {set(false)}
          {moving && set(true)}
        </div>
      </div>
      <div className="fp-wrap fp-center fp-reveal">
        <Link to="/app/learn/stories" className="btn btn-secondary btn-lg">
          {t('landing.legends.cta')}
        </Link>
      </div>
    </section>
  );
}

/** How fast the row drifts, in pixels a second. */
const DRIFT_PX_S = 30;
/** How long after a finger lets go the row waits before drifting on. */
const AFTER_TOUCH_MS = 900;

/**
 * Drifts the track toward the reading start, a transform each frame and nothing else, wrapping at exactly one set's
 * width. It runs only while the rail is on screen and nobody is pointing at it, focused in it or holding it; a drag
 * moves it by hand, and it carries on from where it was let go.
 */
function useEndless(railRef: React.RefObject<HTMLElement | null>, trackRef: React.RefObject<HTMLElement | null>, moving: boolean): void {
  useEffect(() => {
    const rail = railRef.current;
    const track = trackRef.current;
    if (!moving || !rail || !track) return;
    const dir = document.documentElement.dir === 'rtl' ? 1 : -1;
    let offset = 0;
    let width = 0;
    let frame = 0;
    let last = 0;
    let seen = typeof IntersectionObserver === 'undefined';
    let held = false;
    let wait = 0;
    const holds = { hover: false, focus: false };
    // One set's width: from the first set's start to the second's, gap included, so the wrap lands exactly.
    const measure = (): void => {
      const sets = track.children;
      const [a, b] = [sets[0] as HTMLElement | undefined, sets[1] as HTMLElement | undefined];
      width = a && b ? Math.abs(b.offsetLeft - a.offsetLeft) : 0;
    };
    const wrap = (): void => {
      if (!width) return;
      offset = ((offset % width) + width) % width;
      if (dir < 0 && offset > 0) offset -= width;
    };
    const paint = (): void => {
      track.style.transform = `translate3d(${offset.toFixed(2)}px, 0, 0)`;
    };
    const resting = (): boolean => !seen || held || holds.hover || holds.focus || wait !== 0;
    const tick = (now: number): void => {
      frame = 0;
      if (resting()) return;
      const dt = last ? Math.min(64, now - last) : 0;
      last = now;
      offset += (dir * DRIFT_PX_S * dt) / 1000;
      wrap();
      paint();
      frame = requestAnimationFrame(tick);
    };
    const go = (): void => {
      if (frame || resting()) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    const stop = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    // By hand: a drag moves the track itself, and the page still scrolls up and down under a finger (touch-action).
    let startX = 0;
    let startOffset = 0;
    const down = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      held = true;
      window.clearTimeout(wait);
      wait = 0;
      stop();
      startX = e.clientX;
      startOffset = offset;
      rail.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent): void => {
      if (!held) return;
      offset = startOffset + (e.clientX - startX);
      wrap();
      paint();
    };
    const up = (): void => {
      if (!held) return;
      held = false;
      wait = window.setTimeout(() => {
        wait = 0;
        go();
      }, AFTER_TOUCH_MS);
    };
    const hover = (on: boolean) => (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse') return;
      holds.hover = on;
      if (on) stop();
      else go();
    };
    const enter = hover(true);
    const leave = hover(false);
    const focusIn = (): void => {
      holds.focus = true;
      stop();
    };
    const focusOut = (): void => {
      holds.focus = false;
      go();
    };
    rail.addEventListener('pointerdown', down);
    rail.addEventListener('pointermove', move);
    rail.addEventListener('pointerup', up);
    rail.addEventListener('pointercancel', up);
    rail.addEventListener('pointerenter', enter);
    rail.addEventListener('pointerleave', leave);
    rail.addEventListener('focusin', focusIn);
    rail.addEventListener('focusout', focusOut);
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            seen = entries[entries.length - 1]?.isIntersecting ?? false;
            if (seen) go();
            else stop();
          });
    io?.observe(rail);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => (measure(), wrap(), paint()));
    ro?.observe(track);
    measure();
    paint();
    go();
    return () => {
      stop();
      window.clearTimeout(wait);
      io?.disconnect();
      ro?.disconnect();
      rail.removeEventListener('pointerdown', down);
      rail.removeEventListener('pointermove', move);
      rail.removeEventListener('pointerup', up);
      rail.removeEventListener('pointercancel', up);
      rail.removeEventListener('pointerenter', enter);
      rail.removeEventListener('pointerleave', leave);
      rail.removeEventListener('focusin', focusIn);
      rail.removeEventListener('focusout', focusOut);
      track.style.removeProperty('transform');
    };
  }, [railRef, trackRef, moving]);
}
