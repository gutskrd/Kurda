import { describe, it, expect } from 'vitest';
import type { IncomingInvite } from '@kurda/shared';
import { englishOnly as t } from '../i18n/I18nProvider';
import { playNotification } from './notifications';

const note = (data: Record<string, unknown> | null) => ({
  title: 'Game invite',
  body: 'Rojda invited you to play Peyvok Battle.',
  data,
});

const invite: IncomingInvite = {
  id: 'i1',
  game: 'wordle-battle',
  lobbyId: 'b1',
  status: 'pending',
  from: { name: 'Rojda', avatarUrl: null },
  summary: { difficulty: 'hard' },
  rematch: false,
  createdAt: '2026-10-13T10:00:00Z',
  expiresAt: '2026-10-13T10:15:00Z',
};

describe('playNotification', () => {
  it('opens the game an invite is for: the lobby of a battle', () => {
    const view = playNotification(note({ kind: 'play_invite', inviteId: 'i1', game: 'wordle-battle', lobbyId: 'b1' }), t);
    expect(view?.to).toBe('/app/games/peyvok-battle?id=b1');
  });

  it('opens a story game by its link, which joins on arrival', () => {
    const view = playNotification(note({ kind: 'play_invite', inviteId: 'i2', game: 'stories', lobbyId: 's1' }), t);
    expect(view?.to).toBe('/app/games/stories?id=s1');
  });

  it('names who asked in the reader’s words while the invite is still known', () => {
    const view = playNotification(note({ kind: 'play_invite', inviteId: 'i1', game: 'wordle-battle', lobbyId: 'b1' }), t, [invite]);
    expect(view?.title).toBe('Rojda invited you to Peyvok Battle');
  });

  it('names just the game once the invite is gone, never the server’s English', () => {
    const view = playNotification(note({ kind: 'play_invite', inviteId: 'old', game: 'rhyme-match', lobbyId: 'r1' }), t, [invite]);
    expect(view?.title).toBe('Rhyme Match invite');
    expect(view?.body).toBeNull();
  });

  it('leaves every other notification as the server wrote it', () => {
    expect(playNotification(note(null), t)).toBeNull();
    expect(playNotification(note({ kind: 'gift', giftId: 'g1' }), t)).toBeNull();
    // a game or a lobby it cannot read is not a link to nowhere
    expect(playNotification(note({ kind: 'play_invite', game: 'quiz', lobbyId: 'x' }), t)).toBeNull();
    expect(playNotification(note({ kind: 'play_invite', game: 'stories' }), t)).toBeNull();
  });
});
