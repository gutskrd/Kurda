import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OPEN_CONTROLS, type ParentalControls } from '@kurda/shared';
import { Settings } from '../pages/Settings';
import { renderApp, jsonResponse } from '../test/utils';
import { describeError } from '../lib/api';
import { en } from '../i18n/en';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

const person = (userId: string, username: string, displayName: string | null = null) => ({ userId, username, displayName, avatarUrl: null });
const account = (over: Record<string, unknown> = {}) => ({
  user: {
    id: 'me', email: 'a@b.com', username: 'ada', displayName: 'Ada', emailVerified: true, bio: null, xp: 0,
    streak: { current: 0, longest: 0, freezes: 0, lastActiveOn: null }, profileVisibility: 'members', profilePhotoUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z', ...over,
  },
});
const LIMITED: ParentalControls = { ...OPEN_CONTROLS, dailyLimitMinutes: 30, bedtime: { from: '21:00', to: '07:00' }, letters: false, games: false };

type Answer = { status?: number; body?: unknown } | ((init: RequestInit | undefined, url: string) => Response | Promise<Response>);

/** A fake server by method and path, the longest matching path first, recording what it was sent. */
function server(routes: Record<string, Answer>): ReturnType<typeof vi.fn> {
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = new URL(url).pathname;
    const key = keys.find((k) => {
      const [m, p] = k.split(' ');
      return m === method && (path === p || (p!.endsWith('*') && path.startsWith(p!.slice(0, -1))));
    });
    if (!key) return jsonResponse(200, path === '/me' ? account() : {});
    const answer = routes[key]!;
    if (typeof answer === 'function') return answer(init, url);
    return jsonResponse(answer.status ?? 200, answer.body ?? {});
  });
}

const sent = (fetchMock: ReturnType<typeof vi.fn>, method: string, path: string): unknown[] =>
  fetchMock.mock.calls
    .filter(([url, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === method && new URL(String(url)).pathname === path)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body ?? 'null')));

/** A row of a list, by its title. */
const row = (title: string): HTMLElement => screen.getAllByText(title, { selector: '.settings-row-title' })[0]!.closest('a, button, label, li')! as HTMLElement;

