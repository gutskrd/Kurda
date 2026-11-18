import { isPlayGame, type IncomingInvite } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import { GAME_NAME_KEY, joinPath } from './playApi';

/** Just enough of the i18n contract to write a sentence; no React in here. */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** A notification as the rail holds it: the server's English and its data. */
export interface InboxNote {
  title: string;
  body: string | null;
  data?: Record<string, unknown> | null;
}

/** What a notification says in the reader's language, and where tapping it goes. */
export interface NoteView {
  title: string;
  body: string | null;
  /** A page in the app. */
  to?: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * A game invite notification (`data.kind` 'play_invite') in the reader's language, linking to the lobby (a story game
 * joins on arrival). The host's name comes from the invite while the app still has it (`GET /play/invites`); after that
 * the line names only the game. Anything else is null and shown as the server wrote it.
 */
export function playNotification(note: InboxNote, t: Translate, incoming: readonly IncomingInvite[] = []): NoteView | null {
  const data = note.data;
  if (!data || typeof data !== 'object' || data.kind !== 'play_invite') return null;
  const lobbyId = str(data.lobbyId);
  if (!isPlayGame(data.game) || !lobbyId) return null;
  const game = t(GAME_NAME_KEY[data.game]);
  const invite = incoming.find((i) => i.id === data.inviteId);
  return {
    title: invite ? t('play.banner.invited', { name: invite.from.name, game }) : t('games.invite.preview', { game }),
    body: null,
    to: joinPath(data.game, lobbyId),
  };
}
