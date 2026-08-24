import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { renderApp } from '../test/utils';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('ProtectedRoute', () => {
  it('redirects a signed-out visitor to /login', async () => {
    renderApp(
      <Routes>
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <div>secret</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>,
      ['/app'],
    );

    // starts by restoring, then resolves to signed-out and redirects
    await waitFor(() => expect(screen.getByText('login page')).toBeInTheDocument());
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});
