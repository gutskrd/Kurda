import { Button } from './Button';

export function Loading({ label = 'Loading…' }: { label?: string }): React.JSX.Element {
  return (
    <div className="spinner-center" role="status" aria-live="polite">
      <div className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}): React.JSX.Element {
  return (
    <div className="state" role="alert">
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry && (
        <div style={{ marginTop: 18 }}>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }): React.JSX.Element {
  return (
    <div className="state">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}
