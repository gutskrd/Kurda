// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('./testing/svg'));
vi.mock('expo-secure-store', () => import('./testing/stubs'));
vi.mock('expo-linear-gradient', () => import('./testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('./testing/stubs'));
vi.mock('../auth/AuthContext', () => import('./testing/auth'));
const navigate = vi.fn();
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate, goBack: vi.fn() }) }));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Linking } from 'react-native';
import { HELPLINE_URL, type ReportReceipt } from '@kurda/shared';
import { renderWithProviders } from './testing/harness';
import { patchReactNativeWeb } from './testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from './testing/auth';
import { ReportSheet, requestFor } from './ReportSheet';
import { PlayerReportButton } from './PlayerReportButton';

patchReactNativeWeb();

function receipt(over: Partial<ReportReceipt> = {}): ReportReceipt {
  return {
    report: {
      id: 'r1',
      targetType: 'dm_message',
      category: 'harassment',
      status: 'open',
      targetLabel: null,
      createdAt: '2026-10-13T10:00:00.000Z',
      closedAt: null,
      canAppeal: false,
      caseId: 'c1',
    },
    deduped: false,
    ...over,
  };
}

beforeEach(() => navigate.mockReset());
afterEach(cleanup);

describe('ReportSheet', () => {
  it('reports a message in three steps: what, an optional note, then what happens next', async () => {
    const client = fakeClient({ 'POST /reports': ok(receipt()) });
    testAuth.client = client;
    const onClose = vi.fn();
    renderWithProviders(
      <ReportSheet visible target={{ type: 'dm_message', messageId: 'm1' }} onClose={onClose} />,
    );

    expect(screen.getByText('Report this message')).toBeTruthy();
    expect(screen.getByText('What’s wrong?')).toBeTruthy();
    // the most urgent categories come first, in plain words
    const options = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(options.indexOf('A child is in danger (including sexual messages or pictures)')).toBeLessThan(
      options.indexOf('Bullying or harassment'),
    );
    // shared REPORT_CATEGORIES' copyright, in the app's words, after harassment
    expect(options.indexOf('Copies someone else’s work')).toBeGreaterThan(options.indexOf('Bullying or harassment'));

    fireEvent.click(screen.getByRole('button', { name: 'Bullying or harassment' }));
    expect(screen.getByText('You chose: Bullying or harassment')).toBeTruthy();
    // no minimum: sending with an empty note is fine
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => expect(screen.getByText('Thanks for telling us')).toBeTruthy());
    expect(client.calls).toContainEqual({
      method: 'POST',
      path: '/reports',
      body: { targetType: 'dm_message', targetId: 'm1', category: 'harassment' },
    });
    expect(screen.getByText('What happens next')).toBeTruthy();
    // nothing to block or leave was offered, so nothing is shown
    expect(screen.queryByRole('button', { name: /^Block/ })).toBeNull();

    fireEvent.click(screen.getByText('My reports'));
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('MyReports');
  });

  it('shows where to find help first when someone may hurt themselves', async () => {
    const client = fakeClient({ 'POST /reports': ok(receipt({ help: { url: HELPLINE_URL } })) });
    testAuth.client = client;
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderWithProviders(<ReportSheet visible target={{ type: 'user', userId: 'u2' }} name="Rojda" onClose={() => undefined} />);

    expect(screen.getByText('Report Rojda')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Someone may hurt themselves' }));
    // help comes before the note
    expect(screen.getByText('If someone is in danger right now')).toBeTruthy();
    expect(screen.queryByText('Send report')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Find a helpline' }));
    expect(open).toHaveBeenCalledWith(HELPLINE_URL);

    fireEvent.click(screen.getByRole('button', { name: 'Continue the report' }));
    fireEvent.change(screen.getByLabelText('Anything else we should know? (optional)'), {
      target: { value: '  they said goodbye  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(screen.getByText('Thanks for telling us')).toBeTruthy());
    expect(client.calls[0]?.body).toEqual({ targetType: 'user', targetId: 'u2', category: 'self_harm', note: 'they said goodbye' });
    // and once more at the end
    expect(screen.getByRole('link', { name: 'Find a helpline' })).toBeTruthy();
    open.mockRestore();
  });

  it('offers Block and Leave group on the done screen, one tap each', async () => {
    const client = fakeClient({
      'POST /reports': ok(receipt()),
      'POST /friends/u3/block': ok({ blocked: true }),
      'POST /groups/g1/leave': ok({ ok: true }),
    });
    testAuth.client = client;
    const onBlocked = vi.fn();
    const onLeftGroup = vi.fn();
    renderWithProviders(
      <ReportSheet
        visible
        target={{ type: 'group_message', messageId: 'm9' }}
        blockable={{ userId: 'u3', name: 'Azad' }}
        leavable={{ groupId: 'g1', name: 'Newroz club' }}
        onClose={() => undefined}
        onBlocked={onBlocked}
        onLeftGroup={onLeftGroup}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Scam or spam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Block Azad' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Block Azad' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Blocked' })).toBeTruthy());
    expect(onBlocked).toHaveBeenCalledWith('u3');

    fireEvent.click(screen.getByRole('button', { name: 'Leave Newroz club' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'You left the group' })).toBeTruthy());
    expect(onLeftGroup).toHaveBeenCalledWith('g1');
  });

  it('says plainly when the daily limit is reached, and keeps the note', async () => {
    testAuth.client = fakeClient({ 'POST /reports': fail({ code: 'REPORT_LIMIT', status: 429, kind: 'rate_limited' }) });
    renderWithProviders(<ReportSheet visible target={{ type: 'library_post', postId: 'p1' }} onClose={() => undefined} />);
    expect(screen.getByText('Report this post')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Something else' }));
    fireEvent.change(screen.getByLabelText('Anything else we should know? (optional)'), { target: { value: 'odd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() =>
      expect(screen.getByText('You’ve sent a lot of reports today. Please try again tomorrow.')).toBeTruthy(),
    );
    expect((screen.getByLabelText('Anything else we should know? (optional)') as HTMLTextAreaElement).value).toBe('odd');
  });

  it('says in words, not the server’s, that your own cannot be reported', async () => {
    testAuth.client = fakeClient({ 'POST /reports': fail({ code: 'SELF_REPORT', status: 400, message: 'you cannot report yourself' }) });
    renderWithProviders(<ReportSheet visible target={{ type: 'group', groupId: 'g1' }} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Scam or spam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('This is yours, so it can’t be reported.')).toBeTruthy();
    expect(screen.queryByText('you cannot report yourself')).toBeNull();
  });

  it('starts again when it is opened again', () => {
    testAuth.client = fakeClient();
    const { rerender } = renderWithProviders(
      <ReportSheet visible target={{ type: 'group', groupId: 'g1' }} onClose={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Something else' }));
    expect(screen.getByText('You chose: Something else')).toBeTruthy();
    rerender(<ReportSheet visible={false} target={{ type: 'group', groupId: 'g1' }} onClose={() => undefined} />);
    rerender(<ReportSheet visible target={{ type: 'group', groupId: 'g1' }} onClose={() => undefined} />);
    expect(screen.getByText('What’s wrong?')).toBeTruthy();
  });
});

describe('PlayerReportButton', () => {
  it('reports a player of a finished game by seat, with no Block for an account it never knew', async () => {
    const client = fakeClient({ 'POST /reports': ok(receipt({ report: { ...receipt().report, targetType: 'game_player' } })) });
    testAuth.client = client;
    renderWithProviders(<PlayerReportButton game="rhyme-match" gameId="m1" seat={2} name={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Report Player 2' }));
    expect(screen.getByText('Report Player 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bullying or harassment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Thanks for telling us')).toBeTruthy();
    expect(client.calls.find((c) => c.path === '/reports')?.body).toEqual({
      targetType: 'game_player',
      targetId: 'm1',
      game: 'rhyme-match',
      seat: 2,
      category: 'harassment',
    });
    expect(screen.queryByRole('button', { name: /^Block/ })).toBeNull();
  });
});

describe('requestFor', () => {
  it('names a game player by game and seat, never by account', () => {
    expect(requestFor({ type: 'game_player', game: 'wordle-battle', gameId: 'b1', seat: 2 }, 'harassment', '')).toEqual({
      targetType: 'game_player',
      targetId: 'b1',
      game: 'wordle-battle',
      seat: 2,
      category: 'harassment',
    });
  });

  it('maps each target to its type and id', () => {
    expect(requestFor({ type: 'image_comment', commentId: 'c1' }, 'spam', ' x ')).toEqual({
      targetType: 'image_comment',
      targetId: 'c1',
      category: 'spam',
      note: 'x',
    });
    expect(requestFor({ type: 'group', groupId: 'g' }, 'hate', '').targetType).toBe('group');
  });
});
