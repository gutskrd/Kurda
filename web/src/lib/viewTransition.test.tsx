import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CarriedRouter, HOLD_MS, carriesPages, forgetCarried, glidesBetween, isAnotherPage, useGrowsFrom, useGrowsInto } from './viewTransition';

/** A browser that plays motion, or one with reduced motion. */
function withMotion(reduced = false): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** The test ids of elements wearing a transition name now. */
function wearing(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid]')]
    .filter((el) => el.style.viewTransitionName)
    .map((el) => `${el.dataset.testid}=${el.style.viewTransitionName}`);
}

/** One transition the page asked for, as the stand-in saw it. */
interface Asked {
  /** What wore a name when the old page's picture was taken. */
  before: string[];
  /** Whether the root said a page was changing at that moment. */
  changing: boolean;
  /** The part the root let glide at that moment, if any. */
  glide: string | undefined;
  /** Settles when the next page has been drawn. */
  updated: Promise<void>;
  skipped: boolean;
  /** Ends the animation. */
  finish: () => void;
}

/** A stand-in for the browser's view transitions: takes the old picture, calls back for the new page, ends when told. */
function withTransitions(): Asked[] {
  const asked: Asked[] = [];
  const start = (update: () => Promise<void>): ViewTransition => {
    let finish = (): void => undefined;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    const changing = document.documentElement.classList.contains('is-changing-page');
    const glide = document.documentElement.dataset.glide;
    const one: Asked = { before: wearing(), changing, glide, updated: Promise.resolve(), skipped: false, finish };
    one.updated = Promise.resolve().then(() => update());
    asked.push(one);
    const skipTransition = (): void => {
      one.skipped = true;
      finish();
    };
    return { finished, ready: one.updated, updateCallbackDone: one.updated, skipTransition, types: new Set<string>() } as unknown as ViewTransition;
  };
  document.startViewTransition = start as unknown as Document['startViewTransition'];
  return asked;
}

/** Lets the browser's turn and the page's own drawing after it run. */
async function settled(ms = 30): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/**
 * Waits until the next page is drawn for the new picture, in two steps: what the page schedules during a test's wait
 * only runs once that wait is over.
 */
async function pictured(one: Asked): Promise<void> {
  await settled();
  await act(async () => one.updated);
}

/** Sets the window's scroll; a browser without layout never scrolls by itself. */
function scrolledTo(top: number): void {
  Object.defineProperty(window, 'scrollY', { value: top, configurable: true });
}

/** Test ids of cards off screen; without layout everything is nowhere, so the tests say where things are. */
let offScreen: string[] = [];

/** A list with the same card on two shelves, and a link that belongs to neither. */
function List(): React.JSX.Element {
  const first = useGrowsFrom('thing:1', { within: '.card' });
  const second = useGrowsFrom('thing:1', { within: '.card' });
  return (
    <main>
      <h1>the list</h1>
      <article className="card">
        <span data-testid="first-picture" ref={first} />
        <Link to="/thing/1">open from the first shelf</Link>
      </article>
      <article className="card">
        <span data-testid="second-picture" ref={second} />
        <Link to="/thing/1">open from the second shelf</Link>
        <Link to="/elsewhere">somewhere else</Link>
      </article>
      <Link to="/thing/1">a bare link to the thing</Link>
      <Link to="/?sort=newest">newest first</Link>
      <Link to="/slow">a page with no head</Link>
      <Link to="/old">an old address</Link>
      <Hurried />
    </main>
  );
}

/** Buttons that change the address twice before anything has been drawn. */
function Hurried(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void navigate('/thing/1');
          void navigate('/elsewhere');
        }}
      >
        two pages at once
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate('/elsewhere');
          void navigate('/elsewhere?tab=2', { replace: true });
        }}
      >
        a page and then its tab
      </button>
    </>
  );
}

/** Shows where the router thinks the reader is, which must match the address bar. */
function Elsewhere(): React.JSX.Element {
  const { search } = useLocation();
  return <h1>elsewhere{search}</h1>;
}

function Thing(): React.JSX.Element {
  const head = useGrowsInto('thing:1');
  return (
    <main>
      <h1>the thing</h1>
      <span data-testid="page-head" ref={head} />
    </main>
  );
}

/** Two cards: one opens a page that promises a head and never shows it, the other a page that promises nothing. */
function Slow(): React.JSX.Element {
  const slow = useGrowsFrom('slow:1');
  const bare = useGrowsFrom('bare:1');
  return (
    <main>
      <h1>the slow page</h1>
      <Link data-testid="slow-card" ref={slow} to="/slow/1">
        open the slow thing
      </Link>
      <Link data-testid="bare-card" ref={bare} to="/bare/1">
        open the bare thing
      </Link>
    </main>
  );
}

