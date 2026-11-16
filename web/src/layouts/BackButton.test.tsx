import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Link, Outlet, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import type { NavItem } from '../components/TopNav';
import { I18nProvider } from '../i18n/I18nProvider';
import { renderApp } from '../test/utils';
import { BackButton, rootFor, useAsksBeforeLeaving } from './BackButton';
import { OWNS } from './navLinks';
import { forgetTrail, useTrail } from './trail';

afterEach(() => {
  // the window's history and what was noted of it are one for the whole file: each test starts on a page opened cold
  forgetTrail();
  window.history.replaceState(null, '', '/');
});

/** The places as the bar has them, with Learn last left on its Games. */
const LINKS: NavItem[] = [
  { key: 'home', label: 'Home', to: '/app', owns: OWNS.home },
  { key: 'learn', label: 'Learn', to: '/app/games', owns: OWNS.learn },
  { key: 'messages', label: 'Messages', to: '/app/messages', owns: OWNS.messages },
  { key: 'profile', label: 'Profile', to: '/app/profile', owns: OWNS.profile },
];

function Where(): React.JSX.Element {
  const { pathname } = useLocation();
  return (
    <output data-testid="where" data-how={useNavigationType()}>
      {pathname}
    </output>
  );
}
const where = () => screen.getByTestId('where').textContent;

/** The way back on a page opened cold: nothing of the app's is behind it. */
const cold = (at: string, links: NavItem[] = LINKS) =>
  renderApp(
    <>
      <BackButton links={links} />
      <Where />
    </>,
    [at],
  );

/** A shell as the app's are: it notes each page it draws. */
function Shell(): React.JSX.Element {
  useTrail();
  return <Outlet />;
}

/** A corner of the site in the browser's own history: Learn, a course's page with the way back, a lesson, and the alphabet. */
function visit(at: string) {
  window.history.replaceState(null, '', at);
  return render(
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route
              path="/app/learn"
              element={
                <>
                  <Link to="/app/learn/course/c1">The course</Link>
                  <Link to="/app/alphabet">The alphabet</Link>
                </>
              }
            />
            <Route
              path="/app/learn/course/c1"
              element={
                <>
                  <BackButton links={LINKS} />
                  <Link to="/app/learn/lesson/l1">A lesson</Link>
                </>
              }
            />
            {/* a lesson leaves for the page it was opened from, as a new entry in the history */}
            <Route path="/app/learn/lesson/l1" element={<Link to="/app/learn/course/c1">Leave the lesson</Link>} />
            <Route path="/app/alphabet" element={<BackButton links={LINKS} />} />
            <Route path="/app/games" element={<p>Games</p>} />
          </Route>
        </Routes>
        <Where />
      </BrowserRouter>
    </I18nProvider>,
  );
}

const press = (name: string) => userEvent.click(screen.getByRole(name === 'Back' ? 'button' : 'link', { name }));

