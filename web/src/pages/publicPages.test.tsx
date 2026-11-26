import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderApp, routedFetch } from '../test/utils';
import { Landing } from './Landing';
import { About } from './About';
import { Privacy } from './Privacy';
import { Terms } from './Terms';
import { Faq } from './Faq';
import { HowHevaloTeaches } from './HowHevaloTeaches';
import { CopyrightPage } from '../copyright/CopyrightPage';

/** Each public page names itself once: a single h1, so a search engine and a screen reader know what the page is. */
describe('the public pages', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const pages: Array<[string, () => React.JSX.Element]> = [
    ['/', Landing],
    ['/about', About],
    ['/privacy', Privacy],
    ['/terms', Terms],
    ['/faq', Faq],
    ['/how-hevalo-teaches', HowHevaloTeaches],
    ['/copyright', CopyrightPage],
  ];
  for (const [path, Page] of pages) {
    it(`gives ${path} one h1 and a title of its own`, () => {
      vi.stubGlobal('fetch', vi.fn(routedFetch({})));
      renderApp(<Page />, [path]);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(document.title.length).toBeGreaterThan(5);
    });
  }
});
