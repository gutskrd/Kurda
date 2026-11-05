/**
 * What `GET /mp/:game/:id` answers: one lobby or game of any multiplayer
 * learning game, as one viewer may see it. The envelope — the lobby, the
 * seats, the clock, the result — is the same for every game, so both apps draw
 * the room around a game once (`GameRoom`); `board` is the game's own view for
 * this viewer, built by its rules' `viewFor` and never more than that seat may
 * see.
 *
 * People are seats. Another player's `userId` is `seat:N`, their name only
 * when the viewer may see it (a friend, or anyone in a game open to adults),
 * and a report names the seat; nothing here is ever an account id but the
 * viewer's own.
 */
import type { GameAccess } from '../../stories.js';
import type { RatedState } from '../../ranks.js';
import type { LetterDialect } from '../letters.js';
import type { MultiGame } from './games.js';

export type MultiStatus = 'lobby' | 'active' | 'finished' | 'cancelled';

/** A lobby friends are invited to, or one person against Hevalo. */
export type MultiMode = 'group' | 'solo';

export interface MultiSeat {
  seat: number;
  /** the viewer's own id on their own seat, `seat:N` on everyone else's */
  userId: string;
  /** null unless the viewer may see it: shown as "Player N" (or Hevalo, for a computer seat) */
  name: string | null;
  avatarUrl: string | null;
  isMe: boolean;
  isHost: boolean;
  /** left after the start; stays listed so seats do not move */
  gone: boolean;
  /** missed two turns in a row, or not heard from: their turns are passed over until they are back */
  away: boolean;
  team: number | null;
  /** a computer seat ('hevalo'); null for a person */
  bot: string | null;
}

export interface MultiResult {
  seat: number;
  place: number;
  score: number;
  /** placement XP paid to that seat; null for a computer seat or a game that paid none */
  xpAwarded: number | null;
}

export interface MultiView<Board = unknown, Settings = unknown> {
  id: string;
  game: MultiGame;
  mode: MultiMode;
  status: MultiStatus;
  /** bumped by every change; `?v=` waits for a newer one */
  version: number;
  /** the server's clock when this was built: every countdown is drawn from it */
  serverNow: string;
  dialect: LetterDialect;
  /** the settings anyone in the lobby may see */
  settings: Settings;
  access: GameAccess;
  /** the code a friend types to join, while the lobby can be joined; null after */
  code: string | null;
  rated: RatedState;
  minPlayers: number;
  maxPlayers: number;
  /** teams in a team game (0 when every seat plays for itself) */
  teams: number;
  /** the viewer is the host */
  isHost: boolean;
  /** the viewer holds the host controls now: the host, or a stand-in while the host is away or gone */
  canControl: boolean;
  /** the host: the viewer's own id when they host, else the host's `seat:N` */
  createdBy: string;
  nextLobbyId: string | null;
  players: MultiSeat[];
  /** the viewer's own seat; null for someone who may join but has not */
  me: { seat: number; team: number | null } | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** once finished: every seat's place, best first */
  results: MultiResult[] | null;
  board: Board;
}

/** `POST /mp/:game/:id/moves`: the view after the move, and what the mover alone is told about it. */
export interface MultiMoveAnswer<Board = unknown, Outcome = unknown, Settings = unknown> {
  view: MultiView<Board, Settings>;
  outcome: Outcome;
}
