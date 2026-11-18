import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagsCard } from './TagsCard';
import { renderApp, jsonResponse } from '../test/utils';
import type { ClaimedTag, ProfileTags, TagRow } from '@kurda/shared';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const row = (over: Partial<TagRow>): TagRow => ({
  id: over.key ?? 'x',
  key: 'x',
  label: 'X',
  kind: 'claimable',
  category: 'c',
  acquisition: 'self_claim',
  roleRequired: null,
  shopSku: null,
  sensitive: false,
  active: true,
  ...over,
});

const claimedTag = (over: Partial<ClaimedTag>): ClaimedTag => ({
  key: 'age',
  label: 'Age',
  category: 'about',
  value: null,
  sensitive: false,
  displayed: true,
  ...over,
});

/**
 * Answers the card's three endpoints. Longest key first, since '/me/tags/claimed' contains '/me/tags' and a plain
 * find() would hand the claimed list the profile fixture.
 */
function tagServer(parts: { mine?: Partial<ProfileTags>; claimed?: ClaimedTag[]; catalog?: TagRow[] }) {
  const posts: Array<{ url: string; body: unknown }> = [];
  const deletes: string[] = [];
  const mine: ProfileTags = { main: null, claimable: [], ...parts.mine };
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      posts.push({ url: u, body: JSON.parse(String(init.body)) });
      return jsonResponse(200, { claimed: true, updated: true });
    }
    if (init?.method === 'DELETE') {
      deletes.push(u);
      return jsonResponse(200, { removed: true });
    }
    if (u.includes('/me/tags/claimed')) return jsonResponse(200, { tags: parts.claimed ?? [] });
    if (u.includes('/me/tags')) return jsonResponse(200, mine);
    if (u.includes('/tags')) return jsonResponse(200, { tags: parts.catalog ?? [] });
    return jsonResponse(200, {});
  });
  return { fetch, posts, deletes };
}

