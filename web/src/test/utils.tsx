import type { ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';

/** Render a tree wrapped in the auth context, router, and profile-modal context. */
export function renderApp(ui: ReactNode, initialEntries: string[] = ['/']): RenderResult {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <ProfileModalProvider>{ui}</ProfileModalProvider>
      </MemoryRouter>
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
