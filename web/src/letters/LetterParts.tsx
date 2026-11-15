import { useId, useMemo } from 'react';
import { letterBirdSvg, type LetterItem } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import { FlagIcon } from '../components/icons';
import { LetterOnPaper } from './PaperSheet';

/**
 * The small pieces the letters pages share: a pen pal's bird as their
 * picture, and a letter as it is read. The paper a letter is written on is
 * the composer's own (LetterComposer.tsx).
 */

/** Somebody's pigeon, its portrait in a round of its own as their picture. Decoration: their name is always beside it. */
export function BirdBadge({ bird, size = 44 }: { bird: number; size?: number }): React.JSX.Element {
  const id = `bb${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const svg = useMemo(() => ({ __html: letterBirdSvg({ bird, portrait: true, size, idPrefix: id }) }), [bird, size, id]);
  return <span className="letter-badge" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={svg} />;
}

/**
 * A letter as it is read: who wrote it and when, over the letter on its own
 * paper with its drawing and notes, and for one written to you, the way to
 * report it. A letter Hevalo took down says so on a plain sheet, and shows
 * nothing of what was on it.
 */
export function LetterSheet({ letter, from, onReport }: { letter: LetterItem; from: string; onReport?: () => void }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const when = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(letter.sentAt));
  return (
    <article className={`letter-sheet${letter.mine ? ' is-mine' : ''}${letter.removed ? ' is-removed' : ''}`} aria-label={t('letters.fromWhom', { name: from })}>
      <header className="letter-sheet-head">
        <span className="letter-sheet-from">{from}</span>
        <time dateTime={letter.sentAt}>{when}</time>
      </header>
      {letter.removed ? (
        <p className="letter-sheet-removed">{t('letters.removed')}</p>
      ) : (
        <LetterOnPaper body={letter.body} decor={letter.decor ?? null} drawnLabel={t('letters.read.drawn')} notesLabel={t('letters.read.notes')} />
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
