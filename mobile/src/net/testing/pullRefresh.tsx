/**
 * `usePullRefresh` for component tests. On the web the real control has nothing to pull, so this draws a button
 * over the scroller (test id `pull-to-refresh`); pressing it is the pull. Wire with
 * `vi.mock('…/net/usePullRefresh', () => import('…/net/testing/pullRefresh'))`.
 */
import { createElement, Fragment, type ReactNode } from 'react';

function Pull({ onRefresh, children }: { onRefresh: () => void; children?: ReactNode }): React.JSX.Element {
  return createElement(Fragment, null, createElement('button', { type: 'button', 'data-testid': 'pull-to-refresh', onClick: onRefresh }), children);
}

export function usePullRefresh(reload: () => unknown): React.JSX.Element {
  return createElement(Pull, { onRefresh: () => void reload() });
}
