import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect } from 'react';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { PageTop } from './usePageTop';

afterEach(() => {
  vi.restoreAllMocks();
});

/** The window, scrolled `y` down; and what was asked of it since. */
function scrolledTo(y: number) {
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(y);
  return vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
}

function Back(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back
    </button>
  );
}

/** A shell as the app's is: the hook first, then whichever page the address names. */
function Shell({ postScrolls }: { postScrolls?: () => void }): React.JSX.Element {
  return (
    <>
      <PageTop />
      <Routes>
        <Route path="/app" element={<Link to="/app/library/p1">Open the post</Link>} />
        <Route path="/app/wall" element={<Link to="/app/wall?sort=popular">Most popular</Link>} />
        <Route path="/app/library/p1" element={<Post onPlace={postScrolls} />} />
      </Routes>
    </>
  );
}

function Post({ onPlace }: { onPlace?: () => void }): React.JSX.Element {
  // a page that puts the reader somewhere of its own as it opens, as a course's path does
  useLayoutEffect(() => {
    onPlace?.();
  }, [onPlace]);
  return (
    <>
      <p>The post</p>
      <Back />
    </>
  );
}

describe('a new page starts at its top', () => {
  it('puts the window at the top, at once, when a link leads to another page', async () => {
    const scrollTo = scrolledTo(1800);
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Shell />
      </MemoryRouter>,
    );
    scrollTo.mockClear();
    await userEvent.click(screen.getByRole('link', { name: 'Open the post' }));
    expect(await screen.findByText('The post')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
  });

  it('leaves Back to the browser, which puts the reader where they were', async () => {
    const scrollTo = scrolledTo(1800);
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Shell />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('link', { name: 'Open the post' }));
    scrollTo.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('link', { name: 'Open the post' })).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stays where it is when only the filter after the ? changes', async () => {
    const scrollTo = scrolledTo(900);
    render(
      <MemoryRouter initialEntries={['/app/wall']}>
        <Shell />
      </MemoryRouter>,
    );
    scrollTo.mockClear();
    await userEvent.click(screen.getByRole('link', { name: 'Most popular' }));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('goes first, so a page that opens on a place of its own keeps it', async () => {
    const order: string[] = [];
    scrolledTo(1800).mockImplementation(() => void order.push('top'));
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Shell postScrolls={() => order.push('the page’s own place')} />
      </MemoryRouter>,
    );
    order.length = 0;
    await userEvent.click(screen.getByRole('link', { name: 'Open the post' }));
    await screen.findByText('The post');
    expect(order).toEqual(['top', 'the page’s own place']);
  });
});
