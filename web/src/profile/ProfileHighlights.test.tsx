import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileHighlights } from './ProfileHighlights';
import { renderApp } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const tree = { species: 'hinar', stage: 4, health: 'fresh', age: 30, harvests: 2 } as const;
const badge = { key: 'ders', family: 'learning', tier: 2, tierKey: 'ziv' } as const;

describe('ProfileHighlights', () => {
  it('shows nothing when somebody has nothing to show off', () => {
    const { container } = renderApp(<ProfileHighlights />);
    expect(container.querySelector('.hl-row')).toBeNull();
  });

  it('gathers somebody else’s badges in one case with how many they have, and opens it to their names and meanings', async () => {
    renderApp(<ProfileHighlights badges={[badge]} earned={12} />);
    // One tile for the badges, not one per badge.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    const tile = screen.getByRole('button', { name: 'Badges: 12' });
    expect(tile.querySelector('.hl-count')).toHaveTextContent('12');
    await userEvent.click(tile);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: /Badges/ })).toBeInTheDocument();
    expect(within(sheet).getByText('Wane')).toBeInTheDocument();
    expect(within(sheet).getByText('Lessons')).toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: 'All badges' })).not.toBeInTheDocument();
  });

  it('starts your own row with the badge case, which opens your badges, and links your tree to its page', () => {
    renderApp(<ProfileHighlights own tree={tree} badges={[badge]} earned={3} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/app/badges');
    expect(links[0]).toHaveAccessibleName('Badges: 3');
    expect(links[1]).toHaveAttribute('href', '/app/tree');
  });

  it('keeps an empty case without a nought, and shows no case for somebody with no badges', () => {
    const { unmount } = renderApp(<ProfileHighlights own earned={0} />);
    expect(screen.getByRole('link', { name: 'Badges: 0' }).querySelector('.hl-count')).toBeNull();
    unmount();
    const { container } = renderApp(<ProfileHighlights earned={0} />);
    expect(container.querySelector('.hl-row')).toBeNull();
  });

  it('opens somebody else’s tree in a sheet rather than taking you to yours', async () => {
    renderApp(<ProfileHighlights tree={tree} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('offers your own empty tree a place to be planted', () => {
    renderApp(<ProfileHighlights own tree={null} />);
    expect(screen.getByRole('link', { name: 'Tree' })).toHaveAttribute('href', '/app/tree');
  });

  it('names the league tile by its league', async () => {
    renderApp(<ProfileHighlights league={{ tier: 'cem' }} />);
    const tile = screen.getByRole('button', { name: /League/ });
    await userEvent.click(tile);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
