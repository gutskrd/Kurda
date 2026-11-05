/**
 * `usePullRefresh` for component tests. A list or a scroller draws its
 * `refreshControl` round itself (react-native-web clones the control with
 * the scroller as its child), and on the web the real control has nothing to
 * pull, so this one is a button named "Pull to refresh" over the scroller:
 * pressing it is the pull. Wired with
 * `vi.mock('…/net/usePullRefresh', () => import('…/net/testing/pullRefresh'))`.
 */
import { createElement, Fragment, type ReactNode } from 'react';

function Pull({ onRefresh, children }: { onRefresh: () => void; children?: ReactNode }): React.JSX.Element {
  return createElement(Fragment, null, createElement('button', { type: 'button', 'aria-label': 'Pull to refresh', onClick: onRefresh }), children);
}

export function usePullRefresh(reload: () => unknown): React.JSX.Element {
  return createElement(Pull, { onRefresh: () => void reload() });
}
