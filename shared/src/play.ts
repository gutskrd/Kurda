/**
 * Playing online games with friends, the same for every game: in-app invites a friend joins or turns down, join codes and
 * links as a fallback, and rematches without a new link. One pending invite per host, friend and game (a newer one
 * replaces it), preset decline reasons only, and nobody is ever put into a game they did not choose. Shared so the API,
 * the browser and the phone agree on names, states and limits.
 */
import { MULTI_GAMES } from './games/multi/games.js';

/** The online games friends can be invited to: the three with their own engines, then every `MULTI_GAMES` game. */
export const PLAY_GAMES = ['wordle-battle', 'rhyme-match', 'stories', ...MULTI_GAMES] as const;
export type PlayGame = (typeof PLAY_GAMES)[number];

/**
 * `POST /play/join {code}`: the game and lobby a code joined. Every lobby has a code (`normalizeJoinCode`,
 * `formatJoinCode`), cleared once the game can no longer be joined. Refusals: 404 GAME_NOT_FOUND for a code not open to
 * the caller, 409 GAME_FULL, and 409 GAME_STARTED for a story game whose questions began.
 */
export interface JoinedByCode {
  game: PlayGame;
  lobbyId: string;
}

export function isPlayGame(v: unknown): v is PlayGame {
  return (PLAY_GAMES as readonly unknown[]).includes(v);
}

/** Where an invite is in its life. */
export const INVITE_STATUSES = ['pending', 'accepted', 'declined', 'cancelled', 'expired'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** Why someone turned an invite down: presets only, never free text, shown to the host in soft wording. */
export const DECLINE_REASONS = ['later', 'not_this_game'] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

/** A live invite lasts at most this long; it also ends when the lobby starts without the invitee, is cancelled or fills. */
export const INVITE_TTL_MINUTES = 15;

/** Friends one invite request may name; a duo invites one, a group up to seven. */
export const MAX_INVITEES_PER_REQUEST = 7;

/** After "not now", the same host cannot invite the same friend to the same game for this long. */
export const DECLINE_COOLDOWN_MINUTES = 10;

/** A two-player rematch offer stands this long while both are on the results screen. */
export const REMATCH_OFFER_SECONDS = 60;

/**
 * The API's NOT_FOUND message for a path with no route (api/src/plugins/errors.ts). A game's own "no such game" is
 * NOT_FOUND too, but never with these words.
 */
export const ROUTE_NOT_FOUND_MESSAGE = 'route not found';

/** The server has no such route: the app is newer than the API, so the apps say that rather than "This game isn't available". */
export function isMissingRoute(error: { code?: string; message?: string }): boolean {
  return error.code === 'NOT_FOUND' && error.message === ROUTE_NOT_FOUND_MESSAGE;
}

/** Who sent an invite, as the invitee sees them; always a friend. */
export interface InvitePerson {
  name: string;
  avatarUrl: string | null;
}

/** What an invite is for, short enough for a banner; each game fills only its own fields. */
export interface InviteSummary {
  /** Peyvok Battle: easy | medium | hard */
  difficulty?: string;
  /** Rhyme Match and Stories: kurmanci | sorani */
  dialect?: string;
  /** Stories */
  storyTitle?: string;
  length?: string;
  questionCount?: number;
  /** Stories: solo | duo | group */
  mode?: string;
  /** Every game: Rated or Friendly, shown before anyone joins. Whether a rated game counts is decided when it starts. */
  rated?: boolean;
}

/** An invite as the person invited sees it (incoming). */
export interface IncomingInvite {
  id: string;
  game: PlayGame;
  lobbyId: string;
  status: InviteStatus;
  from: InvitePerson;
  summary: InviteSummary;
  /** a rematch of a game you played together (the banner says so) */
  rematch: boolean;
  createdAt: string;
  expiresAt: string;
}

/** One friend's answer, as the host sees it (outgoing). */
export interface OutgoingInviteState {
  inviteId: string;
  /** a friend of the host, so the host may see their id and name */
  userId: string;
  name: string;
  avatarUrl: string | null;
  status: InviteStatus;
  declineReason: DeclineReason | null;
}

/** GET /play/invites */
export interface InviteLists {
  incoming: IncomingInvite[];
  /** the host's pending and recently answered invites, newest first */
  outgoing: Array<{ game: PlayGame; lobbyId: string; invitees: OutgoingInviteState[] }>;
}

/** A game card in a chat: the live state of a shared lobby, fetched when shown and on each `play_changed`. */
export type LobbyCardStatus = 'open' | 'full' | 'started' | 'finished' | 'cancelled' | 'unavailable';

export interface LobbyCard {
  game: PlayGame;
  lobbyId: string;
  /** 'unavailable' when this viewer may not see or join it; looks the same as gone */
  status: LobbyCardStatus;
  players: number;
  maxPlayers: number;
  summary: InviteSummary;
  /** whether this viewer can join right now */
  canJoin: boolean;
  /** this viewer is already in it */
  isMember: boolean;
}

/**
 * After a game: two players get a rematch both must ask for, which starts at once with the same settings; in a bigger game
 * the host opens the next round and the others join with one tap.
 */
export interface RematchState {
  kind: 'pair' | 'round';
  /** pair: who has asked so far */
  offeredByMe: boolean;
  offeredByOther: boolean;
  /** pair: the other player left the results screen or said no thanks */
  otherDeclined: boolean;
  /** set once the next game exists */
  nextLobbyId: string | null;
  /** round: only the host may open the next round */
  canOpenRound: boolean;
  /** pair: games won in this run of rematches, you first ("2–1") */
  series: { me: number; other: number; draws: number } | null;
}

/** Events on a user's own realtime channel. */
export type PlayUserEvent =
  | { type: 'play_invite'; invite: IncomingInvite }
  | { type: 'play_invite_update'; inviteId: string; status: InviteStatus; declineReason?: DeclineReason | null }
  /** something changed in a lobby or game you are in or were invited to: refetch it */
  | { type: 'play_changed'; game: PlayGame; lobbyId: string }
  | { type: 'rematch_update'; game: PlayGame; lobbyId: string };
