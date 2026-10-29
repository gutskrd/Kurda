import { useId } from 'react';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';

/**
 * A yes for something that cannot be taken back: what it is, in a step of its
 * own, with the plain consequences and Cancel beside it — first, so the
 * keyboard lands on the way out rather than the way through.
 */
export function GroupAsk({
  title,
  body,
  action,
  danger = false,
  busy,
  error,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  /** what will happen, said plainly */
  body?: React.ReactNode;
  action: string;
  danger?: boolean;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** a choice that goes with the yes (stop someone's requests) */
  children?: React.ReactNode;
}): React.JSX.Element {
  const t = useT();
  const id = useId();
  return (
    <div className="ginfo-ask" role="alertdialog" aria-labelledby={`${id}-title`} aria-describedby={body ? `${id}-body` : undefined}>
      <h2 className="ginfo-ask-title" id={`${id}-title`} dir="auto">
        {title}
      </h2>
      {body && (
        <div className="ginfo-ask-body" id={`${id}-body`} dir="auto">
          {body}
        </div>
      )}
      {children}
      {error && (
        <div className="msg msg-error" role="alert">
          {error}
        </div>
      )}
      <div className="ginfo-ask-actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
          {t('common.cancel')}
        </Button>
        <Button className={danger ? 'btn-danger' : undefined} onClick={onConfirm} disabled={busy}>
          {action}
        </Button>
      </div>
    </div>
  );
}
