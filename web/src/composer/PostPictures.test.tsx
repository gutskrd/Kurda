import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FeedImage } from '@kurda/shared';
import { preloadCatalogue } from '../i18n/catalogues';
import { renderApp } from '../test/utils';
import { PostPictures } from './PostPictures';

const pic = (n: number, alt: string | null = null, width: number | null = 1200, height: number | null = 900): FeedImage => ({
  url: `https://cdn.test/${n}.webp`,
  alt,
  width,
  height,
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('dir');
});

describe('PostPictures', () => {
  it('shows nothing when a post has no pictures', () => {
    const { container } = renderApp(<PostPictures images={[]} />);
    expect(container.querySelector('.pp-grid')).toBeNull();
  });

  it('shows at most four, in the grid for their number', () => {
    renderApp(<PostPictures images={[pic(1), pic(2), pic(3), pic(4), pic(5)]} />);
    const group = screen.getByRole('group', { name: '4 pictures' });
    expect(group).toHaveClass('pp-n4');
    expect(within(group).getAllByRole('button')).toHaveLength(4);
  });

  it('keeps one picture at its own shape, within limits', () => {
    const { rerender } = renderApp(<PostPictures images={[pic(1, null, 1000, 500)]} />);
    expect(screen.getByRole('group')).toHaveStyle({ aspectRatio: '1.91' });
    // a very tall photo is not allowed to take the whole wall
    rerender(<PostPictures images={[pic(1, null, 500, 2000)]} />);
    expect(screen.getByRole('group')).toHaveStyle({ aspectRatio: '0.8' });
  });

  it('marks a described picture with ALT for sighted readers, and names it by its description', () => {
    renderApp(<PostPictures images={[pic(1, 'A pomegranate tree'), pic(2)]} />);
    const described = screen.getByRole('button', { name: 'Open picture 1 of 2: A pomegranate tree' });
    expect(within(described).getByText('ALT')).toBeInTheDocument();
    const plain = screen.getByRole('button', { name: 'Open picture 2 of 2' });
    expect(within(plain).queryByText('ALT')).toBeNull();
  });

  describe('the lightbox', () => {
    it('opens on the picture chosen, with its description under it', async () => {
      renderApp(<PostPictures images={[pic(1, 'Sunrise'), pic(2, 'Mountains')]} />);
      await userEvent.click(screen.getByRole('button', { name: 'Open picture 2 of 2: Mountains' }));

      const dialog = screen.getByRole('dialog', { name: 'Picture 2 of 2' });
      expect(within(dialog).getByRole('img', { name: 'Mountains' })).toHaveAttribute('src', 'https://cdn.test/2.webp');
      expect(within(dialog).getByText('2 of 2')).toBeInTheDocument();
      // focus starts on the way out
      expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    });

    it('moves with the arrow keys and the buttons, round and round', async () => {
      renderApp(<PostPictures images={[pic(1, 'One'), pic(2, 'Two'), pic(3, 'Three')]} />);
      await userEvent.click(screen.getByRole('button', { name: 'Open picture 1 of 3: One' }));

      await userEvent.keyboard('{ArrowRight}');
      expect(screen.getByRole('img', { name: 'Two' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Next picture' }));
      expect(screen.getByRole('img', { name: 'Three' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Next picture' }));
      expect(screen.getByRole('img', { name: 'One' })).toBeInTheDocument();
      await userEvent.keyboard('{ArrowLeft}');
      expect(screen.getByRole('img', { name: 'Three' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Previous picture' }));
      expect(screen.getByRole('img', { name: 'Two' })).toBeInTheDocument();
    });

    it('reverses the arrow keys for a right-to-left language, so "next" goes the reading way', async () => {
      localStorage.setItem('hevalo_locale', 'ckb');
      await preloadCatalogue();
      renderApp(<PostPictures images={[pic(1, 'One'), pic(2, 'Two')]} />);
      await userEvent.click(screen.getAllByRole('button')[0]!);

      await userEvent.keyboard('{ArrowLeft}');
      expect(screen.getByRole('img', { name: 'Two' })).toBeInTheDocument();
    });

    it('closes with Escape and gives focus back to the picture that was opened', async () => {
      renderApp(<PostPictures images={[pic(1), pic(2)]} />);
      const second = screen.getByRole('button', { name: 'Open picture 2 of 2' });
      await userEvent.click(second);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // an undescribed picture still says what it is
      expect(screen.getByRole('img', { name: 'Picture 2, no description' })).toBeInTheDocument();

      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(second).toHaveFocus();
    });

    it('keeps Tab inside the viewer', async () => {
      renderApp(<PostPictures images={[pic(1), pic(2)]} />);
      await userEvent.click(screen.getByRole('button', { name: 'Open picture 1 of 2' }));
      const dialog = screen.getByRole('dialog');
      const [close, , next] = within(dialog).getAllByRole('button');
      expect(close).toHaveFocus();
      await userEvent.tab({ shift: true });
      expect(next).toHaveFocus();
      await userEvent.tab();
      expect(close).toHaveFocus();
    });

    it('has no arrows for a single picture', async () => {
      renderApp(<PostPictures images={[pic(1, 'Only one')]} />);
      await userEvent.click(screen.getByRole('button', { name: 'Open picture 1 of 1: Only one' }));
      const dialog = screen.getByRole('dialog', { name: 'Picture' });
      expect(within(dialog).queryByRole('button', { name: 'Next picture' })).toBeNull();
      expect(within(dialog).queryByText('1 of 1')).toBeNull();
    });
  });
});
