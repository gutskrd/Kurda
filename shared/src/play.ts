/**
 * Starting a game with friends, the same way for every online game — Peyvok
 * Battle, Rhyme Match and Stories: invite a friend from the game, their
 * profile, the friends list or your chat with them; they get an in-app invite
 * they can Join or turn down; and when a game ends, the same people can play
 * again without anyone sending a link. Links and join codes still work, as a
 * fallback.
 *
 * Shaped after the apps people already know (lichess, chess.com, Kahoot): one
 * pending invite per host, friend and game, a newer one replacing it; preset
 * reasons for "not now", never free text; a two-player rematch that starts when
 * both ask for it; a group "play again" the host opens and the others join with
 * one tap — nobody is ever put into a game they did not choose.
 *
 * Shared so the API, the browser and the phone agree on the names, the states
 * and the limits.
 */
import type { GameAccess } from './stories.js';

/** The online games you can invite friends to. */
export const PLAY_GAMES = ['wordle-battle', 'rhyme-match', 'stories'] as const;
export type PlayGame = (typeof PLAY_GAMES)[number];

export function isPlayGame(v: unknown): v is PlayGame {
  return v === 'wordle-battle' || v === 'rhyme-match' || v === 'stories';
}

export type { GameAccess };

/** Where an invite is in its life. */
export const INVITE_STATUSES = ['pending', 'accepted', 'declined', 'cancelled', 'expired'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/**
 * Why someone turned an invite down — presets only, never free text, and the
 * host is shown the soft wording ("can't play right now" / "would rather play
 * something else").
 */
export const DECLINE_REASONS = ['later', 'not_this_game'] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export function isDeclineReason(v: unknown): v is DeclineReason {
  return v === 'later' || v === 'not_this_game';
}

/**
 * A live invite lasts this long at most. It also ends as soon as the lobby
 * starts without the invitee (for games that cannot be joined late), is
 * cancelled, or fills up.
 */
export const INVITE_TTL_MINUTES = 15;

/** Friends one invite request may name; a duo invites one, a group up to seven. */
export const MAX_INVITEES_PER_REQUEST = 7;

/** After "not now", the same host cannot invite the same friend to the same game for this long. */
export const DECLINE_COOLDOWN_MINUTES = 10;

/** A two-player rematch offer stands this long while both are on the results screen. */
export const REMATCH_OFFER_SECONDS = 60;

/**
 * What the API answers, with code NOT_FOUND, for a path it has no route for
 * (api/src/plugins/errors.ts). The games' own "no such game" is NOT_FOUND
 * too, but never with these words.
 */
export const ROUTE_NOT_FOUND_MESSAGE = 'route not found';

/**
 * The server has no such route: an app newer than the API it talks to — a
 * build of a branch whose API has not been deployed yet, say, where
 * `/play/lobbies` does not exist. The apps say that plainly rather than read
 * it as a game that has ended ("This game isn't available"), which is what an
 * invite to a friend used to show against such a server.
 */
export function isMissingRoute(error: { code?: string; message?: string }): boolean {
  return error.code === 'NOT_FOUND' && error.message === ROUTE_NOT_FOUND_MESSAGE;
}

/**
 * Who may join a lobby, the same rule for every game:
 * - 'friends' (default): the host's accepted friends, and — when the host
 *   shared the game into a group chat — members of that group;
 * - 'open': any known adult with the link or code; only a known-adult host can
 *   open a game, and a minor or an account of unknown age can never join one.
 * In both: nobody with a block either way against any player, and nobody the
 * host removed. Every refusal that could tell someone something about another
 * person looks the same as "not found".
 */
export const DEFAULT_ACCESS: GameAccess = 'friends';

/** The person who sent an invite, as the invitee sees them (always a friend). */
export interface InvitePerson {
  name: string;
  avatarUrl: string | null;
}

/**
 * What the invite is for, short enough for a banner: each game fills only
 * its own fields.
 */
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
  /**
   * Every game: Rated or Friendly (Game Ranks), so the banner and the card
   * show it before anyone joins. Whether a Rated game then counts is decided
   * when it starts (the game's `rated` state).
   */
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
  /** a friend of the host, so their id and name are theirs to see */
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

/**
 * A game card in a chat — the live state of a lobby someone shared there. The
 * card asks for this when it is shown and when a `play_changed` arrives.
 */
export type LobbyCardStatus = 'open' | 'full' | 'started' | 'finished' | 'cancelled' | 'unavailable';

export interface LobbyCard {
  game: PlayGame;
  lobbyId: string;
  /** 'unavailable' when this viewer may not see or join it (looks the same as gone) */
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
 * After a game: a two-player game offers a rematch both must ask for (it then
 * starts at once with the same settings); a bigger game's host opens the next
 * round and everyone else gets a one-tap Join.
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
