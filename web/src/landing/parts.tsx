import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';
import { AndroidIcon, IosIcon } from '../components/icons';
import { AppSoonButton } from './AppSoon';

/** Pieces the front page's sections share. */

/** A Kurdish word or phrase: marked as Kurdish for screen readers and spell checkers, and always left to right. */
export function Ku({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <span className={`fp-ku${className ? ` ${className}` : ''}`} lang="ku" dir="ltr">
      {children}
    </span>
  );
}

/**
 * The ways in: start on the web, or sign in. At the top of the page (`apps`) the phone apps' two buttons sit between
 * them; the only other pair is beside the phone further down, and the page's foot has just the two ways in.
 */
export function JoinButtons({ apps = false }: { apps?: boolean }): React.JSX.Element {
  const t = useT();
  return (
    <div className="fp-join-buttons">
      <Link to="/register" className="btn btn-primary btn-lg btn-block fp-start">
        {t('landing.join.start')}
      </Link>
      {apps && (
        <>
          <p className="fp-or">
            <span>{t('landing.hero.or')}</span>
          </p>
          <AppSoonButton platform="ios" look="store">
            <IosIcon size={20} />
            {t('landing.hero.ios')}
          </AppSoonButton>
          <AppSoonButton platform="android" look="store">
            <AndroidIcon size={20} />
            {t('landing.hero.android')}
          </AppSoonButton>
        </>
      )}
      <p className="fp-login">
        {t('landing.hero.haveAccount')}{' '}
        <Link to="/login" className="fp-login-link reach-line">
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

/** Whether the window is wide enough for the larger figures (a tablet or wider), and stays in step as it changes. */
export function useWide(): boolean {
  const query = '(min-width: 760px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const change = (): void => setWide(m.matches);
    m.addEventListener?.('change', change);
    return () => m.removeEventListener?.('change', change);
  }, []);
  return wide;
}
