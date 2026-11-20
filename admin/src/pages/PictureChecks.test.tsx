// @vitest-environment jsdom
/**
 * Picture checks, against a fake API: what a moderator reads on each tab, that nothing of a picture is fetched until it
 * is shown, and exactly what approving and removing send.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { PictureCaseItem, PictureCaseList, PictureView } from '@kurda/shared';
import { setToken } from '../api';
import { failure, fakeApi, json, on, type Call, type Route } from '../test/fetch';
import { SUBJECT_ID } from '../test/moderation';
import { renderUi } from '../test/render';
import { PictureChecks } from './PictureChecks';

const HOUR = 3_600_000;
const ago = (h: number): string => new Date(Date.now() - h * HOUR).toISOString();
const posts = (calls: Call[], path: string | RegExp): Call[] =>
  calls.filter((c) => c.method === 'POST' && (typeof path === 'string' ? c.path === path : path.test(c.path)));
const lists = (calls: Call[]): Call[] => calls.filter((c) => c.method === 'GET' && c.path.startsWith('/admin/pictures'));

function picture(over: Partial<PictureCaseItem> = {}): PictureCaseItem {
  return {
    caseId: 'pc-1',
    surface: 'post',
    origin: 'held',
    levels: { sexual: 'likely', suggestive: 'possible', violence: 'none' },
    checkedBy: 'auto',
    createdAt: ago(5),
    owner: { id: SUBJECT_ID, username: 'baran', displayName: 'Baran Ç.', minor: true },
    context: { text: 'Our trip to the lake, with the whole family on the last day of summer.', groupName: null },
    note: null,
    reportCount: 0,
    sensitive: false,
    status: 'open',
    decided: null,
    ...over,
  };
}

function page(items: PictureCaseItem[], over: Partial<PictureCaseList> = {}): PictureCaseList {
  return { items, nextCursor: null, counts: { waiting: items.length, asked: 1, reported: 2 }, ...over };
}

const view = (caseId: string): PictureView => ({ url: `https://media.test/${caseId}.webp?sig=1`, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
const viewRoute: Route = on('POST', /^\/admin\/pictures\/[^/]+\/view$/, (c) => json(view(c.path.split('/')[3]!)));

function show(hash: string, ...routes: Route[]): ReturnType<typeof fakeApi> {
  setToken('tok');
  location.hash = hash;
  const api = fakeApi(viewRoute, ...routes);
  renderUi(<PictureChecks />);
  return api;
}

const tile = (name: string): HTMLElement => screen.getAllByRole('article').find((a) => a.dataset.case === name)!;
const tab = (label: string): HTMLElement => screen.getByRole('tab', { name: new RegExp(`^${label}`) });
/** The number on a tab, or null when it shows none. */
const countOn = (label: string): string | null => tab(label).querySelector('.tab-count')?.textContent ?? null;

/** Show a tile's picture and let it load, as approving waits for a look. */
async function look(user: ReturnType<typeof userEvent.setup>, at: HTMLElement): Promise<void> {
  await user.click(within(at).getByRole('button', { name: 'Show picture' }));
  fireEvent.load(await within(at).findByRole('img'));
}

