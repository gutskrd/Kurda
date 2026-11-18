import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps one page's render error from blanking the whole console: the page area shows what went wrong and the nav
 * keeps working. A changed `resetKey` (the active page) clears the error.
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
    // No error reporting service is wired up; the console is what an admin can hand over with a report.
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