/** Promises its head from the start and waits for something that never arrives. */
function SlowThing(): React.JSX.Element {
  useGrowsInto('slow:1');
  return <h1>the slow thing</h1>;
}

function App(): React.JSX.Element {
  return (
    <CarriedRouter>
      <Routes>
        <Route path="/" element={<List />} />
        <Route path="/thing/1" element={<Thing />} />
        <Route path="/elsewhere" element={<Elsewhere />} />
        <Route path="/old" element={<Navigate to="/elsewhere" replace />} />
        <Route path="/slow" element={<Slow />} />
        <Route path="/slow/1" element={<SlowThing />} />
        <Route path="/bare/1" element={<h1>the bare thing</h1>} />
      </Routes>
    </CarriedRouter>
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  offScreen = [];
  // Everything is a 100px square near the top of the window unless a test puts it off screen.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function box(this: HTMLElement) {
    const away = offScreen.includes(this.dataset.testid ?? '') ? 5000 : 0;
    return { left: 10, top: 10 + away, right: 110, bottom: 110 + away, width: 100, height: 100, x: 10, y: 10 + away, toJSON: () => ({}) } as DOMRect;
  });
  // A window that scrolls where it is told.
  window.scrollTo = vi.fn((to: ScrollToOptions) => scrolledTo(to.top ?? 0)) as unknown as typeof window.scrollTo;
});

afterEach(() => {
  forgetCarried();
  scrolledTo(0);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  document.documentElement.className = '';
  delete document.documentElement.dataset.glide;
});

describe('whether a change of page is carried', () => {
  it('is not, in a browser without view transitions', () => {
    withMotion();
    expect(carriesPages()).toBe(false);
  });

  it('is not, for a reader who asked for less motion', () => {
    withMotion(true);
    withTransitions();
    expect(carriesPages()).toBe(false);
  });

  it('is not, where the browser cannot even be asked about motion', () => {
    withTransitions();
    expect(carriesPages()).toBe(false);
  });

  it('is, in a browser that has them, for a reader who has not', () => {
    withMotion();
    withTransitions();
    expect(carriesPages()).toBe(true);
  });

  it('counts another path as another page, and what follows the ? or the # as the same one', () => {
    expect(isAnotherPage({ pathname: '/app' }, { pathname: '/app/learn' })).toBe(true);
    expect(isAnotherPage({ pathname: '/app/learn' }, { pathname: '/app/learn' })).toBe(false);
    expect(isAnotherPage({ pathname: '/app/' }, { pathname: '/app' })).toBe(false);
  });
});

describe('a change of page', () => {
  it('happens as it always did in a browser without view transitions', async () => {
    withMotion();
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'open from the first shelf' }));
    expect(await screen.findByRole('heading', { name: 'the thing' })).toBeInTheDocument();
    expect(wearing()).toEqual([]);
    expect(document.documentElement).not.toHaveClass('is-changing-page');
  });

  it('happens as it always did for a reader who asked for less motion: the browser is not asked for a transition', async () => {
    withMotion(true);
    const asked = withTransitions();
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'open from the first shelf' }));
    expect(await screen.findByRole('heading', { name: 'the thing' })).toBeInTheDocument();
    expect(asked).toHaveLength(0);
    expect(wearing()).toEqual([]);
  });

  it('is handed to the browser as one transition, with the bars told for exactly as long as it lasts', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'a page with no head' }));
    expect(asked).toHaveLength(1);
    expect(asked[0]!.changing).toBe(true);
    // The old page is still drawn while its picture is taken.
    expect(screen.getByRole('heading', { name: 'the list' })).toBeInTheDocument();
    await settled();
    expect(screen.getByRole('heading', { name: 'the slow page' })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('is-changing-page');
    await act(async () => asked[0]!.finish());
    expect(document.documentElement).not.toHaveClass('is-changing-page');
  });

  it('lets a part glide between two pages that both have it, and leaves it with its page when the next one has none', async () => {
    withMotion();
    glidesBetween('the-switch', ['/', '/slow/']);
    const asked = withTransitions();
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'a page with no head' }));
    expect(asked[0]!.glide).toBe('the-switch');
    await settled();
    await act(async () => asked[0]!.finish());
    expect(document.documentElement.dataset.glide).toBeUndefined();
    fireEvent.click(screen.getByRole('link', { name: 'open the bare thing' }));
    expect(asked[1]!.changing).toBe(true);
    expect(asked[1]!.glide).toBeUndefined();
  });

  it('is not a transition when only what follows the ? changes', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'newest first' }));
    await settled();
    expect(window.location.search).toBe('?sort=newest');
    expect(asked).toHaveLength(0);
  });

  it('takes a page that only sends the reader on as part of the same change: one transition, to where it leads', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'an old address' }));
    await pictured(asked[0]!);
    expect(screen.getByRole('heading', { name: 'elsewhere' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/elsewhere');
    expect(asked).toHaveLength(1);
    expect(asked[0]!.skipped).toBe(false);
  });

  it('takes two changes of address made at once as one change, and ends on the second', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'two pages at once' }));
    await pictured(asked[0]!);
    expect(screen.getByRole('heading', { name: 'elsewhere' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/elsewhere');
    expect(asked).toHaveLength(1);
  });

  it('draws what follows a change of page after it, never before: the page ends where the address bar does', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'a page and then its tab' }));
    await pictured(asked[0]!);
    expect(window.location.search).toBe('?tab=2');
    expect(screen.getByRole('heading', { name: 'elsewhere?tab=2' })).toBeInTheDocument();
    expect(asked).toHaveLength(1);
  });

  it('still happens when the browser refuses the transition outright', async () => {
    withMotion();
    document.startViewTransition = (() => {
      throw new Error('not now');
    }) as unknown as Document['startViewTransition'];
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'a page with no head' }));
    expect(await screen.findByRole('heading', { name: 'the slow page' })).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass('is-changing-page');
  });
});