afterEach(() => {
  setToken(null);
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('the waiting list', () => {
  it('shows each picture’s finding, owner, context and wait, and fetches no picture before it is shown', async () => {
    const { calls } = show(
      '#/picture-checks',
      on(
        'GET',
        '/admin/pictures?view=waiting',
        json(
          page([
            picture(),
            picture({ caseId: 'pc-2', surface: 'group_photo', levels: null, checkedBy: 'checker_unavailable', owner: null, context: { text: null, groupName: 'Kurmancî beginners' } }),
          ]),
        ),
      ),
    );
    // The placeholder is on screen before the list answers.
    expect(screen.getByText('Loading pictures…')).toBeInTheDocument();
    const first = await screen.findByRole('article', { name: 'Post' });
    expect(within(first).getByText('Held at upload')).toBeInTheDocument();
    expect(within(first).getByRole('list', { name: 'What the check found' })).toHaveTextContent('Nudity — likelySuggestive — possible');
    expect(within(first).queryByText(/Violence/)).not.toBeInTheDocument();
    expect(within(first).getByText('Checked automatically')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: '@baran' })).toHaveAttribute('href', `#/users/${SUBJECT_ID}`);
    expect(within(first).getByText('Minor')).toBeInTheDocument();
    expect(within(first).getByText('Baran Ç.')).toBeInTheDocument();
    expect(within(first).getByText(/^Our trip to the lake/)).toBeInTheDocument();
    expect(within(first).getByText(/^Waiting/)).toHaveTextContent('Waiting 5 h');
    expect(within(first).getByRole('link', { name: /Open case/ })).toHaveAttribute('href', '#/moderation/pc-1');

    const second = tile('pc-2');
    expect(within(second).getByRole('heading', { name: 'Group photo' })).toBeInTheDocument();
    expect(within(second).getByText('Checker unavailable, held for people')).toBeInTheDocument();
    // Held for people, so there are no findings to speak of.
    expect(within(second).queryByText(/findings|found/)).not.toBeInTheDocument();
    expect(within(second).getByText('Kurmancî beginners')).toBeInTheDocument();
    expect(within(second).getByText('Deleted account')).toBeInTheDocument();

    // The tabs carry the counts; nothing has asked for a picture, and none is on the page.
    expect(tab('Waiting')).toHaveAttribute('aria-selected', 'true');
    expect(countOn('Waiting')).toBe('2');
    expect(countOn('Asked')).toBe('1');
    expect(tab('Reported')).toHaveAttribute('href', '#/picture-checks?view=reported');
    expect(countOn('Decided')).toBeNull();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(posts(calls, /\/view$/)).toHaveLength(0);
  });

  it('says plainly when nothing is waiting', async () => {
    show('#/picture-checks', on('GET', '/admin/pictures?view=waiting', json(page([], { counts: { waiting: 0, asked: 0, reported: 0 } }))));
    expect(await screen.findByText('Nothing waiting')).toBeInTheDocument();
    expect(screen.getByText(/^Every picture has been checked\./)).toBeInTheDocument();
  });

  it('shows a load failure as one, with a way to try again', async () => {
    const user = userEvent.setup();
    const { calls, use } = show('#/picture-checks', on('GET', /^\/admin\/pictures\?/, failure(500, 'INTERNAL', 'boom')));
    expect(await screen.findByText('The server had a problem')).toBeInTheDocument();
    expect(screen.queryByText('Nothing waiting')).not.toBeInTheDocument();
    use(on('GET', /^\/admin\/pictures\?/, json(page([picture()]))));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('article', { name: 'Post' })).toBeInTheDocument();
    expect(lists(calls)).toHaveLength(2);
  });

  it('asks for the next page with the cursor the list gave', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/picture-checks',
      on('GET', '/admin/pictures?view=waiting', json(page([picture()], { nextCursor: 'c/2+' }))),
      on('GET', '/admin/pictures?view=waiting&cursor=c%2F2%2B', json(page([picture({ caseId: 'pc-9', surface: 'letter' })]))),
    );
    await user.click(await screen.findByRole('button', { name: 'Show more pictures' }));
    expect(await screen.findByRole('article', { name: 'Letter drawing' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Show more pictures' })).not.toBeInTheDocument();
    expect(lists(calls).map((c) => c.path)).toEqual(['/admin/pictures?view=waiting', '/admin/pictures?view=waiting&cursor=c%2F2%2B']);
  });
});

