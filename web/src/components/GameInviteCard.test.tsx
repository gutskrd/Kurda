import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MessageBody } from './GameInviteCard';

const show = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('MessageBody', () => {
  it('turns a Stories link into a card that opens the game', () => {
    const id = '0b0c2c43-5a1e-4b1e-9b5e-6f1b2a3c4d5e';
    show(<MessageBody body={`read with me https://hevalo.app/app/games/stories?id=${id}`} />);
    const card = screen.getByRole('link', { name: 'Join a Stories game' });
    expect(card).toHaveAttribute('href', `/app/games/stories?id=${id}`);
    expect(screen.getByText('read with me')).toBeInTheDocument();
    expect(screen.getByText('Join game')).toBeInTheDocument();
  });

  it('leaves text without a link as it is', () => {
    show(<MessageBody body="just words" />);
    expect(screen.getByText('just words')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('lets what somebody wrote run in its own direction, whatever the page’s', () => {
    show(<MessageBody body="Sibê em Wordle bilîzin?" />);
    expect(screen.getByText('Sibê em Wordle bilîzin?')).toHaveAttribute('dir', 'auto');
  });
});
