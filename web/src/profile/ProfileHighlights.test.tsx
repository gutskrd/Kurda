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

  it('opens a badge in a sheet with its name and meaning, and leaves the choosing to its owner', async () => {
    renderApp(<ProfileHighlights badges={[badge]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Wane' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Wane' })).toBeInTheDocument();
    expect(within(sheet).getByText('Lessons')).toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: 'All badges' })).not.toBeInTheDocument();
  });

  it('starts your own row with the way to choose badges, and links your tree to its page', () => {
    renderApp(<ProfileHighlights own tree={tree} badges={[badge]} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/app/badges');
    expect(links[1]).toHaveAttribute('href', '/app/tree');
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
