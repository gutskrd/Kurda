import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { GroupStanding } from '@kurda/shared';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import type { RealtimeClient } from '../realtime/RealtimeClient';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { jsonResponse } from '../test/utils';
import { GroupThread } from './GroupThread';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

type Call = { url: string; method: string; body: unknown };
type Route = [method: string, path: RegExp, answer: (call: Call) => Response];

/** The API as a table of answers, the first match winning; every call is kept. */
function stubApi(routes: Route[]): Call[] {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const call: Call = { url, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null };
      calls.push(call);
      for (const [m, path, answer] of routes) if (m === method && path.test(url)) return answer(call);
      if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'baran' } });
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

/** A realtime client whose room events a test sends. */
function fakeRealtime(): { client: RealtimeClient; emit: (env: RealtimeEventEnvelope) => void } {
  const listeners = new Set<(env: RealtimeEventEnvelope) => void>();
  const fake = {
    on(type: string, handler: (arg: unknown) => void) {
      if (type === 'event') listeners.add(handler as (env: RealtimeEventEnvelope) => void);
      return () => listeners.delete(handler as (env: RealtimeEventEnvelope) => void);
    },
    connect() {},
    destroy() {},
    join() {},
    leave() {},
  };
  return { client: fake as unknown as RealtimeClient, emit: (env) => listeners.forEach((h) => h(env)) };
}

function mount(props: Partial<React.ComponentProps<typeof GroupThread>> = {}): ReturnType<typeof fakeRealtime> {
  const rt = fakeRealtime();
  render(
    <I18nProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/app/messages?group=g1']}>
          <RealtimeProvider client={rt.client}>
            <ProfileModalProvider>
              <GroupThread groupId="g1" {...props} />
            </ProfileModalProvider>
          </RealtimeProvider>
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>,
  );
  return rt;
}

const member = (userId: string, username: string, role: 'owner' | 'moderator' | 'member') => ({
  userId,
  username,
  avatarUrl: null,
  role,
  joinedAt: '2026-01-01T00:00:00.000Z',
});

function detail(over: Record<string, unknown> = {}): Record<string, unknown> {
  const myRole = (over.myRole as string | null | undefined) === undefined ? 'member' : over.myRole;
  return {
    id: 'g1',
    name: 'Hevalên Amedê',
    description: null,
    privacy: 'open',
    ownerId: 'u-owen',
    archivedAt: null,
    memberCount: 3,
    photoUrl: null,
    myRole,
    standing: myRole ? { kind: 'member', role: myRole } : { kind: 'out' },
    members: [member('me', 'baran', (myRole as 'member') ?? 'member'), member('u-owen', 'owen', 'owner'), member('u-rojda', 'rojda', 'member')],
    ...over,
  };
}

const message = (id: string, senderId: string, username: string, body: string, createdAt = '2026-10-29T09:00:00.000Z') => ({
  id,
  senderId,
  username,
  avatarUrl: null,
  body,
  kind: 'text',
  createdAt,
  deleted: false,
});

const history = (messages: unknown[], cleared: unknown = { forEveryone: null, forMe: null }): Route => [
  'GET',
  /\/groups\/g1\/chat$/,
  () => jsonResponse(200, { messages, cleared }),
];
const group = (over: Record<string, unknown> = {}): Route => ['GET', /\/groups\/g1$/, () => jsonResponse(200, detail(over))];

