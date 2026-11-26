import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { ArrowIcon } from '../components/icons';
import { SpeakingCharacter, type CharacterReaction } from '../characters/SpeakingCharacter';
import { prefersReducedMotion } from '../lib/motion';
import { GREETINGS } from './samples';
import { JoinButtons, Ku, useTiltLean } from './parts';

/**
 * The top of the front page: what is new, Hevalo himself, one line of what this is, and the ways in. It stays light, so
 * it paints quickly on a slow phone: the deer is one inline drawing, and the pictures further down load later.
 */

/** Only what has really shipped, each pointing at the part of the page that shows it. */
const NEWS: ReadonlyArray<{ text: MessageKey; to: string }> = [
  { text: 'landing.news.letters', to: '#learn' },
  { text: 'landing.news.tree', to: '#tree' },
  { text: 'landing.news.legends', to: '#legends' },
];
const NEWS_MS = 4200;

/** What a tap on Hevalo gets, in turn: never the same twice running, so each one plays. */
const TAPS: readonly CharacterReaction[] = ['wink', 'giggle', 'cheer', 'tongue'];

export function Hero(): React.JSX.Element {
  const t = useT();
  const [news, setNews] = useState(0);
  const [taps, setTaps] = useState(0);
  const figure = useRef<HTMLDivElement>(null);
  useTiltLean(figure);

  // The news turns over slowly while the page is in front, and not at all under Reduce Motion.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setNews((n) => (n + 1) % NEWS.length);
    }, NEWS_MS);
    return () => window.clearInterval(timer);
  }, []);

  const said = taps > 0 ? GREETINGS[(taps - 1) % GREETINGS.length]! : null;
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-hero-in">
        <a className="lp-pill" href={NEWS[news]!.to}>
          <span className="lp-pill-new">{t('landing.news.new')}</span>
          {/* All three stacked in one place, so the pill keeps the width of the longest and never jumps. */}
          <span className="lp-pill-texts">
            {NEWS.map((n, i) => (
              <span key={n.text} className={`lp-pill-text${i === news ? ' is-on' : ''}`} aria-hidden={i === news ? undefined : true}>
                {t(n.text)}
              </span>
            ))}
          </span>
          <ArrowIcon size={16} className="lp-pill-arrow" />
        </a>

        <div className="lp-hevalo" ref={figure}>
          <button
            type="button"
            className="lp-hevalo-hit"
            aria-label={t('landing.hero.tapHevalo')}
            onClick={() => setTaps((n) => n + 1)}
          >
            <SpeakingCharacter
              speaker="hevalo"
              audio={null}
              crop="full"
              decorative
              reaction={taps > 0 ? TAPS[(taps - 1) % TAPS.length]! : null}
              className="lp-hevalo-art"
            />
          </button>
          {/* What he says when tapped, with what it means; read out as it changes. */}
          <p className="lp-say" aria-live="polite">
            {said && (
              <span className="lp-say-bubble" key={taps}>
                <Ku className="lp-say-ku">{said.ku}</Ku>
                <span className="lp-say-gloss">{t(said.gloss)}</span>
              </span>
            )}
          </p>
        </div>

        <h1 id="lp-hero-title" className="lp-title">
          {t('landing.hero.title')}
        </h1>
        <p className="lp-lead lp-hero-lead">{t('landing.hero.lead')}</p>
        <JoinButtons />
      </div>
    </section>
  );
}
