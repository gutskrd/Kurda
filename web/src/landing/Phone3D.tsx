import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useInFront } from '../lib/motion';
import './phone3d.css';

/**
 * The phone on the front page, as an object rather than an outline.
 *
 * The flat rounded rectangle it replaced read as "a picture of a phone"; this
 * one is a phone standing in the page: a metal band with real thickness, its
 * buttons on the sides, a camera pill in the glass, the glass catching the
 * light, and a shadow on the ground under it. It is built in CSS 3D rather
 * than drawn, so the screen inside stays live markup in the reader's language
 * (see `mocks.tsx`): the band is a stack of thin rounded slabs, one behind the
 * other, which the eye reads as the phone's edge once the phone turns.
 *
 * It stands turned a little toward the copy, and on a desk with a mouse it
 * turns a few degrees more toward the pointer, the way a real thing held up to
 * the light would; it floats very slowly while it is on the screen and its
 * tab is in front, and it rests otherwise. Reduce Motion keeps it standing
 * still, turned, with nothing following the pointer.
 */

/** How many slabs make the edge: enough that it reads as solid at the steepest turn, few enough to cost nothing. */
const SLABS = 12;

/** How far, in degrees, the pointer may turn the phone from its resting pose. */
const REACH = { x: 7, y: 10 };

export type PhonePose = 'left' | 'right';

/**
 * The phone's tilt toward the pointer, written into two CSS custom properties
 * on the element so the stylesheet composes it with the resting pose; one
 * write per animation frame at most, and none on a touch screen or under
 * Reduce Motion.
 */
function usePointerTilt(ref: React.RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof window === 'undefined' || !window.matchMedia) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // the area that steers it is the phone's own section, so the pointer anywhere near it counts
    const area = el.closest('section') ?? el;
    let frame = 0;
    let next: { x: number; y: number } | null = null;
    const write = (): void => {
      frame = 0;
      if (!next) return;
      el.style.setProperty('--tilt-x', `${(next.y * -REACH.x).toFixed(2)}deg`);
      el.style.setProperty('--tilt-y', `${(next.x * REACH.y).toFixed(2)}deg`);
    };
    const onMove = (e: Event): void => {
      const p = e as PointerEvent;
      const box = el.getBoundingClientRect();
      const half = Math.max(box.width, 1) * 1.6;
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      next = { x: Math.max(-1, Math.min(1, (p.clientX - cx) / half)), y: Math.max(-1, Math.min(1, (p.clientY - cy) / half)) };
      if (!frame) frame = requestAnimationFrame(write);
    };
    const onLeave = (): void => {
      next = { x: 0, y: 0 };
      if (!frame) frame = requestAnimationFrame(write);
    };
    area.addEventListener('pointermove', onMove);
    area.addEventListener('pointerleave', onLeave);
    return () => {
      area.removeEventListener('pointermove', onMove);
      area.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref, enabled]);
}

/** The status bar the phone itself draws: the time, and signal, network and battery as plain shapes. */
function StatusBar(): React.JSX.Element {
  return (
    <span className="p3d-status" aria-hidden="true">
      <span className="p3d-time">9:41</span>
      <span className="p3d-icons">
        <span className="p3d-signal">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="p3d-wifi" />
        <span className="p3d-battery">
          <i />
        </span>
      </span>
    </span>
  );
}

/**
 * A phone in three dimensions, with `children` on its screen. `pose` is which
 * way it turns: toward the copy on the other side of it.
 */
export function Phone3D({
  children,
  pose = 'left',
  className,
}: {
  children: ReactNode;
  pose?: PhonePose;
  className?: string;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const inFront = useInFront(ref);
  usePointerTilt(ref, true);
  return (
    <div ref={ref} className={`p3d p3d--${pose}${inFront ? '' : ' is-resting'}${className ? ` ${className}` : ''}`}>
      <div className="p3d-float">
        <div className="p3d-rig">
          {Array.from({ length: SLABS }, (_, i) => (
            <span key={i} className="p3d-slab" style={{ '--slab': i + 1 } as CSSProperties} aria-hidden="true" />
          ))}
          <span className="p3d-btn p3d-btn--action" aria-hidden="true" />
          <span className="p3d-btn p3d-btn--up" aria-hidden="true" />
          <span className="p3d-btn p3d-btn--down" aria-hidden="true" />
          <span className="p3d-btn p3d-btn--side" aria-hidden="true" />
          <div className="p3d-face">
            <div className="p3d-screen">
              <StatusBar />
              <div className="p3d-content">{children}</div>
              <span className="p3d-island" aria-hidden="true" />
              <span className="p3d-home" aria-hidden="true" />
              <span className="p3d-glare" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      <span className="p3d-shadow" aria-hidden="true" />
    </div>
  );
}

/** One screen the hero phone can show: its picture and the name of its tab under the phone. */
export interface PhoneScreen {
  id: string;
  label: string;
  screen: ReactNode;
}

/** How long each screen stays before the next, when nobody has chosen one. */
const DWELL_MS = 5200;

/**
 * The hero phone: a few of the app's screens in turn, with a row of tabs under
 * it to pick one. The screens change on their own only while the phone is on
 * the screen, its tab is in front, nobody is pointing at or focused on it, and
 * the reader has not asked for less motion; once someone picks a screen it
 * stays on it. Only the screen being shown is there for a screen reader.
 */
export function PhoneShowcase({ screens, pose = 'left', label }: { screens: readonly PhoneScreen[]; pose?: PhonePose; label: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const inFront = useInFront(ref);
  const [shown, setShown] = useState(0);
  const [picked, setPicked] = useState(false);
  const [held, setHeld] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setStill(query.matches);
    const onChange = (): void => setStill(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (picked || held || still || !inFront || screens.length < 2) return;
    const timer = setTimeout(() => setShown((i) => (i + 1) % screens.length), DWELL_MS);
    return () => clearTimeout(timer);
  }, [shown, picked, held, still, inFront, screens.length]);

  return (
    <div
      ref={ref}
      className="p3d-showcase"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <Phone3D pose={pose}>
        <div className="p3d-deck">
          {screens.map((s, i) => (
            <div
              key={s.id}
              className={`p3d-card${i === shown ? ' is-shown' : i === (shown - 1 + screens.length) % screens.length ? ' is-leaving' : ''}`}
              // a screen not shown is not there for the keyboard or a reader either
              aria-hidden={i === shown ? undefined : true}
              inert={i !== shown}
            >
              {s.screen}
            </div>
          ))}
        </div>
      </Phone3D>
      <div className="p3d-tabs" role="group" aria-label={label}>
        {screens.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`p3d-tab${i === shown ? ' is-on' : ''}`}
            aria-pressed={i === shown}
            onClick={() => {
              setPicked(true);
              setShown(i);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
