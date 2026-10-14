import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { About } from './About';
import { renderApp } from '../test/utils';

afterEach(() => localStorage.clear());

describe('About', () => {
  /**
   * The fonts, icons and emoji are other people's work, used under licences
   * that ask to be named; the shop's art and the stickers are Hevalo's own.
   */
  it('credits the work it uses, with each licence, and says the art is its own', () => {
    renderApp(<About />, ['/about']);
    expect(screen.getByRole('heading', { level: 2, name: 'Credits & licences' })).toBeInTheDocument();
    expect(screen.getByText(/Vazirmatn .* SIL Open Font License 1\.1/)).toBeInTheDocument();
    expect(screen.getByText(/Phosphor Icons — MIT License/)).toBeInTheDocument();
    expect(screen.getByText(/Noto Emoji .* resized and re-encoded — Apache License 2\.0/)).toBeInTheDocument();
    expect(screen.getByText(/backgrounds and icons, and the photo stickers, are made by Hevalo/)).toBeInTheDocument();
  });
});
