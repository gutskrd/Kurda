import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { SendError } from './SendError';
import type { ApiError } from '../lib/types';

const refusal = (code: string, details?: unknown): ApiError => ({ kind: 'client', status: 403, code, message: 'server words', details });

describe('SendError', () => {
  it('says what is limited, until when, and where the reasons are', () => {
    renderApp(<SendError error={refusal('MUTED', { scope: 'chat', until: '2030-01-02T10:00:00.000Z' })} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/You can’t send messages until .*2030/);
    expect(screen.getByRole('link', { name: 'See your account standing' })).toHaveAttribute('href', '/app/settings/standing');
  });

  it('does not send anyone to Account standing for a group’s own mute', () => {
    renderApp(<SendError error={refusal('MUTED')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The group’s admins have muted you in this group.');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('explains the automatic chat pause without a page that would show nothing', () => {
    renderApp(<SendError error={refusal('CHAT_MUTED')} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/paused for a while/);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('leaves other errors to the caller’s own words', () => {
    renderApp(<SendError error={refusal('NOT_FRIENDS')} describe={() => 'Only friends.'} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Only friends.');
  });

  it('shows a sentence the caller already has, and nothing for no error', () => {
    const { rerender } = renderApp(<SendError error="Could not prepare it." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not prepare it.');
    rerender(<SendError error={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
