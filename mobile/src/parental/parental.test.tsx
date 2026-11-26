// @vitest-environment jsdom
/** Parental controls on the phone: every side of it, the code that connects a parent and a teen, and the pause. */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import { OPEN_CONTROLS, type SupervisionState } from '@kurda/shared';
import { describeError } from '../api/errors';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { clipboardStub } from '../reports/testing/stubs';
import { navigation } from '../play/testing/navigation';
import { TRANSLATIONS } from '../i18n/translations';
import { interpolate } from '../i18n/format';
import { noteCurrentRoute } from '../navigation/currentRoute';
import { noticeKind, resolveDeepLink } from '../notifications/inbox';
import { notificationText } from '../notifications/followLink';
import { SettingsPageScreen } from '../settings/SettingsPageScreen';
import { CODE_POLL_MS } from './CodePage';
import { bedtimeLabel, durationLabel, formatClock, shownParentCode, typedParentCode, weekSummary } from './format';
import { forgetParentalOverview } from './overview';
import { ParentalNote, ParentalWall } from './ParentalNote';
import { noteParentalRefusal } from './refusals';
import { PauseHost } from './PauseScreen';
import { SupervisionProvider, useParentalOff } from './supervision';
import { forgetTeens, loosens } from './teen';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));

patchReactNativeWeb({ reduceMotion: true });

const t = (key: keyof typeof TRANSLATIONS.en, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.en[key], vars);
const ME = { ...testAuth.user };
const page = (name: Parameters<typeof SettingsPageScreen>[0]['page'], teenId?: string) =>
  renderWithProviders(<SettingsPageScreen page={name} teenId={teenId} onExit={() => undefined} />);
const person = (userId: string, displayName: string) => ({ userId, username: displayName.toLowerCase(), displayName, avatarUrl: null });
const SINCE = '2026-09-01T10:00:00.000Z';
/** The spaces Intl puts in a time ("9:00 PM" with a narrow one), as plain spaces. */
const plain = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

beforeEach(() => {
  forgetParentalOverview();
  forgetTeens();
  navigation.navigate.mockClear();
  navigation.replace.mockClear();
  navigation.goBack.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  testAuth.user = ME;
  noteCurrentRoute(undefined);
});

describe('parental controls in words', () => {
  it('draws a code as two groups of four as it is typed or pasted, forgiving case, spaces and dashes', () => {
    expect(shownParentCode(typedParentCode('abcd'))).toBe('ABCD');
    expect(shownParentCode(typedParentCode('abcde'))).toBe('ABCD-E');
    expect(shownParentCode(typedParentCode(' abcd efgh '))).toBe('ABCD-EFGH');
    expect(shownParentCode(typedParentCode('ABCD-EFGH-XYZ'))).toBe('ABCD-EFGH');
    // Deleting the dash takes the field back to the first group.
    expect(shownParentCode(typedParentCode('ABCD-'))).toBe('ABCD');
  });

  it('says times in the reader’s clock, and a week in one line', () => {
    expect(formatClock('21:00', 'de')).toBe('21:00');
    expect(plain(bedtimeLabel({ from: '21:00', to: '07:00' }, t, 'en'))).toBe('9:00 PM–7:00 AM');
    expect(bedtimeLabel(null, t, 'en')).toBe('None');
    expect(durationLabel(45, t)).toBe('45 min');
    expect(durationLabel(120, t)).toBe('2 h');
    expect(durationLabel(85, t)).toBe('1 h 25 min');
    const week = [10, 20, 0, 15, 25, 5, 10].map((minutes, i) => ({ day: `2026-11-1${i + 2}`, minutes, lessons: i === 2 ? 0 : 1 + (i % 2), xp: 40 * (i % 2) }));
    expect(weekSummary(week, t)).toBe('1 h 25 min · 9 lessons · 120 XP');
  });

  it('turns the server’s parental refusals into calm sentences', () => {
    const said = (code: string) => describeError({ kind: 'client', code, message: 'refused', status: 403 }, t);
    expect(said('PARENTAL_BLOCKED')).toBe('Your parent turned this off.');
    expect(said('PARENTAL_PAUSED')).toBe('Hevalo is resting right now.');
    expect(said('PARENT_CODE_INVALID')).toBe('That code doesn’t work. Check it, or ask your parent for a new one.');
    expect(said('PARENTAL_TOO_MANY_PARENTS')).toBe('You already have two parents connected.');
    // A parent who may not add a teen yet is told what would let them.
    const notParent = (reason: string) => describeError({ kind: 'client', code: 'PARENTAL_NOT_PARENT', message: 'no', status: 403, details: { reason } }, t);
    expect(notParent('email')).toBe('Confirm your email address to look after a teen’s account.');
    expect(notParent('standing')).toBe('Parental controls aren’t available on this account right now.');
  });
});

