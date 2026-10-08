import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { HowHevaloTeaches } from './HowHevaloTeaches';
import { MarketingLayout } from '../layouts/MarketingLayout';
import { renderApp } from '../test/utils';
import { en } from '../i18n/en';
import { LIMITS, PRINCIPLES } from '../teaching/principles';
import { SOURCES, SOURCE_ORDER, shortCite, type SourceId } from '../teaching/sources';

afterEach(() => localStorage.clear());

const show = (path = '/how-hevalo-teaches') => renderApp(<HowHevaloTeaches />, [path]);

/** The section a principle's anchor names. */
const section = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`no section #${id}`);
  return el;
};

describe('How Hevalo teaches', () => {
  it('opens with what the page is', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'How Hevalo teaches' })).toBeInTheDocument();
    expect(screen.getByText(/at the end is what we do not claim/i)).toBeInTheDocument();
  });

  /**
   * Each principle is three parts that do not lean on each other: what the
   * research found, what Hevalo does, and the studies. A section missing one
   * of them is a claim without its evidence, or evidence without its claim.
   */
  it('gives every principle its finding, what Hevalo does, and its studies', () => {
    show();
    expect(PRINCIPLES.map((p) => p.id)).toEqual(['retrieval', 'spacing', 'again', 'feedback', 'voices', 'rewards', 'younger']);
    for (const p of PRINCIPLES) {
      const s = section(p.id);
      expect(within(s).getByRole('heading', { level: 2, name: en[p.title] }), p.id).toBeInTheDocument();
      for (const label of ['What the research found', 'What Hevalo does', 'Read the studies']) {
        expect(within(s).getByRole('heading', { level: 3, name: label }), `${p.id}: ${label}`).toBeInTheDocument();
      }
      for (const k of [...p.found, ...p.does]) expect(within(s).getByText(en[k]), k).toBeInTheDocument();
      for (const id of p.sources) {
        const link = within(s).getByRole('link', { name: shortCite(SOURCES[id]) });
        expect(link, `${p.id}: ${id}`).toHaveAttribute('href', SOURCES[id].url);
      }
    }
  });

  it('says what it does not claim, plainly', () => {
    show();
    const limits = section('limits');
    expect(within(limits).getByRole('heading', { level: 2, name: 'What we don’t claim' })).toBeInTheDocument();
    for (const k of LIMITS) expect(within(limits).getByText(en[k]), k).toBeInTheDocument();
    expect(within(limits).getByText(/does not score your pronunciation automatically/i)).toBeInTheDocument();
    expect(within(limits).getByText(/no app on its own makes anyone fluent/i)).toBeInTheDocument();
  });

  it('lists every study in full, each linked, in reference-list order', () => {
    show();
    const sources = section('sources');
    const items = within(sources).getAllByRole('listitem');
    expect(items.map((li) => li.id)).toEqual(SOURCE_ORDER.map((id) => `source-${id}`));
    for (const id of SOURCE_ORDER) {
      const s = SOURCES[id];
      const item = within(sources).getByText(s.title).closest('li')!;
      expect(within(item).getByRole('link', { name: s.title }), id).toHaveAttribute('href', s.url);
      expect(item.textContent, id).toContain(`(${s.year})`);
      expect(item.textContent, id).toContain(s.venue);
    }
  });

  /** A source nobody cites is padding; a citation with no full reference is a dead end. */
  it('cites every study it lists, and lists every study it cites', () => {
    const cited = new Set<SourceId>(PRINCIPLES.flatMap((p) => p.sources));
    expect([...cited].sort()).toEqual([...SOURCE_ORDER].sort());
  });

  it('opens studies in a new tab without handing them this page', () => {
    show();
    const external = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('https://'));
    expect(external.length).toBeGreaterThanOrEqual(SOURCE_ORDER.length * 2);
    for (const a of external) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
  });

  it('lists its sections at the top, each linked to its anchor', () => {
    show();
    const contents = screen.getByRole('navigation', { name: 'On this page' });
    const hrefs = within(contents).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([...PRINCIPLES.map((p) => `#${p.id}`), '#limits', '#sources']);
  });

  /**
   * Through the layout, as the route serves it: the layout decodes the anchor
   * too, and a hand-typed or cut-short one does not decode. That used to throw
   * from the layout's effect, with nothing above it to catch it, and the page
   * went blank.
   */
  it('survives an anchor nobody wrote', () => {
    renderApp(
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/how-hevalo-teaches" element={<HowHevaloTeaches />} />
        </Route>
      </Routes>,
      ['/how-hevalo-teaches#%E0%A4%A'],
    );
    expect(screen.getByRole('heading', { level: 1, name: 'How Hevalo teaches' })).toBeInTheDocument();
  });

  it('still lands on a section its link names', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    try {
      renderApp(
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route path="/how-hevalo-teaches" element={<HowHevaloTeaches />} />
          </Route>
        </Routes>,
        ['/how-hevalo-teaches#spacing'],
      );
      expect(scroll.mock.contexts).toContain(section('spacing'));
    } finally {
      scroll.mockRestore();
    }
  });

  /**
   * Where Hevalo does less than a study did, or what a study cautions about,
   * the section says so, rather than set the two side by side as though one
   * answered the other.
   */
  it('says where Hevalo falls short of the research it cites', () => {
    show();
    const voices = section('voices');
    expect(within(voices).getByText(/the first course has no listening or speaking exercises yet/i)).toBeInTheDocument();
    expect(within(voices).getByText(/one recording for now/i)).toBeInTheDocument();
    for (const k of ['teach.voices.does2', 'teach.voices.does3'] as const) {
      expect(en[k], k).toMatch(/^In lessons that have them, /);
    }
    const rewards = section('rewards');
    expect(within(rewards).getByText(/still a reward for finishing something, the kind the caution above is about/i)).toBeInTheDocument();
    expect(rewards.textContent).not.toMatch(/daily zêr is for learning/i);
  });

  /**
   * The words around the references are the reader's; a reference itself
   * names a paper the way it was printed, so it stays English, and says so.
   */
  it('translates the page but not the titles of the papers', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    show();
    expect(await screen.findByRole('heading', { level: 1, name: 'Wie Hevalo lehrt' })).toBeInTheDocument();
    const roediger = screen.getByText(SOURCES.roediger2006.title).closest('li')!;
    expect(roediger).toHaveAttribute('lang', 'en');
  });

  /** The words the research does not license, kept off the page in every language's source. */
  it('claims no proof and no guarantee', () => {
    const page = Object.entries(en).filter(([k]) => k.startsWith('teach.') || k.startsWith('meta.teach.'));
    expect(page.length).toBeGreaterThan(40);
    for (const [k, v] of page) {
      expect(v, k).not.toMatch(/\bprove[ns]?\b|scientifically|guarantee|twice as fast|\d+\s?%/i);
    }
  });
});