describe('Parental controls: a teen with no parent yet', () => {
  const teen = { role: 'teen', parents: [], supervision: null };

  it('says what a parent could do and see, and connects one with their code, after the teen sees who it is', async () => {
    const supervision = { controls: OPEN_CONTROLS, minutesToday: 0, timeZone: 'Europe/Berlin', paused: null, resumesAt: null };
    const fetchMock = server({
      'GET /me/parental': { body: teen },
      'POST /me/parental/lookup': { body: { parent: person('p1', 'dilan', 'Dilan') } },
      'POST /me/parental/connect': { body: { parents: [{ ...person('p1', 'dilan', 'Dilan'), since: '2026-11-24T10:00:00.000Z' }], supervision } },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/parental']);

    expect(await screen.findByText(en['parental.teen.title'])).toBeInTheDocument();
    expect(screen.getByText(en['parental.teen.body'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: en['parental.connect'] }));

    const field = await screen.findByLabelText(en['parental.code.label']);
    expect(screen.getByText(en['parental.code.hint'])).toBeInTheDocument();
    // Typed as it comes, in any case: two groups of four, the dash added, letters the code never uses dropped.
    await userEvent.type(field, 'kd7m p3qx');
    expect(field).toHaveValue('KD7M-P3QX');
    await userEvent.click(screen.getByRole('button', { name: en['parental.code.continue'] }));

    const sheet = await screen.findByRole('dialog', { name: 'Connect to Dilan?' });
    expect(sent(fetchMock, 'POST', '/me/parental/lookup')).toEqual([{ code: 'KD7MP3QX' }]);
    expect(within(sheet).getByText('@dilan')).toBeInTheDocument();
    expect(within(sheet).getByText(en['parental.confirm.see'])).toBeInTheDocument();
    expect(within(sheet).getByText(en['parental.confirm.never'])).toBeInTheDocument();
    // Nothing is connected until the teen says yes.
    expect(sent(fetchMock, 'POST', '/me/parental/connect')).toEqual([]);
    await userEvent.click(within(sheet).getByRole('button', { name: en['parental.confirm.connect'] }));

    expect(await within(sheet).findByRole('heading', { name: 'You’re connected to Dilan' })).toBeInTheDocument();
    expect(sent(fetchMock, 'POST', '/me/parental/connect')).toEqual([{ code: 'KD7MP3QX' }]);
  });

  it('says under the field when a code does not work, and keeps what was typed', async () => {
    vi.stubGlobal(
      'fetch',
      server({
        'GET /me/parental': { body: teen },
        'POST /me/parental/lookup': { status: 404, body: { code: 'PARENT_CODE_INVALID', message: 'that code doesn’t work' } },
      }),
    );
    renderApp(<Settings />, ['/app/settings/parental/connect']);
    const field = await screen.findByLabelText(en['parental.code.label']);
    await userEvent.type(field, 'ABCDEFGH');
    await userEvent.click(screen.getByRole('button', { name: en['parental.code.continue'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en['error.code.parentCodeInvalid']);
    expect(field).toHaveValue('ABCD-EFGH');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fills the code in from a link that carries it', async () => {
    vi.stubGlobal('fetch', server({ 'GET /me/parental': { body: teen } }));
    renderApp(<Settings />, ['/app/settings/parental?code=kd7m-p3qx']);
    expect(await screen.findByLabelText(en['parental.code.label'])).toHaveValue('KD7M-P3QX');
  });
});

describe('Parental controls: a connected teen', () => {
  const supervision = { controls: LIMITED, minutesToday: 12, timeZone: 'Europe/Berlin', paused: null, resumesAt: null };
  const overview = { role: 'teen', parents: [{ ...person('p1', 'dilan', 'Dilan'), since: '2026-09-02T10:00:00.000Z' }], supervision };

  it('shows the parents and everything they set, read-only, with what they can and cannot see', async () => {
    vi.stubGlobal('fetch', server({ 'GET /me/parental': { body: overview } }));
    renderApp(<Settings />, ['/app/settings/parental']);

    expect(await screen.findByText('Dilan')).toBeInTheDocument();
    expect(screen.getByText('Since September 2, 2026')).toBeInTheDocument();
    expect(row(en['parental.addParent'])).toHaveAttribute('href', '/app/settings/parental/connect');
    expect(within(row(en['parental.limit.title'])).getByText('30 minutes')).toBeInTheDocument();
    expect(screen.getByText('12 of 30 minutes')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: en['parental.today'] })).toHaveAttribute('aria-valuenow', '12');
    expect(within(row(en['parental.bedtime.title'])).getByText('9:00 PM–7:00 AM')).toBeInTheDocument();
    expect(within(row(en['parental.switch.letters'])).getByText(en['settings.off'])).toBeInTheDocument();
    expect(within(row(en['parental.switch.chat'])).getByText(en['settings.on'])).toBeInTheDocument();
    expect(screen.getByText(en['parental.privacy.teen'])).toBeInTheDocument();
    // Read-only: nothing here switches.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('marks the first of two parents, the one who can turn things back on', async () => {
    const two = { ...overview, parents: [...overview.parents, { ...person('p2', 'baran', 'Baran'), since: '2026-10-02T10:00:00.000Z' }] };
    vi.stubGlobal('fetch', server({ 'GET /me/parental': { body: two } }));
    renderApp(<Settings />, ['/app/settings/parental']);
    expect(await screen.findByText('Dilan')).toBeInTheDocument();
    expect(within(row('Dilan')).getByText('First parent · Since September 2, 2026')).toBeInTheDocument();
    expect(within(row('Baran')).getByText('Since October 2, 2026')).toBeInTheDocument();
    // Two is as many as a teen can have.
    expect(screen.queryByText(en['parental.addParent'])).not.toBeInTheDocument();
  });

  it('disconnects a parent only after saying they will be told', async () => {
    const fetchMock = server({ 'GET /me/parental': { body: overview }, 'DELETE /me/parental/parents/p1': { body: { ended: true } } });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/parental']);

    await userEvent.click(await screen.findByRole('button', { name: en['parental.disconnect'] }));
    const sheet = await screen.findByRole('dialog', { name: en['parental.disconnect'] });
    expect(within(sheet).getByText('Dilan will be told.')).toBeInTheDocument();
    expect(sent(fetchMock, 'DELETE', '/me/parental/parents/p1')).toEqual([]);
    await userEvent.click(within(sheet).getByRole('button', { name: en['parental.disconnect.confirm'] }));
    await waitFor(() => expect(sent(fetchMock, 'DELETE', '/me/parental/parents/p1')).toHaveLength(1));
  });
});

describe('Parental controls: a parent', () => {
  const teens = [
    { teen: person('t1', 'roj', 'Roj'), since: '2026-09-02T10:00:00.000Z', today: { minutes: 12, lessons: 2 } },
    { teen: person('t2', 'baran'), since: '2026-10-11T10:00:00.000Z', today: { minutes: 0, lessons: 1 } },
  ];
  const week = [22, 35, 0, 18, 30, 41, 12].map((minutes, i) => ({ day: `2026-11-${18 + i}`, minutes, lessons: 1, xp: 10 }));
  const detail = {
    teen: person('t1', 'roj', 'Roj'),
    since: '2026-09-02T10:00:00.000Z',
    controls: LIMITED,
    week,
    streak: 6,
    parents: [{ ...person('me', 'ada', 'Ada'), first: true }, person('p2', 'dilan', 'Dilan')],
    canLoosen: true,
    timeZone: 'America/New_York',
  };
  /** The same teen seen by their second parent, who may only tighten. */
  const second = { ...detail, parents: [{ ...person('p2', 'dilan', 'Dilan'), first: true }, person('me', 'ada', 'Ada')], canLoosen: false };

  it('lists the teens with today’s learning, each opening their page', async () => {
    vi.stubGlobal('fetch', server({ 'GET /me/parental': { body: { role: 'parent', teens } } }));
    renderApp(<Settings />, ['/app/settings/parental']);

    expect(within(await screen.findByRole('link', { name: /Roj/ })).getByText('Today: 12 min · 2 lessons')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /baran/ })).getByText('Today: 0 min · 1 lesson')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Roj/ })).toHaveAttribute('href', '/app/settings/parental/teen/t1');
    expect(row(en['parental.addTeen'])).toHaveAttribute('href', '/app/settings/parental/add');
  });

  it('makes a code to read out, and opens the teen’s page once they have entered it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let entered = false;
    const fetchMock = server({
      'GET /me/parental': () => jsonResponse(200, { role: 'parent', teens: entered ? teens : teens.slice(1) }),
      'POST /me/parental/code': { body: { code: 'KD7MP3QX', expiresAt: '2026-11-25T10:00:00.000Z' } },
      'GET /me/parental/teens/*': { body: detail },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/parental/add']);

    expect(await screen.findByText('KD7M-P3QX')).toBeInTheDocument();
    expect(screen.getByText(en['parental.code.works'])).toBeInTheDocument();
    // One code for the visit; another only when asked for.
    expect(sent(fetchMock, 'POST', '/me/parental/code')).toHaveLength(1);

    entered = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(await screen.findByText('Roj is connected')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(await screen.findByRole('heading', { name: 'Roj', level: 1 })).toBeInTheDocument();
  });

  it('shows a teen’s week as bars a screen reader can read, with the totals and the streak', async () => {
    // Signed in, so the page knows which of the teen's parents is the reader.
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
    vi.stubGlobal('fetch', server({ 'GET /me/parental': { body: { role: 'parent', teens } }, 'GET /me/parental/teens/t1': { body: detail } }));
    renderApp(<Settings />, ['/app/settings/parental/teen/t1']);

    expect(await screen.findByRole('heading', { name: 'Roj', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('@roj')).toBeInTheDocument();
    expect(screen.getByText('2 h 38 min · 7 lessons · 70 XP')).toBeInTheDocument();
    expect(screen.getByText('6-day streak')).toBeInTheDocument();
    // 24 November 2026 is a Tuesday.
    expect(screen.getByText('Tuesday: 12 min · 1 lesson')).toBeInTheDocument();
    expect(within(row(en['parental.limit.title'])).getByText('30 minutes')).toBeInTheDocument();
    // The teen's time zone, as a place with the time there now.
    expect(within(row(en['parental.timeZone'])).getByText(/^New York · \d{1,2}:\d{2}/)).toBeInTheDocument();
    // Both parents, the reader as You and the first marked, since only they may loosen.
    expect(await within(row(en['parental.you'])).findByText(en['parental.firstParent'])).toBeInTheDocument();
    expect(row('Dilan')).toBeInTheDocument();
    expect(screen.getByText(en['parental.privacy.parentOf'].replace('{name}', 'Roj'))).toBeInTheDocument();
    // The first parent may loosen, so nothing is switched off for them.
    expect(screen.getByRole('checkbox', { name: en['parental.switch.letters'] })).toBeEnabled();
    expect(screen.queryByText(en['parental.firstOnly'].replace('{name}', 'Ada'))).not.toBeInTheDocument();
  });

  it('lets a second parent only tighten: what would loosen is there but switched off, and says who can', async () => {
    vi.stubGlobal('fetch', server({ 'GET /me/parental/teens/t1': { body: second } }));
    const { unmount } = renderApp(<Settings />, ['/app/settings/parental/teen/t1']);

    // Letters is off, so turning it on would loosen; messages is on, and may still be turned off.
    expect(await screen.findByRole('checkbox', { name: en['parental.switch.letters'] })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: en['parental.switch.chat'] })).toBeEnabled();
    expect(screen.getByText('Only Dilan can turn these back on or loosen them.')).toBeInTheDocument();
    unmount();

    renderApp(<Settings />, ['/app/settings/parental/teen/t1/limit']);
    // From 30 minutes: a lower limit tightens, a higher one or none loosens.
    expect(await screen.findByRole('radio', { name: '15 minutes' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: '30 minutes' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '45 minutes' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: en['parental.limit.none'] })).toBeDisabled();
    expect(screen.getByText('Only Dilan can turn these back on or loosen them.')).toBeInTheDocument();
  });

  it('puts a loosening back when the server says only the first parent may, and says who', async () => {
    const fetchMock = server({
      'GET /me/parental/teens/t1': { body: detail },
      'PATCH /me/parental/teens/t1/controls': { status: 403, body: { code: 'PARENTAL_FIRST_PARENT_ONLY', message: 'x', details: { parent: 'Dilan' } } },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/parental/teen/t1']);

    const letters = await screen.findByRole('checkbox', { name: en['parental.switch.letters'] });
    await userEvent.click(letters);
    await waitFor(() => expect(letters).not.toBeChecked());
    expect(await screen.findByText('Only Dilan can turn these back on or loosen them.')).toBeInTheDocument();
  });

  it('says plainly when the teen is no longer connected to the reader', async () => {
    vi.stubGlobal('fetch', server({ 'GET /me/parental/teens/t9': { status: 404, body: { code: 'NOT_FOUND', message: 'not found' } } }));
    renderApp(<Settings />, ['/app/settings/parental/teen/t9']);
    expect(await screen.findByText(en['parental.teenGone'])).toBeInTheDocument();
  });

  it('switches a part of Hevalo at once, and puts it back with a notice when the server refuses', async () => {
    let answer!: (res: Response) => void;
    const fetchMock = server({
      'GET /me/parental/teens/t1': { body: detail },
      'PATCH /me/parental/teens/t1/controls': () => new Promise<Response>((r) => (answer = r)),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/parental/teen/t1']);

    const letters = await screen.findByRole('checkbox', { name: en['parental.switch.letters'] });
    expect(letters).not.toBeChecked();
    await userEvent.click(letters);
    expect(letters).toBeChecked();
    expect(sent(fetchMock, 'PATCH', '/me/parental/teens/t1/controls')).toEqual([{ letters: true }]);
    answer(jsonResponse(503, {}));
    await waitFor(() => expect(letters).not.toBeChecked());
  });

  it('sets the daily limit from its page of choices', async () => {
    let controls = LIMITED;
    const fetchMock = server({
      'GET /me/parental/teens/t1': () => jsonResponse(200, { ...detail, controls }),
      'PATCH /me/parental/teens/t1/controls': (init) => {
        controls = { ...controls, ...JSON.parse(String(init?.body)) };
        return jsonResponse(200, { controls });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/parental/teen/t1/limit']);

    expect(await screen.findByRole('radio', { name: '30 minutes' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: en['parental.limit.none'] }));
    await waitFor(() => expect(sent(fetchMock, 'PATCH', '/me/parental/teens/t1/controls')).toEqual([{ dailyLimitMinutes: null }]));
    // Back on the teen's page, the new value is there at once.
    await userEvent.click(screen.getByRole('link', { name: 'Roj' }));
    expect(await within(row(en['parental.limit.title'])).findByText(en['parental.limit.none'])).toBeInTheDocument();
  });

  it('stops supervising only after a second, plainly worded step', async () => {
    const fetchMock = server({ 'GET /me/parental': { body: { role: 'parent', teens } }, 'GET /me/parental/teens/t1': { body: detail }, 'DELETE /me/parental/teens/t1': { body: { ended: true } } });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/parental/teen/t1']);

    await userEvent.click(await screen.findByRole('button', { name: en['parental.stop'] }));
    const sheet = await screen.findByRole('dialog', { name: 'Stop supervising Roj?' });
    expect(within(sheet).getByText('Their limits are lifted at once, and Roj will be told.')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: en['parental.stop'] }));
    await waitFor(() => expect(sent(fetchMock, 'DELETE', '/me/parental/teens/t1')).toHaveLength(1));
    expect(await screen.findByRole('heading', { name: en['parental.title'], level: 1 })).toBeInTheDocument();
  });
});

describe('Parental controls: neither side', () => {
  it('says why in one line, with the one thing that would change it', async () => {
    vi.stubGlobal('fetch', server({ 'GET /me/parental': { body: { role: 'none', reason: 'birth_month' } } }));
    renderApp(<Settings />, ['/app/settings/parental']);
    expect(await screen.findByText(en['parental.none.birthMonth'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['letters.refusal.birthMonthAction'] })).toBeInTheDocument();
  });

  it('words every parental refusal calmly', () => {
    const t = (key: string): string => (en as Record<string, string>)[key] ?? key;
    const said = (code: string): string => describeError({ kind: 'client', status: 403, code, message: 'server words' }, t as never);
    expect(said('PARENTAL_BLOCKED')).toBe('Your parent turned this off.');
    expect(said('PARENTAL_PAUSED')).toBe('Hevalo is resting right now.');
    expect(said('PARENT_CODE_INVALID')).toBe(en['error.code.parentCodeInvalid']);
    for (const code of ['PARENTAL_NOT_TEEN', 'PARENTAL_TOO_MANY_PARENTS', 'PARENTAL_PARENT_FULL', 'PARENTAL_ALREADY_CONNECTED', 'PARENTAL_SELF', 'PARENTAL_NOT_PARENT']) {
      expect(said(code)).not.toBe('server words');
    }
  });
});
