import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Home } from './Home';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('Home', () => {
  it('offers one door to Civak rather than three into the same room', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Home />);

    const civak = await screen.findByRole('link', { name: /Civak/ });
    expect(civak).toHaveAttribute('href', '/app/civak');

    // Stories and Poems are sections of that wall now, not destinations
    expect(screen.queryByRole('link', { name: /^Stories/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Poems/ })).not.toBeInTheDocument();
  });

  it('still points at the things that are their own places', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Home />);

    expect(await screen.findByRole('link', { name: /Learn/ })).toHaveAttribute('href', '/app/learn');
    expect(screen.getByRole('link', { name: /Games/ })).toHaveAttribute('href', '/games');
    expect(screen.getByRole('link', { name: /Rankings/ })).toHaveAttribute('href', '/app/rankings');
  });
});
