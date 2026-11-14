import { useId, useMemo, useState } from 'react';
import { LETTER_MAX, letterBirdSvg, letterProblem, type LetterItem, type LetterProblem } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { FlagIcon } from '../components/icons';

/**
 * The small pieces the letters pages share: a pen pal's bird as their
 * picture, the sheet of paper a letter is written on, and a letter as it is
 * read.
 */

/** Somebody's pigeon, its portrait in a round of its own as their picture. Decoration: their name is always beside it. */
export function BirdBadge({ bird, size = 44 }: { bird: number; size?: number }): React.JSX.Element {
  const id = `bb${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const svg = useMemo(() => ({ __html: letterBirdSvg({ bird, portrait: true, size, idPrefix: id }) }), [bird, size, id]);
  return <span className="letter-badge" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={svg} />;
}

/** What to tell the writer about a letter that cannot go as it is, in the order they should mend it. */
const PROBLEM: Record<LetterProblem, MessageKey> = {
  short: 'letters.problem.short',
  long: 'letters.problem.long',
  link: 'letters.problem.link',
  contact: 'letters.problem.contact',
};

/**
 * A sheet of lined paper to write a letter on, and the bird's send. What the
 * server would refuse is said under it as it is written — a link, a phone
 * number, too long — so nothing is refused after the bird has left; that it is
 * too short is said only once somebody tries to send it, not while they are
 * still starting.
 */
export function LetterPaper({
  label,
  busy,
  onSend,
  error,
}: {
  label: string;
  busy: boolean;
  onSend: (body: string) => void;
  /** what the server answered, when it refused */
  error?: string | null;
}): React.JSX.Element {
  const t = useT();
  const id = useId();
  const [body, setBody] = useState('');
  const [tried, setTried] = useState(false);
  const problem = letterProblem(body);
  // a letter still being started is not yet too short
  const shown = problem && (problem !== 'short' || tried) ? t(PROBLEM[problem]) : null;
  const length = [...body.trim()].length;
  return (
    <form
      className="letter-paper"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!problem && !busy) onSend(body);
      }}
    >
      <label htmlFor={`${id}-body`} className="letter-paper-label">
        {label}
      </label>
      <textarea
        id={`${id}-body`}
        className="letter-paper-sheet"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('letters.placeholder')}
        rows={7}
        maxLength={LETTER_MAX + 200}
        aria-describedby={`${id}-hint ${id}-problem`}
        aria-invalid={shown ? true : undefined}
        dir="auto"
      />
      <div className="letter-paper-foot">
        <p id={`${id}-hint`} className="letter-paper-hint">
          {t('letters.hint')}
        </p>
        <span className={`letter-paper-count${length > LETTER_MAX ? ' is-over' : ''}`} aria-hidden="true">
          {length} / {LETTER_MAX}
        </span>
      </div>
      <p id={`${id}-problem`} className="letter-paper-problem" role="alert">
        {shown ?? error ?? ''}
      </p>
      <button type="submit" className="btn btn-primary letter-paper-send" disabled={busy}>
        {busy ? t('letters.sending') : t('letters.send')}
      </button>
    </form>
  );
}

/** A letter as it is read: on its paper, who wrote it and when, and for one written to you, the way to report it. */
export function LetterSheet({ letter, from, onReport }: { letter: LetterItem; from: string; onReport?: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const when = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(letter.sentAt));
  return (
    <article className={`letter-sheet${letter.mine ? ' is-mine' : ''}`} aria-label={t('letters.fromWhom', { name: from })}>
      <header className="letter-sheet-head">
        <span className="letter-sheet-from">{from}</span>
        <time dateTime={letter.sentAt}>{when}</time>
      </header>
      {letter.removed ? (
        <p className="letter-sheet-removed">{t('letters.removed')}</p>
      ) : (
        <p className="letter-sheet-body" dir="auto">
          {letter.body}
        </p>
      )}
      {onReport && !letter.removed && (
        <button type="button" className="letter-sheet-report" onClick={onReport}>
          <FlagIcon size={14} />
          {t('letters.reportLetter')}
        </button>
      )}
    </article>
  );
}
