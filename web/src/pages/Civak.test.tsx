import { describe, it, expect, vi, afterEach } from 'vitest';
import { preloadCatalogue } from '../i18n/catalogues';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { Civak } from './Civak';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const signIn = () =>
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));

const engagement = (over = {}) => ({ likes: 0, bookmarks: 0, liked: false, bookmarked: false, ...over });

const item = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  targetType: 'library',
  id: key.split(':')[1] ?? key,
  kind: 'story',
  author: { id: 'a1', username: 'dilan', avatarUrl: null },
  title: 'Çîroka min',
  excerpt: 'Rojeke em derketin rê.',
  imageUrl: null,
  href: '/app/library/s1',
  viewCount: 3,
  commentCount: 2,
  engagement: engagement(),
  at: '2026-09-01T10:00:00.000Z',
  ...over,
});

/** Serve /feed, remember every query it was asked with, and log writes. */
function feedFetch(items: unknown[], onToggle?: () => unknown) {
  const queries: string[] = [];
  const posts: string[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/feed')) {
      queries.push(url.slice(url.indexOf('/feed')));
      return jsonResponse(200, { items });
    }
    if (url.includes('/posts/')) {
      posts.push(`${init?.method ?? 'GET'} ${url.slice(url.indexOf('/posts'))}`);
      return jsonResponse(200, onToggle ? onToggle() : { on: true, engagement: engagement({ likes: 1, liked: true }) });
    }
    if (url.includes('/me')) return jsonResponse(200, { user: { id: 'me', username: 'me' } });
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetch);
  return { queries, posts };
}

