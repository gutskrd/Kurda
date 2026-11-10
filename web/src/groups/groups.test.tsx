import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GroupDetail } from '../lib/types';
import { renderApp, jsonResponse } from '../test/utils';
import { AddFriendsSheet } from './AddFriendsSheet';
import { GroupInfo } from './GroupInfo';
import { groupInitials } from './GroupAvatar';
import { pictureBlob } from './GroupEdit';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

type Call = { url: string; method: string; body: unknown; type: string | null };

/** The API as a table of answers; every call is kept, with its body and content type. */
function stubApi(routes: Array<[method: string, path: RegExp, answer: (call: Call) => Response]>): Call[] {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      const raw = init?.body;
      const call: Call = {
        url,
        method,
        body: typeof raw === 'string' ? JSON.parse(raw) : raw ?? null,
        type: headers.get('content-type'),
      };
      calls.push(call);
      for (const [m, path, answer] of routes) if (m === method && path.test(url)) return answer(call);
      if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

describe("a group's picture", () => {
  it('stands in with initials, the way the phone does', () => {
    expect(groupInitials('Hevalên Kurmancî')).toBe('HK');
    expect(groupInitials('şev')).toBe('ŞE');
    expect(groupInitials('  ')).toBe('?');
  });

  it("names a picture's type by its ending when the system did not", () => {
    expect(pictureBlob(new File(['x'], 'cat.png', { type: 'image/png' })).type).toBe('image/png');
    expect(pictureBlob(new File(['x'], 'IMG_0001.JPG', { type: '' })).type).toBe('image/jpeg');
    expect(pictureBlob(new File(['x'], 'photo.heic', { type: '' })).type).toBe('image/heic');
  });
});

const detailFor = (myRole: 'owner' | 'moderator' | 'member'): GroupDetail => ({
  id: 'g1',
  name: 'Test Group',
  description: 'A place to practise',
  ownerId: myRole === 'owner' ? 'me' : 'u-owner',
  archivedAt: null,
  memberCount: 4,
  photoUrl: null,
  myRole,
  members: [
    { userId: 'me', username: 'ada', avatarUrl: null, role: myRole, joinedAt: '2026-01-01T00:00:00.000Z' },
    ...(myRole === 'owner' ? [] : [{ userId: 'u-owner', username: 'owen', avatarUrl: null, role: 'owner' as const, joinedAt: '2026-01-01T00:00:00.000Z' }]),
    { userId: 'u-mod', username: 'mira', avatarUrl: null, role: myRole === 'moderator' ? ('member' as const) : ('moderator' as const), joinedAt: '2026-01-02T00:00:00.000Z' },
    { userId: 'u-mem', username: 'zana', avatarUrl: null, role: 'member', joinedAt: '2026-01-03T00:00:00.000Z' },
  ],
});

/** The ⋯ menu's items for one member, or null when the row has no ⋯. */
async function menuOf(name: string): Promise<string[] | null> {
  const button = screen.queryByRole('button', { name: `Options for ${name}` });
  if (!button) return null;
  await userEvent.click(button);
  const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent?.trim() ?? '');
  await userEvent.keyboard('{Escape}');
  return items;
}

