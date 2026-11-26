import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { AppTree } from '../App';

/** The router a page rendered ahead sits in: always at the front page. */
function AtFront({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <StaticRouter location="/">{children}</StaticRouter>;
}

/**
 * The front page as plain HTML, rendered once at build time (scripts/prerender.ts) for readers that do not run
 * JavaScript, search engines among them: what a first visit in English sees, signed out. The app draws the page afresh
 * over it when it starts, since what it shows depends on the reader's language and choices kept in their browser.
 */
export function renderFront(): string {
  return renderToString(<AppTree Router={AtFront} />);
}