describe('a card pressed', () => {
  it('wears the name as its page is left, hands it to the head of the page it opens, and nothing wears it afterwards', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'open from the second shelf' }));
    // The card is on the page twice; only the pressed one is named.
    expect(asked[0]!.before).toEqual(['second-picture=carried-picture']);
    await pictured(asked[0]!);
    expect(screen.getByRole('heading', { name: 'the thing' })).toBeInTheDocument();
    expect(wearing()).toEqual(['page-head=carried-picture']);
    await act(async () => asked[0]!.finish());
    expect(wearing()).toEqual([]);
  });

  it('carries nothing when the link pressed is not the card’s own', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'a bare link to the thing' }));
    expect(asked[0]!.before).toEqual([]);
    await pictured(asked[0]!);
    // The page still changes, plainly.
    expect(screen.getByRole('heading', { name: 'the thing' })).toBeInTheDocument();
    expect(wearing()).toEqual([]);
  });

  it('does not hold the page for a head the page it opens never promised', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'a page with no head' }));
    await pictured(asked[0]!);
    await act(async () => asked[0]!.finish());
    const began = Date.now();
    fireEvent.click(screen.getByRole('link', { name: 'open the bare thing' }));
    await pictured(asked[1]!);
    expect(Date.now() - began).toBeLessThan(HOLD_MS / 2);
    expect(screen.getByRole('heading', { name: 'the bare thing' })).toBeInTheDocument();
    expect(wearing()).toEqual([]);
  });

  it('does not hold the page either for another link in the card, to some other page', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    const began = Date.now();
    fireEvent.click(screen.getByRole('link', { name: 'somewhere else' }));
    await pictured(asked[0]!);
    expect(Date.now() - began).toBeLessThan(HOLD_MS / 2);
    expect(screen.getByRole('heading', { name: 'elsewhere' })).toBeInTheDocument();
    expect(wearing()).toEqual([]);
  });

  it('carries nothing into another tab, nor into whatever is opened next', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    // The browser would open the link elsewhere; here the press is simply let go.
    document.addEventListener('click', (e) => e.preventDefault(), { once: true });
    fireEvent.click(screen.getByRole('link', { name: 'open from the first shelf' }), { ctrlKey: true });
    expect(asked).toHaveLength(0);
    fireEvent.click(screen.getByRole('link', { name: 'a bare link to the thing' }));
    expect(asked[0]!.before).toEqual([]);
    await pictured(asked[0]!);
    expect(wearing()).toEqual([]);
  });

  it('lets the page change plainly when the page it opens promised a head and does not show it in time', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: 'a page with no head' }));
    await pictured(asked[0]!);
    await act(async () => asked[0]!.finish());
    const began = Date.now();
    fireEvent.click(screen.getByRole('link', { name: 'open the slow thing' }));
    expect(asked[1]!.before).toEqual(['slow-card=carried-picture']);
    await pictured(asked[1]!);
    // The page was held for the head, and no longer.
    expect(Date.now() - began).toBeGreaterThanOrEqual(HOLD_MS - 20);
    expect(Date.now() - began).toBeLessThan(HOLD_MS + 400);
    expect(screen.getByRole('heading', { name: 'the slow thing' })).toBeInTheDocument();
    expect(wearing()).toEqual([]);
    expect(asked[1]!.skipped).toBe(false);
  });
});

