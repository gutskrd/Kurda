import { describe, expect, it } from 'vitest';
import { PEOPLE, PROFILE_BACKGROUND } from './samples';

/** The front page's pictures are the app's own files, so they have to exist. */
const onDisk = new Set(
  Object.keys(import.meta.glob('/public/cosmetics/**/*')).map((p) => p.replace(/^\/public/, '')),
);

describe('landing samples', () => {
  it('shows a profile background the shop actually has', () => {
    expect(onDisk).toContain(PROFILE_BACKGROUND);
  });

  it('shows avatars that exist', () => {
    for (const person of Object.values(PEOPLE)) expect(onDisk).toContain(person.avatar);
  });
});