describe('an empty group chat', () => {
  it('welcomes with the group and greetings in Kurmanci, and a tap sends one', async () => {
    const calls = stubApi([
      history([]),
      group(),
      ['POST', /\/groups\/g1\/chat$/, (c) => jsonResponse(200, message('m9', 'me', 'baran', (c.body as { body: string }).body))],
    ]);
    mount();

    expect(await screen.findByText('This is the start of Hevalên Amedê')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hevalên Amedê' })).toBeInTheDocument();
    const hello = within(screen.getByRole('group', { name: 'Say hello in Kurdish' }));
    expect(hello.getAllByRole('button').map((b) => b.textContent)).toEqual(['Silav! 👋', 'Rojbaş!', 'Çawa yî?']);
    expect(hello.getByRole('button', { name: 'Send “Rojbaş!”' })).toHaveAttribute('lang', 'ku');

    await userEvent.click(hello.getByRole('button', { name: 'Send “Rojbaş!”' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/groups/g1/chat'))?.body).toEqual({ body: 'Rojbaş!' }));
    expect(await screen.findByText('Rojbaş!', { selector: '.bubble *' })).toBeInTheDocument();
    expect(screen.queryByText('Say hello in Kurdish')).not.toBeInTheDocument();
  });

  it('greets in Sorani, right to left, for a learner on the Sorani course', async () => {
    localStorage.setItem('hevalo.learn.courseDialect', 'sorani');
    stubApi([history([]), group()]);
    mount();
    const chip = await screen.findByRole('button', { name: 'Send “سڵاو! 👋”' });
    expect(chip).toHaveAttribute('lang', 'ckb');
    expect(chip).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('button', { name: 'Send “چۆنی؟”' })).toBeInTheDocument();
  });

  it('says when you cleared it for yourself instead of the start', async () => {
    stubApi([history([], { forEveryone: null, forMe: '2026-10-28T10:00:00.000Z' }), group()]);
    mount();
    expect(await screen.findByText(/^You cleared this chat on .+\. New messages will show here\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/This is the start/)).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Say hello in Kurdish' })).toBeInTheDocument();
  });

  it('says who cleared it for everyone at the top, with the welcome under it while nothing is said', async () => {
    stubApi([history([], { forEveryone: { at: '2026-10-28T10:00:00.000Z', by: 'owen' }, forMe: null }), group()]);
    mount();
    expect(await screen.findByText(/^owen cleared the chat · /)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Say hello in Kurdish' })).toBeInTheDocument();
    expect(screen.queryByText(/This is the start/)).not.toBeInTheDocument();
  });

  it('keeps the line above what was said since, and names nobody when the account is gone', async () => {
    stubApi([
      history([message('m2', 'u-rojda', 'rojda', 'Ez li vir im')], { forEveryone: { at: '2026-10-28T10:00:00.000Z', by: null }, forMe: null }),
      group(),
    ]);
    mount();
    expect(await screen.findByText(/^An admin cleared the chat · /)).toBeInTheDocument();
    expect(screen.getByText('Ez li vir im')).toBeInTheDocument();
    expect(screen.queryByText('Say hello in Kurdish')).not.toBeInTheDocument();
  });

  it('leaves the greetings out once a send is refused because you are muted here', async () => {
    stubApi([history([]), group(), ['POST', /\/groups\/g1\/chat$/, () => jsonResponse(403, { code: 'MUTED', message: 'muted' })]]);
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Send “Silav! 👋”' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Say hello in Kurdish' })).not.toBeInTheDocument());
    expect(screen.getByText('This is the start of Hevalên Amedê')).toBeInTheDocument();
  });

  it('offers the owner of an invite-only group with nobody else in it to add friends', async () => {
    const calls = stubApi([
      history([]),
      group({ privacy: 'invite', myRole: 'owner', memberCount: 1, members: [member('me', 'baran', 'owner')] }),
      [
        'GET',
        /\/friends\?limit=500$/,
        () =>
          jsonResponse(200, {
            friends: [
              { userId: 'u-rojda', username: 'rojda', displayName: 'Rojda', avatarUrl: null },
              { userId: 'u-azad', username: 'azad', displayName: null, avatarUrl: null },
            ],
          }),
      ],
      ['POST', /\/groups\/g1\/invite$/, (c) => ((c.body as { userId: string }).userId === 'u-azad' ? jsonResponse(409, { code: 'MEMBER_BANNED', message: 'banned' }) : jsonResponse(200, { ok: true }))],
    ]);
    mount();

    await userEvent.click(await screen.findByRole('button', { name: 'Add friends' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Add friends' }));
    await userEvent.click(await sheet.findByRole('button', { name: 'Add Rojda' }));
    expect(await sheet.findByRole('button', { name: 'Rojda is added' })).toBeDisabled();
    expect(calls.find((c) => c.url.endsWith('/groups/g1/invite'))?.body).toEqual({ userId: 'u-rojda' });

    await userEvent.click(sheet.getByRole('button', { name: 'Add azad' }));
    expect(await sheet.findByText('azad is banned from this group. Unban them first.')).toBeInTheDocument();
  });

  it('does not offer to add friends in an open group', async () => {
    stubApi([history([]), group({ myRole: 'owner', memberCount: 1, members: [member('me', 'baran', 'owner')] })]);
    mount();
    await screen.findByText('This is the start of Hevalên Amedê');
    expect(screen.queryByRole('button', { name: 'Add friends' })).not.toBeInTheDocument();
  });
});

describe('clearing a group chat', () => {
  const said = [message('m1', 'u-rojda', 'rojda', 'Silav hevalno'), message('m2', 'me', 'baran', 'Rojbaş')];

  async function menuItems(): Promise<string[]> {
    await userEvent.click(await screen.findByRole('button', { name: 'Chat options' }));
    return within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent ?? '');
  }

  it('gives a member Clear chat for me only, asks first, and Cancel changes nothing', async () => {
    const calls = stubApi([history(said), group()]);
    mount();
    await screen.findByText('Silav hevalno');
    expect(await menuItems()).toEqual(['Clear chat for me']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear chat for me' }));

    const ask = screen.getByRole('alertdialog', { name: 'Clear this chat for you?' });
    expect(within(ask).getByText('The messages so far disappear from your view only; everyone else still sees them.')).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(calls.some((c) => c.url.endsWith('/chat/clear'))).toBe(false);
    expect(screen.getByText('Silav hevalno')).toBeInTheDocument();
  });

  it('clears it for you, and the chat says so where the messages were', async () => {
    const calls = stubApi([
      history(said),
      group(),
      ['POST', /\/groups\/g1\/chat\/clear$/, () => jsonResponse(200, { cleared: { forEveryone: null, forMe: '2026-10-29T10:00:00.000Z' } })],
    ]);
    mount();
    await screen.findByText('Silav hevalno');
    await menuItems();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear chat for me' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear for me' }));

    await waitFor(() => expect(screen.queryByText('Silav hevalno')).not.toBeInTheDocument());
    expect(calls.find((c) => c.url.endsWith('/chat/clear'))?.body).toEqual({ for: 'me' });
    expect(screen.getByText(/^You cleared this chat on /)).toBeInTheDocument();
    expect(screen.getByText('Chat cleared for you.')).toBeInTheDocument();
  });

  it('lets an admin clear it for everyone, after saying how many it reaches and that it cannot be undone', async () => {
    const calls = stubApi([
      history(said),
      group({ myRole: 'moderator' }),
      ['POST', /\/groups\/g1\/chat\/clear$/, () => jsonResponse(200, { cleared: { forEveryone: { at: '2026-10-29T10:00:00.000Z', by: 'baran' }, forMe: null } })],
    ]);
    mount();
    await screen.findByText('Silav hevalno');
    expect(await menuItems()).toEqual(['Clear chat for me', 'Clear chat for everyone']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear chat for everyone' }));

    const ask = screen.getByRole('alertdialog', { name: 'Clear this chat for all 3 members?' });
    expect(within(ask).getByText(/deleted for everyone and the chat shows that you cleared it\. This can’t be undone\./)).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: 'Clear for everyone' }));

    await waitFor(() => expect(screen.queryByText('Silav hevalno')).not.toBeInTheDocument());
    expect(calls.find((c) => c.url.endsWith('/chat/clear'))?.body).toEqual({ for: 'everyone' });
    expect(screen.getByText(/^You cleared the chat · /)).toBeInTheDocument();
  });

  it('says why a clear did not happen, and keeps the question open', async () => {
    stubApi([history(said), group({ myRole: 'owner' }), ['POST', /\/groups\/g1\/chat\/clear$/, () => jsonResponse(403, { code: 'NOT_GROUP_ADMIN', message: 'Only the owner and admins can do that.' })]]);
    mount();
    await screen.findByText('Silav hevalno');
    await menuItems();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear chat for everyone' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear for everyone' }));
    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Silav hevalno')).toBeInTheDocument();
  });
});

