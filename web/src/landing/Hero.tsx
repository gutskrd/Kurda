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

  // The news goes round once, slowly, and settles on the first; it holds still under a pointer or the keyboard, and
  // under Reduce Motion it does not turn at all.
  const [held, setHeld] = useState(false);
  const [turns, setTurns] = useState(0);
  useEffect(() => {
    if (held || turns >= NEWS.length || prefersReducedMotion()) return;
    const timer = window.setTimeout(() => {
      setNews((n) => (n + 1) % NEWS.length);
      setTurns((n) => n + 1);
    }, NEWS_MS);
    return () => window.clearTimeout(timer);
  }, [held, turns]);

  const said = taps > 0 ? GREETINGS[(taps - 1) % GREETINGS.length]! : null;
  return (
    <section className="fp-hero" aria-labelledby="fp-hero-title">
      <div className="fp-hero-in">
        <a
          className="fp-pill"
          href={NEWS[news]!.to}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
        >
          <span className="fp-pill-new">{t('landing.news.new')}</span>
          {/* All three stacked in one place, so the pill keeps the width of the longest and never jumps. */}
          <span className="fp-pill-texts">
            {NEWS.map((n, i) => (
              <span key={n.text} className={`fp-pill-text${i === news ? ' is-on' : ''}`} aria-hidden={i === news ? undefined : true}>
                {t(n.text)}
              </span>
            ))}
          </span>
          <ArrowIcon size={16} className="fp-pill-arrow" />
        </a>

        <div className="fp-hevalo" ref={figure}>
          <button
            type="button"
            className="fp-hevalo-hit"
            aria-label={t('landing.hero.tapHevalo')}
            onClick={() => setTaps((n) => n + 1)}
          >
            <SpeakingCharacter
              speaker="hevalo"
              audio={null}
              crop="full"
              decorative
              reaction={taps > 0 ? TAPS[(taps - 1) % TAPS.length]! : null}
              className="fp-hevalo-art"
            />
          </button>
          {/* What he says when tapped, with what it means; read out as it changes. */}
          <p className="fp-say" aria-live="polite">
            {said && (
              <span className="fp-say-bubble" key={taps}>
                <Ku className="fp-say-ku">{said.ku}</Ku>
                <span className="fp-say-gloss">{t(said.gloss)}</span>
              </span>
            )}
          </p>
        </div>

        <h1 id="fp-hero-title" className="fp-title">
          {t('landing.hero.title')}
        </h1>
        <p className="fp-lead fp-hero-lead">{t('landing.hero.lead')}</p>
        <JoinButtons />
      </div>
    </section>
  );
}
