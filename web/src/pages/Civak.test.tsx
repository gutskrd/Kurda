import { describe, it, expect, vi, afterEach } from 'vitest';
import { preloadCatalogue } from '../i18n/catalogues';
import { screen, waitFor, within } from '@testing-library/react';
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
    // one name over each post, and once more where the picture's caption starts
    expect(screen.getAllByText('dilan')).toHaveLength(4);
    expect(document.querySelectorAll('.fcard-name')).toHaveLength(3);
    expect(screen.getByText('Çiyayên welêt').closest('.fcard-caption')?.textContent).toBe('dilan Çiyayên welêt');
  });

  it('asks the server for the filter rather than filtering what it already has', async () => {
    const { queries } = feedFetch([item('library:s1')]);
    renderApp(<Civak />, ['/app/civak']);
    await screen.findByText('Çîroka min');
    expect(queries[0]).toContain('section=all');

    await userEvent.click(screen.getByRole('button', { name: 'Filter posts' }));
    const writing = within(screen.getByRole('menu', { name: 'Show' })).getByRole('group', { name: 'Writing' });
    await userEvent.click(within(writing).getByRole('menuitemradio', { name: 'Poem' }));

    await waitFor(() =>
      expect(queries.some((q) => q.includes('section=gotin') && q.includes('kind=helbest'))).toBe(true),
    );
  });

  it('starts on the half and kind the address asked for', async () => {
    const { queries } = feedFetch([item('library:p1')]);
    // so /app/poems can simply redirect here and land somewhere meaningful
    renderApp(<Civak />, ['/app/civak?section=gotin&kind=helbest']);
    await waitFor(() => expect(queries[0]).toContain('kind=helbest'));
    expect(screen.getByRole('button', { name: 'Filter posts — showing Writing · Poem' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Writing · Poem' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Writing · Poem' }));
    const writing = within(screen.getByRole('menu', { name: 'Show' })).getByRole('group', { name: 'Writing' });
    expect(within(writing).getByRole('menuitemradio', { name: 'Poem' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Everything' })).toHaveAttribute('aria-checked', 'false');
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
      await userEvent.click(screen.getByRole('button', { name: 'Filtrar publicaciones' }));
      const menu = screen.getByRole('menu', { name: 'Mostrar' });
      expect(within(menu).getByRole('menuitemradio', { name: 'Todo' })).toBeInTheDocument();
      expect(within(menu).getByRole('group', { name: 'Escritos' })).toBeInTheDocument();
      expect(within(menu).getByRole('menuitemradio', { name: 'Todas las imágenes' })).toBeInTheDocument();
    });

    /** In Kurmancî those words ARE the translation, so they come back. */
    it('keeps the Kurdish words for someone reading in Kurdish', async () => {
      localStorage.setItem('hevalo_locale', 'ku');
      await preloadCatalogue();
      feedFetch([item('library:s1')]);
      renderApp(<Civak />, ['/app/civak']);

      expect(await screen.findByRole('heading', { name: 'Civak', level: 1 })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Şandiyan parzûn bike' }));
      const menu = screen.getByRole('menu', { name: 'Nîşan bide' });
      expect(within(menu).getByRole('group', { name: 'Gotin' })).toBeInTheDocument();
      expect(within(menu).getByRole('group', { name: 'Dîmen' })).toBeInTheDocument();
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

      await userEvent.click(screen.getByRole('button', { name: 'Filter posts' }));
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Meme' }));
      await waitFor(() => expect(queries.some((q) => q.includes('section=dimen') && q.includes('kind=mim'))).toBe(true));

      await userEvent.click(screen.getByRole('button', { name: 'Filter posts — showing Pictures · Meme' }));
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Photo' }));
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
   * The filter is a button, not a row of toggles: the wall opens on the posts,
   * and the choice is there when it is wanted. A chip says what the wall is
   * narrowed to while it is.
   */
  describe('the filter', () => {
    /** Where the router is, so a test can see the filter reach the address. */
    function Where(): React.JSX.Element {
      return <output data-testid="where">{useLocation().search}</output>;
    }
    const where = (): string | null => screen.getByTestId('where').textContent;

    it('puts no toggles over the wall, only a button that opens a list', async () => {
      feedFetch([item('library:s1')]);
      renderApp(<Civak />, ['/app/civak']);
      await screen.findByText('Çîroka min');

      expect(screen.queryByRole('button', { name: 'Writing' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Pictures' })).not.toBeInTheDocument();
      expect(document.querySelector('.seg')).toBeNull();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      const button = screen.getByRole('button', { name: 'Filter posts' });
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');

      const menu = screen.getByRole('menu', { name: 'Show' });
      expect(within(menu).getAllByRole('menuitemradio').map((c) => c.textContent)).toEqual([
        'Everything',
        'All writing',
        'Saying',
        'Story',
        'Poem',
        'All pictures',
        'Photo',
        'Meme',
      ]);
      // what is shown now is ticked, and is where the keyboard starts
      const everything = within(menu).getByRole('menuitemradio', { name: 'Everything' });
      expect(everything).toHaveAttribute('aria-checked', 'true');
      expect(everything).toHaveFocus();
      // and nothing about it is a chip while the wall shows everything
      expect(screen.queryByRole('button', { name: 'Show everything' })).not.toBeInTheDocument();
    });

    it('narrows the wall to memes, says so on the button and in a chip, and keeps it in the address', async () => {
      const { queries } = feedFetch([item('library:s1')]);
      renderApp(
        <>
          <Civak />
          <Where />
        </>,
        ['/app/civak'],
      );
      await screen.findByText('Çîroka min');

      await userEvent.click(screen.getByRole('button', { name: 'Filter posts' }));
      const pictures = within(screen.getByRole('menu', { name: 'Show' })).getByRole('group', { name: 'Pictures' });
      await userEvent.click(within(pictures).getByRole('menuitemradio', { name: 'Meme' }));

      await waitFor(() => expect(queries.at(-1)).toContain('section=dimen'));
      expect(queries.at(-1)).toContain('kind=mim');
      expect(where()).toBe('?section=dimen&kind=mim');
      // a choice closes the list, and the keyboard goes back to the button
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      const button = screen.getByRole('button', { name: 'Filter posts — showing Pictures · Meme' });
      expect(button).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Pictures · Meme' })).toBeInTheDocument();
    });

    it('shows everything again from the chip’s ✕', async () => {
      const { queries } = feedFetch([item('library:s1')]);
      renderApp(
        <>
          <Civak />
          <Where />
        </>,
        ['/app/civak?section=dimen&kind=mim'],
      );
      await screen.findByText('Çîroka min');

      await userEvent.click(screen.getByRole('button', { name: 'Show everything' }));
      await waitFor(() => expect(queries.at(-1)).toContain('section=all'));
      expect(queries.at(-1)).not.toContain('kind=');
      expect(where()).toBe('');
      expect(screen.queryByRole('button', { name: 'Pictures · Meme' })).not.toBeInTheDocument();
      // the chip went with the filter, so the keyboard lands on the funnel rather than nowhere
      expect(screen.getByRole('button', { name: 'Filter posts' })).toHaveFocus();
    });

    it('opens the list again from the chip, with the filter ticked', async () => {
      feedFetch([item('library:s1')]);
      renderApp(<Civak />, ['/app/civak?section=dimen']);
      await screen.findByText('Çîroka min');

      const chip = screen.getByRole('button', { name: 'Pictures' });
      await userEvent.click(chip);
      const ticked = screen.getByRole('menuitemradio', { name: 'All pictures' });
      expect(ticked).toHaveAttribute('aria-checked', 'true');
      expect(ticked).toHaveFocus();
      await userEvent.keyboard('{Escape}');
      expect(chip).toHaveFocus();
    });

    it('is worked by the keyboard: arrows move, Enter chooses, Escape closes and goes back', async () => {
      const { queries } = feedFetch([item('library:s1')]);
      renderApp(<Civak />, ['/app/civak']);
      await screen.findByText('Çîroka min');

      const button = screen.getByRole('button', { name: 'Filter posts' });
      button.focus();
      await userEvent.keyboard('{Enter}');
      expect(screen.getByRole('menuitemradio', { name: 'Everything' })).toHaveFocus();
      await userEvent.keyboard('{ArrowUp}');
      expect(screen.getByRole('menuitemradio', { name: 'Meme' })).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}{ArrowDown}');
      expect(screen.getByRole('menuitemradio', { name: 'All writing' })).toHaveFocus();
      await userEvent.keyboard('{End}');
      expect(screen.getByRole('menuitemradio', { name: 'Meme' })).toHaveFocus();
      await userEvent.keyboard('{Home}');
      expect(screen.getByRole('menuitemradio', { name: 'Everything' })).toHaveFocus();

      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(button).toHaveFocus();
      expect(button).toHaveAttribute('aria-expanded', 'false');

      await userEvent.keyboard('{Enter}');
      await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
      await waitFor(() => expect(queries.some((q) => q.includes('section=gotin') && q.includes('kind=helbest'))).toBe(true));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes when somewhere else is pressed, choosing nothing', async () => {
      const { queries } = feedFetch([item('library:s1')]);
      renderApp(<Civak />, ['/app/civak']);
      await screen.findByText('Çîroka min');

      await userEvent.click(screen.getByRole('button', { name: 'Filter posts' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('heading', { name: 'Community', level: 1 }));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(queries).toHaveLength(1);
    });

    it('offers everything else when only the chosen kind is empty', async () => {
      const { queries } = feedFetch([]);
      renderApp(<Civak />, ['/app/civak?section=dimen&kind=mim']);
      expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();

      // the chip's ✕ and the empty wall's button say the same thing; the latter is the second
      const [, fromEmpty] = screen.getAllByRole('button', { name: 'Show everything' });
      await userEvent.click(fromEmpty!);
      await waitFor(() => expect(queries.at(-1)).toContain('section=all'));
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