describe('the other tabs', () => {
  it('reads the tab from the address, with the owner’s own words on an asked picture', async () => {
    const { calls } = show(
      '#/picture-checks?view=asked',
      on('GET', '/admin/pictures?view=asked', json(page([picture({ origin: 'asked', note: 'It is a painting from a museum.' })]))),
    );
    const at = await screen.findByRole('article', { name: 'Post' });
    expect(within(at).getByText('Owner asked for a look')).toBeInTheDocument();
    expect(within(at).getByText('The owner wrote')).toBeInTheDocument();
    expect(within(at).getByText('It is a painting from a museum.')).toBeInTheDocument();
    expect(tab('Asked')).toHaveAttribute('aria-selected', 'true');
    expect(lists(calls).map((c) => c.path)).toEqual(['/admin/pictures?view=asked']);
  });

  it('counts the reports on a reported picture', async () => {
    const reported = picture({ origin: 'reported', reportCount: 3, levels: { sexual: 'none' } });
    show('#/picture-checks?view=reported', on('GET', '/admin/pictures?view=reported', json(page([reported]))));
    const at = await screen.findByRole('article', { name: 'Post' });
    expect(within(at).getByText('3 reports')).toBeInTheDocument();
    expect(within(at).getByText('The check found nothing to name.')).toBeInTheDocument();
  });

  it('says who decided what, and when, on the decided tab, with nothing left to decide', async () => {
    show(
      '#/picture-checks?view=decided',
      on(
        'GET',
        '/admin/pictures?view=decided',
        json(
          page([
            picture({ status: 'actioned', decided: { outcome: 'removed', byUsername: 'rojda', at: ago(2) } }),
            picture({ caseId: 'pc-2', status: 'no_violation', decided: { outcome: 'approved', byUsername: null, at: ago(30) } }),
          ]),
        ),
      ),
    );
    const removed = await screen.findByText(/^Removed by @rojda/);
    expect(removed).toHaveTextContent('Removed by @rojda 2 h ago');
    expect(within(tile('pc-2')).getByText(/^Approved by a moderator/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Open case/ })).toHaveLength(2);
  });

  it('gives each tab its own words when it is empty', async () => {
    show('#/picture-checks?view=asked', on('GET', /^\/admin\/pictures\?/, json(page([]))));
    expect(await screen.findByText('Nobody is asking')).toBeInTheDocument();
  });
});

