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

/** The thread with Rojda, where a sent message is answered by whatever `onSend` returns. */
function threadWhere(onSend: () => Promise<Response> | Response): { sent: string[] } {
  const sent: string[] = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'baran' } });
      if (url.includes('/chat/u-rojda/messages') && init?.method === 'POST') {
        sent.push(String((JSON.parse(String(init.body)) as { body: string }).body));
        return onSend();
      }
      if (url.includes('/chat/u-rojda/messages')) return jsonResponse(200, { messages: [] });
      return jsonResponse(200, {});
    }),
  );
  renderApp(<DmThread otherId="u-rojda" otherName="Rojda" onSent={() => undefined} />);
  return { sent };
}

const delivered = (body: string): Response =>
  jsonResponse(201, { id: 'm9', senderId: 'me', username: 'baran', avatarUrl: null, body, kind: 'text', createdAt: new Date().toISOString(), deliveredAt: null, readAt: null });

describe('DmThread, sending', () => {
  it('shows the message at once and empties the box, before the server has answered', async () => {
    let letGo: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (letGo = resolve));
    threadWhere(async () => {
      await held;
      return delivered('Silav!');
    });
    const box = await screen.findByRole('textbox', { name: 'Message' });
    await userEvent.type(box, 'Silav!');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    // in the thread already, not sent yet: it says so, and carries no mark of having been sent
    const bubble = screen.getByText('Silav!').closest('.bubble')!;
    expect(bubble).toHaveClass('is-sending');
    expect(screen.getByText('Sending…')).toBeInTheDocument();
    expect(document.querySelector('.chat-receipt')).toBeNull();
    expect(box).toHaveValue('');

    letGo();
    await vi.waitFor(() => expect(screen.getByText('Silav!').closest('.bubble')).not.toHaveClass('is-sending'));
    expect(screen.getAllByText('Silav!')).toHaveLength(1);
  });

  it('marks a message the server could not be reached for as not sent, and sends it again on Try again', async () => {
    let online = false;
    const { sent } = threadWhere(() => (online ? delivered('Tu çawa yî?') : jsonResponse(500, { code: 'INTERNAL', message: 'down' })));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Message' }), 'Tu çawa yî?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Not sent')).toBeInTheDocument();
    const bubble = screen.getByText('Tu çawa yî?').closest('.bubble')!;
    expect(bubble).toHaveClass('is-failed');
    // never shown as sent
    expect(document.querySelector('.chat-receipt')).toBeNull();

    online = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(screen.queryByText('Not sent')).not.toBeInTheDocument());
    expect(sent).toEqual(['Tu çawa yî?', 'Tu çawa yî?']);
    expect(screen.getAllByText('Tu çawa yî?')).toHaveLength(1);
  });

  it('gives the words back to the box when a message that did not go is cancelled', async () => {
    threadWhere(() => jsonResponse(500, { code: 'INTERNAL', message: 'down' }));
    const box = await screen.findByRole('textbox', { name: 'Message' });
    await userEvent.type(box, 'Spas');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Not sent');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Not sent')).not.toBeInTheDocument();
    expect(box).toHaveValue('Spas');
  });

  it('takes a message the server refuses out of the thread, and says why as it always has', async () => {
    threadWhere(() => jsonResponse(422, { code: 'CONTENT_BLOCKED', message: 'blocked' }));
    const box = await screen.findByRole('textbox', { name: 'Message' });
    await userEvent.type(box, 'tiştekî nebaş');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('That message was blocked by moderation.')).toBeInTheDocument();
    // not left in the thread as if it might still go, and nothing to try again
    expect(document.querySelector('.bubble')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    // the words are back where they were typed
    expect(box).toHaveValue('tiştekî nebaş');
  });

  it('sends on Enter at a keyboard, and leaves Enter as a new line on a touch screen', async () => {
    const { sent } = threadWhere(() => delivered('Rojbaş'));
    const box = await screen.findByRole('textbox', { name: 'Message' });
    expect(box).toHaveAttribute('enterkeyhint', 'send');
    await userEvent.type(box, 'Rojbaş{Enter}');
    await vi.waitFor(() => expect(sent).toEqual(['Rojbaş']));
  });
});

describe('the message box on a touch screen', () => {
  it('keeps Enter for a new line, and says so on the key', async () => {
    // a finger is the main pointer
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('pointer: coarse'),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { sent } = threadWhere(() => delivered('yek'));
    const box = await screen.findByRole('textbox', { name: 'Message' });
    expect(box).toHaveAttribute('enterkeyhint', 'enter');
    await userEvent.type(box, 'yek{Enter}du');
    expect(box).toHaveValue('yek\ndu');
    expect(sent).toEqual([]);
    vi.stubGlobal('matchMedia', undefined);
  });
});
