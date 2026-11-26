import { useRef } from 'react';
import { localeDir } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { HevaloPeek } from '../characters/HevaloPeek';
import { JoinButtons, useNear, useWide } from './parts';
import { useVisitor, type LearningFor } from './visitor';

/**
 * The foot of the front page repeats the top: Hevalo bursting through the page again, cheering as he comes, and the same
 * ways in. Its words count the Kurdish the visitor learned on the page, and follow who they said they are learning for,
 * from this browser alone.
 */
const LEADS: Record<LearningFor | 'anyone', MessageKey> = {
  family: 'landing.final.lead.family',
  partner: 'landing.final.lead.partner',
  children: 'landing.final.lead.children',
  self: 'landing.final.lead.anyone',
  curious: 'landing.final.lead.anyone',
  anyone: 'landing.final.lead.anyone',
};

export function Closing(): React.JSX.Element {
  const t = useT();
  const { learningFor, words } = useVisitor();
  const figure = useRef<HTMLDivElement>(null);
  const wide = useWide();
  const rtl = localeDir(useLocale()) === 'rtl';
  // He comes through the page, cheering, when it comes into view.
  const seen = useNear(figure, '0px 0px -30% 0px');
  const known = words.length;
  const title =
    known === 0 ? t('landing.final.title') : known === 1 ? t('landing.final.knowOne') : t('landing.final.knowMany', { count: known });
  return (
    <section id="join" className="fp-section fp-final" aria-labelledby="fp-final-title">
      <div className="fp-final-in">
        <div className="fp-final-hevalo" ref={figure} aria-hidden="true">
          <HevaloPeek size={wide ? 240 : 204} pop={seen} flip={rtl} />
        </div>
        <h2 id="fp-final-title" className="fp-title">
          {title}
        </h2>
        <p className="fp-lead">{t(LEADS[learningFor ?? 'anyone'])}</p>
        <JoinButtons />
      </div>
    </section>
  );
}
