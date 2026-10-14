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

  it('gives the keyboard back to the ⋯ when the report sheet closes', async () => {
    signIn();
    stub();
    renderApp(<ReportAction target={{ targetType: 'library_comment', targetId: 'c1' }} authorId="u2" label="More about this comment" />);
    const more = await screen.findByRole('button', { name: 'More about this comment' });
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Report' }));
    expect(screen.getByRole('dialog', { name: 'Report this comment' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
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

  it('keeps its open menu inside the window when the ⋯ sits at the edge', async () => {
    signIn();
    stub();
    // a ⋯ near the right edge of a phone: the menu would run 110px off it
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('msg-menu-list')
        ? ({ left: 324, right: 500, top: 0, bottom: 60, width: 176, height: 60 } as DOMRect)
        : ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } as DOMRect);
    });
    vi.stubGlobal('innerWidth', 390);
    renderApp(<ReportAction target={{ targetType: 'library_comment', targetId: 'c1' }} authorId="u2" label="More about this comment" />);
    await userEvent.click(await screen.findByRole('button', { name: 'More about this comment' }));
    // 8px short of the edge: 390 - 8 - 500
    expect(screen.getByRole('menu').style.transform).toBe('translateX(-118px)');
    rect.mockRestore();
  });
});