describe('a group chat as it changes elsewhere', () => {
  it('empties every open view at once when an admin clears it for everyone', async () => {
    stubApi([history([message('m1', 'u-rojda', 'rojda', 'Silav hevalno', '2026-10-29T09:00:00.000Z')]), group()]);
    const rt = mount();
    await screen.findByText('Silav hevalno');
    // the room is listened to once the session has settled; until then an event has no listener
    await waitFor(() => {
      rt.emit({ room: 'group:g1', event: { type: 'group_chat_cleared', groupId: 'g1', at: '2026-10-29T10:00:00.000Z', by: 'owen' } });
      expect(screen.queryByText('Silav hevalno')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText(/^owen cleared the chat · /).length).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: 'Say hello in Kurdish' })).toBeInTheDocument();
  });

  it('ignores a clear in another group', async () => {
    stubApi([history([message('m1', 'u-rojda', 'rojda', 'Silav hevalno')]), group()]);
    const rt = mount();
    await screen.findByText('Silav hevalno');
    // a message arriving after it proves the room was being listened to when the other group's clear came
    await waitFor(() => {
      rt.emit({ room: 'group:g2', event: { type: 'group_chat_cleared', groupId: 'g2', at: '2026-10-29T10:00:00.000Z', by: 'owen' } });
      rt.emit({ room: 'group:g1', event: { type: 'group_msg', groupId: 'g1', message: message('m5', 'u-owen', 'owen', 'Hûn çawa ne?', '2026-10-29T10:30:00.000Z') } });
      expect(screen.getByText('Hûn çawa ne?')).toBeInTheDocument();
    });
    expect(screen.getByText('Silav hevalno')).toBeInTheDocument();
    expect(screen.queryByText(/cleared the chat/)).not.toBeInTheDocument();
  });

  it('takes the messages of a banned member out when they are deleted with the ban', async () => {
    stubApi([history([message('m1', 'u-rojda', 'rojda', 'Tiştekî xerab'), message('m2', 'u-owen', 'owen', 'Bes e')]), group()]);
    const rt = mount();
    await screen.findByText('Tiştekî xerab');
    await waitFor(() => {
      rt.emit({ room: 'group:g1', event: { type: 'group_msgs_deleted', groupId: 'g1', senderId: 'u-rojda' } });
      expect(screen.queryByText('Tiştekî xerab')).not.toBeInTheDocument();
    });
    expect(screen.getByText('message deleted')).toBeInTheDocument();
    expect(screen.getByText('Bes e')).toBeInTheDocument();
  });
});

