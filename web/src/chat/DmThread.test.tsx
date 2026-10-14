import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderApp, jsonResponse } from '../test/utils';
import { DmThread } from './DmThread';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function Where(): React.JSX.Element {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname + loc.search}</span>;
}

function stub(): void {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'baran' } });
      if (url.includes('/chat/u-rojda/messages')) {
        return jsonResponse(200, {
          messages: [
            { id: 'm1', senderId: 'u-rojda', username: 'Rojda', avatarUrl: null, body: 'something unkind', kind: 'text', createdAt: '2026-10-14T10:00:00Z', deliveredAt: null, readAt: null },
          ],
        });
      }
      if (url.endsWith('/reports')) return jsonResponse(201, { id: 'r1', deduped: false });
      return jsonResponse(200, {});
    }),
  );
}

/** Report Rojda's message from its ⋯, block her on the done screen, and close the sheet. */
async function reportAndBlock(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'More about Rojda’s message' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Report' }));
  await userEvent.click(screen.getByRole('button', { name: /Bullying or harassment/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Block Rojda' }));
  expect(await screen.findByText('Rojda is blocked.')).toBeInTheDocument();
}

describe('DmThread, after blocking from a report', () => {
  it('stays to show the done screen, then closes the conversation with the sheet', async () => {
    stub();
    renderApp(
      <>
        <DmThread otherId="u-rojda" otherName="Rojda" onSent={() => undefined} />
        <Where />
      </>,
      ['/app/messages?to=u-rojda&name=Rojda'],
    );
    await reportAndBlock();
    // still here: what happens next is worth reading
    expect(screen.getByTestId('where')).toHaveTextContent('to=u-rojda');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/messages$/);
  });

  it('closes a docked conversation instead', async () => {
    stub();
    const onClose = vi.fn();
    renderApp(<DmThread otherId="u-rojda" otherName="Rojda" onSent={() => undefined} onClose={onClose} />);
    await reportAndBlock();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
