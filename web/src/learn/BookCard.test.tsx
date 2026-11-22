import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { jsonResponse, renderApp } from '../test/utils';
import { API_URL } from '../lib/config';
import { BookCard } from './BookCard';

/** A server that says which chapters of the road are in the book. */
function serve(chapters: number[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url, 'http://test').pathname;
      return path.endsWith('/books/road') ? jsonResponse(200, { chapters }) : jsonResponse(404, { code: 'NOT_FOUND', message: 'not found' });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Hevalo’s book on Learn', () => {
  it('offers the PDF of the chapters that are online, as a download', async () => {
    serve([1, 2]);
    renderApp(<BookCard />);
    const link = await screen.findByRole('link', { name: /Hevalo’s book/ });
    expect(link).toHaveAttribute('href', `${API_URL}/books/road.pdf`);
    expect(link).toHaveAttribute('download');
    expect(link).toHaveTextContent('2 chapters of the road, to keep or print');
  });

  it('says one chapter when there is one', async () => {
    serve([1]);
    renderApp(<BookCard />);
    expect(await screen.findByText(/Chapter 1 of the road, to keep or print/)).toBeInTheDocument();
  });

  it('is not there before any chapter is online', async () => {
    serve([]);
    const { container } = renderApp(<BookCard />);
    // Its placeholder stands while the answer is on its way, then nothing is left.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
