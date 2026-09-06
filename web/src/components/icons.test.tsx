import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as icons from './icons';

/**
 * The icon façade is the one place a wrong import shows up as a blank space
 * rather than an error, so this walks every name it exports and checks a real
 * glyph comes out at the size asked for.
 */
const ENTRIES = Object.entries(icons).filter(([, v]) => typeof v === 'function') as Array<
  [string, (p: { size?: number }) => React.JSX.Element]
>;

describe('icons', () => {
  it('exports the whole set the app imports by name', () => {
    const names = ENTRIES.map(([n]) => n);
    // the ones screens actually reach for; a rename should fail here, loudly,
    // rather than silently leaving a hole in a toolbar
    for (const expected of [
      'PersonGlyph', 'BookIcon', 'FeatherIcon', 'GameIcon', 'PhotoIcon', 'HeartIcon',
      'CommentIcon', 'TrophyIcon', 'UserIcon', 'UsersIcon', 'SparkIcon', 'CoinIcon',
      'TilesIcon', 'WaveformIcon', 'ChevronIcon', 'GiftIcon', 'MenuIcon', 'CloseIcon',
      'SunIcon', 'MoonIcon', 'GearIcon', 'ArrowIcon', 'BookmarkIcon', 'TextIcon', 'EyeIcon',
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
      // decorative by default: the label belongs on the control, not the glyph
      expect(svg!.getAttribute('aria-hidden')).toBe('true');
      unmount();
    }
  });

  it('gives the password toggle two different glyphs', () => {
    const open = render(<icons.EyeIcon />).container.innerHTML;
    const shut = render(<icons.EyeIcon off />).container.innerHTML;
    // one icon in one place with two states — if they matched, the button would
    // look inert while it was in fact working
    expect(open).not.toBe(shut);
  });

  it('tells the two people icons apart', () => {
    // the social panel is your friends, not your profile
    const one = render(<icons.UserIcon size={20} />).container.innerHTML;
    const many = render(<icons.UsersIcon size={20} />).container.innerHTML;
    expect(one).not.toBe(many);
  });
});
