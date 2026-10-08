import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { Footer } from '../components/Footer';
import { Landing } from '../pages/Landing';
import { About } from '../pages/About';
import { Faq } from '../pages/Faq';
import { en } from '../i18n/en';
import { PRINCIPLES } from './principles';

/**
 * Every way in to "How Hevalo teaches": the front page's section, the footer
 * on every public page, About and the FAQ. A page nobody can reach is a page
 * that does not exist, and an anchor that names no section lands at the top
 * of the page with nothing to say why.
 */
describe('the ways in to How Hevalo teaches', () => {
  it('gives the front page a section of four principles, each a link to its own', () => {
    renderApp(<Landing />);
    const section = document.getElementById('how-it-teaches')!;
    expect(within(section).getByRole('heading', { level: 2, name: 'Built on how memory works.' })).toBeInTheDocument();

    const ids = new Set(PRINCIPLES.map((p) => p.id));
    const cards = within(section)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.includes('#'));
    expect(cards).toHaveLength(4);
    for (const a of cards) {
      const [path, anchor] = a.getAttribute('href')!.split('#');
      expect(path).toBe('/how-hevalo-teaches');
      expect(ids, `#${anchor} names no section`).toContain(anchor);
      // the card is named for the principle it opens, as the section there is
      expect(a).toHaveTextContent(en[PRINCIPLES.find((p) => p.id === anchor)!.title]);
    }
    expect(within(section).getByRole('link', { name: 'How Hevalo teaches, with the studies' })).toHaveAttribute(
      'href',
      '/how-hevalo-teaches',
    );
  });

  it('is in the footer, under Company', () => {
    renderApp(<Footer />);
    const company = screen.getByRole('navigation', { name: 'Company' });
    expect(within(company).getByRole('link', { name: 'How Hevalo teaches' })).toHaveAttribute('href', '/how-hevalo-teaches');
  });

  it('is a sentence on About, with the link', () => {
    renderApp(<About />);
    expect(screen.getByText(/built on what research on memory and language learning has found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How Hevalo teaches' })).toHaveAttribute('href', '/how-hevalo-teaches');
  });

  it('answers “Is Hevalo based on research?” on the FAQ, and says what it does not claim', () => {
    renderApp(<Faq />);
    const answer = screen.getByText('Is Hevalo based on research?').closest('details')!;
    expect(within(answer).getByText(/no app on its own makes anyone fluent/i)).toBeInTheDocument();
    expect(within(answer).getByRole('link', { name: 'How Hevalo teaches' })).toHaveAttribute('href', '/how-hevalo-teaches');
  });
});
