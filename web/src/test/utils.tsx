import type { ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { I18nProvider } from '../i18n/I18nProvider';

/**
 * Render a tree wrapped in the contexts the real app always provides: auth, the
 * router, the profile modal, and the interface language.
 *
 * The language belongs here rather than in each test because `useT` throws
 * without it, exactly as `useAuth` does — a component that asks for a word is
 * no more optional about its provider than one that asks who is signed in.
 * Tests get English, since jsdom's navigator reports `en-US` and nothing has
 * been stored.
 */
export function renderApp(ui: ReactNode, initialEntries: string[] = ['/']): RenderResult {
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