describe('Civak', () => {
  it('shows one card per post, whatever kind it is', async () => {
    feedFetch([
      item('library:s1'),
      item('library:p1', { kind: 'poem', title: 'Dara Hinarê', href: '/app/library/p1' }),
      item('image:i1', {
        targetType: 'image',
        kind: 'image',
        title: null,
        imageUrl: 'https://cdn.test/a.webp',
        excerpt: 'Çiyayên welêt',
        href: '/app/dimen/i1',
      }),
    ]);
    renderApp(<Civak />, ['/app/civak']);

    expect(await screen.findByText('Çîroka min')).toBeInTheDocument();
    expect(screen.getByText('Dara Hinarê')).toBeInTheDocument();
    // the merge is the point: a picture sits between the words, not on its own
    // page — and it opens full size, so it is a button named for what it does
    const picture = screen.getByRole('button', { name: 'Open picture 1 of 1' });
    expect(picture.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/a.webp');
    // one name over each post, and a picture's words above it rather than a caption under it
    expect(screen.getAllByText('dilan')).toHaveLength(3);
    expect(document.querySelectorAll('.fcard-name')).toHaveLength(3);
    expect(screen.getByText('Çiyayên welêt').closest('.fcard-body')?.nextElementSibling).toHaveClass('fcard-media');
  });

  it('asks the server for the filter rather than filtering what it already has', async () => {
    const { queries } = feedFetch([item('library:s1')]);
    renderApp(<Civak />, ['/app/civak']);
    await screen.findByText('Çîroka min');
    expect(queries[0]).toContain('section=all');

    await userEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    const writing = within(screen.getByRole('dialog', { name: 'Sort and filter' })).getByRole('group', { name: 'Writing' });
    await userEvent.click(within(writing).getByRole('radio', { name: 'Poem' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show posts' }));

    await waitFor(() =>
      expect(queries.some((q) => q.includes('section=gotin') && q.includes('kind=helbest'))).toBe(true),
    );
  });

  it('starts on the half and kind the address asked for', async () => {
    const { queries } = feedFetch([item('library:p1')]);
    // so /app/poems can simply redirect here and land somewhere meaningful
    renderApp(<Civak />, ['/app/civak?section=gotin&kind=helbest']);
    await waitFor(() => expect(queries[0]).toContain('kind=helbest'));
    expect(screen.getByRole('button', { name: 'Sort and filter — Writing · Poem' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Writing · Poem' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Writing · Poem' }));
    const writing = within(screen.getByRole('dialog', { name: 'Sort and filter' })).getByRole('group', { name: 'Writing' });
    expect(within(writing).getByRole('radio', { name: 'Poem' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Everything' })).toHaveAttribute('aria-checked', 'false');
  });

  it('drops a kind that does not belong to the half it is asked with', async () => {
    const { queries } = feedFetch([item('library:s1')]);
    // a helbest inside Dîmen is a contradiction the server refuses, so the
    // leftover kind is dropped rather than sent
    renderApp(<Civak />, ['/app/civak?section=dimen&kind=helbest']);
    await waitFor(() => expect(queries).toHaveLength(1));
    expect(queries[0]).toContain('section=dimen');
    expect(queries[0]).not.toContain('kind=');
  });

  it('likes a post and keeps the new count, without reloading the wall', async () => {
    signIn();
    const { queries, posts } = feedFetch([item('library:s1')]);
    renderApp(<Civak />, ['/app/civak']);

    const card = (await screen.findByText('Çîroka min')).closest<HTMLElement>('.fcard')!;
    const like = within(card).getByRole('button', { name: /^Like/ });
    await waitFor(() => expect(like).toBeEnabled());
    await userEvent.click(like);

    await waitFor(() => expect(posts).toContain('POST /posts/library/s1/like'));
    // the server's answer replaces the card in place — a reload would lose your
    // scroll position for the sake of one number
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Unlike (1)' })).toBeInTheDocument());
    expect(card.textContent).toContain('1');
    expect(queries).toHaveLength(1);
  });

  it('saves a post separately from liking it', async () => {
    signIn();
    const { posts } = feedFetch([item('library:s1')], () => ({
      on: true,
      engagement: engagement({ bookmarks: 1, bookmarked: true }),
    }));
    renderApp(<Civak />, ['/app/civak']);

    const card = (await screen.findByText('Çîroka min')).closest<HTMLElement>('.fcard')!;
    const save = within(card).getByRole('button', { name: 'Save' });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() => expect(posts).toContain('POST /posts/library/s1/bookmark'));
    await waitFor(() =>
      expect(within(card).getByRole('button', { name: 'Remove from saved' })).toBeInTheDocument(),
    );
  });

  it('shows the counts to a guest but does not let them act', async () => {
    const { posts } = feedFetch([item('library:s1', { engagement: engagement({ likes: 4 }) })]);
    renderApp(<Civak />, ['/app/civak']);

    const like = await screen.findByRole('button', { name: 'Sign in to like' });
    // the count is still readable; it is the label that says what it is
    expect(like).toBeDisabled();
    expect(like.textContent).toContain('4');
    await userEvent.click(like);
    expect(posts).toHaveLength(0);
  });

  it('says so plainly when the wall is empty', async () => {
    feedFetch([]);
    renderApp(<Civak />, ['/app/civak']);
    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('badges a gotin, which has no title of its own', async () => {
    feedFetch([item('library:g1', { kind: 'gotin', title: null, excerpt: 'Jiyan bi kurdî xweştire.' })]);
    renderApp(<Civak />, ['/app/civak']);

    expect(await screen.findByText('Jiyan bi kurdî xweştire.')).toBeInTheDocument();
    // scoped to the card: 'Saying' also names a filter chip above it
    expect(within(screen.getByRole('article')).getByText('Saying')).toBeInTheDocument();
  });

  /**
   * The wall in another language, section names and all.
   *
   * Civak, Gotin, Dîmen, Çîrok, Helbest, Wêne and Mîm are Kurdish words, and
   * Kurdish is one of the eight languages this app is read in rather than a
   * layer on top of the others. Somebody who chose Spanish gets Spanish;
   * leaving the sections in a language they do not read would make the app
   * harder to use, not more authentic.
   */
  describe('in another language', () => {
    it('translates the sections, not only the words around them', async () => {
      localStorage.setItem('hevalo_locale', 'es');
      await preloadCatalogue();
      feedFetch([item('library:s1')]);
      renderApp(<Civak />, ['/app/civak']);

      expect(await screen.findByText('Relatos, poemas e imágenes de todo el mundo.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Comunidad', level: 1 })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Ordenar y filtrar' }));
      const panel = screen.getByRole('dialog', { name: 'Ordenar y filtrar' });
      expect(within(panel).getByRole('radiogroup', { name: 'Ordenar por' })).toBeInTheDocument();
      expect(within(panel).getByRole('radio', { name: 'Más populares' })).toBeInTheDocument();
      expect(within(panel).getByRole('radio', { name: 'Todo' })).toBeInTheDocument();
      expect(within(panel).getByRole('group', { name: 'Escritos' })).toBeInTheDocument();
      expect(within(panel).getByRole('radio', { name: 'Todas las imágenes' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Mostrar publicaciones' })).toBeInTheDocument();
    });

    /** In Kurmancî those words ARE the translation, so they come back. */
    it('keeps the Kurdish words for someone reading in Kurdish', async () => {
      localStorage.setItem('hevalo_locale', 'ku');
      await preloadCatalogue();
      feedFetch([item('library:s1')]);
      renderApp(<Civak />, ['/app/civak']);

      expect(await screen.findByRole('heading', { name: 'Civak', level: 1 })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Rêz bike û parzûn bike' }));
      const panel = screen.getByRole('dialog', { name: 'Rêz bike û parzûn bike' });
      expect(within(panel).getByRole('radiogroup', { name: 'Nîşan bide' })).toBeInTheDocument();
      expect(within(panel).getByRole('group', { name: 'Gotin' })).toBeInTheDocument();
      expect(within(panel).getByRole('group', { name: 'Dîmen' })).toBeInTheDocument();
    });

    it('translates the badge on a card', async () => {
      localStorage.setItem('hevalo_locale', 'fr');
      await preloadCatalogue();
      feedFetch([item('library:p1', { kind: 'poem' })]);
      renderApp(<Civak />, ['/app/civak']);

      await screen.findByText('Çîroka min');
      expect(within(screen.getByRole('article')).getByText('Poème')).toBeInTheDocument();
    });

    it('translates the controls on a card', async () => {
      localStorage.setItem('hevalo_locale', 'de');
      await preloadCatalogue();
      signIn();
      feedFetch([item('library:s1')]);
      renderApp(<Civak />, ['/app/civak']);

      await screen.findByText('Çîroka min');
      expect(screen.getByTitle('Gefällt mir')).toBeInTheDocument();
      expect(screen.getByTitle('Speichern')).toBeInTheDocument();
    });

    /*
     * This asked "what are you posting?" — words or pictures — in Turkish.
     * There is no such question any more (one box for both, web/src/composer),
     * so what is pinned now is that the one box speaks the reader's language.
     */
    it('offers to post in your language, in one box for words and pictures', async () => {
      localStorage.setItem('hevalo_locale', 'tr');
      await preloadCatalogue();
      signIn();
      feedFetch([]);
      renderApp(<Civak />, ['/app/civak']);

      await userEvent.click(await screen.findByRole('button', { name: 'Bir şey paylaş' }));
      const dialog = await screen.findByRole('dialog', { name: 'Yeni gönderi' });
      expect(within(dialog).getByPlaceholderText('Aklında ne var?')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Fotoğraf ekle (0/4)' })).toBeInTheDocument();
      expect(within(dialog).queryByText('Ne paylaşıyorsun?')).not.toBeInTheDocument();
    });
  });

  describe('pictures on written posts', () => {
    const pic = (n: number, alt: string | null = null) => ({ url: `https://cdn.test/${n}.webp`, alt, width: 1200, height: 900 });

    it('shows up to four pictures one at a time, each named by its description', async () => {
      feedFetch([
        item('library:g1', {
          kind: 'gotin',
          title: null,
          excerpt: 'Newroz li Amedê',
          images: [pic(1, 'Agirê Newrozê'), pic(2), pic(3)],
          imageUrl: 'https://cdn.test/1.webp',
        }),
      ]);
      renderApp(<Civak />, ['/app/civak']);

      const group = await screen.findByRole('group', { name: '3 pictures' });
      expect(within(group).getAllByRole('button', { name: /^Open picture/ })).toHaveLength(3);
      // the author's description, never the post's words, is what a reader hears
      expect(within(group).getByRole('button', { name: 'Open picture 1 of 3: Agirê Newrozê' })).toBeInTheDocument();
      expect(within(group).getByRole('button', { name: 'Open picture 2 of 3' })).toBeInTheDocument();
      // on the wall they are swiped through, not tiled
      expect(group).toHaveClass('pp-strip');
      expect(group.querySelector('.pp-counter')?.textContent).toBe('1/3');
    });

    it('badges a post marked as a meme as a meme, and one that is only pictures as a photo', async () => {
      feedFetch([
        item('library:m1', { kind: 'gotin', title: null, excerpt: 'Dema mamoste dibêje…', meme: true, images: [pic(1)] }),
        item('library:p2', { kind: 'gotin', title: null, excerpt: null, images: [pic(2)] }),
      ]);
      renderApp(<Civak />, ['/app/civak']);

      await screen.findByText('Dema mamoste dibêje…');
      expect(screen.getByText('Meme')).toBeInTheDocument();
      expect(screen.getByText('Photo')).toBeInTheDocument();
      expect(screen.queryByText('Saying')).not.toBeInTheDocument();
    });

    it('asks the server for photos or memes inside Pictures', async () => {
      const { queries } = feedFetch([item('library:s1')]);
      renderApp(<Civak />, ['/app/civak']);
      await screen.findByText('Çîroka min');

      await userEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
      await userEvent.click(screen.getByRole('radio', { name: 'Meme' }));
      await userEvent.click(screen.getByRole('button', { name: 'Show posts' }));
      await waitFor(() => expect(queries.some((q) => q.includes('section=dimen') && q.includes('kind=mim'))).toBe(true));

      await userEvent.click(screen.getByRole('button', { name: 'Sort and filter — Pictures · Meme' }));
      await userEvent.click(screen.getByRole('radio', { name: 'Photo' }));
      await userEvent.click(screen.getByRole('button', { name: 'Show posts' }));
      await waitFor(() => expect(queries.some((q) => q.includes('section=dimen') && q.includes('kind=wene'))).toBe(true));
    });

    it('still shows the one picture an older server sends', async () => {
      feedFetch([item('image:i1', { targetType: 'image', kind: 'image', title: null, excerpt: null, imageUrl: 'https://cdn.test/old.webp' })]);
      renderApp(<Civak />, ['/app/civak']);
      const open = await screen.findByRole('button', { name: 'Open picture 1 of 1' });
      expect(open.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/old.webp');
    });
  });

  /**
   * Sort and filter are one button, not rows of toggles: the wall opens on the
   * posts, and the choices are there when they are wanted. Choices are a draft
   * until "Show posts"; a chip says what differs from the plain wall while it does.
   */
  describe('sort and filter', () => {
    /** Where the router is, so a test can see a choice reach the address. */
    function Where(): React.JSX.Element {
      return <output data-testid="where">{useLocation().search}</output>;
    }
    const where = (): string | null => screen.getByTestId('where').textContent;
    const panel = (): HTMLElement => screen.getByRole('dialog', { name: 'Sort and filter' });
    const names = (group: HTMLElement): string[] => within(group).getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.textContent ?? '');

    async function wall(at = '/app/civak', items: unknown[] = [item('library:s1')]) {
      const fetched = feedFetch(items);
      renderApp(
        <>
          <Civak />
          <Where />
        </>,
        [at],
      );
      if (items.length > 0) await screen.findByText('Çîroka min');
      else await screen.findByText('Nothing here yet.');
      return fetched;
    }

    it('puts no toggles over the wall, only a button that opens one panel', async () => {
      await wall();
      expect(screen.queryByRole('button', { name: 'Writing' })).not.toBeInTheDocument();
      expect(document.querySelector('.seg')).toBeNull();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      const button = screen.getByRole('button', { name: 'Sort and filter' });
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');

      const sortBy = within(panel()).getByRole('radiogroup', { name: 'Sort by' });
      expect(names(sortBy)).toEqual(['Newest', 'Oldest', 'Most popular', 'Most discussed']);
      // what the ranked two count is said under them
      expect(within(sortBy).getByRole('radio', { name: 'Most popular' })).toHaveAccessibleDescription('Hearts, reposts and comments');
      expect(within(sortBy).getByRole('radio', { name: 'Most discussed' })).toHaveAccessibleDescription('Most comments');
      // the order chosen now is ticked, and is where the keyboard starts
      const newest = within(sortBy).getByRole('radio', { name: 'Newest' });
      expect(newest).toHaveAttribute('aria-checked', 'true');
      expect(newest).toHaveFocus();
      // newest first reads everything, so there is no range to choose
      expect(within(panel()).queryByRole('radiogroup', { name: 'From' })).not.toBeInTheDocument();

      expect(names(within(panel()).getByRole('radiogroup', { name: 'Show' }))).toEqual([
        'Everything',
        'All writing',
        'Saying',
        'Story',
        'Poem',
        'All pictures',
        'Photo',
        'Meme',
      ]);
      // nothing to reset on the plain wall, and no chip while it is the plain wall
      expect(within(panel()).getByRole('button', { name: 'Reset' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Back to newest' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show everything' })).not.toBeInTheDocument();
    });

    it('sorts by the most popular this week once Show posts is pressed, and says so', async () => {
      const { queries } = await wall();
      await userEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
      await userEvent.click(within(panel()).getByRole('radio', { name: 'Most popular' }));

      // a ranked order looks back over a range, all of it until told otherwise
      const from = within(panel()).getByRole('radiogroup', { name: 'From' });
      expect(names(from)).toEqual(['Today', 'This week', 'This month', 'This year', 'All time']);
      expect(within(from).getByRole('radio', { name: 'All time' })).toHaveAttribute('aria-checked', 'true');
      await userEvent.click(within(from).getByRole('radio', { name: 'This week' }));
      // a draft: nothing is asked for until it is shown
      expect(queries).toHaveLength(1);

      await userEvent.click(within(panel()).getByRole('button', { name: 'Show posts' }));
      await waitFor(() => expect(queries.at(-1)).toContain('sort=popular'));
      expect(queries.at(-1)).toContain('period=week');
      expect(queries.at(-1)).toContain('offset=0');
      expect(where()).toBe('?sort=popular&period=week');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const button = screen.getByRole('button', { name: 'Sort and filter — Most popular, This week' });
      expect(button).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Most popular · This week' })).toBeInTheDocument();
    });

    it('names every part that differs on the button, and gives each part a chip of its own', async () => {
      await wall('/app/civak?section=dimen&kind=mim&sort=discussed&period=month');
      expect(screen.getByRole('button', { name: 'Sort and filter — Most discussed, This month, Pictures · Meme' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Most discussed · This month' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pictures · Meme' })).toBeInTheDocument();
    });

    it('goes back to the newest from the order’s ✕, keeping the kinds', async () => {
      const { queries } = await wall('/app/civak?section=dimen&kind=mim&sort=popular&period=week');
      expect(queries[0]).toContain('sort=popular');

      await userEvent.click(screen.getByRole('button', { name: 'Back to newest' }));
      await waitFor(() => expect(queries.at(-1)).not.toContain('sort='));
      expect(queries.at(-1)).not.toContain('period=');
      expect(queries.at(-1)).toContain('kind=mim');
      expect(where()).toBe('?section=dimen&kind=mim');
      expect(screen.queryByRole('button', { name: 'Most popular · This week' })).not.toBeInTheDocument();
      // the chip went, so the keyboard lands on the funnel rather than nowhere
      expect(screen.getByRole('button', { name: 'Sort and filter — Pictures · Meme' })).toHaveFocus();
    });

    it('shows everything again from the kinds’ ✕, keeping the order', async () => {
      const { queries } = await wall('/app/civak?section=dimen&kind=mim&sort=oldest');

      await userEvent.click(screen.getByRole('button', { name: 'Show everything' }));
      await waitFor(() => expect(queries.at(-1)).toContain('section=all'));
      expect(queries.at(-1)).not.toContain('kind=');
      expect(queries.at(-1)).toContain('sort=oldest');
      expect(where()).toBe('?sort=oldest');
      expect(screen.queryByRole('button', { name: 'Pictures · Meme' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sort and filter — Oldest' })).toHaveFocus();
    });

    it('changes nothing when it is closed without Show posts', async () => {
      const { queries } = await wall();
      const button = screen.getByRole('button', { name: 'Sort and filter' });

      for (const close of ['escape', 'cross', 'outside'] as const) {
        await userEvent.click(button);
        await userEvent.click(within(panel()).getByRole('radio', { name: 'Oldest' }));
        await userEvent.click(within(panel()).getByRole('radio', { name: 'Meme' }));
        if (close === 'escape') await userEvent.keyboard('{Escape}');
        if (close === 'cross') await userEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
        if (close === 'outside') await userEvent.click(screen.getByRole('heading', { name: 'Community', level: 1 }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      }
      expect(queries).toHaveLength(1);
      expect(where()).toBe('');

      // and the draft went with it: the panel opens on what the wall shows
      await userEvent.click(button);
      expect(within(panel()).getByRole('radio', { name: 'Newest' })).toHaveAttribute('aria-checked', 'true');
      expect(within(panel()).getByRole('radio', { name: 'Everything' })).toHaveAttribute('aria-checked', 'true');
    });

    it('puts the draft back to the plain wall with Reset', async () => {
      const { queries } = await wall('/app/civak?section=gotin&sort=oldest');
      await userEvent.click(screen.getByRole('button', { name: 'Oldest' }));
      expect(within(panel()).getByRole('radio', { name: 'Oldest' })).toHaveAttribute('aria-checked', 'true');
      expect(within(panel()).getByRole('radio', { name: 'All writing' })).toHaveAttribute('aria-checked', 'true');

      const reset = within(panel()).getByRole('button', { name: 'Reset' });
      await userEvent.click(reset);
      expect(within(panel()).getByRole('radio', { name: 'Newest' })).toHaveAttribute('aria-checked', 'true');
      expect(within(panel()).getByRole('radio', { name: 'Everything' })).toHaveAttribute('aria-checked', 'true');
      expect(reset).toBeDisabled();
      // still a draft
      expect(queries).toHaveLength(1);

      await userEvent.click(within(panel()).getByRole('button', { name: 'Show posts' }));
      await waitFor(() => expect(queries).toHaveLength(2));
      expect(queries[1]).toContain('section=all');
      expect(queries[1]).not.toContain('sort=');
      expect(where()).toBe('');
    });

    it('keeps the range to the two orders that rank', async () => {
      const { queries } = await wall();
      await userEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
      const sortBy = within(panel()).getByRole('radiogroup', { name: 'Sort by' });

      await userEvent.click(within(sortBy).getByRole('radio', { name: 'Oldest' }));
      expect(within(panel()).queryByRole('radiogroup', { name: 'From' })).not.toBeInTheDocument();
      await userEvent.click(within(sortBy).getByRole('radio', { name: 'Most discussed' }));
      await userEvent.click(within(panel()).getByRole('radio', { name: 'Today' }));
      await userEvent.click(within(sortBy).getByRole('radio', { name: 'Oldest' }));
      expect(within(panel()).queryByRole('radiogroup', { name: 'From' })).not.toBeInTheDocument();

      await userEvent.click(within(panel()).getByRole('button', { name: 'Show posts' }));
      await waitFor(() => expect(queries.at(-1)).toContain('sort=oldest'));
      expect(queries.at(-1)).not.toContain('period=');
      expect(where()).toBe('?sort=oldest');
      expect(screen.getByRole('button', { name: 'Oldest' })).toBeInTheDocument();
    });

    it('reads the order back from the address, and passes over what it does not mean', async () => {
      const first = await wall('/app/civak?sort=discussed&period=month');
      expect(first.queries[0]).toContain('sort=discussed');
      expect(first.queries[0]).toContain('period=month');
      cleanup();

      const second = await wall('/app/civak?sort=random&period=decade');
      expect(second.queries[0]).not.toContain('sort=');
      expect(second.queries[0]).not.toContain('period=');
      expect(screen.getByRole('button', { name: 'Sort and filter' })).toBeInTheDocument();
      cleanup();

      // a range means nothing to the oldest first, so it is not sent
      const third = await wall('/app/civak?sort=oldest&period=week');
      expect(third.queries[0]).toContain('sort=oldest');
      expect(third.queries[0]).not.toContain('period=');
    });

    it('is worked by the keyboard: arrows choose within a group, Tab goes from group to group and stays inside', async () => {
      const { queries } = await wall();
      const button = screen.getByRole('button', { name: 'Sort and filter' });
      button.focus();
      await userEvent.keyboard('{Enter}');
      expect(within(panel()).getByRole('radio', { name: 'Newest' })).toHaveFocus();

      await userEvent.keyboard('{ArrowDown}');
      const oldest = within(panel()).getByRole('radio', { name: 'Oldest' });
      expect(oldest).toHaveFocus();
      expect(oldest).toHaveAttribute('aria-checked', 'true');
      await userEvent.keyboard('{End}');
      expect(within(panel()).getByRole('radio', { name: 'Most discussed' })).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}');
      expect(within(panel()).getByRole('radio', { name: 'Newest' })).toHaveFocus();
      await userEvent.keyboard('{ArrowUp}');
      expect(within(panel()).getByRole('radio', { name: 'Most discussed' })).toHaveAttribute('aria-checked', 'true');

      // Tab to the range, where left goes back along the row
      await userEvent.tab();
      expect(within(panel()).getByRole('radio', { name: 'All time' })).toHaveFocus();
      await userEvent.keyboard('{ArrowLeft}');
      expect(within(panel()).getByRole('radio', { name: 'This year' })).toHaveAttribute('aria-checked', 'true');
      // then to the kinds
      await userEvent.tab();
      expect(within(panel()).getByRole('radio', { name: 'Everything' })).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}');
      expect(within(panel()).getByRole('radio', { name: 'All writing' })).toHaveAttribute('aria-checked', 'true');

      // Reset, Show posts, and round again to the ✕ at the top
      await userEvent.tab();
      expect(within(panel()).getByRole('button', { name: 'Reset' })).toHaveFocus();
      await userEvent.tab();
      expect(within(panel()).getByRole('button', { name: 'Show posts' })).toHaveFocus();
      await userEvent.tab();
      expect(within(panel()).getByRole('button', { name: 'Close' })).toHaveFocus();
      await userEvent.tab({ shift: true });
      expect(within(panel()).getByRole('button', { name: 'Show posts' })).toHaveFocus();

      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(queries.at(-1)).toContain('sort=discussed'));
      expect(queries.at(-1)).toContain('period=year');
      expect(queries.at(-1)).toContain('section=gotin');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sort and filter — Most discussed, This year, Writing' })).toHaveFocus();
    });

    it('goes back to where it was opened from when it closes', async () => {
      await wall('/app/civak?section=dimen');
      const chip = screen.getByRole('button', { name: 'Pictures' });
      await userEvent.click(chip);
      expect(within(panel()).getByRole('radio', { name: 'All pictures' })).toHaveAttribute('aria-checked', 'true');
      await userEvent.keyboard('{Escape}');
      expect(chip).toHaveFocus();
    });

    it('shows a post only once when the next page repeats one', async () => {
      const page = (from: number) => Array.from({ length: 20 }, (_, i) => item(`library:p${from + i}`, { title: `Post ${from + i}` }));
      const queries: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (!url.includes('/feed')) return jsonResponse(200, {});
          queries.push(url.slice(url.indexOf('/feed')));
          // the second page has moved on by one: its first post was the last of the first page
          return jsonResponse(200, { items: url.includes('offset=0') ? page(0) : url.includes('offset=20') ? page(19) : [] });
        }),
      );
      renderApp(<Civak />, ['/app/civak?sort=popular']);
      await screen.findByText('Post 0');
      await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
      await screen.findByText('Post 38');
      expect(screen.getAllByText('Post 19')).toHaveLength(1);
      expect(screen.getAllByRole('article')).toHaveLength(39);
      // and the next page starts where the server's last one ended, not at the count shown
      await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
      await waitFor(() => expect(queries.at(-1)).toContain('offset=40'));
    });

    it('offers the whole wall again when a filter or a range leaves it empty', async () => {
      const kinds = await wall('/app/civak?section=dimen&kind=mim', []);
      // the chip's ✕ and the empty wall's button say the same thing; the latter is the second
      const [, fromEmpty] = screen.getAllByRole('button', { name: 'Show everything' });
      await userEvent.click(fromEmpty!);
      await waitFor(() => expect(kinds.queries.at(-1)).toContain('section=all'));
      cleanup();

      const ranged = await wall('/app/civak?sort=popular&period=day', []);
      // not "find people" — the wall has posts, just none liked today
      expect(screen.queryByRole('link', { name: 'Find people' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Show everything' }));
      await waitFor(() => expect(ranged.queries.at(-1)).not.toContain('sort='));
      expect(where()).toBe('');
    });
  });

  it('shows an unfamiliar kind rather than an empty badge', async () => {
    // CARD_LABEL is deliberately open: if the server ships a kind before the web
    // knows its name, the wall should still render it, not a blank chip
    feedFetch([item('library:x1', { kind: 'axaftin', title: 'Something new' })]);
    renderApp(<Civak />, ['/app/civak']);

    expect(await screen.findByText('Something new')).toBeInTheDocument();
    expect(screen.getByText('axaftin')).toBeInTheDocument();
  });
});
