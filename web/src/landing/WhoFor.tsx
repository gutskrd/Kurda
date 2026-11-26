import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { LEARNING_FOR, chooseLearningFor, useVisitor, type LearningFor } from './visitor';

/**
 * One optional question under the hero: who are you learning for? The answer changes a few lines further down (the
 * table's heading and the closing words), stays in this browser and is never sent anywhere; the note under it says so.
 */
const ANSWERS: Record<LearningFor, { label: MessageKey; reply: MessageKey }> = {
  family: { label: 'landing.who.family', reply: 'landing.who.reply.family' },
  partner: { label: 'landing.who.partner', reply: 'landing.who.reply.partner' },
  children: { label: 'landing.who.children', reply: 'landing.who.reply.children' },
  self: { label: 'landing.who.self', reply: 'landing.who.reply.self' },
  curious: { label: 'landing.who.curious', reply: 'landing.who.reply.curious' },
};

export function WhoFor(): React.JSX.Element {
  const t = useT();
  const { learningFor } = useVisitor();
  return (
    <section className="fp-who fp-reveal" aria-labelledby="fp-who-title">
      <h2 id="fp-who-title" className="fp-who-title">
        {t('landing.who.title')}
      </h2>
      <div className="fp-who-answers" role="group" aria-labelledby="fp-who-title">
        {LEARNING_FOR.map((k) => (
          <button
            key={k}
            type="button"
            className={`fp-chip-button${learningFor === k ? ' is-on' : ''}`}
            aria-pressed={learningFor === k}
            onClick={() => chooseLearningFor(learningFor === k ? null : k)}
          >
            {t(ANSWERS[k].label)}
          </button>
        ))}
      </div>
      {/* The reply's place is kept whether or not there is one, so choosing moves nothing below it. */}
      <p className="fp-who-reply" aria-live="polite">
        {learningFor ? t(ANSWERS[learningFor].reply) : t('landing.who.note')}
      </p>
    </section>
  );
}
