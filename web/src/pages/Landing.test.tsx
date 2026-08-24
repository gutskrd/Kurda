import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Landing } from './Landing';

describe('Landing', () => {
  it('renders the hero and primary calls to action', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/learn kurdish/i);
    const start = screen.getByRole('link', { name: /start learning/i });
    expect(start).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: /explore stories/i })).toHaveAttribute('href', '/stories');
  });
});
