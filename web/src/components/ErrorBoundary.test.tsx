import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { renderApp } from '../test/utils';

/** React and componentDidCatch both log a caught render error; that is noise in these tests. */
afterEach(() => vi.restoreAllMocks());

function Boom(): React.JSX.Element {
  throw new Error('boom from the page');
}

function renderWithBoundary(broken: () => React.JSX.Element) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // The link sits outside the boundary, as the real navigation does, so it survives the crash.
  return renderApp(
    <>
      <Link to="/fine">go elsewhere</Link>
      <ErrorBoundary>
        <Routes>
          <Route path="/broken" element={broken()} />
          <Route path="/fine" element={<p>A working page</p>} />
        </Routes>
      </ErrorBoundary>
    </>,
    ['/broken'],
  );
}

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderApp(
      <ErrorBoundary>
        <p>A working page</p>
      </ErrorBoundary>,
      ['/fine'],
    );
    expect(screen.getByText('A working page')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('shows the crash page instead of a blank one when a page throws', () => {
    renderWithBoundary(() => <Boom />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  // A deterministically broken page throws again on retry, so navigating away must clear it.
  it('clears the error when the path changes', async () => {
    const user = userEvent.setup();
    renderWithBoundary(() => <Boom />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'go elsewhere' }));

    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.getByText('A working page')).toBeInTheDocument();
  });
});
