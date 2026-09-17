import { describe, expect, it } from 'vitest';
import { ICON_PATHS, ICON_VIEWBOX } from './icon-paths';
import { TABS } from '../navigation/tabs';

/**
 * That the file still matches Phosphor is checked by the generator itself
 * (`node mobile/scripts/generate-icon-paths.mjs --check`, which mobile's lint
 * runs) — it needs to read the filesystem, and this workspace deliberately has
 * no node types, so app code cannot reach for `fs` and break on a device.
 *
 * What is worth asserting here is what a reader of the app would notice.
 */
describe('icon paths', () => {
  it('gives every name something to draw', () => {
    for (const [name, paths] of Object.entries(ICON_PATHS)) {
      expect(paths.length, name).toBeGreaterThan(0);
      for (const d of paths) {
        // every Phosphor path opens with an absolute moveto; an empty or
        // truncated string renders as nothing at all, which reads as a missing
        // icon rather than as an error
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
