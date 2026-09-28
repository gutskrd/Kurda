import { describe, expect, it } from 'vitest';
import { FAVORITE_KINDS, favoriteCopy, setFavorite, clearFavorite, type FavoriteKind } from './favorites';
import { TRANSLATIONS, LOCALES } from '../i18n/translations';
import type { ApiClient } from '../api/client';

describe('favoriteCopy', () => {
  it('names each slot and its empty case', () => {
    expect(favoriteCopy('poem')).toEqual({ label: 'profile.favoritePoem', empty: 'favorites.noPoems' });
    expect(favoriteCopy('story')).toEqual({ label: 'profile.favoriteStory', empty: 'favorites.noStories' });
  });

  it('gives the two slots different copy', () => {
    expect(favoriteCopy('poem').label).not.toBe(favoriteCopy('story').label);
    expect(favoriteCopy('poem').empty).not.toBe(favoriteCopy('story').empty);
  });

  /*
   * A key with nothing behind it renders as the key itself, which the type
   * cannot catch — `TranslationKey` says the name is spelled right, not that
   * nine catalogues have a sentence under it. `profile.favoritePoem` in
   * particular sat in all nine for months with nothing reading it, so the one
   * thing never checked was whether it reads well when something finally does.
   */
  it('names keys every language actually has', () => {
    for (const kind of FAVORITE_KINDS) {
      const copy = favoriteCopy(kind);
      for (const loc of LOCALES) {
        for (const key of [copy.label, copy.empty]) {
          expect(TRANSLATIONS[loc][key], `${loc} ${key}`).toBeTruthy();
        }
      }
    }
  });
});

describe('FAVORITE_KINDS', () => {
  it('is the poem then the story, and nothing else', () => {
    expect(FAVORITE_KINDS).toEqual(['poem', 'story']);
  });
});

/**
 * The paths, because a favourite is the one profile write whose URL carries the
 * slot. `/me/favorites/poems` or `/me/favorites/Poem` would 404 at runtime and
 * typecheck perfectly.
 */
describe('the endpoints', () => {
  const spy = () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const client = {
      put: (path: string, body?: unknown) => {
        calls.push({ method: 'PUT', path, body });
        return Promise.resolve({ ok: true, data: {} });
      },
      delete: (path: string) => {
        calls.push({ method: 'DELETE', path });
        return Promise.resolve({ ok: true, data: {} });
      },
    } as unknown as ApiClient;
    return { client, calls };
  };

  it('puts the post id to the slot', async () => {
    for (const kind of FAVORITE_KINDS) {
      const { client, calls } = spy();
      await setFavorite(client, kind, 'post-1');
      expect(calls).toEqual([{ method: 'PUT', path: `/me/favorites/${kind}`, body: { postId: 'post-1' } }]);
    }
  });

  it('deletes the slot, sending no body', async () => {
    for (const kind of FAVORITE_KINDS) {
      const { client, calls } = spy();
      await clearFavorite(client, kind);
      expect(calls).toEqual([{ method: 'DELETE', path: `/me/favorites/${kind}` }]);
    }
  });

  /* the slot in the path is the kind verbatim — no pluralising, no casing */
  it('uses the kind itself as the path segment', () => {
    const { client, calls } = spy();
    void setFavorite(client, 'poem' as FavoriteKind, 'x');
    expect(calls[0]!.path.endsWith('/poem')).toBe(true);
  });
});