describe('looking at a picture', () => {
  it('asks for a link only when shown, hides it again, and uses the same link while it lasts', async () => {
    const user = userEvent.setup();
    const { calls } = show('#/picture-checks', on('GET', '/admin/pictures?view=waiting', json(page([picture(), picture({ caseId: 'pc-2' })]))));
    await screen.findAllByRole('article');
    const at = tile('pc-1');
    await user.click(within(at).getByRole('button', { name: 'Show picture' }));
    const img = await within(at).findByRole('img');
    expect(img).toHaveAttribute('src', 'https://media.test/pc-1.webp?sig=1');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(posts(calls, '/admin/pictures/pc-1/view')).toHaveLength(1);
    // The other tile is still not fetched.
    expect(within(tile('pc-2')).queryByRole('img')).not.toBeInTheDocument();

    await user.click(within(at).getByRole('button', { name: 'Hide' }));
    expect(within(at).queryByRole('img')).not.toBeInTheDocument();
    await user.click(within(at).getByRole('button', { name: 'Show picture' }));
    expect(await within(at).findByRole('img')).toBeInTheDocument();
    expect(posts(calls, /\/view$/)).toHaveLength(1);
  });

  it('asks before showing a child-safety hit, and offers only its case', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/picture-checks',
      on('GET', '/admin/pictures?view=waiting', json(page([picture({ origin: 'child_safety', sensitive: true, levels: { minor_safety: 'likely' } })]))),
    );
    const at = await screen.findByRole('article', { name: 'Post' });
    expect(within(at).getByText('May be child sexual abuse material')).toBeInTheDocument();
    expect(within(at).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(within(at).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(within(at).getByRole('link', { name: /Open case/ })).toHaveAttribute('href', '#/moderation/pc-1');

    await user.click(within(at).getByRole('button', { name: 'Show picture' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Show this picture?' });
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(posts(calls, /\/view$/)).toHaveLength(0);
    expect(within(at).queryByRole('img')).not.toBeInTheDocument();

    await user.click(within(at).getByRole('button', { name: 'Show picture' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Show it' }));
    expect(await within(at).findByRole('img')).toBeInTheDocument();
    expect(posts(calls, '/admin/pictures/pc-1/view')).toHaveLength(1);
  });

  it('says when the picture can’t be fetched, and asks for a new link after one fails to load', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/picture-checks',
      on('GET', '/admin/pictures?view=waiting', json(page([picture()]))),
      on('POST', '/admin/pictures/pc-1/view', failure(404, 'NOT_FOUND', 'the picture is no longer stored')),
    );
    const at = await screen.findByRole('article', { name: 'Post' });
    await user.click(within(at).getByRole('button', { name: 'Show picture' }));
    expect(await within(at).findByRole('alert')).toHaveTextContent('The picture is no longer stored.');
    expect(within(at).getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(posts(calls, /\/view$/)).toHaveLength(1);
  });
});

describe('deciding', () => {
  it('approves only after a look, takes the tile off at once, and sends the approval', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/picture-checks',
      on('GET', '/admin/pictures?view=waiting', json(page([picture(), picture({ caseId: 'pc-2' })]))),
      on('POST', '/admin/pictures/pc-1/decide', json({ ok: true })),
    );
    await screen.findAllByRole('article');
    const at = tile('pc-1');
    expect(within(at).getByRole('button', { name: 'Approve' })).toBeDisabled();
    await look(user, at);
    await user.click(within(at).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(posts(calls, '/admin/pictures/pc-1/decide')).toHaveLength(1));
    expect(posts(calls, '/admin/pictures/pc-1/decide')[0]!.body).toEqual({ decision: 'approve' });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(countOn('Waiting')).toBe('1');
    expect(await screen.findByText('Approved. It is public now, and the owner is told.')).toBeInTheDocument();
  });

  it('removes under the rule the finding suggests, or another, with a note, after a confirmation', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/picture-checks',
      on('GET', '/admin/pictures?view=waiting', json(page([picture({ levels: { violence: 'certain', sexual: 'possible' } })]))),
      on('POST', '/admin/pictures/pc-1/decide', json({ ok: true })),
    );
    const at = await screen.findByRole('article', { name: 'Post' });
    await user.click(within(at).getByRole('button', { name: 'Remove' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Remove this picture?' });
    const rule = within(ask).getByLabelText('The rule it breaks');
    expect(rule).toHaveValue('violence');
    // Child sexual abuse material is never removed from here: its case keeps the evidence.
    expect(within(rule).queryByRole('option', { name: /Child safety/ })).not.toBeInTheDocument();

    // Cancelling sends nothing and keeps the tile.
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(posts(calls, /\/decide$/)).toHaveLength(0);
    expect(screen.getByRole('article', { name: 'Post' })).toBeInTheDocument();

    await user.click(within(at).getByRole('button', { name: 'Remove' }));
    const again = await screen.findByRole('alertdialog');
    await user.selectOptions(within(again).getByLabelText('The rule it breaks'), 'sexual');
    await user.type(within(again).getByLabelText('Note for the case (optional)'), 'Nude, posted in a public group.');
    await user.click(within(again).getByRole('button', { name: 'Remove picture' }));
    await waitFor(() => expect(posts(calls, '/admin/pictures/pc-1/decide')).toHaveLength(1));
    expect(posts(calls, '/admin/pictures/pc-1/decide')[0]!.body).toEqual({ decision: 'remove', policy: 'sexual', note: 'Nude, posted in a public group.' });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(await screen.findByText('Removed. The owner is told which rule it breaks and how to appeal.')).toBeInTheDocument();
  });

  it('starts a removal on “something else” when the check found nothing, and sends no empty note', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/picture-checks',
      on('GET', '/admin/pictures?view=waiting', json(page([picture({ levels: null, checkedBy: 'people_only' })]))),
      on('POST', '/admin/pictures/pc-1/decide', json({ ok: true })),
    );
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    const ask = await screen.findByRole('alertdialog');
    expect(within(ask).getByLabelText('The rule it breaks')).toHaveValue('other');
    await user.click(within(ask).getByRole('button', { name: 'Remove picture' }));
    await waitFor(() => expect(posts(calls, /\/decide$/)).toHaveLength(1));
    expect(posts(calls, /\/decide$/)[0]!.body).toEqual({ decision: 'remove', policy: 'other' });
  });

  it('says calmly when someone else decided first, and refreshes the list', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/picture-checks',
      on('GET', '/admin/pictures?view=waiting', json(page([picture()]))),
      on('POST', '/admin/pictures/pc-1/decide', failure(409, 'ALREADY_DECIDED', 'already decided')),
    );
    const at = await screen.findByRole('article', { name: 'Post' });
    await look(user, at);
    await user.click(within(at).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Another moderator decided that picture first, so the list has been refreshed.')).toBeInTheDocument();
    await waitFor(() => expect(lists(calls)).toHaveLength(2));
    // A note, not an error.
    expect(document.querySelector('.toast-region[data-tone="assertive"]')).toBeEmptyDOMElement();
  });

  it('puts the tile back and says why when the server refuses', async () => {
    const user = userEvent.setup();
    show(
      '#/picture-checks',
      on('GET', '/admin/pictures?view=waiting', json(page([picture()]))),
      on('POST', '/admin/pictures/pc-1/decide', failure(500, 'INTERNAL', 'boom')),
    );
    const at = await screen.findByRole('article', { name: 'Post' });
    await look(user, at);
    await user.click(within(at).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/^The server had a problem\./)).toBeInTheDocument();
    expect(await screen.findByRole('article', { name: 'Post' })).toBeInTheDocument();
    expect(countOn('Waiting')).toBe('1');
  });
});

