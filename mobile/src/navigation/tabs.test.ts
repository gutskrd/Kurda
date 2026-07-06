import { describe, expect, it } from 'vitest';
import { TABS, linkingScreens } from './tabs';

describe('tab registry', () => {
  it('has exactly the five product tabs', () => {
    expect(TABS.map((t) => t.name)).toEqual(['Learn', 'Play', 'Dictionary', 'Social', 'Profile']);
  });

  it('has unique names and paths', () => {
    expect(new Set(TABS.map((t) => t.name)).size).toBe(TABS.length);
    expect(new Set(TABS.map((t) => t.path)).size).toBe(TABS.length);
  });

  it('labels every tab in Kurmanji with correct diacritics', () => {
    const ku = TABS.map((t) => t.titleKu);
    expect(ku).toContain('Fêrbûn');
    expect(ku).toContain('Lîstik');
    expect(ku).toContain('Profîl');
    for (const label of ku) expect(label.length).toBeGreaterThan(2);
  });

  it('maps every tab to a deep-link path (kurda://<path>)', () => {
    const screens = linkingScreens();
    expect(screens['Learn']).toBe('learn');
    expect(screens['Dictionary']).toBe('dictionary');
    expect(Object.keys(screens)).toHaveLength(TABS.length);
  });
});
