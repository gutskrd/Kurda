import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from './Button';
import { useT } from '../i18n/I18nProvider';

/**
 * Keeps one page's render error from blanking the whole site. It sits inside `<main>`, beside the Suspense boundary, so
 * the bars stay up, and it resets on `resetKey` (the path) so navigating away clears the error.
 */
interface Props {
  children: ReactNode;
  /** Changing this clears a caught error. Pass the current path. */
  resetKey: string;
}

interface State {
  error: Error | null;
  key: string;
}

class Boundary extends Component<Props & { t: ReturnType<typeof useT> }, State> {
  override state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { error: null, key: props.resetKey };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No reporting service is wired up. React has logged the error already; the component stack is what it leaves out.
    console.error('[web] page crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    const { t } = this.props;
    if (!error) return this.props.children;
    return (
      <div className="container" style={{ padding: '96px 24px', textAlign: 'center' }}>
        <h1 className="display" style={{ marginTop: 12, fontSize: 'clamp(1.6rem, 4vw, 2.4rem)' }}>
          {t('error.crash.title')}
        </h1>
        <p className="lead" style={{ margin: '16px auto 30px', maxWidth: '46ch' }}>
          {t('error.crash.body')}
        </p>
        {/* The message names internals, so it is shown only in development builds. */}
        {import.meta.env.DEV ? (
          <pre style={{ margin: '0 auto 24px', maxWidth: '60ch', whiteSpace: 'pre-wrap', textAlign: 'left' }}>
            {error.message || String(error)}
          </pre>
        ) : null}
        <Button onClick={() => this.setState({ error: null })} size="lg">
          {t('common.retry')}
        </Button>
      </div>
    );
  }
}

/** Wraps the page area. Resets itself whenever the path changes. */
export function ErrorBoundary({ children }: { children: ReactNode }): React.JSX.Element {
  const t = useT();
  const { pathname } = useLocation();
  return (
    <Boundary resetKey={pathname} t={t}>
      {children}
    </Boundary>
  );
}
