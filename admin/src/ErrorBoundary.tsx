import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps one page's render error from taking down the whole admin.
 *
 * Without this, an exception anywhere in a page unmounts the entire React tree
 * and leaves a blank white screen with no nav and no way back — which is exactly
 * how the Economy page presented when it hit an unexpected value. Now the page
 * area shows what went wrong and the rest of the admin keeps working.
 *
 * Reset by giving it a `resetKey` that changes (the active page): navigating
 * away and back clears the error rather than sticking on it for the session.
 */
interface Props {
  children: ReactNode;
  /** Changing this clears a caught error — pass the current page key. */
  resetKey: string;
}
interface State {
  error: Error | null;
  key: string;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { error: null, key: props.resetKey };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // there is no error reporting service wired up; the console is what an
    // admin can actually hand over when reporting a broken page
    console.error('[admin] page crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="state state-error card" role="alert">
        <div className="state-title">This page hit an error</div>
        <div className="state-text">
          The rest of the admin still works — pick another page from the menu. If it keeps happening, the message below is the
          useful part of a bug report.
        </div>
        <pre className="code-block crash-message">{error.message || String(error)}</pre>
        <div className="state-action">
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
