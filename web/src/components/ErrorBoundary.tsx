import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from './Button';
import { useT } from '../i18n/I18nProvider';

/**
 * Keeps one page's render error from taking the whole site down.
 *
 * React unmounts the entire tree when a render throws — it cannot know which
 * state is still consistent — so without a boundary the browser is left on a
 * blank page. Reload is the only way out, and the reader has no reason to guess
 * that reloading is what is wanted.
 *
 * It sits inside `<main>`, in the same place and for the same reason as the
 * Suspense boundary already there: above the route table it would take the
 * navigation down with the page, and the bars staying put is the truth of what
 * is happening. Only the page is gone.
 *
 * It resets on `resetKey`, which is the path — so navigating anywhere clears a
 * caught error rather than sticking on it for the rest of the session, which is
 * the trap a plain "try again" falls into when the page is deterministically
 * broken.
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
    // No reporting service is wired up. React has already logged the error by
    // the time this runs; the component stack is the part it does not repeat,
    // and it is what makes a bug report worth reading.
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
        {/*
          The message names internals, and a deployed build shows it to
          strangers. import.meta.env.DEV is false in every production build, so
          this line is not in the bundle the public gets.
        */}
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
