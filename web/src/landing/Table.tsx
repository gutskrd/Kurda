import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { SpeakingCharacter, type CharacterReaction } from '../characters/SpeakingCharacter';
import { prefersReducedMotion } from '../lib/motion';
import { TABLE } from './samples';
import { Ku, useOnScreen } from './parts';
import { useVisitor, type LearningFor } from './visitor';

/**
 * The front page's second contrast: other courses start at a café counter, the road starts at a Kurdish table. Hamo,
 * who says nearly every line of the road, says its first phrases in turn while the scene is on screen, and any of them
 * again when it is picked. The heading and its line follow who the visitor said they are learning for.
 */
const HEADS: Record<LearningFor | 'anyone', { us: MessageKey; lead: MessageKey }> = {
  family: { us: 'landing.table.us.family', lead: 'landing.table.lead.family' },
  partner: { us: 'landing.table.us.partner', lead: 'landing.table.lead.partner' },
  children: { us: 'landing.table.us.children', lead: 'landing.table.lead.children' },
  self: { us: 'landing.table.us.anyone', lead: 'landing.table.lead.anyone' },
  curious: { us: 'landing.table.us.anyone', lead: 'landing.table.lead.anyone' },
  anyone: { us: 'landing.table.us.anyone', lead: 'landing.table.lead.anyone' },
};

/** How long each phrase stays before Hamo says the next. */
const SAY_MS = 3600;
const REACTIONS: readonly CharacterReaction[] = ['chuckle', 'wink', 'cheer'];

export function Table(): React.JSX.Element {
  const t = useT();
  const { learningFor } = useVisitor();
  const head = HEADS[learningFor ?? 'anyone'];
  const [said, setSaid] = useState(0);
  const [chosen, setChosen] = useState(false);
  const [turn, setTurn] = useState(0);
  const scene = useRef<HTMLDivElement>(null);
  const on = useOnScreen(scene, 0.4);

  // He goes round the table's phrases on his own while it is on screen, until someone picks one.
  useEffect(() => {
    if (!on || chosen || prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setSaid((n) => (n + 1) % TABLE.length);
      setTurn((n) => n + 1);
    }, SAY_MS);
    return () => window.clearInterval(timer);
  }, [on, chosen]);

  const phrase = TABLE[said]!;
  return (
    <section id="family" className="lp-section lp-table" aria-labelledby="lp-table-title">
      <div className="lp-wrap">
        <header className="lp-head lp-reveal">
          <h2 id="lp-table-title" className="lp-h2 lp-contrast">
            <span className="lp-contrast-them">{t('landing.table.them')}</span> <span>{t(head.us)}</span>
          </h2>
          <p className="lp-lead">{t(head.lead)}</p>
        </header>
        <div className="lp-table-scene lp-reveal" ref={scene}>
          <div className="lp-table-host" aria-hidden="true">
            <SpeakingCharacter speaker="hamo" audio={null} crop="bust" decorative reaction={turn > 0 ? REACTIONS[turn % REACTIONS.length]! : null} />
          </div>
          <p className="lp-table-bubble" aria-live="polite">
            <span className="lp-table-said" key={said}>
              <Ku className="lp-table-ku">{phrase.ku}</Ku>
              <span className="lp-table-gloss">{t(phrase.gloss)}</span>
            </span>
          </p>
          <div className="lp-table-phrases" role="group" aria-label={t('landing.table.pick')}>
            {TABLE.map((p, i) => (
              <button
                key={p.ku}
                type="button"
                className={`lp-chip-button${i === said ? ' is-on' : ''}`}
                aria-pressed={i === said}
                onClick={() => {
                  setChosen(true);
                  setSaid(i);
                  setTurn((n) => n + 1);
                }}
              >
                <Ku>{p.ku}</Ku>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
