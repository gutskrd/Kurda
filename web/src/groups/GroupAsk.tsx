import { useId } from 'react';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';

/** A confirmation step for something irreversible, with its consequences and Cancel first so the keyboard lands on it. */
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
  /** What will happen, said plainly. */
  body?: React.ReactNode;
  action: string;
  danger?: boolean;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** A choice that goes with the confirmation, such as stopping someone's requests. */
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