describe('a group from outside', () => {
  const banned = (request: Extract<GroupStanding, { kind: 'banned' }>['request'], until: string | null = '2026-11-05T10:00:00.000Z') =>
    group({ myRole: null, standing: { kind: 'banned', until, reason: 'Reklam', request } });
  const notIn = () => jsonResponse(403, { code: 'NOT_A_MEMBER', message: 'you are not in this group' });
  const refused: Route = ['GET', /\/groups\/g1\/chat$/, notIn];

  it('shows the ordinary Join to someone removed from an open group, and joins', async () => {
    let joined = false;
    const calls = stubApi([
      ['GET', /\/groups\/g1\/chat$/, () => (joined ? jsonResponse(200, { messages: [], cleared: { forEveryone: null, forMe: null } }) : notIn())],
      ['GET', /\/groups\/g1$/, () => jsonResponse(200, detail(joined ? {} : { myRole: null }))],
      [
        'POST',
        /\/groups\/g1\/join$/,
        () => {
          joined = true;
          return jsonResponse(200, { ok: true });
        },
      ],
    ]);
    mount();
    expect(await screen.findByText('Join to read the chat and say hello.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/groups/g1/join'))).toBe(true);
    expect(await screen.findByText('This is the start of Hevalên Amedê')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('tells someone outside an invite-only group that an admin can add them', async () => {
    stubApi([refused, group({ myRole: null, privacy: 'invite' })]);
    mount();
    expect(await screen.findByText('This group is invite-only. An admin can add you.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
  });

  it('shows a banned person until when, the reason, and a way to ask with a note', async () => {
    const calls = stubApi([
      refused,
      banned({ kind: 'can_ask' }),
      ['POST', /\/groups\/g1\/requests$/, () => jsonResponse(200, { request: { kind: 'pending', sentAt: '2026-10-29T10:00:00.000Z' } })],
    ]);
    mount();
    expect(await screen.findByText(/^You’re banned from this group until .+\.$/)).toBeInTheDocument();
    expect(screen.getByText('Reklam')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ask to come back' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Ask to come back' }));
    expect(sheet.getByText('The admins will see this.')).toBeInTheDocument();
    await userEvent.type(sheet.getByLabelText(/A note to the admins/), 'Bibore');
    expect(sheet.getByText('6/200')).toBeInTheDocument();
    await userEvent.click(sheet.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText(/^Request sent on .+ — the admins will decide\.$/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/groups/g1/requests'))?.body).toEqual({ note: 'Bibore' });
    expect(screen.getByRole('button', { name: 'Withdraw request' })).toBeInTheDocument();
  });

  it('withdraws a waiting request, which can then be made again', async () => {
    const calls = stubApi([refused, banned({ kind: 'pending', sentAt: '2026-10-29T08:00:00.000Z' }), ['DELETE', /\/groups\/g1\/requests$/, () => jsonResponse(200, { ok: true })]]);
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw request' }));
    expect(await screen.findByRole('button', { name: 'Ask to come back' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/groups/g1/requests'))).toBe(true);
  });

  it('says when a turned-down person may ask again, and when requests are closed', async () => {
    stubApi([refused, banned({ kind: 'wait', until: '2026-11-05T10:00:00.000Z' }, null)]);
    mount();
    expect(await screen.findByText('You’re banned from this group for good.')).toBeInTheDocument();
    expect(screen.getByText(/^You can ask again on .+\.$/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask to come back' })).not.toBeInTheDocument();
  });

  it('says plainly when the admins take no more requests', async () => {
    stubApi([refused, banned({ kind: 'closed' })]);
    mount();
    expect(await screen.findByText('The admins aren’t taking requests from you.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask to come back' })).not.toBeInTheDocument();
  });

  it('shows the wait the server answers with when a request comes too soon', async () => {
    stubApi([
      refused,
      banned({ kind: 'can_ask' }),
      ['POST', /\/groups\/g1\/requests$/, () => jsonResponse(429, { code: 'REQUEST_WAIT', message: 'wait', details: { until: '2026-11-05T10:00:00.000Z' } })],
    ]);
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Ask to come back' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Ask to come back' })).getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(/^You can ask again on .+\.$/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Ask to come back' })).not.toBeInTheDocument();
  });
});

describe('being taken out while the chat is open', () => {
  it('turns the thread into a calm card when a send finds you were removed', async () => {
    let removed = false;
    stubApi([
      history([message('m1', 'u-rojda', 'rojda', 'Silav hevalno')]),
      ['GET', /\/groups\/g1$/, () => jsonResponse(200, detail(removed ? { myRole: null } : {}))],
      [
        'POST',
        /\/groups\/g1\/chat$/,
        () => {
          removed = true;
          return jsonResponse(403, { code: 'NOT_A_MEMBER', message: 'you are not in this group' });
        },
      ],
    ]);
    mount();
    await screen.findByText('Silav hevalno');
    await userEvent.type(screen.getByRole('textbox'), 'Silav{Enter}');

    const gone = await screen.findByRole('heading', { name: 'You’re no longer in this group' });
    await waitFor(() => expect(gone).toHaveFocus());
    expect(screen.getByText('You can join again whenever you like.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Silav hevalno')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chat options' })).not.toBeInTheDocument();
  });

  it('shows the ban and the way to ask when the next read finds you banned', async () => {
    let banned = false;
    stubApi([
      [
        'GET',
        /\/groups\/g1\/chat$/,
        () => (banned ? jsonResponse(403, { code: 'GROUP_BANNED', message: 'banned', details: { until: null } }) : jsonResponse(200, { messages: [message('m1', 'u-rojda', 'rojda', 'Silav')] })),
      ],
      ['GET', /\/groups\/g1$/, () => jsonResponse(200, banned ? detail({ myRole: null, standing: { kind: 'banned', until: null, reason: null, request: { kind: 'can_ask' } } }) : detail())],
      [
        'POST',
        /\/groups\/g1\/chat$/,
        () => {
          banned = true;
          return jsonResponse(403, { code: 'GROUP_BANNED', message: 'banned', details: { until: null } });
        },
      ],
    ]);
    mount();
    await screen.findByText('Silav');
    await userEvent.type(screen.getByRole('textbox'), 'Hey{Enter}');
    expect(await screen.findByRole('heading', { name: 'You’re no longer in this group' })).toBeInTheDocument();
    expect(await screen.findByText('You’re banned from this group for good.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask to come back' })).toBeInTheDocument();
  });
});

describe('a notification about requests to come back', () => {
  it('opens the group on its own page', async () => {
    stubApi([history([]), group({ myRole: 'owner' })]);
    mount({ openInfo: true });
    expect(await screen.findByRole('dialog', { name: 'Group info' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /Requests to come back/ })).toBeInTheDocument();
  });
});