describe("a group's page", () => {
  it('shows the group, its members plainly, and for the owner every action behind each ⋯', async () => {
    stubApi([]);
    renderApp(<GroupInfo detail={detailFor('owner')} onChanged={async () => undefined} onLeft={() => undefined} />);

    expect(await screen.findByRole('heading', { name: 'Test Group' })).toBeInTheDocument();
    expect(screen.getByText('4 members')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit group' })).toBeInTheDocument();
    // nobody manages themselves
    expect(await menuOf('ada')).toBeNull();
    expect(await menuOf('mira')).toEqual(['View profile', 'Remove admin', 'Make owner', 'Remove from group', 'Ban…']);
    expect(await menuOf('zana')).toEqual(['View profile', 'Make admin', 'Make owner', 'Remove from group', 'Ban…']);
    // the owner deletes rather than leaves, and is told why
    expect(screen.getByText(/To leave, make someone else the owner first/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete group' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Report this group' })).not.toBeInTheDocument();
  });

  it('gives an admin the members only, and can edit the group', async () => {
    stubApi([]);
    renderApp(<GroupInfo detail={detailFor('moderator')} onChanged={async () => undefined} onLeft={() => undefined} />);
    await screen.findByRole('heading', { name: 'Test Group' });
    expect(screen.getByRole('button', { name: 'Edit group' })).toBeInTheDocument();
    expect(await menuOf('owen')).toBeNull();
    expect(await menuOf('mira')).toEqual(['View profile', 'Remove from group', 'Ban…']);
    expect(await menuOf('zana')).toEqual(['View profile', 'Remove from group', 'Ban…']);
  });

  it('gives a member nothing to press but people, a report and leaving', async () => {
    stubApi([]);
    renderApp(<GroupInfo detail={detailFor('member')} onChanged={async () => undefined} onLeft={() => undefined} />);
    await screen.findByRole('heading', { name: 'Test Group' });
    expect(screen.queryByRole('button', { name: 'Edit group' })).not.toBeInTheDocument();
    for (const name of ['owen', 'mira', 'zana']) expect(await menuOf(name)).toBeNull();
    expect(screen.getByRole('button', { name: 'Report this group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave Test Group' })).toBeInTheDocument();
  });

  it('removes somebody only after saying who, from where, and that they can come back — and Cancel changes nothing', async () => {
    const calls = stubApi([['DELETE', /\/groups\/g1\/members\/u-mem$/, () => jsonResponse(200, { ok: true })]]);
    const changed = vi.fn(async () => undefined);
    renderApp(<GroupInfo detail={detailFor('owner')} onChanged={changed} onLeft={() => undefined} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Options for zana' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from group' }));
    const ask = screen.getByRole('alertdialog', { name: 'Remove from group' });
    expect(within(ask).getByText('Remove zana from Test Group')).toBeInTheDocument();
    expect(within(ask).getByText('zana can be added again later.')).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Options for zana' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from group' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove from group' }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(calls.find((c) => c.method === 'DELETE')?.url).toMatch(/\/groups\/g1\/members\/u-mem$/);
  });

  it('says nothing of a group being open or invite-only, and offers no way to join one', async () => {
    stubApi([]);
    renderApp(<GroupInfo detail={detailFor('member')} onChanged={async () => undefined} onLeft={() => undefined} />);
    await screen.findByRole('heading', { name: 'Test Group' });
    expect(screen.queryByText(/open group|invite-only|privacy/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
  });

  it('reads in one order for the owner: members, add friends, requests, banned, edit, delete', async () => {
    const waiting = { userId: 'u-berfin', username: 'berfin', avatarUrl: null, note: null, sentAt: '2026-10-28T10:00:00.000Z', declines: 0 };
    stubApi([
      ['GET', /\/groups\/g1\/requests$/, () => jsonResponse(200, { requests: [waiting] })],
      ['GET', /\/groups\/g1\/bans$/, () => jsonResponse(200, { bans: [] })],
    ]);
    renderApp(<GroupInfo detail={{ ...detailFor('owner'), pendingRequests: 1 }} onChanged={async () => undefined} onLeft={() => undefined} />);
    await screen.findByRole('button', { name: 'Approve berfin' });

    const order = [
      screen.getByRole('heading', { name: 'Members' }),
      screen.getByRole('button', { name: 'Add friends' }),
      screen.getByRole('button', { name: 'Options for zana' }),
      screen.getByRole('heading', { name: /Requests to come back/ }),
      screen.getByRole('heading', { name: 'Banned' }),
      screen.getByRole('button', { name: 'Edit group' }),
      screen.getByRole('button', { name: 'Delete group' }),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('lets the owner and the admins add friends from the page, and nobody else', async () => {
    stubApi([['GET', /\/friends\?limit=500$/, () => jsonResponse(200, { friends: [{ userId: 'u-roj', username: 'roj', displayName: 'Roj', avatarUrl: null }] })]]);
    const { unmount } = renderApp(<GroupInfo detail={detailFor('moderator')} onChanged={async () => undefined} onLeft={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add friends' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Add friends' }));
    expect(await sheet.findByRole('button', { name: 'Add Roj' })).toBeInTheDocument();
    unmount();

    renderApp(<GroupInfo detail={detailFor('member')} onChanged={async () => undefined} onLeft={() => undefined} />);
    await screen.findByRole('heading', { name: 'Test Group' });
    expect(screen.queryByRole('button', { name: 'Add friends' })).not.toBeInTheDocument();
  });

  it('deletes the group only once the owner has read what it costs', async () => {
    const calls = stubApi([['DELETE', /\/groups\/g1$/, () => jsonResponse(200, { ok: true })]]);
    const left = vi.fn();
    renderApp(<GroupInfo detail={detailFor('owner')} onChanged={async () => undefined} onLeft={left} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete group' }));
    const ask = screen.getByRole('alertdialog', { name: 'Delete group' });
    expect(within(ask).getByText(/deletes Test Group and all its messages, for everyone/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(within(ask).getByRole('button', { name: 'Delete group' }));
    await waitFor(() => expect(left).toHaveBeenCalled());
  });
});

describe('changing a group', () => {
  async function openEdit(routes: Parameters<typeof stubApi>[0] = []): Promise<{ calls: Call[]; changed: ReturnType<typeof vi.fn> }> {
    const calls = stubApi(routes);
    const changed = vi.fn(async () => undefined);
    renderApp(<GroupInfo detail={detailFor('moderator')} onChanged={changed} onLeft={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit group' }));
    return { calls, changed };
  }

  it('saves only what changed, and only a name that is a name', async () => {
    const { calls, changed } = await openEdit([['PATCH', /\/groups\/g1$/, () => jsonResponse(200, { name: 'Test Group', description: 'Every evening' })]]);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'x');
    expect(save).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'Test Group');
    expect(save).toBeDisabled();

    const about = screen.getByLabelText('Description');
    await userEvent.clear(about);
    await userEvent.type(about, 'Every evening');
    expect(screen.getByText('13/300')).toBeInTheDocument();
    await userEvent.click(save);

    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ description: 'Every evening' });
  });

  it('says plainly when words were refused', async () => {
    await openEdit([['PATCH', /\/groups\/g1$/, () => jsonResponse(422, { code: 'GROUP_TEXT_REJECTED', message: 'no' })]]);
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Something rude');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Some of those words aren’t allowed here. Try different ones.')).toBeInTheDocument();
  });

  it('puts up a picture as its raw bytes, with its type', async () => {
    const { calls, changed } = await openEdit([['POST', /\/groups\/g1\/photo$/, () => jsonResponse(200, { photoUrl: 'https://cdn.test/g1.webp' })]]);
    const input = document.querySelector<HTMLInputElement>('.gedit input[type="file"]')!;
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'group.png', { type: 'image/png' });
    await userEvent.upload(input, file);

    await waitFor(() => expect(changed).toHaveBeenCalled());
    const upload = calls.find((c) => c.method === 'POST' && c.url.endsWith('/groups/g1/photo'))!;
    expect(upload.type).toBe('image/png');
    expect(upload.body).toBe(file);
    expect(await screen.findByRole('button', { name: 'Remove picture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change picture' })).toBeInTheDocument();
  });

  it('says why a picture was not put up', async () => {
    await openEdit([['POST', /\/groups\/g1\/photo$/, () => jsonResponse(413, { code: 'UPLOAD_TOO_LARGE', message: 'too big' })]]);
    const input = document.querySelector<HTMLInputElement>('.gedit input[type="file"]')!;
    await userEvent.upload(input, new File(['x'], 'huge.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a picture' })).toBeInTheDocument();
  });
});

