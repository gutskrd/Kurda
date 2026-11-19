import type { ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, type InitialEntry } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { I18nProvider } from '../i18n/I18nProvider';

/**
 * Renders a tree inside the providers the app always has: auth, the router, the profile modal and the interface
 * language. The language is English, since jsdom reports `en-US` and nothing is stored.
 */
export function renderApp(ui: ReactNode, initialEntries: InitialEntry[] = ['/']): RenderResult {
  return render(
    <AuthProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <ProfileModalProvider>{ui}</ProfileModalProvider>
        </MemoryRouter>
      </I18nProvider>
    </AuthProvider>,
  );
}

/** A JSON Response for stubbing fetch. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fetch stub that answers by matching a substring of the request URL. */
export function routedFetch(map: Record<string, unknown>): (url: string) => Promise<Response> {
  return async (url: string) => {
    const key = Object.keys(map).find((k) => url.includes(k));
    return jsonResponse(200, key ? map[key] : {});
  };
}

/** How long to wait for a sign-in page to move on: it pauses after signing in (auth/arrival) on top of the usual wait. */
export const MOVES_ON = { timeout: 8000 } as const;

/** The reads the apps make once for both varieties (shared `readEveryDialect`). */
const BOTH_DIALECTS = ['/games/availability', '/games/impostor/couch', '/games/who-am-i/couch'];

/**
 * A test's answers with each read for both varieties answered from its answers for each, added last so a variety's own
 * read still finds its own answer first.
 */
export function withBothDialects(routes: Record<string, unknown>): Record<string, unknown> {
  const both: Record<string, unknown> = {};
  for (const path of BOTH_DIALECTS) {
    const each = ['kmr', 'ckb'].map((d) => routes[`${path}?dialect=${d}`]).filter((answer) => answer !== undefined);
    if (each.length > 0 && !(path in routes)) both[path] = { dialects: each };
  }
  return { ...routes, ...both };
}
