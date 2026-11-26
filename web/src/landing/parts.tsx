import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { PEEK_LEAN, leanFor, stepLean, tiltFromOrientation } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { AndroidIcon, IosIcon } from '../components/icons';
import { prefersReducedMotion } from '../lib/motion';
import { AppSoonButton } from './AppSoon';

/** Pieces the front page's sections share. */

/** A Kurdish word or phrase: marked as Kurdish for screen readers and spell checkers, and always left to right. */
export function Ku({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <span className={`lp-ku${className ? ` ${className}` : ''}`} lang="ku" dir="ltr">
      {children}
    </span>
  );
}

/**
 * The ways in, the same at the top and the foot of the page: start on the web, or one of the phone apps (coming soon),
 * or sign in.
 */
export function JoinButtons(): React.JSX.Element {
  const t = useT();
  return (
    <div className="lp-join-buttons">
      <Link to="/register" className="btn btn-primary btn-lg btn-block lp-start">
        {t('landing.hero.start')}
      </Link>
      <p className="lp-or">
        <span>{t('landing.hero.or')}</span>
      </p>
      <AppSoonButton platform="ios" className="lp-store">
        <IosIcon size={20} />
        {t('landing.hero.ios')}
      </AppSoonButton>
      <AppSoonButton platform="android" className="lp-store">
        <AndroidIcon size={20} />
        {t('landing.hero.android')}
      </AppSoonButton>
      <p className="lp-login">
        {t('landing.hero.haveAccount')}{' '}
        <Link to="/login" className="lp-login-link">
          {t('landing.hero.login')}
        </Link>
      </p>
    </div>
  );
}

/**
 * Whether `ref` has come near the screen (within `margin`), once and for good; true at once where there is no
 * IntersectionObserver, so tests, crawlers and old browsers get everything.
 */
export function useNear(ref: RefObject<Element | null>, margin = '0px'): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, near]);
  return near;
}

/** Whether `ref` is on screen now, following it in and out; false where it cannot be told. */
export function useOnScreen(ref: RefObject<Element | null>, threshold = 0.25): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => setOn(entries[entries.length - 1]?.isIntersecting ?? false), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return on;
}

/**
 * Leans `ref` with a phone's tilt, as Hevalo leans in the app (shared peek-lean.ts): the browser's orientation events,
 * the shared spring, and `--lp-lean` for the stylesheet. It never asks for motion access, so where a browser would ask
 * first, or has no sensor, he stands as he is; off under Reduce Motion, and each frame runs only while he is moving.
 */
export function useTiltLean(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window.DeviceOrientationEvent === 'undefined' || prefersReducedMotion()) return;
    let state = { angle: 0, speed: 0, settled: true };
    let target = 0;
    let frame: number | null = null;
    let last = 0;
    const tick = (now: number): void => {
      const seconds = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      state = stepLean(state, target, seconds);
      el.style.setProperty('--lp-lean', `${state.angle.toFixed(2)}deg`);
      frame = state.settled ? null : requestAnimationFrame(tick);
    };
    const onTilt = (event: DeviceOrientationEvent): void => {
      const tilt = tiltFromOrientation(event.beta, event.gamma, screen.orientation?.angle ?? 0);
      if (tilt == null) return;
      const wanted = leanFor(tilt);
      if (Math.abs(wanted - target) < PEEK_LEAN.wakeDeg) return;
      target = wanted;
      if (frame == null) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    };
    window.addEventListener('deviceorientation', onTilt);
    return () => {
      window.removeEventListener('deviceorientation', onTilt);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
