import { useState } from 'react';
import { MAX_APPEAL_LEN, type AppealOutcome, type AppealView, type StandingSanction } from '@kurda/shared';
import { Button } from '../components/Button';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { CATEGORY_LABEL, SANCTION_LABEL } from './labels';
import { formatDay, formatUntil } from './restriction';

/** The answer to a review, once there is one (an open one says when it was asked). */
const APPEAL_OUTCOME: Record<AppealOutcome, MessageKey> = {
  upheld: 'standing.appeal.upheld',
  overturned: 'standing.appeal.overturned',
  modified: 'standing.appeal.modified',
};

/** How a decision came about, as its statement of reasons has to say. */
function originKey(s: StandingSanction): MessageKey {
  if (s.origin === 'report') return 'standing.origin.report';
  if (s.origin === 'moderator') return 'standing.origin.moderator';
  return s.reviewedByPerson ? 'standing.origin.automaticReviewed' : 'standing.origin.automatic';
}

/** An appeal's answer, as its author sees it. */
export function AppealState({ appeal }: { appeal: AppealView }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  return (
    <div className={`appeal-state is-${appeal.status}`} role="status">
      <p>
        {appeal.status === 'open'
          ? t('standing.appeal.openOn', { date: formatDay(appeal.createdAt, locale) })
          : t(APPEAL_OUTCOME[appeal.status])}
      </p>
      {appeal.decisionNote && (
        <p className="appeal-answer">
          {t('standing.appeal.answer')} <span dir="auto">{appeal.decisionNote}</span>
        </p>
      )}
    </div>
  );
}

/**
 * One decision about your account, with its statement of reasons: what it
 * is, the rule, what the reviewer wrote to you, from when until when, how it
 * came about, and the one review you may ask for.
 *
 * Shared by Account standing and the suspension screen; `appeal` is how the
 * request is sent, because the suspension screen has no session — only the
 * appeal token that sign-in handed it.
 */
export function SanctionCard({
  sanction,
  appeal,
}: {
  sanction: StandingSanction;
  /** send the review request; resolves to the appeal, or a sentence saying why it did not go */
  appeal: (sanctionId: string, text: string) => Promise<AppealView | string>;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const [current, setCurrent] = useState<AppealView | null>(sanction.appeal.current);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await appeal(sanction.id, text.trim());
    setBusy(false);
    if (typeof result === 'string') {
      setError(result);
      return;
    }
    setCurrent(result);
    setAsking(false);
  }

  const start = formatDay(sanction.startsAt, locale);
  const when = !sanction.endsAt
    ? sanction.kind === 'warning' || sanction.kind === 'content_removal'
      ? start
      : t('standing.when.open', { start })
    : t('standing.when.range', { start, end: formatUntil(sanction.endsAt, locale) });

  return (
    <article className={`card sanction${sanction.active ? ' is-active' : ''}`}>
      <header className="sanction-head">
        <h3 className="sanction-kind">{t(SANCTION_LABEL[sanction.kind])}</h3>
        {sanction.revokedAt ? (
          <span className="sanction-tag">{t('standing.lifted', { date: formatDay(sanction.revokedAt, locale) })}</span>
        ) : (
          sanction.active && <span className="sanction-tag is-active">{t('standing.inForce')}</span>
        )}
      </header>
      <p className="sanction-rule">{t('standing.rule', { rule: t(CATEGORY_LABEL[sanction.policy]) })}</p>
      <p className="sanction-when">{when}</p>
      {sanction.statement && (
        <figure className="sanction-statement">
          <figcaption>{t('standing.statement')}</figcaption>
          {/* what a person wrote, in whichever language and direction they wrote it */}
          <blockquote dir="auto">{sanction.statement}</blockquote>
        </figure>
      )}
      <p className="sanction-origin">{t(originKey(sanction))}</p>

      {current ? (
        <AppealState appeal={current} />
      ) : sanction.appeal.allowed ? (
        asking ? (
          <form className="appeal-form" onSubmit={(e) => void send(e)}>
            <label className="field-label" htmlFor={`appeal-${sanction.id}`}>
              {t('standing.appeal.label')}
            </label>
            <textarea
              id={`appeal-${sanction.id}`}
              className="input"
              rows={4}
              maxLength={MAX_APPEAL_LEN}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-describedby={`appeal-hint-${sanction.id}`}
            />
            <p className="field-hint" id={`appeal-hint-${sanction.id}`}>
              {t('standing.appeal.hint')}
            </p>
            {error && (
              <div className="msg msg-error" role="alert">
                {error}
              </div>
            )}
            <div className="appeal-actions">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={busy || !text.trim()}>
                {busy ? t('report.sending') : t('standing.appeal.send')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="appeal-offer">
            <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
              {t('standing.appeal.ask')}
            </Button>
            <span className="appeal-deadline">
              {t('standing.appeal.deadline', { date: formatDay(sanction.appeal.deadline, locale) })}
            </span>
          </div>
        )
      ) : null}
    </article>
  );
}
