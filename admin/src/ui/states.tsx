/**
 * The three states a page is in before it has something to show: still
 * loading, nothing there, or a failure. Kept apart because the old pages ran
 * them together — a 403 or a 500 drew "Queue is empty — nothing to review",
 * which is the most dangerous thing a moderation screen can say when it is not
 * true.
 */
import type { ReactNode } from 'react';
import { describeError } from './errors';
import { Icon, type IconName } from './icons';

export function EmptyState({
  title,
  children,
  action,
  icon = 'inbox',
  compact = false,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
  compact?: boolean;
}): React.JSX.Element {
  return (
    <div className={`state state-empty${compact ? ' is-compact' : ''}`}>
      <Icon name={icon} size={compact ? 20 : 28} className="state-icon" />
      <div className="state-title">{title}</div>
      {children && <div className="state-text">{children}</div>}
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

/**
 * A failure, said the way it can be fixed: a role that cannot open this (ask a
 * superadmin), a 2FA check that has run out (enter a code), no connection, or
 * a server error to retry — with the request id for a bug report.
 */
export function ErrorState({
  error,
  onRetry,
  what,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  /** what the page shows, for "your role doesn't include …" */
  what?: string;
  compact?: boolean;
}): React.JSX.Element {
  const d = describeError(error, what);
  const icon: IconName = d.kind === 'forbidden' || d.kind === 'two_factor' || d.kind === 'two_factor_setup' ? 'lock' : 'alert';
  return (
    <div className={`state state-error kind-${d.kind}${compact ? ' is-compact' : ''}`} role="alert">
      <Icon name={icon} size={compact ? 20 : 28} className="state-icon" />
      <div className="state-title">{d.title}</div>
      <div className="state-text">{d.message}</div>
      <div className="state-action">
        {d.kind === 'two_factor' || d.kind === 'two_factor_setup' ? (
          // the gate asks for the code (or the setup) when the page loads again
          <button type="button" className="primary" onClick={() => location.reload()}>
            {d.kind === 'two_factor' ? 'Enter a code' : 'Set up 2FA'}
          </button>
        ) : d.kind === 'forbidden' ? null : onRetry ? (
          <button type="button" onClick={onRetry}>
            <Icon name="refresh" />
            Try again
          </button>
        ) : null}
      </div>
      {d.requestId && d.kind === 'server' && <div className="state-ref mono">Request id: {d.requestId}</div>}
    </div>
  );
}

/** Still loading: said to screen readers once, shown as a quiet placeholder. */
export function Loading({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }): React.JSX.Element {
  return (
    <div className="state state-loading" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}