describe('banning a member', () => {
  async function openBan(routes: Parameters<typeof stubApi>[0] = []): Promise<{ calls: Call[]; changed: ReturnType<typeof vi.fn> }> {
    const calls = stubApi(routes);
    const changed = vi.fn(async () => undefined);
    renderApp(<GroupInfo detail={detailFor('owner')} onChanged={changed} onLeft={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Options for zana' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ban…' }));
    return { calls, changed };
  }

  it('asks how long as a plain choice, takes an optional reason they will see, and can delete their messages', async () => {
    const { calls, changed } = await openBan([
      [
        'POST',
        /\/groups\/g1\/bans$/,
        () =>
          jsonResponse(200, {
            ban: { userId: 'u-mem', username: 'zana', avatarUrl: null, until: null, reason: 'Spam', bannedBy: 'ada', at: '2026-10-29T10:00:00.000Z', requestsClosed: false },
          }),
      ],
    ]);
    const sheet = within(screen.getByRole('dialog', { name: 'Ban zana' }));
    expect(sheet.getByText('Removed members can be added again. Banned members can’t, but they can ask you to let them back.')).toBeInTheDocument();
    const how = within(sheet.getByRole('group', { name: 'How long' }));
    expect(how.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['1 day', '1 week', 'For good']);
    expect(how.getByRole('radio', { name: '1 day' })).toBeChecked();
    await userEvent.click(how.getByRole('radio', { name: 'For good' }));
    await userEvent.type(sheet.getByLabelText(/Reason/), 'Spam');
    expect(sheet.getByText('4/200')).toBeInTheDocument();
    expect(sheet.getByText('zana will see this.')).toBeInTheDocument();
    await userEvent.click(sheet.getByRole('switch', { name: 'Also delete their messages in this group' }));
    await userEvent.click(sheet.getByRole('button', { name: 'Ban zana' }));

    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/groups/g1/bans'))?.body).toEqual({
      userId: 'u-mem',
      duration: 'perm',
      reason: 'Spam',
      deleteMessages: true,
    });
    expect(screen.queryByRole('dialog', { name: 'Ban zana' })).not.toBeInTheDocument();
    expect(screen.getByText('zana is banned.')).toBeInTheDocument();
  });

  it('sends no reason when none is given, and says when the words are refused', async () => {
    const { calls } = await openBan([['POST', /\/groups\/g1\/bans$/, () => jsonResponse(422, { code: 'GROUP_TEXT_REJECTED', message: 'no' })]]);
    await userEvent.click(screen.getByRole('button', { name: 'Ban zana' }));
    expect(await screen.findByText('Some of those words aren’t allowed here. Try different ones.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/bans'))?.body).toEqual({ userId: 'u-mem', duration: '1d', reason: null, deleteMessages: false });
    expect(screen.getByRole('dialog', { name: 'Ban zana' })).toBeInTheDocument();
  });
});

