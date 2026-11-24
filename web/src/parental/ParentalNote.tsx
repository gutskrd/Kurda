import { Link } from 'react-router-dom';
import type { ParentalSwitch } from '@kurda/shared';
import { ParentalIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { useSupervision } from './Supervision';

/** Whether a supervised teen's parent has switched this part of Hevalo off; false for everyone else. */
export function useParentalOff(control: ParentalSwitch): boolean {
  return useSupervision().state?.controls[control] === false;
}

/**
 * What a supervised teen sees in place of something their parent switched off: one calm sentence with the parental
 * glyph, and the way to see what is set. `compact` is the sentence alone, for the room a single button had.
 */
export function ParentalNote({ className, compact = false }: { className?: string; compact?: boolean }): React.JSX.Element {
  const t = useT();
  return (
    <div className={`parental-note${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`} role="note">
      <ParentalIcon size={compact ? 18 : 20} className="parental-note-icon" />
      <p className="parental-note-text">
        {t('parental.off')}
        {!compact && (
          <>
            {' '}
            <Link to="/app/settings/parental" className="parental-note-link reach-line">
              {t('parental.seeControls')}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

/**
 * A whole place a supervised teen's parent switched off (Messages with chats off, Letters with letters off): the parental
 * glyph in its soft circle, the same calm sentence, and the way to see what is set. Shown instead of reading anything,
 * so nothing is asked of the server only to be refused.
 */
export function ParentalOffPlace({ className }: { className?: string }): React.JSX.Element {
  const t = useT();
  return (
    <div className={`parental-off${className ? ` ${className}` : ''}`} role="status">
      <span className="parental-lead-glyph" aria-hidden="true">
        <ParentalIcon size={32} />
      </span>
      <p className="parental-off-text">{t('parental.off')}</p>
      <Link to="/app/settings/parental" className="btn btn-secondary">
        {t('parental.seeControls')}
      </Link>
    </div>
  );
}
