import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BadgePill } from './BadgeRow';
import { renderApp } from '../test/utils';

const tree = { species: 'hinar', stage: 4, health: 'fresh', age: 30, harvests: 2 } as const;
const badge = (key: string) => ({ key, family: 'learning', tier: 1, tierKey: 'sifir' }) as const;

describe('the badge row beside the handle', () => {
  it('holds the top three, the chosen badges first, and counts the rest', () => {
    const badges = ['ders', 'agir', 'roj', 'dubare', 'rewi', 'bekemasi'].map(badge);
    renderApp(<BadgePill league="cem" tree={tree} badges={badges} title="Hamo’s collection" onOpen={() => {}} />);
    const pill = screen.getByRole('button', { name: 'Hamo’s collection, Badges: 6' });
    expect(pill.querySelectorAll('.bdg-pill-icon')).toHaveLength(3);
    expect(pill.querySelector('.bdg-pill-icon .art-league')).toBeNull();
    expect(pill.querySelector('.bdg-pill-more')).toHaveTextContent('+5');
  });

  it('is one button that opens the collection', async () => {
    const open = vi.fn();
    renderApp(<BadgePill badges={[badge('ders')]} title="Your collection" own onOpen={open} />);
    await userEvent.click(screen.getByRole('button', { name: 'Your collection, Badges: 1' }));
    expect(open).toHaveBeenCalledOnce();
  });

  it('shows nobody else’s empty row, and keeps your own as a quiet way to what there is to earn', () => {
    const { container, unmount } = renderApp(<BadgePill badges={[]} title="Hamo’s collection" onOpen={() => {}} />);
    expect(container.querySelector('.bdg-pill')).toBeNull();
    unmount();
    renderApp(<BadgePill badges={[]} own title="Your collection" onOpen={() => {}} />);
    const pill = screen.getByRole('button', { name: 'Your collection, Badges: 0' });
    expect(pill).toHaveClass('is-quiet');
    expect(pill).toHaveTextContent('Badges');
  });
});
