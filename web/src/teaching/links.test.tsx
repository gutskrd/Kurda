import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { Footer } from '../components/Footer';
import { Landing } from '../pages/Landing';
import { About } from '../pages/About';
import { Faq } from '../pages/Faq';
import { en } from '../i18n/en';

/**
 * Every link to "How Hevalo teaches" (the front page, the public footer, About and the FAQ), and that each anchor
 * names a real section.
 */
describe('the ways in to How Hevalo teaches', () => {
  it('answers on the front page what research the lessons follow, with the way to the full page', () => {
    renderApp(<Landing />);
    const section = document.getElementById('faq')!;
    const answer = within(section).getByText(en['faq.research.q']).closest('details')!;
    expect(within(answer).getByRole('link', { name: en['footer.teach'] })).toHaveAttribute('href', '/how-hevalo-teaches');
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