describe('going back', () => {
  /** From the list into the thing through the second shelf’s card, animation finished. */
  async function opened(asked: Asked[]): Promise<void> {
    fireEvent.click(screen.getByRole('link', { name: 'open from the second shelf' }));
    await pictured(asked[0]!);
    await act(async () => asked[0]!.finish());
  }

  it('shrinks the head to the card it came from, when the card is on the screen', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    await opened(asked);
    act(() => window.history.back());
    await settled();
    expect(asked).toHaveLength(2);
    expect(asked[1]!.before).toEqual(['page-head=carried-picture']);
    await pictured(asked[1]!);
    expect(screen.getByRole('heading', { name: 'the list' })).toBeInTheDocument();
    // Only one of the two cards.
    expect(wearing()).toHaveLength(1);
    expect(wearing()[0]).toMatch(/^(first|second)-picture=carried-picture$/);
    await act(async () => asked[1]!.finish());
    expect(wearing()).toEqual([]);
  });

  it('is the plain change when the card is no longer on the screen, and does not wait for it', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    await opened(asked);
    offScreen = ['first-picture', 'second-picture'];
    const began = Date.now();
    act(() => window.history.back());
    await settled();
    await pictured(asked[1]!);
    expect(Date.now() - began).toBeLessThan(HOLD_MS);
    expect(screen.getByRole('heading', { name: 'the list' })).toBeInTheDocument();
    expect(wearing()).toEqual([]);
  });

  it('puts the page back where it was left', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    scrolledTo(640);
    await opened(asked);
    // The thing's own page is at its top.
    scrolledTo(0);
    act(() => window.history.back());
    await settled();
    await pictured(asked[1]!);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'instant' });
    expect(window.scrollY).toBe(640);
  });

  it('waits for a list that is still growing, and puts it back once it is long enough', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    scrolledTo(640);
    await opened(asked);
    scrolledTo(0);
    // The list comes back short and reaches full length a moment later; until then it cannot scroll past 100.
    let long = false;
    window.scrollTo = vi.fn((to: ScrollToOptions) => scrolledTo(long ? (to.top ?? 0) : Math.min(to.top ?? 0, 100))) as unknown as typeof window.scrollTo;
    window.setTimeout(() => (long = true), 150);
    const began = Date.now();
    act(() => window.history.back());
    await settled();
    await pictured(asked[1]!);
    expect(window.scrollY).toBe(640);
    expect(Date.now() - began).toBeGreaterThanOrEqual(140);
    expect(Date.now() - began).toBeLessThan(HOLD_MS);
    // The head still found its card at the reader's place.
    expect(wearing()).toHaveLength(1);
  });

  it('gives up on a list that never gets long enough, and shows it as near as it goes', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    scrolledTo(640);
    await opened(asked);
    scrolledTo(0);
    window.scrollTo = vi.fn((to: ScrollToOptions) => scrolledTo(Math.min(to.top ?? 0, 100))) as unknown as typeof window.scrollTo;
    const began = Date.now();
    act(() => window.history.back());
    await settled();
    await pictured(asked[1]!);
    expect(window.scrollY).toBe(100);
    expect(Date.now() - began).toBeGreaterThanOrEqual(HOLD_MS - 20);
    expect(Date.now() - began).toBeLessThan(HOLD_MS + 400);
    expect(asked[1]!.skipped).toBe(false);
  });

  it('is not carried a second time when the browser has already moved the page across, under a swipe', async () => {
    withMotion();
    const asked = withTransitions();
    // What a phone's browser reports for an edge-swipe Back, set in the capture phase before the page hears it.
    window.addEventListener('popstate', (e) => Object.defineProperty(e, 'hasUAVisualTransition', { value: true }), { capture: true, once: true });
    render(<App />);
    await opened(asked);
    act(() => window.history.back());
    await settled();
    expect(await screen.findByRole('heading', { name: 'the list' })).toBeInTheDocument();
    expect(asked).toHaveLength(1);
    expect(wearing()).toEqual([]);
  });

  it('is left to the browser, with no transition, for a page whose place is not known', async () => {
    withMotion();
    const asked = withTransitions();
    render(<App />);
    await opened(asked);
    // The tab was reloaded on the thing’s page, so what was remembered of the list is gone.
    forgetCarried();
    act(() => window.history.back());
    await settled();
    expect(await screen.findByRole('heading', { name: 'the list' })).toBeInTheDocument();
    expect(asked).toHaveLength(1);
  });
});