describe('requests to come back, and who is banned', () => {
  const request = { userId: 'u-berfin', username: 'berfin', avatarUrl: null, note: 'Bibore, ez ê baş bim', sentAt: '2026-10-28T10:00:00.000Z', declines: 2 };
  const ban = {
    userId: 'u-delal',
    username: 'delal',
    avatarUrl: null,
    until: '2026-11-04T10:00:00.000Z',
    reason: 'Reklam',
    bannedBy: 'owen',
    at: '2026-10-28T10:00:00.000Z',
    requestsClosed: true,
  };
  const lists = (requests: unknown[], bans: unknown[]): Parameters<typeof stubApi>[0] => [
    ['GET', /\/groups\/g1\/requests$/, () => jsonResponse(200, { requests })],
    ['GET', /\/groups\/g1\/bans$/, () => jsonResponse(200, { bans })],
  ];

  it('shows the owner each request with its note, when, and how often it was turned down, and each ban', async () => {
    stubApi(lists([request], [ban]));
    renderApp(<GroupInfo detail={detailFor('owner')} onChanged={async () => undefined} onLeft={() => undefined} />);

    const asks = within(await screen.findByRole('region', { name: /Requests to come back/ }));
    expect(await asks.findByText('Bibore, ez ê baş bim')).toBeInTheDocument();
    expect(asks.getByText(/^Asked on .+ · turned down 2 times before$/)).toBeInTheDocument();
    expect(asks.getByText('1')).toBeInTheDocument();
    const bans = within(screen.getByRole('region', { name: 'Banned' }));
    expect(bans.getByText(/^Until .+ · banned by owen$/)).toBeInTheDocument();
    expect(bans.getByText('Reklam')).toBeInTheDocument();
    expect(bans.getByText('Requests from them are stopped.')).toBeInTheDocument();
  });

  it('shows no requests section while nobody asks, and says plainly that nobody is banned', async () => {
    stubApi(lists([], []));
    renderApp(<GroupInfo detail={detailFor('moderator')} onChanged={async () => undefined} onLeft={() => undefined} />);
    expect(await screen.findByText('Nobody is banned from this group.')).toBeInTheDocument();
    expect(screen.queryByText(/Requests to come back/)).not.toBeInTheDocument();
  });

  it('shows neither list to a member, nor asks for them', async () => {
    const calls = stubApi(lists([request], [ban]));
    renderApp(<GroupInfo detail={detailFor('member')} onChanged={async () => undefined} onLeft={() => undefined} />);
    await screen.findByRole('heading', { name: 'Test Group' });
    expect(screen.queryByText(/Requests to come back/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Banned' })).not.toBeInTheDocument();
    expect(calls.some((c) => /\/(requests|bans)$/.test(c.url))).toBe(false);
  });

  it('approves a request, and says whether they are back in or only free to be added again', async () => {
    let rejoined = true;
    const calls = stubApi([...lists([request], []), ['POST', /\/groups\/g1\/requests\/u-berfin\/approve$/, () => jsonResponse(200, { rejoined })]]);
    const changed = vi.fn(async () => undefined);
    renderApp(<GroupInfo detail={detailFor('owner')} onChanged={changed} onLeft={() => undefined} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve berfin' }));
    expect(await screen.findByText('berfin is back in the group.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/requests/u-berfin/approve'))).toBe(true);
    expect(changed).toHaveBeenCalled();

    rejoined = false;
    await userEvent.click(screen.getByRole('button', { name: 'Approve berfin' }));
    expect(await screen.findByText('berfin is no longer banned but couldn’t be added back just now. An admin who is their friend can add them again.')).toBeInTheDocument();
  });

  it('declines a request after saying how long they wait, and can stop their requests', async () => {
    const calls = stubApi([...lists([request], []), ['POST', /\/groups\/g1\/requests\/u-berfin\/decline$/, () => jsonResponse(200, { ok: true })]]);
    renderApp(<GroupInfo detail={detailFor('owner')} onChanged={async () => undefined} onLeft={() => undefined} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Decline berfin' }));
    const ask = within(screen.getByRole('alertdialog', { name: 'Decline berfin’s request?' }));
    // turned down twice before: the third wait is the longest
    expect(ask.getByText('berfin can ask again in 30 days.')).toBeInTheDocument();
    await userEvent.click(ask.getByRole('switch', { name: /Stop requests from berfin/ }));
    await userEvent.click(ask.getByRole('button', { name: 'Decline' }));

    expect(await screen.findByText('You declined berfin’s request.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/decline'))?.body).toEqual({ stopRequests: true });
  });

  it('unbans only after saying it does not add them back', async () => {
    const calls = stubApi([...lists([], [ban]), ['DELETE', /\/groups\/g1\/bans\/u-delal$/, () => jsonResponse(200, { ok: true })]]);
    renderApp(<GroupInfo detail={detailFor('owner')} onChanged={async () => undefined} onLeft={() => undefined} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Unban delal' }));
    const ask = within(screen.getByRole('alertdialog', { name: 'Unban delal?' }));
    expect(ask.getByText('delal won’t be added back, but an admin can add them again.')).toBeInTheDocument();
    await userEvent.click(ask.getByRole('button', { name: 'Cancel' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Unban delal' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Unban' }));
    expect(await screen.findByText('delal is unbanned.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'DELETE')?.url).toMatch(/\/groups\/g1\/bans\/u-delal$/);
  });
});

describe('adding friends to a group', () => {
  const friends = [
    { userId: 'u-roj', username: 'roj', displayName: 'Roj', avatarUrl: null },
    { userId: 'u-mem', username: 'zana', displayName: null, avatarUrl: null },
  ];
  const sheetFor = (onClose = () => undefined, onAdded = () => undefined): React.JSX.Element => (
    <AddFriendsSheet open groupId="g1" groupName="Test Group" memberIds={new Set(['me', 'u-mem'])} onClose={onClose} onAdded={onAdded} />
  );

  it('lists the friends who are not in it yet, adds one in a tap, and has Done to go on to the chat', async () => {
    const calls = stubApi([
      ['GET', /\/friends\?limit=500$/, () => jsonResponse(200, { friends })],
      ['POST', /\/groups\/g1\/invite$/, () => jsonResponse(200, { ok: true })],
    ]);
    const closed = vi.fn();
    const added = vi.fn();
    renderApp(sheetFor(closed, added));

    const sheet = within(await screen.findByRole('dialog', { name: 'Add friends' }));
    // zana is in the group already, so only Roj is offered
    await userEvent.click(await sheet.findByRole('button', { name: 'Add Roj' }));
    expect(await sheet.findByRole('button', { name: 'Roj is added' })).toBeDisabled();
    expect(sheet.queryByText('zana')).not.toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/groups/g1/invite'))?.body).toEqual({ userId: 'u-roj' });
    expect(added).toHaveBeenCalled();

    await userEvent.click(sheet.getByRole('button', { name: 'Done' }));
    expect(closed).toHaveBeenCalled();
  });

  it('tells someone with no friends yet so in a sentence, with the way to find people', async () => {
    stubApi([['GET', /\/friends\?limit=500$/, () => jsonResponse(200, { friends: [] })]]);
    renderApp(sheetFor());

    const sheet = within(await screen.findByRole('dialog', { name: 'Add friends' }));
    expect(await sheet.findByText(/You have no friends here yet\./)).toBeInTheDocument();
    expect(sheet.getByRole('link', { name: 'Find people' })).toHaveAttribute('href', '/app/search');
    expect(sheet.queryByRole('list')).not.toBeInTheDocument();
    expect(sheet.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });
});
