import { describe, expect, it } from 'vitest';
import { ICON_PATHS, ICON_VIEWBOX } from './icon-paths';
import { TABS } from '../navigation/tabs';

/**
 * The generator itself checks the file still matches the icon package (`node mobile/scripts/generate-icon-paths.mjs
 * --check`, run by mobile's lint), since that needs the file system, which this workspace's types leave out so app
 * code cannot reach for `fs`. Here only what a reader would notice is asserted.
 */
describe('icon paths', () => {
  it('gives every name something to draw', () => {
    for (const [name, paths] of Object.entries(ICON_PATHS)) {
      expect(paths.length, name).toBeGreaterThan(0);
      for (const d of paths) {
        // Every path starts with an absolute moveto; an empty or truncated one would render as a silently missing icon.
        expect(d.startsWith('M'), `${name}: ${d.slice(0, 12)}`).toBe(true);
        expect(d.length, name).toBeGreaterThan(20);
      }
    }
  });

  it('draws in Phosphor’s 256 box, not the old hand-drawn 24', () => {
    expect(ICON_VIEWBOX).toBe(256);
  });

  it('has a glyph for every tab', () => {
    for (const tab of TABS) expect(Object.keys(ICON_PATHS), tab.name).toContain(tab.icon);
  });
});