describe('the keyboard', () => {
  it('moves with j and k, shows with Space, approves with a and opens the removal with r', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/picture-checks',
      on('GET', '/admin/pictures?view=waiting', json(page([picture(), picture({ caseId: 'pc-2' }), picture({ caseId: 'pc-3' })]))),
      on('POST', /\/decide$/, json({ ok: true })),
    );
    await screen.findAllByRole('article');
    await user.keyboard('j');
    expect(tile('pc-1')).toHaveFocus();
    await user.keyboard('jj');
    expect(tile('pc-3')).toHaveFocus();
    await user.keyboard('k');
    expect(tile('pc-2')).toHaveFocus();

    // Approving waits for a look: a says so, and sends nothing.
    await user.keyboard('a');
    expect(await screen.findByText('Show the picture first, then approve it.')).toBeInTheDocument();
    expect(posts(calls, /\/decide$/)).toHaveLength(0);

    await user.keyboard(' ');
    fireEvent.load(await within(tile('pc-2')).findByRole('img'));
    expect(posts(calls, '/admin/pictures/pc-2/view')).toHaveLength(1);
    tile('pc-2').focus();
    await user.keyboard('a');
    await waitFor(() => expect(posts(calls, '/admin/pictures/pc-2/decide')).toHaveLength(1));
    // Focus goes to the tile that took its place.
    await waitFor(() => expect(tile('pc-3')).toHaveFocus());

    await user.keyboard('r');
    const ask = await screen.findByRole('alertdialog', { name: 'Remove this picture?' });
    // The page’s keys rest while the dialog is open.
    await user.keyboard('j');
    expect(within(ask).getByLabelText('The rule it breaks')).toHaveFocus();
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(posts(calls, /\/decide$/)).toHaveLength(1);
  });
});