describe('the way back', () => {
  it('is a button named Back, with the chevron that points back in either direction', () => {
    cold('/app/settings');
    const button = screen.getByRole('button', { name: 'Back' });
    expect(button).toHaveClass('nav-back');
    expect(button.querySelector('svg')).toHaveClass('back-chevron');
  });

  it('steps back through the browser’s history when you came from inside the app', async () => {
    visit('/app/learn');
    await press('The alphabet');
    expect(where()).toBe('/app/alphabet');

    await press('Back');
    // where you came from, and not the root the alphabet belongs under (Learn, which is at /app/games here)
    await waitFor(() => expect(where()).toBe('/app/learn'));
    expect(screen.getByTestId('where')).toHaveAttribute('data-how', 'POP');
  });

  it('leads to the root of the place that owns the page when the page was opened cold', async () => {
    cold('/app/settings');
    await press('Back');
    expect(where()).toBe('/app/profile');
    // the root takes the page's place: the browser's own Back does not walk forward into it again
    expect(screen.getByTestId('where')).toHaveAttribute('data-how', 'REPLACE');
  });

  it('does the same in the browser’s own history, for a page loaded at the start of a visit', async () => {
    visit('/app/alphabet');
    await press('Back');
    await waitFor(() => expect(where()).toBe('/app/games'));
    expect(screen.getByTestId('where')).toHaveAttribute('data-how', 'REPLACE');
  });

  it('passes over a lesson that came back to the page, and does not lead into it again', async () => {
    visit('/app/learn');
    await press('The course');
    await press('A lesson');
    await press('Leave the lesson');
    expect(where()).toBe('/app/learn/course/c1');

    await press('Back');
    // not the lesson one step behind, nor this same page two behind: Learn, where the course was opened from
    await waitFor(() => expect(where()).toBe('/app/learn'));
  });

  it('leads to the root when nothing is behind the page but a lesson and the page itself', async () => {
    visit('/app/learn/course/c1');
    await press('A lesson');
    await press('Leave the lesson');
    await press('Back');
    await waitFor(() => expect(where()).toBe('/app/learn'));
    expect(screen.getByTestId('where')).toHaveAttribute('data-how', 'REPLACE');
  });

  it('asks a page with something to lose instead of leaving it, for as long as there is something to lose', async () => {
    const ask = vi.fn();
    /** A game on one phone: under way until it is ended. */
    function Game(): React.JSX.Element {
      const [under, setUnder] = useState(true);
      useAsksBeforeLeaving(under ? ask : null);
      return (
        <button type="button" onClick={() => setUnder(false)}>
          End the game
        </button>
      );
    }
    const game = renderApp(
      <>
        <BackButton links={LINKS} />
        <Game />
        <Where />
      </>,
      ['/app/games/who-am-i'],
    );
    await press('Back');
    expect(ask).toHaveBeenCalledTimes(1);
    expect(where()).toBe('/app/games/who-am-i');

    // the game is over: nothing is asked, and the way back leads out
    await userEvent.click(screen.getByRole('button', { name: 'End the game' }));
    await press('Back');
    expect(ask).toHaveBeenCalledTimes(1);
    expect(where()).toBe('/app/games');
    game.unmount();

    // and a page left while it was asking takes its question with it
    const left = renderApp(<Game />, ['/app/games/who-am-i']);
    left.unmount();
    cold('/app/settings');
    await press('Back');
    expect(ask).toHaveBeenCalledTimes(1);
    expect(where()).toBe('/app/profile');
  });
});

describe('where a page leads back to when nothing is behind it', () => {
  it('is the root its address stands under, before the place’s own', () => {
    // a story is under the stories, whichever view of Learn was last open
    expect(rootFor('/app/learn/stories/sev-u-roj', LINKS)).toBe('/app/learn/stories');
    expect(rootFor('/app/games/peyvok', LINKS)).toBe('/app/games');
    expect(rootFor('/app/messages', LINKS)).toBe('/app/messages');
    expect(rootFor('/app/profile/edit', LINKS)).toBe('/app/profile');
  });

  it('is otherwise the root of the place that owns the page, as the bar of places gives it', () => {
    expect(rootFor('/app/shop', LINKS)).toBe('/app/profile');
    expect(rootFor('/app/friends', LINKS)).toBe('/app/messages');
    expect(rootFor('/app/library/p1', LINKS)).toBe('/app');
    // your tree is opened from your profile; letters by bird are the first row of Messages
    expect(rootFor('/app/tree', LINKS)).toBe('/app/profile');
    expect(rootFor('/app/letters', LINKS)).toBe('/app/messages');
    expect(rootFor('/app/letters/t1', LINKS)).toBe('/app/messages');
    // one of Learn's tools: wherever the Learn place leads now
    expect(rootFor('/app/alphabet', LINKS)).toBe('/app/games');
  });

  it('is Home for a page no place owns, and for a visitor who has no such place', () => {
    expect(rootFor('/app/users/u1', LINKS)).toBe('/app');
    expect(rootFor('/app/search', LINKS)).toBe('/app');
    expect(rootFor('/app/settings', LINKS.slice(0, 2))).toBe('/app');
  });
});
