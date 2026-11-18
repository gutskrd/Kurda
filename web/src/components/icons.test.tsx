import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as icons from './icons';

/** A wrong import in the icon façade shows as a blank space rather than an error, so every export is drawn here. */
const ENTRIES = Object.entries(icons).filter(([, v]) => typeof v === 'function') as Array<
  [string, (p: { size?: number }) => React.JSX.Element]
>;

describe('icons', () => {
  it('exports the whole set the app imports by name', () => {
    const names = ENTRIES.map(([n]) => n);
    // The ones screens use by name; a rename should fail here rather than leave a hole in a toolbar.
    for (const expected of [
      'PersonGlyph', 'BookIcon', 'FeatherIcon', 'GameIcon', 'PhotoIcon', 'HeartIcon',
      'CommentIcon', 'TrophyIcon', 'UserIcon', 'UsersIcon', 'FlameIcon', 'CoinIcon',
      'TilesIcon', 'WaveformIcon', 'ChevronIcon', 'GiftIcon', 'MenuIcon', 'CloseIcon',
      'MoonIcon', 'GearIcon', 'ArrowIcon', 'BookmarkIcon', 'TextIcon', 'EyeIcon',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('draws every one of them at the size it was given', () => {
    for (const [name, Glyph] of ENTRIES) {
      const { container, unmount } = render(<Glyph size={24} />);
      const svg = container.querySelector('svg');
      expect(svg, `${name} drew nothing`).not.toBeNull();
      expect(svg!.getAttribute('width'), `${name} ignored size`).toBe('24');
      // Decorative by default; the label belongs on the control. The coin and gem sit inside a hidden wrapper.
      expect(svg!.closest('[aria-hidden="true"]'), `${name} is not hidden`).not.toBeNull();
      unmount();
    }
  });

  it('gives the password toggle two different glyphs', () => {
    const open = render(<icons.EyeIcon />).container.innerHTML;
    const shut = render(<icons.EyeIcon off />).container.innerHTML;
    // Two states of one icon; if they matched, the button would look inert while working.
    expect(open).not.toBe(shut);
  });

  it('tells the two people icons apart', () => {
    // The social panel is your friends, not your profile.
    const one = render(<icons.UserIcon size={20} />).container.innerHTML;
    const many = render(<icons.UsersIcon size={20} />).container.innerHTML;
    expect(one).not.toBe(many);
  });
});