describe('a teen with no parent yet', () => {
  it('says what a parent could do and see before anything is asked, and opens the code entry', async () => {
    testAuth.client = fakeClient({ 'GET /me/parental': ok({ role: 'teen', parents: [], supervision: null }) });
    page('parental');
    expect(await screen.findByText(t('parental.teen.intro'))).toBeTruthy();
    fireEvent.click(screen.getByTestId('parental-connect'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SettingsPage', { page: 'parentalConnect' });
  });

  it('keeps a wrong code in the field and says so under it, then confirms the right parent by face and name', async () => {
    const client = fakeClient({
      'POST /me/parental/lookup': (body) =>
        (body as { code: string }).code === 'ABCDEFGH'
          ? ok({ parent: person('p1', 'Rojîn') })
          : fail({ code: 'PARENT_CODE_INVALID', status: 404, message: 'no' }),
      'POST /me/parental/connect': ok({
        parents: [{ ...person('p1', 'Rojîn'), since: SINCE }],
        supervision: { controls: OPEN_CONTROLS, minutesToday: 0, timeZone: 'UTC', paused: null, resumesAt: null },
      }),
    });
    testAuth.client = client;
    page('parentalConnect');
    const field = screen.getByTestId('parent-code-input') as HTMLInputElement;
    const go = screen.getByTestId('parent-code-continue');
    expect(go.getAttribute('aria-disabled')).toBe('true');

    fireEvent.change(field, { target: { value: 'abcd ' } });
    fireEvent.change(field, { target: { value: 'ABCD-HJKM' } });
    expect(field.value).toBe('ABCD-HJKM');
    await act(async () => {
      fireEvent.click(go);
    });
    expect((await screen.findByTestId('parent-code-error')).textContent).toBe('That code doesn’t work. Check it, or ask your parent for a new one.');
    expect(field.value).toBe('ABCD-HJKM');

    // Pasted with a space instead of the dash, and the error clears as soon as it changes.
    fireEvent.change(field, { target: { value: 'abcd efgh' } });
    expect(field.value).toBe('ABCD-EFGH');
    expect(screen.queryByTestId('parent-code-error')).toBeNull();
    await act(async () => {
      fireEvent.click(go);
    });
    const sheet = await screen.findByTestId('parent-confirm');
    expect(within(sheet).getByText('Connect to Rojîn?')).toBeTruthy();
    expect(within(sheet).getByText('@rojîn')).toBeTruthy();
    expect(within(sheet).getByText('They never see your messages, letters, posts or friends.')).toBeTruthy();

    await act(async () => {
      fireEvent.click(within(sheet).getByTestId('parent-connect'));
    });
    expect(client.calls.find((c) => c.path === '/me/parental/connect')?.body).toEqual({ code: 'ABCDEFGH' });
    expect((await screen.findByTestId('parental-success')).textContent).toContain('Connected to Rojîn');
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it('never sends a code that cannot be one', async () => {
    const client = fakeClient();
    testAuth.client = client;
    page('parentalConnect');
    // O and 0, I and 1 are left out of every code, so they are not guessed at.
    fireEvent.change(screen.getByTestId('parent-code-input'), { target: { value: 'OOOO0000' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('parent-code-continue'));
    });
    expect(screen.getByTestId('parent-code-error')).toBeTruthy();
    expect(client.calls.some((c) => c.path === '/me/parental/lookup')).toBe(false);
  });
});

describe('a supervised teen', () => {
  const SUPERVISED: SupervisionState = {
    controls: { ...OPEN_CONTROLS, dailyLimitMinutes: 30, bedtime: { from: '21:00', to: '07:00' }, chat: false },
    minutesToday: 12,
    timeZone: 'UTC',
    paused: null,
    resumesAt: null,
  };

  it('reads what was set, as values, and what a parent never sees', async () => {
    testAuth.client = fakeClient({
      'GET /me/parental': ok({ role: 'teen', parents: [{ ...person('p1', 'Rojîn'), since: SINCE }], supervision: SUPERVISED }),
    });
    page('parental');
    expect(await screen.findByText('Rojîn')).toBeTruthy();
    expect(screen.getByText('30 minutes')).toBeTruthy();
    expect(screen.getByText('12 of 30 minutes')).toBeTruthy();
    expect(screen.getByText((text) => plain(text) === '9:00 PM–7:00 AM')).toBeTruthy();
    expect(screen.getByText('Since September 1, 2026')).toBeTruthy();
    expect(screen.getByText('Off: no sending or reading messages and group chats.')).toBeTruthy();
    expect(screen.getByText(t('parental.privacy.teen'))).toBeTruthy();
    // One parent: there is room for another.
    expect(screen.getByRole('button', { name: 'Add another parent' })).toBeTruthy();
  });

  it('marks the first parent, by the server’s word or else by who connected first', async () => {
    testAuth.client = fakeClient({
      'GET /me/parental': ok({
        role: 'teen',
        parents: [
          { ...person('p2', 'Azad'), since: '2026-10-02T10:00:00.000Z' },
          { ...person('p1', 'Rojîn'), since: SINCE },
        ],
        supervision: SUPERVISED,
      }),
    });
    page('parental');
    expect((await screen.findByText(/^First parent · /)).textContent).toBe('First parent · Since September 1, 2026');
    // Two parents is the most there can be.
    expect(screen.queryByRole('button', { name: 'Add another parent' })).toBeNull();
  });

  it('asks to stop a parent’s supervision, which ends a week later, and can stay connected after all', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T10:00:00Z'));
    const ENDS = '2026-12-02T10:00:00.000Z';
    let asked = false;
    const client = fakeClient({
      'GET /me/parental': () => ok({ role: 'teen', parents: [{ ...person('p1', 'Rojîn'), since: SINCE, leaveEndsAt: asked ? ENDS : null }], supervision: SUPERVISED }),
      'POST /me/parental/parents/p1/leave': () => {
        asked = true;
        return ok({ endsAt: ENDS });
      },
      'DELETE /me/parental/parents/p1/leave': () => {
        asked = false;
        return ok({ kept: true });
      },
    });
    testAuth.client = client;
    page('parental');
    fireEvent.click(await screen.findByTestId('parental-leave'));
    const sheet = await screen.findByTestId('parental-leave-sheet');
    expect(within(sheet).getByText('Stop supervision by Rojîn?')).toBeTruthy();
    // Said before anything is sent: the parent is told now, and when it would end.
    expect(within(sheet).getByText(t('parental.leave.body', { name: 'Rojîn', date: 'December 2, 2026' }))).toBeTruthy();
    expect(client.calls.some((c) => c.method === 'POST')).toBe(false);
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId('parental-leave-confirm'));
    });
    expect(client.calls.some((c) => c.method === 'POST' && c.path === '/me/parental/parents/p1/leave')).toBe(true);
    const row = await screen.findByTestId('parental-parent-p1');
    await waitFor(() => expect(within(row).getByText('Ends on December 2, 2026')).toBeTruthy());
    // Nobody is left to ask about, so the row to ask goes.
    expect(screen.queryByTestId('parental-leave')).toBeNull();
    await act(async () => {
      fireEvent.click(within(row).getByTestId('parental-stay-p1'));
    });
    expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/me/parental/parents/p1/leave')).toBe(true);
    await waitFor(() => expect(within(screen.getByTestId('parental-parent-p1')).getByText('Since September 1, 2026')).toBeTruthy());
    expect(screen.getByTestId('parental-leave')).toBeTruthy();
  });

  it('puts a parent back as staying when taking the request back fails, and says so', async () => {
    const client = fakeClient({
      'GET /me/parental': ok({ role: 'teen', parents: [{ ...person('p1', 'Rojîn'), since: SINCE, leaveEndsAt: '2026-12-02T10:00:00.000Z' }], supervision: SUPERVISED }),
      'DELETE /me/parental/parents/p1/leave': fail({ status: 500, message: 'no' }),
    });
    testAuth.client = client;
    page('parental');
    const stay = await screen.findByTestId('parental-stay-p1');
    await act(async () => {
      fireEvent.click(stay);
    });
    expect(within(screen.getByTestId('parental-parent-p1')).getByText('Ends on December 2, 2026')).toBeTruthy();
  });

  it('sees a calm note, with the parental icon, in place of what a parent switched off', () => {
    function Composer(): React.JSX.Element {
      return useParentalOff('chat') ? <ParentalNote /> : <Text>composer</Text>;
    }
    testAuth.client = fakeClient({ 'POST /me/usage': ok(SUPERVISED) });
    testAuth.user = { ...ME, supervision: SUPERVISED };
    renderWithProviders(
      <SupervisionProvider>
        <Composer />
      </SupervisionProvider>,
    );
    expect(screen.getByTestId('parental-note').textContent).toBe('Your parent turned this off.');
    cleanup();
    testAuth.user = ME;
    renderWithProviders(
      <SupervisionProvider>
        <Composer />
      </SupervisionProvider>,
    );
    expect(screen.getByText('composer')).toBeTruthy();
  });
});

