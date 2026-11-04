import { describe, expect, it } from 'vitest';
import { STORY_CATEGORY_SLUG_PATTERN, STORY_COVER_MAX } from './stories.js';
import { STORY_COVERS, isStoryCover, storyCover, storyCoverPath } from './story-covers.js';

describe('the story covers', () => {
  it('are the shop’s backgrounds, each once, keyed the way a story stores a cover', () => {
    expect(STORY_COVERS).toHaveLength(27);
    expect(new Set(STORY_COVERS.map((c) => c.key)).size).toBe(STORY_COVERS.length);
    for (const c of STORY_COVERS) {
      expect(c.key).toMatch(STORY_CATEGORY_SLUG_PATTERN);
      expect(c.key.length).toBeLessThanOrEqual(STORY_COVER_MAX);
      expect(c.file).toMatch(new RegExp(`^made-\\d{2}-${c.key}\\.webp$`));
      expect(c.ku.trim()).not.toBe('');
      expect(c.en.trim()).not.toBe('');
    }
    // the files are numbered in the shop’s order, with no gap
    expect(STORY_COVERS.map((c) => Number(c.file.slice(5, 7)))).toEqual(STORY_COVERS.map((_, i) => i + 1));
    expect(STORY_COVERS.filter((c) => c.kind === 'kilim').map((c) => c.key)).toEqual(
      ['kilima-sor', 'kilima-mor', 'kilima-zer', 'kilima-kesk', 'kilima-sin', 'kilima-gulan', 'kilima-seve'],
    );
  });

  it('find a cover by its key and say where its picture is', () => {
    expect(storyCover('gola-sin')).toMatchObject({ en: 'Blue lake', kind: 'scene' });
    expect(storyCoverPath('gola-sin')).toBe('/cosmetics/backgrounds/made-06-gola-sin.webp');
    expect(isStoryCover('kilima-sor')).toBe(true);
    for (const missing of [null, undefined, '', 'made-06-gola-sin', 'nowhere']) {
      expect(storyCover(missing)).toBeNull();
      expect(storyCoverPath(missing)).toBeNull();
      expect(isStoryCover(missing)).toBe(false);
    }
  });
});
