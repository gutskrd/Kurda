import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { prefersReducedMotion, useInFront } from '../lib/motion';
import type { PhoneGl, PhoneStage } from './phoneGl';
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
 *
 * Once the page has settled, a browser that can draw WebGL swaps that CSS
 * body for a modelled one (`phoneGl.ts`): rounded metal that catches the
 * light as it turns, drawn on a canvas behind the same live screen. From
 * then on one loop poses both, the HTML and the model, in the same frame, so
 * the screen never slides on its glass. Without WebGL, on a connection that
 * asks to save data, or in a test, the CSS phone simply stays.
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
function usePointerTilt(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
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

/** How long the float takes to rise, and to settle again: the CSS float's 7 seconds, alternate. */
const FLOAT_MS = 7000;
/** How far the float lifts the phone and turns it, at the top of its rise (the CSS keyframes' values). */
const FLOAT_LIFT = 12;
const FLOAT_SWAY = 0.6;
/** How quickly the turn catches up with the pointer, as a time constant in seconds (the CSS transition's feel). */
const TILT_EASE_S = 0.16;

/**
 * Whether this browser should be offered the modelled phone at all: it needs
 * WebGL, and a reader who asked to save data, or is on a slow connection,
 * keeps the CSS phone rather than wait for a picture of one.
 */
export function wantsModelledPhone(): boolean {
  if (typeof window === 'undefined' || !('WebGL2RenderingContext' in window)) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData === true) return false;
  return !['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '');
}

/** Reads a length or angle the stylesheet keeps in a custom property, as a number. */
function cssNumber(style: CSSStyleDeclaration, name: string): number {
  const value = parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
}

/** Where the phone stands, as the stylesheet lays it out: its box, its perspective and its metal. */
function stageOf(host: HTMLElement): PhoneStage {
  const style = getComputedStyle(host);
  const [originX, originY] = style.perspectiveOrigin.split(' ').map((v) => parseFloat(v));
  return {
    width: host.offsetWidth,
    height: host.offsetHeight,
    perspective: parseFloat(style.perspective) || 1700,
    originX: Number.isFinite(originX) ? originX! : host.offsetWidth / 2,
    originY: Number.isFinite(originY) ? originY! : host.offsetHeight * 0.4,
    tone: style.getPropertyValue('--p3d-tone').trim() || '#b9bcc2',
  };
}

/** Runs `run` once the page is idle, so the model never competes with the page's first paint; returns how to cancel it. */
function whenIdle(run: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 500);
  return () => clearTimeout(id);
}

/**
 * The modelled body: loaded the first time the phone is on the screen, once
 * the page is idle, and posed from then on by one loop that writes the same
 * pose to the HTML (the float and the rig) and to the model. Returns whether
 * the model is showing, so the CSS body can step aside.
 */
function useModelledBody(
  hostRef: RefObject<HTMLElement | null>,
  floatRef: RefObject<HTMLElement | null>,
  rigRef: RefObject<HTMLElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  inFront: boolean,
): boolean {
  const [body, setBody] = useState<PhoneGl | null>(null);
  const [wanted] = useState(wantsModelledPhone);

  // load it the first time the phone is in front
  useEffect(() => {
    if (!wanted || body || !inFront) return;
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      import('./phoneGl')
        .then(({ mountPhoneGl }) => {
          const host = hostRef.current;
          const canvas = canvasRef.current;
          if (cancelled || !host || !canvas) return;
          const made = mountPhoneGl(canvas, stageOf(host));
          if (made) setBody(made);
        })
        .catch(() => {
          // the chunk did not arrive: the CSS phone is a phone too
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [wanted, body, inFront, hostRef, canvasRef]);

  // let it go with the page, and give the HTML its stylesheet pose back
  useEffect(() => {
    if (!body) return;
    const canvas = canvasRef.current;
    const lost = (): void => setBody(null);
    canvas?.addEventListener('webglcontextlost', lost);
    return () => {
      canvas?.removeEventListener('webglcontextlost', lost);
      body.dispose();
      floatRef.current?.style.removeProperty('transform');
      rigRef.current?.style.removeProperty('transform');
    };
  }, [body, canvasRef, floatRef, rigRef]);

  // a new size or a new theme: fit and paint it again
  useEffect(() => {
    const host = hostRef.current;
    if (!body || !host) return;
    const refit = (): void => {
      const stage = stageOf(host);
      body.fit(stage);
      body.retone(stage.tone);
    };
    const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refit);
    sizes?.observe(host);
    const themes = new MutationObserver(refit);
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'dir'] });
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    scheme?.addEventListener?.('change', refit);
    return () => {
      sizes?.disconnect();
      themes.disconnect();
      scheme?.removeEventListener?.('change', refit);
    };
  }, [body, hostRef]);

  // the loop: while the phone is in front, every frame; otherwise, one frame where it stopped
  useEffect(() => {
    const host = hostRef.current;
    const float = floatRef.current;
    const rig = rigRef.current;
    if (!body || !host || !float || !rig) return;
    const still = prefersReducedMotion();
    const style = getComputedStyle(host);
    const pose = { x: cssNumber(style, '--pose-x'), y: cssNumber(style, '--pose-y'), z: cssNumber(style, '--pose-z') };
    const tilt = { x: cssNumber(host.style, '--tilt-x'), y: cssNumber(host.style, '--tilt-y') };
    let frame = 0;
    let last = performance.now();
    const step = (now: number): void => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const ease = 1 - Math.exp(-dt / TILT_EASE_S);
      tilt.x += (cssNumber(host.style, '--tilt-x') - tilt.x) * ease;
      tilt.y += (cssNumber(host.style, '--tilt-y') - tilt.y) * ease;
      const rise = still ? 0 : 0.5 - 0.5 * Math.cos((now / FLOAT_MS) * Math.PI);
      const shot = { lift: -FLOAT_LIFT * rise, sway: -FLOAT_SWAY * rise, x: pose.x + tilt.x, y: pose.y + tilt.y, z: pose.z };
      float.style.transform = `translateY(${shot.lift.toFixed(2)}px) rotateZ(${shot.sway.toFixed(3)}deg)`;
      rig.style.transform = `rotateX(${shot.x.toFixed(3)}deg) rotateY(${shot.y.toFixed(3)}deg) rotateZ(${shot.z.toFixed(3)}deg)`;
      body.draw(shot);
      if (inFront && !still) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [body, inFront, hostRef, floatRef, rigRef]);

  return body !== null;
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
  const floatRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inFront = useInFront(ref);
  usePointerTilt(ref, true);
  const modelled = useModelledBody(ref, floatRef, rigRef, canvasRef, inFront);
  return (
    <div
      ref={ref}
      className={`p3d p3d--${pose}${inFront ? '' : ' is-resting'}${modelled ? ' is-modelled' : ''}${className ? ` ${className}` : ''}`}
    >
      <canvas ref={canvasRef} className="p3d-model" width={0} height={0} aria-hidden="true" />
      <div ref={floatRef} className="p3d-float">
        <div ref={rigRef} className="p3d-rig">
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
