import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { warmApi } from '../lib/warmup';
import { usePageMeta, useT } from '../i18n/I18nProvider';
import { FaqList } from '../components/FaqList';
import { HOME_FAQ } from '../landing/faq';
import { Hero } from '../landing/Hero';
import { WhoFor } from '../landing/WhoFor';
import { FirstWords } from '../landing/FirstWords';
import { Table } from '../landing/Table';
import { Legends } from '../landing/Legends';
import { Closing } from '../landing/Closing';
import { useNear } from '../landing/parts';
import '../landing/landing.css';

/*
 * The front page, told as Hevalo's story for the person arriving: who it is (the hero), who they are learning for, three
 * words learned on the spot, where those words go (scenes that play themselves), the Kurdish table the road starts at,
 * the tree every lesson waters, the legends, the questions, and the same ways in again. Every section has one heading
 * and at most two short sentences, and shows rather than tells. Nothing promises what is not there: no counts, reviews
 * or press, and the phone apps are coming soon.
 */

const StoryPlayer = lazy(() => import('../landing/Stories').then((m) => ({ default: m.StoryPlayer })));
const TreeGrowth = lazy(() => import('../landing/TreeGrowth').then((m) => ({ default: m.TreeGrowth })));

/**
 * Sections rise into view once as they arrive. The page arms itself (`fp-armed`, which hides unarrived sections) only
 * with an IntersectionObserver and motion allowed, so crawlers, previews and full-page screenshots always see everything.
 */
function useReveal(): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    root.querySelectorAll('.fp-reveal').forEach((el) => io.observe(el));
    root.classList.add('fp-armed');
    return () => {
      io.disconnect();
      root.classList.remove('fp-armed');
    };
  }, []);
  return ref;
}

/**
 * Whether the page has settled: loaded, then a quiet moment. A visitor saving data or on a slow connection is spared
 * what has not come near the screen.
 */
function useSettled(): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '')) return;
    let timer = 0;
    const later = (): void => {
      timer = window.setTimeout(() => {
        const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
        if (idle) idle(() => setSettled(true), { timeout: 3000 });
        else setSettled(true);
      }, 2500);
    };
    if (document.readyState === 'complete') later();
    else window.addEventListener('load', later, { once: true });
    return () => {
      window.removeEventListener('load', later);
      window.clearTimeout(timer);
    };
  }, []);
  return settled;
}

/** A heavy scene below the fold: drawn once it nears the screen or the page has settled. Its place keeps its size. */
function Later({ settled, className, children }: { settled: boolean; className: string; children: ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNear(ref, '600px 0px');
  return (
    <div ref={ref} className={className}>
      {(near || settled) && <Suspense fallback={null}>{children}</Suspense>}
    </div>
  );
}

export function Landing(): React.JSX.Element {
  const t = useT();
  usePageMeta(t('meta.home.title'), t('app.description'));
  const root = useReveal();
  const settled = useSettled();
  // Warm the API early so a later sign-in does not pay the cold start.
  useEffect(() => {
    warmApi();
  }, []);

  return (
    <div className="fp" ref={root}>
      <Hero />
      <WhoFor />

      <section id="first-words" className="fp-section fp-words" aria-labelledby="fp-words-title">
        <div className="fp-wrap">
          <header className="fp-head fp-head--center fp-reveal">
            <h2 id="fp-words-title" className="fp-h2">
              {t('landing.words.title')}
            </h2>
            <p className="fp-lead">{t('landing.words.lead')}</p>
          </header>
          <FirstWords />
        </div>
      </section>

      <section id="learn" className="fp-section fp-stories" aria-labelledby="fp-stories-title">
        <div className="fp-wrap fp-stories-grid">
          <header className="fp-head fp-reveal">
            <h2 id="fp-stories-title" className="fp-h2 fp-contrast">
              <span className="fp-contrast-them">{t('landing.stories.them')}</span> <span>{t('landing.stories.us')}</span>
            </h2>
            <p className="fp-lead">{t('landing.stories.lead')}</p>
          </header>
          <Later settled={settled} className="fp-player-place fp-reveal">
            <StoryPlayer />
          </Later>
        </div>
      </section>

      <Table />

      <section id="tree" className="fp-tree" aria-labelledby="fp-tree-title">
        <div className="fp-tree-hold">
          <div className="fp-wrap fp-tree-grid">
            <header className="fp-head">
              <h2 id="fp-tree-title" className="fp-h2">
                {t('landing.tree.title')}
              </h2>
              <p className="fp-lead">{t('landing.tree.lead')}</p>
            </header>
            <Later settled={settled} className="fp-tree-place">
              <TreeGrowth />
            </Later>
          </div>
        </div>
      </section>

      <Legends />

      <section id="faq" className="fp-section fp-faq" aria-labelledby="fp-faq-title">
        <div className="fp-wrap fp-faq-wrap">
          <header className="fp-head fp-head--center fp-reveal">
            <h2 id="fp-faq-title" className="fp-h2">
              {t('faq.title')}
            </h2>
            <p className="fp-lead">{t('faq.lead')}</p>
          </header>
          <div className="fp-reveal">
            <FaqList entries={HOME_FAQ} />
          </div>
          {/* On a line of its own, so its touch reach extends above and below its words (styles/reach.css). */}
          <Link to="/faq" className="doc-link reach-line fp-faq-all">
            {t('faq.all')}
          </Link>
        </div>
      </section>

      <Closing />
    </div>
  );
}