describe('the pause', () => {
  const BEDTIME: SupervisionState = {
    controls: { ...OPEN_CONTROLS, bedtime: { from: '21:00', to: '07:00' } },
    minutesToday: 20,
    timeZone: 'UTC',
    paused: 'bedtime',
    resumesAt: '2026-11-25T07:00:00.000Z',
  };

  it('covers the app at bedtime, and waits for a lesson to end', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-24T22:30:00Z'));
    const client = fakeClient({ 'POST /me/usage': ok(BEDTIME) });
    testAuth.client = client;
    testAuth.user = { ...ME, supervision: BEDTIME };
    const open = vi.fn();
    renderWithProviders(
      <SupervisionProvider>
        <PauseHost onOpenControls={open} />
      </SupervisionProvider>,
    );
    const pause = await screen.findByTestId('parental-pause');
    expect(within(pause).getByText('Good night')).toBeTruthy();
    expect(plain(within(pause).getByText(/rest until/).textContent)).toBe('Your parent set Hevalo to rest until 7:00 AM.');
    // A beat once in front, with the phone’s own time zone.
    expect(client.calls.find((c) => c.path === '/me/usage')?.body).toEqual({ timeZone: expect.any(String) });
    fireEvent.click(within(pause).getByTestId('pause-controls'));
    expect(open).toHaveBeenCalledTimes(1);

    // Never over a lesson under way, nor over Parental controls itself.
    act(() => noteCurrentRoute({ name: 'Lesson' }));
    expect(screen.queryByTestId('parental-pause')).toBeNull();
    act(() => noteCurrentRoute({ name: 'SettingsPage', params: { page: 'parental' } }));
    expect(screen.queryByTestId('parental-pause')).toBeNull();
    act(() => noteCurrentRoute({ name: 'Tabs' }));
    expect(screen.getByTestId('parental-pause')).toBeTruthy();
  });

  it('reads the limits again at once when a write meets a parent’s switch', async () => {
    const client = fakeClient({ 'POST /me/usage': ok(BEDTIME) });
    testAuth.client = client;
    testAuth.user = { ...ME, supervision: BEDTIME };
    renderWithProviders(
      <SupervisionProvider>
        <Text>app</Text>
      </SupervisionProvider>,
    );
    await waitFor(() => expect(client.calls.filter((c) => c.path === '/me/usage')).toHaveLength(1));
    await act(async () => noteParentalRefusal());
    expect(client.calls.filter((c) => c.path === '/me/usage')).toHaveLength(2);
    // An account the app did not know was supervised is read again instead.
    cleanup();
    testAuth.user = ME;
    vi.mocked(testAuth.refreshUser).mockClear();
    renderWithProviders(
      <SupervisionProvider>
        <Text>app</Text>
      </SupervisionProvider>,
    );
    await act(async () => noteParentalRefusal());
    expect(testAuth.refreshUser).toHaveBeenCalledTimes(1);
  });

  it('lifts as soon as a beat says supervision has ended, and beats no more', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-24T22:30:00Z'));
    const client = fakeClient({ 'POST /me/usage': ok(undefined) });
    testAuth.client = client;
    testAuth.user = { ...ME, supervision: BEDTIME };
    renderWithProviders(
      <SupervisionProvider>
        <PauseHost onOpenControls={() => undefined} />
      </SupervisionProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('parental-pause')).toBeNull());
    expect(client.calls.filter((c) => c.path === '/me/usage')).toHaveLength(1);
  });

  it('shows a child’s profile the resting screen when the server says Hevalo is resting, though the phone’s numbers said not yet', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-24T16:00:00Z'));
    const nearly: SupervisionState = { controls: { ...OPEN_CONTROLS, dailyLimitMinutes: 30 }, minutesToday: 28, timeZone: 'UTC', paused: null, resumesAt: null };
    const used: SupervisionState = { ...nearly, minutesToday: 30, paused: 'limit', resumesAt: '2026-11-25T00:00:00.000Z' };
    let beats = 0;
    testAuth.client = fakeClient({ 'POST /me/usage': () => ok(++beats === 1 ? nearly : used) });
    testAuth.user = { ...ME, kind: 'child', supervision: nearly } as typeof ME;
    renderWithProviders(
      <SupervisionProvider>
        <PauseHost onOpenControls={() => undefined} />
      </SupervisionProvider>,
    );
    await waitFor(() => expect(beats).toBe(1));
    expect(screen.queryByTestId('parental-pause')).toBeNull();
    // what the API client does on 403 PARENTAL_PAUSED from a lesson, a game or a story (api/client.ts `onParental`)
    await act(async () => noteParentalRefusal());
    const pause = await screen.findByTestId('parental-pause');
    expect(within(pause).getByText('Time for a break')).toBeTruthy();
  });

  it('says how much of the day was used, and when Hevalo opens again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-24T16:00:00Z'));
    const used: SupervisionState = {
      controls: { ...OPEN_CONTROLS, dailyLimitMinutes: 30 },
      minutesToday: 30,
      timeZone: 'UTC',
      paused: 'limit',
      resumesAt: '2026-11-25T00:00:00.000Z',
    };
    testAuth.client = fakeClient({ 'POST /me/usage': ok(used) });
    testAuth.user = { ...ME, supervision: used };
    renderWithProviders(
      <SupervisionProvider>
        <PauseHost onOpenControls={() => undefined} />
      </SupervisionProvider>,
    );
    const pause = await screen.findByTestId('parental-pause');
    expect(within(pause).getByText('Time for a break')).toBeTruthy();
    expect(within(pause).getByText('You’ve used today’s 30 minutes. Hevalo opens again at midnight.')).toBeTruthy();
  });
});

