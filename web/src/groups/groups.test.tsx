import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GroupDetail } from '../lib/types';
import { renderApp, jsonResponse } from '../test/utils';
import { DiscoverGroups, groupMatches } from './DiscoverGroups';
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

const discovered = [
  { id: 'g1', name: 'Hevalên Kurmancî', description: 'Em her êvar diaxivin', privacy: 'open', ownerId: 'u2', archivedAt: null, memberCount: 14, photoUrl: null, joined: true },
  { id: 'g2', name: 'Klûba helbestê', description: 'Helbest û stran', privacy: 'open', ownerId: 'u3', archivedAt: null, memberCount: 6, photoUrl: 'https://cdn.test/g2.webp', joined: false },
  { id: 'g3', name: 'Soranî ji bo destpêkeran', description: null, privacy: 'open', ownerId: 'u4', archivedAt: null, memberCount: 38, photoUrl: null, joined: false },
];

describe('finding a group', () => {
  it('matches every word typed, in the name or what it is about, accents aside', () => {
    expect(groupMatches(discovered[0]!, 'hevalen')).toBe(true);
    expect(groupMatches(discovered[1]!, 'KLUBA stran')).toBe(true);
    expect(groupMatches(discovered[1]!, 'klûba sorani')).toBe(false);
    expect(groupMatches(discovered[2]!, '  ')).toBe(true);
  });

  it('lists each group with Join, or Open for one you are in, and narrows as you type', async () => {
    stubApi([['GET', /\/groups$/, () => jsonResponse(200, { groups: discovered })]]);
    renderApp(<DiscoverGroups mineIds={new Set()} onOpen={() => undefined} onJoined={() => undefined} onNew={() => undefined} />);

    expect(await screen.findByRole('link', { name: 'Open: Hevalên Kurmancî' })).toHaveAttribute('href', '/app/messages?group=g1');
    expect(screen.getByRole('button', { name: 'Join: Klûba helbestê' })).toBeInTheDocument();
    expect(screen.getByText('38 members')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search groups' }), 'helbest');
    expect(screen.queryByText('Hevalên Kurmancî')).not.toBeInTheDocument();
    expect(screen.getByText('Klûba helbestê')).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search groups' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search groups' }), 'xyz');
    expect(screen.getByText('No groups match “xyz”.')).toBeInTheDocument();
  });

  it('joins a group, which then says Open, and hands it back to open', async () => {
    const calls = stubApi([
      ['GET', /\/groups$/, () => jsonResponse(200, { groups: discovered })],
      ['POST', /\/groups\/g2\/join$/, () => jsonResponse(200, { ok: true })],
    ]);
    const joined = vi.fn();
    renderApp(<DiscoverGroups mineIds={new Set()} onOpen={() => undefined} onJoined={joined} onNew={() => undefined} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Join: Klûba helbestê' }));
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/groups/g2/join'))).toBe(true);
    expect(await screen.findByRole('link', { name: 'Open: Klûba helbestê' })).toBeInTheDocument();
    expect(joined).toHaveBeenCalledWith(expect.objectContaining({ id: 'g2' }));
  });

  it('offers to start a group when there is none to find', async () => {
    stubApi([['GET', /\/groups$/, () => jsonResponse(200, { groups: [] })]]);
    const fresh = vi.fn();
    renderApp(<DiscoverGroups mineIds={new Set()} onOpen={() => undefined} onJoined={() => undefined} onNew={fresh} />);
    await userEvent.click(await screen.findByRole('button', { name: 'New group' }));
    expect(fresh).toHaveBeenCalled();
  });
});

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
  privacy: 'open',
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
    expect(screen.getByText('Open group · 4 members')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit group' })).toBeInTheDocument();
    // nobody manages themselves
    expect(await menuOf('ada')).toBeNull();
    expect(await menuOf('mira')).toEqual(['View profile', 'Remove admin', 'Make owner', 'Remove from group']);
    expect(await menuOf('zana')).toEqual(['View profile', 'Make admin', 'Make owner', 'Remove from group']);
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
    expect(await menuOf('mira')).toEqual(['View profile', 'Remove from group']);
    expect(await menuOf('zana')).toEqual(['View profile', 'Remove from group']);
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

  it('removes somebody only after saying who, from where — and Cancel changes nothing', async () => {
    const calls = stubApi([['DELETE', /\/groups\/g1\/members\/u-mem$/, () => jsonResponse(200, { ok: true })]]);
    const changed = vi.fn(async () => undefined);
    renderApp(<GroupInfo detail={detailFor('owner')} onChanged={changed} onLeft={() => undefined} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Options for zana' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from group' }));
    const ask = screen.getByRole('alertdialog', { name: 'Remove from group' });
    expect(within(ask).getByText('Remove zana from Test Group')).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Options for zana' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from group' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove from group' }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(calls.find((c) => c.method === 'DELETE')?.url).toMatch(/\/groups\/g1\/members\/u-mem$/);
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
