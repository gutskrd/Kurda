import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSessionUser } from '../auth/AuthProvider';
import { ShieldIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { STANDING_PATH } from './restriction';

/** Whether a person is checking this account before it may post or message (shared account-hold.ts). */
export function useAccountHeld(): boolean {
  return Boolean(useSessionUser()?.accountHold);
}

/**
 * What a held account sees in place of posting, commenting, messaging, uploading, letters and joining groups: what waits,
 * that learning does not, a short "Why?" and the way to Account standing. It never says what started the check.
 */
export function HeldNotice({ className, standing = true }: { className?: string; standing?: boolean }): React.JSX.Element {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className={`held-notice${className ? ` ${className}` : ''}`}>
      <span className="held-notice-icon" aria-hidden="true">
        <ShieldIcon size={18} />
      </span>
      <div className="held-notice-body">
        <p className="held-notice-text">{t('hold.title')}</p>
        <p className="held-notice-ways">
          <button type="button" className="link-button held-notice-why" aria-expanded={open} aria-controls={`${id}-why`} onClick={() => setOpen((v) => !v)}>
            {t('hold.why')}
          </button>
          {standing && (
            <Link to={STANDING_PATH} className="send-error-link reach-line">
              {t('restriction.seeStanding')}
            </Link>
          )}
        </p>
        <p className="held-notice-more" id={`${id}-why`} hidden={!open}>
          {t('hold.whyBody')}
        </p>
      </div>
    </div>
  );
}

/** The notice as a page's banner, shown only while the account is held. */
export function HeldBanner({ className, standing }: { className?: string; standing?: boolean }): React.JSX.Element | null {
  return useAccountHeld() ? <HeldNotice className={className} standing={standing} /> : null;
}
