import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { jsonResponse, renderApp } from '../test/utils';
import { Dictionary } from './Dictionary';

afterEach(() => {
  vi.unstubAllGlobals();
});

function Where(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

describe('the dictionary', () => {
  it('offers today’s word before anything is searched, opening its entry, and leaves no gap on a day without one', async () => {
    for (const word of [{ entryId: 'e42', headword: 'hêvî', pos: 'n', definitionEn: 'hope', definitionKu: null }, null]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          const path = new URL(url).pathname;
          if (path === '/dictionary/word-of-day') return jsonResponse(200, { word });
          return jsonResponse(401, {});
        }),
      );
      const { unmount } = renderApp(
        <Routes>
          <Route path="/app/dictionary" element={<Dictionary />} />
        </Routes>,
        ['/app/dictionary'],
      );
      if (word) {
        const card = await screen.findByRole('link', { name: /Word of the day/ });
        expect(card).toHaveTextContent('hêvî');
        expect(card).toHaveTextContent('n · hope');
        expect(card).toHaveAttribute('href', '/app/dictionary?entry=e42');
      } else {
        await waitFor(() => expect(document.querySelector('.learn-wotd, .skeleton-late')).toBeNull());
      }
      unmount();
    }
  });

  it('opens the entry an address names, and drops it from the address on the way back to search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        if (path === '/dictionary/entries/e42') return jsonResponse(200, { id: 'e42', headword: 'hêvî', dialect: 'kurmanji', senses: [], audio: [], xrefs: [] });
        if (path === '/me/saved-words') return jsonResponse(200, { words: [] });
        return jsonResponse(401, {});
      }),
    );
    renderApp(
      <>
        <Routes>
          <Route path="/app/dictionary" element={<Dictionary />} />
        </Routes>
        <Where />
      </>,
      ['/app/dictionary?entry=e42'],
    );
    expect(await screen.findByRole('heading', { name: /hêvî/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to search' }));
    expect(screen.getByRole('searchbox', { name: 'Dictionary search' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/app\/dictionary$/);
  });
});