describe('TagsCard', () => {
  it('shows the main tag the server derived, or says there is none', async () => {
    vi.stubGlobal('fetch', tagServer({ mine: { main: { key: 'founder', label: 'Founder' } } }).fetch);
    renderApp(<TagsCard />);
    expect(await screen.findByText('Founder')).toBeInTheDocument();

    vi.restoreAllMocks();
    vi.stubGlobal('fetch', tagServer({}).fetch);
    renderApp(<TagsCard />);
    expect(await screen.findByText('No main tag yet.')).toBeInTheDocument();
  });

  it('lists a claimed tag with its value', async () => {
    vi.stubGlobal('fetch', tagServer({ claimed: [claimedTag({ value: '25–34' })] }).fetch);
    renderApp(<TagsCard />);
    expect(await screen.findByText('Age: 25–34')).toBeInTheDocument();
  });

  it('says so when there are none', async () => {
    vi.stubGlobal('fetch', tagServer({}).fetch);
    renderApp(<TagsCard />);
    expect(await screen.findByText('You haven’t added any tags yet.')).toBeInTheDocument();
  });

  it('posts the key and the new state when showing is toggled off', async () => {
    const s = tagServer({ claimed: [claimedTag({ displayed: true })] });
    vi.stubGlobal('fetch', s.fetch);
    renderApp(<TagsCard />);

    await userEvent.click(await screen.findByRole('checkbox', { name: /Show Age on profile/i }));
    await waitFor(() => expect(s.posts).toHaveLength(1));
    expect(s.posts[0]!.url).toContain('/me/tags/display');
    expect(s.posts[0]!.body).toEqual({ key: 'age', displayed: false });
  });

  it('hides a tag at once, ends quick presses in the last one, and puts the box back when refused', async () => {
    const s = tagServer({ claimed: [claimedTag({ displayed: true })] });
    const answers: Array<(res: Response) => void> = [];
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          sent.push(JSON.parse(String(init.body)));
          return new Promise<Response>((r) => answers.push(r));
        }
        return s.fetch(url, init);
      }),
    );
    renderApp(<TagsCard />);

    const box = await screen.findByRole('checkbox', { name: /Show Age on profile/i });
    await userEvent.click(box);
    await userEvent.click(box);
    await userEvent.click(box);
    expect(box).not.toBeChecked();
    expect(screen.getByText('hidden')).toBeInTheDocument();
    expect(sent).toEqual([{ key: 'age', displayed: false }]);
    answers[0]!(jsonResponse(503, {}));
    // The newest press still asks for "hidden", so that goes next; only its refusal puts the box back.
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(box).not.toBeChecked();
    answers[1]!(jsonResponse(503, {}));
    await waitFor(() => expect(box).toBeChecked());
    expect(await screen.findByRole('status')).toHaveTextContent('Something went wrong on our end. Please try again shortly.');
  });

  /** Giving up a tag cannot be undone, so the first press arms `ConfirmButton` and only a second goes through. */
  it('arms rather than deleting on the first press', async () => {
    const s = tagServer({ claimed: [claimedTag({ value: '25–34' })] });
    vi.stubGlobal('fetch', s.fetch);
    renderApp(<TagsCard />);

    const remove = await screen.findByRole('button', { name: 'Remove Age' });
    await userEvent.click(remove);
    expect(s.deletes).toHaveLength(0);
    expect(remove).toHaveTextContent('Sure?');
  });

  it('deletes on the second press', async () => {
    const s = tagServer({ claimed: [claimedTag({})] });
    vi.stubGlobal('fetch', s.fetch);
    renderApp(<TagsCard />);

    const remove = await screen.findByRole('button', { name: 'Remove Age' });
    await userEvent.click(remove);
    await userEvent.click(remove);
    await waitFor(() => expect(s.deletes).toHaveLength(1));
    expect(s.deletes[0]).toContain('/me/tags/age');
  });

  describe('a sensitive tag', () => {
    const catalog = [row({ key: 'ethnicity', label: 'Ethnicity', sensitive: true })];

    it('cannot be claimed until consent is ticked', async () => {
      const s = tagServer({ catalog });
      vi.stubGlobal('fetch', s.fetch);
      renderApp(<TagsCard />);

      await userEvent.click(await screen.findByRole('button', { name: 'Ethnicity' }));
      const add = screen.getByRole('button', { name: 'Add' });
      expect(add).toBeDisabled();
      expect(screen.getByText('Consent needed')).toBeInTheDocument();
      expect(s.posts).toHaveLength(0);
    });

    it('sends the consent it was given, with the typed value', async () => {
      const s = tagServer({ catalog });
      vi.stubGlobal('fetch', s.fetch);
      renderApp(<TagsCard />);

      await userEvent.click(await screen.findByRole('button', { name: 'Ethnicity' }));
      await userEvent.type(screen.getByLabelText(/Your Ethnicity/i), '  Kurd  ');
      await userEvent.click(screen.getByRole('checkbox', { name: /I consent/i }));
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      await waitFor(() => expect(s.posts).toHaveLength(1));
      // Trimmed, with the consent flag only because this tag needs one.
      expect(s.posts[0]!.body).toEqual({ key: 'ethnicity', value: 'Kurd', consent: true });
    });
  });

  it('claims an ordinary tag without asking for consent', async () => {
    const s = tagServer({ catalog: [row({ key: 'city', label: 'City' })] });
    vi.stubGlobal('fetch', s.fetch);
    renderApp(<TagsCard />);

    await userEvent.click(await screen.findByRole('button', { name: 'City' }));
    expect(screen.queryByText('Consent needed')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(s.posts).toHaveLength(1));
    expect(s.posts[0]!.body).toEqual({ key: 'city' });
  });

  /* Automatic tags are shown, with no controls. */
  it('names the automatic tags without offering to change them', async () => {
    vi.stubGlobal(
      'fetch',
      tagServer({
        mine: { claimable: [{ key: 'level', label: 'Level', category: 'x', value: '7', sensitive: false, auto: true }] },
      }).fetch,
    );
    renderApp(<TagsCard />);

    expect(await screen.findByText(/Automatic: Level: 7/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove Level/ })).not.toBeInTheDocument();
  });

  it('sends a purchase tag to the shop rather than offering to claim it', async () => {
    vi.stubGlobal(
      'fetch',
      tagServer({ catalog: [row({ key: 'kurdish', label: 'Kurdish', acquisition: 'purchase', shopSku: 'tag_kurdish' })] })
        .fetch,
    );
    renderApp(<TagsCard />);

    const link = await screen.findByRole('link', { name: 'Get the Kurdish tag' });
    expect(link).toHaveAttribute('href', '/app/shop');
    expect(screen.queryByRole('button', { name: 'Kurdish' })).not.toBeInTheDocument();
  });

  /** A 200 with no `tags` in the body means no tags, and must not take the Edit Profile page down. */
  it('survives a response with no tags in it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<TagsCard />);

    expect(await screen.findByText('You haven’t added any tags yet.')).toBeInTheDocument();
    expect(screen.getByText('No main tag yet.')).toBeInTheDocument();
  });

  it('reads in the chosen language', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    vi.stubGlobal('fetch', tagServer({}).fetch);
    renderApp(<TagsCard />);

    // The title is "Tags" in German too, so the lines under it show the language.
    expect(await screen.findByRole('heading', { name: 'Tags' })).toBeInTheDocument();
    expect(await screen.findByText('Haupt-Tag')).toBeInTheDocument();
  });
});
