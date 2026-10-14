import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, jsonResponse } from '../test/utils';
import { ReportSheet, type ReportSheetProps } from './ReportSheet';

afterEach(() => vi.restoreAllMocks());

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function stub(reportStatus = 201, reportBody: unknown = null): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : null });
      if (url.endsWith('/reports')) {
        return jsonResponse(
          reportStatus,
          reportBody ?? {
            report: { id: 'r1', targetType: 'user', category: 'harassment', status: 'open', targetLabel: '@rojda', createdAt: '', closedAt: null, canAppeal: false, caseId: null },
            deduped: false,
          },
        );
      }
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

function show(props: Partial<ReportSheetProps> = {}): void {
  renderApp(
    <ReportSheet
      open
      onClose={() => undefined}
      target={{ targetType: 'user', targetId: 'u-rojda' }}
      name="Rojda"
      block={{ userId: 'u-rojda', name: 'Rojda' }}
      {...props}
    />,
  );
}

describe('ReportSheet', () => {
  it('lists every category, most urgent first, in plain words', () => {
    stub();
    show();
    const dialog = screen.getByRole('dialog', { name: 'Report Rojda' });
    const buttons = within(dialog).getAllByRole('button').filter((b) => b.classList.contains('report-cat'));
    expect(buttons).toHaveLength(10);
    expect(buttons[0]).toHaveTextContent('A child is being put at risk');
    expect(buttons[1]).toHaveTextContent('Someone may hurt themselves');
    expect(buttons[9]).toHaveTextContent('Something else');
    expect(screen.getByText('They won’t be told who reported them.')).toBeInTheDocument();
  });

  it('sends with no note at all, then says what happens next and offers a block', async () => {
    const calls = stub();
    const onBlocked = vi.fn();
    show({ onBlocked });

    await userEvent.click(screen.getByRole('button', { name: /Bullying or harassment/ }));
    expect(await screen.findByRole('heading', { name: 'Anything else we should know?' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByRole('heading', { name: 'Thanks for telling us' })).toBeInTheDocument();
    const sent = calls.find((c) => c.url.endsWith('/reports'))!;
    expect(sent.body).toEqual({ targetType: 'user', targetId: 'u-rojda', category: 'harassment' });
    expect(screen.getByText('What happens next')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See my reports' })).toHaveAttribute('href', '/app/settings/reports');
    // there is no personal mute in Hevalo, so none is offered
    expect(screen.queryByRole('button', { name: /mute/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Block Rojda' }));
    expect(await screen.findByText('Rojda is blocked.')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/friends/u-rojda/block') && c.method === 'POST')).toBe(true);
    expect(onBlocked).toHaveBeenCalled();
  });

  it('shows help at once for someone who may hurt themselves', async () => {
    const calls = stub();
    show();
    await userEvent.click(screen.getByRole('button', { name: /Someone may hurt themselves/ }));

    expect(screen.getByRole('heading', { name: 'If someone may hurt themselves' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Find a helpline/ })).toHaveAttribute('href', 'https://findahelpline.com');
    // nothing has been sent yet: help comes before the report
    expect(calls.some((c) => c.url.endsWith('/reports'))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Continue with the report' }));
    await userEvent.type(screen.getByLabelText(/Your note/), 'They said goodbye to everyone.');
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByRole('heading', { name: 'Thanks for telling us' });
    expect(calls.find((c) => c.url.endsWith('/reports'))!.body).toMatchObject({
      category: 'self_harm',
      note: 'They said goodbye to everyone.',
    });
  });

  it('reports a game player by game and seat, never by account', async () => {
    const calls = stub();
    show({ target: { targetType: 'game_player', targetId: 'battle-1', game: 'wordle-battle', seat: 3 }, name: 'Player 3', block: null });
    await userEvent.click(screen.getByRole('button', { name: /Scam or spam/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByRole('heading', { name: 'Thanks for telling us' });
    expect(calls.find((c) => c.url.endsWith('/reports'))!.body).toEqual({
      targetType: 'game_player',
      targetId: 'battle-1',
      category: 'spam',
      game: 'wordle-battle',
      seat: 3,
    });
    expect(screen.queryByRole('button', { name: /Block/ })).not.toBeInTheDocument();
  });

  it('offers to leave a group from the done screen', async () => {
    const calls = stub();
    show({ target: { targetType: 'group', targetId: 'g1' }, name: 'Hevalên Amedê', block: null, leaveGroup: { groupId: 'g1', name: 'Hevalên Amedê' } });
    await userEvent.click(screen.getByRole('button', { name: /Hate/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Leave Hevalên Amedê' }));
    expect(await screen.findByText('You left Hevalên Amedê.')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/groups/g1/leave'))).toBe(true);
  });

  it('says plainly when the day’s reports are used up', async () => {
    stub(429, { code: 'REPORT_LIMIT', message: 'you have sent a lot of reports today' });
    show();
    await userEvent.click(screen.getByRole('button', { name: /Something else/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You’ve sent a lot of reports today. You can send more tomorrow.');
  });

  it('says so when it was already reported and is still open', async () => {
    stub(200, {
      report: { id: 'r1', targetType: 'user', category: 'spam', status: 'open', targetLabel: null, createdAt: '', closedAt: null, canAppeal: false, caseId: null },
      deduped: true,
    });
    show();
    await userEvent.click(screen.getByRole('button', { name: /Scam or spam/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByRole('heading', { name: 'We already have your report' })).toBeInTheDocument();
  });
});
