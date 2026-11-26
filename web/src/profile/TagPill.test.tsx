import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { ProfileCard } from '../ui/ProfileCard';
import { TagPill } from './TagPill';

describe('a word tag', () => {
  it('is its Kurmancî word, with what it means for the reader on hover and to a screen reader', () => {
    renderApp(<TagPill tag={{ label: 'Mêvanperwer', meaning: 'Hospitable' }} />);
    const word = screen.getByText('Mêvanperwer');
    expect(word).toHaveAttribute('lang', 'ku');
    expect(word.closest('.tag-pill')).toHaveAttribute('title', 'Mêvanperwer: Hospitable');
    expect(screen.getByText(', Hospitable')).toHaveClass('sr-only');
  });

  it('stands by the name on the mini profile', () => {
    renderApp(<ProfileCard name="Rojda" username="rojda" tag={{ sku: 'tag-dengbej', label: 'Dengbêj', meaning: 'Singer of tales' }} />);
    const row = screen.getByText('Rojda').closest('.pc-name-row')!;
    expect(row).toHaveTextContent('Dengbêj');
  });
});