describe('a parent', () => {
  const TEENS = [
    { teen: person('t1', 'Berfîn'), since: SINCE, today: { minutes: 12, lessons: 2 } },
    { teen: person('t2', 'Dilan'), since: SINCE, today: { minutes: 0, lessons: 1 } },
  ];

  it('sees each teen with today’s numbers, and adds another from a fresh code', async () => {
    testAuth.client = fakeClient({ 'GET /me/parental': ok({ role: 'parent', teens: TEENS }) });
    page('parental');
    const first = await screen.findByTestId('parental-teen-t1');
    expect(first.getAttribute('aria-label')).toBe('Berfîn, Today: 12 min · 2 lessons');
    expect(screen.getByTestId('parental-teen-t2').getAttribute('aria-label')).toBe('Dilan, Today: 0 min · 1 lesson');
    fireEvent.click(first);
    expect(navigation.navigate).toHaveBeenLastCalledWith('SettingsPage', { page: 'parentalTeen', teenId: 't1' });
    fireEvent.click(screen.getByTestId('parental-add-teen'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SettingsPage', { page: 'parentalCode' });
  });

  it('says first, for a teen who asked to stop, the day it ends', async () => {
    testAuth.client = fakeClient({ 'GET /me/parental': ok({ role: 'parent', teens: [{ ...TEENS[0], leaveEndsAt: '2026-12-02T10:00:00.000Z' }] }) });
    page('parental');
    expect((await screen.findByTestId('parental-teen-t1')).getAttribute('aria-label')).toBe('Berfîn, Leaving on December 2, 2026\nToday: 12 min · 2 lessons');
  });

  it('with no teen yet, says what it is for and offers to add one', async () => {
    testAuth.client = fakeClient({ 'GET /me/parental': ok({ role: 'parent', teens: [] }) });
    page('parental');
    expect(await screen.findByText(t('parental.parent.intro'))).toBeTruthy();
    expect(screen.getByTestId('parental-add-teen')).toBeTruthy();
  });

  it('shows a fresh code to read across a room, copies it, and opens the teen’s page once they use it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let reads = 0;
    const client = fakeClient({
      'POST /me/parental/code': ok({ code: 'ABCDEFGH', expiresAt: '2026-11-25T10:00:00.000Z' }),
      'GET /me/parental': () => {
        reads += 1;
        return ok({ role: 'parent', teens: reads < 2 ? TEENS.slice(1) : TEENS });
      },
    });
    testAuth.client = client;
    clipboardStub.text = null;
    page('parentalCode');
    expect((await screen.findByTestId('parent-code')).textContent).toBe('ABCD-EFGH');
    expect(screen.getByText('Works for 24 hours, once.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(clipboardStub.text).toBe('ABCD-EFGH');

    await act(async () => {
      vi.advanceTimersByTime(CODE_POLL_MS);
    });
    expect((await screen.findByTestId('parental-success')).textContent).toContain('Berfîn is connected');
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('SettingsPage', { page: 'parentalTeen', teenId: 't1' }), { timeout: 3000 });
  });

  it('says so in the parent’s own words when five teens is the most there can be', async () => {
    testAuth.client = fakeClient({
      'POST /me/parental/code': fail({ code: 'PARENTAL_PARENT_FULL', status: 409 }),
      'GET /me/parental': ok({ role: 'parent', teens: TEENS }),
    });
    page('parentalCode');
    expect(await screen.findByText('You’re looking after five teens, the most one account can.')).toBeTruthy();
    expect(screen.queryByText('Waiting for your teen…')).toBeNull();
  });

  it('makes a new code on request, which replaces the one shown', async () => {
    let made = 0;
    testAuth.client = fakeClient({
      'POST /me/parental/code': () => {
        made += 1;
        return ok({ code: made === 1 ? 'ABCDEFGH' : 'HJKMNPQR', expiresAt: '2026-11-25T10:00:00.000Z' });
      },
      'GET /me/parental': ok({ role: 'parent', teens: [] }),
    });
    page('parentalCode');
    await screen.findByText('ABCD-EFGH');
    await act(async () => {
      fireEvent.click(screen.getByTestId('parent-code-new'));
    });
    expect(await screen.findByText('HJKM-NPQR')).toBeTruthy();
  });
});

describe('a second parent', () => {
  it('may tighten but never loosen, as the server allows', () => {
    expect(loosens('chat', false, true)).toBe(true);
    expect(loosens('chat', true, false)).toBe(false);
    expect(loosens('dailyLimitMinutes', 30, 45)).toBe(true);
    expect(loosens('dailyLimitMinutes', 30, null)).toBe(true);
    expect(loosens('dailyLimitMinutes', 30, 15)).toBe(false);
    expect(loosens('dailyLimitMinutes', null, 120)).toBe(false);
    expect(loosens('bedtime', { from: '21:00', to: '07:00' }, { from: '22:00', to: '07:00' })).toBe(true);
    expect(loosens('bedtime', { from: '21:00', to: '07:00' }, null)).toBe(true);
    expect(loosens('bedtime', { from: '21:00', to: '07:00' }, { from: '20:00', to: '07:00' })).toBe(false);
    expect(loosens('bedtime', null, { from: '23:00', to: '07:00' })).toBe(false);
  });

  const SECOND = {
    teen: person('t1', 'Berfîn'),
    since: SINCE,
    controls: { ...OPEN_CONTROLS, dailyLimitMinutes: 45, games: false },
    week: [],
    streak: 0,
    parents: [{ ...person('p0', 'Rojîn'), first: true }, person('me', 'Rojda')],
    canLoosen: false,
    timeZone: 'Europe/Berlin',
  };

  it('sees what only the first parent can loosen held back, says who can, and where the teen’s day is counted', async () => {
    testAuth.client = fakeClient({ 'GET /me/parental/teens/t1': ok(SECOND) });
    page('parentalTeen', 't1');
    // An open part can be closed; a closed one only the first parent can open again.
    expect((await screen.findByRole('switch', { name: 'Chat' })).getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.getByRole('switch', { name: 'Online games' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getAllByText('Only Rojîn can turn these back on or loosen them.')).toHaveLength(2);
    expect(screen.getByText('First parent')).toBeTruthy();
    expect(screen.getByTestId('teen-zone').textContent).toContain('Berlin');
    cleanup();
    page('parentalLimit', 't1');
    const group = await screen.findByRole('radiogroup', { name: 'Daily limit' });
    const disabled = within(group)
      .getAllByRole('radio')
      .filter((r) => r.getAttribute('aria-disabled') === 'true')
      .map((r) => r.getAttribute('aria-label'));
    expect(disabled).toEqual(['No limit', '60 minutes', '90 minutes', '120 minutes']);
  });

  it('puts a loosening back when the server says it is the first parent’s, and says whose', async () => {
    const said = describeError(
      { kind: 'client', code: 'PARENTAL_FIRST_PARENT_ONLY', status: 403, message: 'no', details: { parent: { displayName: 'Rojîn', username: 'rojin' } } },
      t,
    );
    expect(said).toBe('Only Rojîn can turn these back on or loosen them.');
    // A page that still thought this parent could loosen: the change shows, then goes back.
    const client = fakeClient({
      'GET /me/parental/teens/t1': ok({ ...SECOND, canLoosen: true }),
      'PATCH /me/parental/teens/t1/controls': fail({ code: 'PARENTAL_FIRST_PARENT_ONLY', status: 403, details: { parent: { ...person('p0', 'Rojîn') } } }),
    });
    testAuth.client = client;
    page('parentalTeen', 't1');
    const games = await screen.findByRole('switch', { name: 'Online games' });
    await act(async () => {
      fireEvent.click(games);
    });
    expect(client.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ games: true });
    expect(screen.getByRole('switch', { name: 'Online games' }).getAttribute('aria-checked')).toBe('false');
  });
});

describe('a teen’s page, for their parent', () => {
  const DETAIL = {
    teen: person('t1', 'Berfîn'),
    since: SINCE,
    controls: { ...OPEN_CONTROLS, dailyLimitMinutes: 45 },
    week: [10, 20, 0, 15, 25, 5, 10].map((minutes, i) => ({ day: `2026-11-${18 + i}`, minutes, lessons: i === 2 ? 0 : 1 + (i % 2), xp: 40 })),
    streak: 6,
    parents: [person('me', 'Rojda')],
  };

  it('shows the week in bars and one line, and the two times', async () => {
    testAuth.client = fakeClient({ 'GET /me/parental/teens/t1': ok(DETAIL) });
    page('parentalTeen', 't1');
    expect((await screen.findByTestId('teen-week-summary')).textContent).toBe('1 h 25 min · 9 lessons · 280 XP');
    // The streak as the teen's own card says it, with no hyphen.
    expect(screen.getByTestId('teen-streak').getAttribute('aria-label')).toBe('6 day streak');
    // Each day is read out with its numbers; the bars themselves are only drawn.
    expect(screen.getByLabelText('Sunday: 25 minutes, 1 lesson')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Daily limit, 45 minutes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bedtime, None' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('teen-bedtime'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SettingsPage', { page: 'parentalBedtime', teenId: 't1' });
  });

  it('turns a part off at once, and puts it back when the server refuses', async () => {
    let answer: (r: unknown) => void = () => undefined;
    const client = fakeClient({
      'GET /me/parental/teens/t1': ok(DETAIL),
      'PATCH /me/parental/teens/t1/controls': () => new Promise((resolve) => (answer = resolve)),
    } as never);
    testAuth.client = client;
    page('parentalTeen', 't1');
    const chat = await screen.findByRole('switch', { name: 'Chat' });
    expect(chat.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(chat);
    expect(chat.getAttribute('aria-checked')).toBe('false');
    expect(client.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ chat: false });
    await act(async () => answer({ ok: false, error: { kind: 'server', status: 500, message: 'no' } }));
    expect(screen.getByRole('switch', { name: 'Chat' }).getAttribute('aria-checked')).toBe('true');
  });

  it('chooses a daily limit from the allowed ones', async () => {
    const client = fakeClient({
      'GET /me/parental/teens/t1': ok(DETAIL),
      'PATCH /me/parental/teens/t1/controls': ok({ controls: { ...DETAIL.controls, dailyLimitMinutes: 30 } }),
    });
    testAuth.client = client;
    page('parentalLimit', 't1');
    const group = await screen.findByRole('radiogroup', { name: 'Daily limit' });
    expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
      'No limit',
      '15 minutes',
      '30 minutes',
      '45 minutes',
      '60 minutes',
      '90 minutes',
      '120 minutes',
    ]);
    await act(async () => {
      fireEvent.click(within(group).getByRole('radio', { name: '30 minutes' }));
    });
    expect(client.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ dailyLimitMinutes: 30 });
    expect(within(group).getByRole('radio', { name: '30 minutes' }).getAttribute('aria-checked')).toBe('true');
  });

  it('says at the top that the teen asked to stop, and lets them go now', async () => {
    const client = fakeClient({
      'GET /me/parental/teens/t1': ok({ ...DETAIL, leaveEndsAt: '2026-12-02T10:00:00.000Z' }),
      'DELETE /me/parental/teens/t1': ok({ ended: true }),
    });
    testAuth.client = client;
    page('parentalTeen', 't1');
    const note = await screen.findByTestId('teen-leaving');
    expect(within(note).getByText('Berfîn asked to stop supervision. It ends on December 2, 2026.')).toBeTruthy();
    fireEvent.click(within(note).getByTestId('teen-let-go'));
    const sheet = await screen.findByTestId('teen-stop-sheet');
    expect(within(sheet).getByText(t('parental.stop.body', { name: 'Berfîn' }))).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId('teen-stop-confirm'));
    });
    expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/me/parental/teens/t1')).toBe(true);
  });

  it('lets the first parent correct the birth month once, to one that keeps the teen 13 to 17', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T10:00:00Z'));
    const client = fakeClient({
      'GET /me/parental/teens/t1': ok({ ...DETAIL, birthMonth: { year: 2011, month: 3 }, birthCorrectable: true }),
      'PUT /me/parental/teens/t1/birth-month': ok({ birthMonth: { year: 2011, month: 4 }, birthCorrectable: false }),
    });
    testAuth.client = client;
    page('parentalTeen', 't1');
    fireEvent.click(await screen.findByRole('button', { name: 'Birth month, March 2011' }));
    const sheet = await screen.findByTestId('teen-birth-sheet');
    // The years on offer are the ones that keep the teen 13 to 17.
    expect(within(within(sheet).getByTestId('teen-birth-years')).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
      '2013',
      '2012',
      '2011',
      '2010',
      '2009',
      '2008',
    ]);
    const save = within(sheet).getByTestId('teen-birth-save');
    expect(save.getAttribute('aria-disabled')).toBe('true');
    // A month and year that would make them an adult is said at once, and never sent.
    fireEvent.click(within(sheet).getByRole('radio', { name: 'January' }));
    fireEvent.click(within(sheet).getByRole('radio', { name: '2008' }));
    await act(async () => {
      fireEvent.click(save);
    });
    expect(within(sheet).getByText(t('parental.birth.adult', { name: 'Berfîn' }))).toBeTruthy();
    expect(client.calls.some((c) => c.method === 'PUT')).toBe(false);
    fireEvent.click(within(sheet).getByRole('radio', { name: 'April' }));
    fireEvent.click(within(sheet).getByRole('radio', { name: '2011' }));
    await act(async () => {
      fireEvent.click(save);
    });
    expect(client.calls.find((c) => c.method === 'PUT')?.body).toEqual({ birthYear: 2011, birthMonth: 4 });
    const row = await screen.findByTestId('teen-birth');
    expect(within(row).getByText('April 2011')).toBeTruthy();
    expect(within(row).getByText('Already corrected')).toBeTruthy();
  });

  it('shows another parent the birth month, and who alone can correct it', async () => {
    testAuth.client = fakeClient({
      'GET /me/parental/teens/t1': ok({
        ...DETAIL,
        parents: [{ ...person('p0', 'Rojîn'), first: true }, person('me', 'Rojda')],
        canLoosen: false,
        birthMonth: { year: 2011, month: 3 },
        birthCorrectable: false,
      }),
    });
    page('parentalTeen', 't1');
    const row = await screen.findByTestId('teen-birth');
    expect(within(row).getByText('Only Rojîn can correct this')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Birth month, March 2011' })).toBeNull();
  });

  it('stops supervising only once asked, and goes back to the list', async () => {
    const client = fakeClient({ 'GET /me/parental/teens/t1': ok(DETAIL), 'DELETE /me/parental/teens/t1': ok({ ended: true }) });
    testAuth.client = client;
    page('parentalTeen', 't1');
    fireEvent.click(await screen.findByTestId('teen-stop'));
    const sheet = await screen.findByTestId('teen-stop-sheet');
    expect(within(sheet).getByText('Stop supervising Berfîn?')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId('teen-stop-confirm'));
    });
    expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/me/parental/teens/t1')).toBe(true);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});

describe('parental news in the notifications', () => {
  it('opens the teen it is about for their parent, and the parental page for the teen and for an ending', () => {
    const teenPage = { screen: 'SettingsPage', params: { page: 'parentalTeen', teenId: 't1' } };
    expect(resolveDeepLink({ kind: 'parental_connected', teenId: 't1' })).toEqual(teenPage);
    expect(resolveDeepLink({ kind: 'parental_parent_added', teenId: 't1' })).toEqual(teenPage);
    expect(resolveDeepLink({ kind: 'parental_zone', teenId: 't1', timeZone: 'Europe/Berlin' })).toEqual(teenPage);
    expect(resolveDeepLink({ kind: 'parental_changed', to: 'parent', teenId: 't1' })).toEqual(teenPage);
    // The teen's own news names them too, but opens their own page, never a parent's view of them.
    expect(resolveDeepLink({ kind: 'parental_changed', to: 'teen', teenId: 't1' })).toEqual({ screen: 'SettingsPage', params: { page: 'parental' } });
    expect(resolveDeepLink({ kind: 'parental_ended', teenId: 't1' })).toEqual({ screen: 'SettingsPage', params: { page: 'parental' } });
    // A teen asking to stop, or staying, is news to their parent; a corrected birth month to whoever it went to.
    expect(resolveDeepLink({ kind: 'parental_leave', state: 'asked', teenId: 't1' })).toEqual(teenPage);
    expect(resolveDeepLink({ kind: 'parental_leave', state: 'kept', teenId: 't1' })).toEqual(teenPage);
    expect(resolveDeepLink({ kind: 'parental_birth', to: 'parent', teenId: 't1' })).toEqual(teenPage);
    expect(resolveDeepLink({ kind: 'parental_birth', to: 'teen', teenId: 't1' })).toEqual({ screen: 'SettingsPage', params: { page: 'parental' } });
  });

  it('says in the reader’s language that a teen asked to stop, stayed, or had their birth month corrected', () => {
    const de = (key: keyof typeof TRANSLATIONS.de, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.de[key], vars);
    const item = (data: Record<string, unknown>) => ({ title: 'English title', body: 'English body', data, category: 'friends' });
    const said = (data: Record<string, unknown>) => notificationText(item(data), de, 'de');
    expect(noticeKind(item({ kind: 'parental_leave' })).icon).toBe('parental');
    expect(noticeKind(item({ kind: 'parental_birth' })).icon).toBe('parental');
    expect(said({ kind: 'parental_leave', state: 'asked', teenName: 'Berfîn', endsAt: '2026-12-02T10:00:00.000Z' })).toEqual({
      title: de('parental.notice.leave', { name: 'Berfîn' }),
      body: de('parental.notice.leave.body', { date: '2. Dezember 2026' }),
    });
    expect(said({ kind: 'parental_leave', state: 'kept', teenName: 'Berfîn' })).toEqual({ title: de('parental.notice.kept', { name: 'Berfîn' }), body: '' });
    expect(said({ kind: 'parental_birth', to: 'teen', parentName: 'Rojîn', birthYear: '2011', birthMonth: '4' })).toEqual({
      title: de('parental.notice.birth', { name: 'Rojîn', month: 'April 2011' }),
      body: de('parental.notice.birth.body'),
    });
    expect(said({ kind: 'parental_birth', to: 'parent', parentName: 'Rojîn', teenName: 'Berfîn', birthYear: '2011', birthMonth: '4' }).title).toBe(
      de('parental.notice.birthFor', { parent: 'Rojîn', teen: 'Berfîn', month: 'April 2011' }),
    );
    // The teen whose own request ran its days is told which parent it was, not that the parent stopped.
    expect(said({ kind: 'parental_ended', by: 'teen', parentName: 'Rojîn' }).title).toBe(de('parental.notice.endedLeft', { name: 'Rojîn' }));
  });

  it('wears the parental glyph, and is worded for whoever reads it', () => {
    const de = (key: keyof typeof TRANSLATIONS.de, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.de[key], vars);
    const item = (data: Record<string, unknown>) => ({ title: 'English title', body: 'English body', data, category: 'friends' });
    expect(noticeKind(item({ kind: 'parental_zone' })).icon).toBe('parental');
    const said = (data: Record<string, unknown>) => notificationText(item(data), de, 'de').body;
    expect(said({ kind: 'parental_changed', to: 'teen', parentName: 'Rojîn', teenName: 'Berfîn' })).toBe('Rojîn hat deine Einstellungen geändert.');
    expect(said({ kind: 'parental_changed', to: 'parent', parentName: 'Rojîn', teenName: 'Berfîn' })).toBe('Rojîn hat die Einstellungen von Berfîn geändert.');
    expect(said({ kind: 'parental_ended', by: 'age', teenName: 'Berfîn' })).toBe('Die Elternkontrolle ist beendet, weil Berfîn jetzt 18 ist.');
    expect(said({ kind: 'parental_ended', by: 'account', parentName: 'Rojîn' })).toBe('Die Elternkontrolle mit Rojîn ist beendet.');
    expect(said({ kind: 'parental_parent_added', parentName: 'Rojîn', teenName: 'Berfîn' })).toBe('Rojîn begleitet jetzt auch Berfîn.');
    expect(said({ kind: 'parental_zone', teenName: 'Berfîn', timeZone: 'America/New_York' })).toBe('Die Zeitzone von Berfîn ist jetzt New York.');
    // English readers keep the server's own line.
    expect(notificationText(item({ kind: 'parental_zone', teenName: 'Berfîn', timeZone: 'Europe/Berlin' }), t, 'en').body).toBe('English body');
  });
});

describe('a place a parent switched off', () => {
  it('is one calm page instead of the screen, which is never drawn and so asks for nothing', () => {
    const off: SupervisionState = { controls: { ...OPEN_CONTROLS, chat: false }, minutesToday: 0, timeZone: 'UTC', paused: null, resumesAt: null };
    testAuth.client = fakeClient({ 'POST /me/usage': ok(off) });
    testAuth.user = { ...ME, supervision: off };
    const drawn = vi.fn(() => <Text>messages</Text>);
    function Messages(): React.JSX.Element {
      return drawn();
    }
    renderWithProviders(
      <SupervisionProvider>
        <ParentalWall part="chat" onBack={() => undefined}>
          <Messages />
        </ParentalWall>
      </SupervisionProvider>,
    );
    expect(screen.getByTestId('parental-wall-chat').textContent).toContain('Your parent turned this off.');
    expect(drawn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Parental controls' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('SettingsPage', { page: 'parental' });
  });
});

describe('an account parental controls are not for yet', () => {
  it('says why in one line, with the one way on', async () => {
    testAuth.client = fakeClient({ 'GET /me/parental': ok({ role: 'none', reason: 'birth_month' }) });
    page('parental');
    expect(await screen.findByText('Add your birth month to use parental controls.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add your birth month' })).toBeTruthy();
    cleanup();
    forgetParentalOverview();
    testAuth.client = fakeClient({ 'GET /me/parental': ok({ role: 'none', reason: 'standing' }) });
    page('parental');
    expect(await screen.findByText('Parental controls aren’t available on this account right now.')).toBeTruthy();
  });
});
