import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, jsonResponse } from '../test/utils';
import { ReportAction } from './ReportAction';

afterEach(() => vi.restoreAllMocks());

const signIn = (): void => localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));

function stub(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/me') ? jsonResponse(200, { user: { id: 'me', username: 'baran', email: 'b@x.test' } }) : jsonResponse(200, {}),
    ),
  );
}

describe('ReportAction', () => {
  it('opens the report sheet for someone else’s comment', async () => {
    signIn();
    stub();
    renderApp(<ReportAction target={{ targetType: 'library_comment', targetId: 'c1' }} authorId="u2" label="More about this comment" />);
    await userEvent.click(await screen.findByRole('button', { name: 'More about this comment' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Report' }));
    expect(screen.getByRole('dialog', { name: 'Report this comment' })).toBeInTheDocument();
  });

  it('draws nothing for your own things', async () => {
    signIn();
    stub();
    renderApp(
      <>
        <ReportAction target={{ targetType: 'library_post', targetId: 'p1' }} authorId="me" label="More about my post" />
        <ReportAction target={{ targetType: 'library_post', targetId: 'p2' }} authorId="u2" label="More about their post" />
      </>,
    );
    // theirs appearing says the sign-in has landed; mine still has nothing
    expect(await screen.findByRole('button', { name: 'More about their post' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More about my post' })).not.toBeInTheDocument();
  });

  it('draws nothing for a guest, who has no account to report with', () => {
    stub();
    renderApp(<ReportAction target={{ targetType: 'library_post', targetId: 'p1' }} authorId="u2" label="More about this post" />);
    expect(screen.queryByRole('button', { name: 'More about this post' })).not.toBeInTheDocument();
  });
});
