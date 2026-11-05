import type pg from 'pg';
import type { z } from 'zod';
import type { GameAccess, GameRules, InviteSummary, LetterDialect, MultiGame, RulesSeat } from '@kurda/shared';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * One multiplayer learning game, as the engine (service.ts) runs it: its pure
 * rules, and the few things that need the server — reading the settings a host
 * may choose, preparing a move that needs a lookup before the rules can judge
 * it (a word checked against the dictionary), Hevalo's move, what a game
 * against Hevalo pays, and whether the game has the content to be offered at
 * all. Everything else — lobbies, invites, seats, the clock, presence, who is
 * away, the stand-in host, placement XP, Game Ranks, reports by seat — is the
 * engine's, the same for every game.
 */

/** What every lobby is made with, besides the game's own settings. */
export interface LobbyChoices<Settings> {
  settings: Settings;
  dialect: LetterDialect;
  /** 2..max for a group game */
  maxPlayers: number;
  access: GameAccess;
  /** left out: the host's last choice (Game Ranks) */
  rated?: boolean;
}

/** A move the rules can judge, and what of it is kept with the move for a report. */
export interface PreparedMove<Move> {
  move: Move;
  /** what the player typed, as stored with the move (never shown outside the game) */
  text: string | null;
  /** the text tripped the profanity filter: an offense is recorded once the move commits */
  offense?: boolean;
}

/** A move read from a request body, already through the free-text gate when the game takes free text. */
export interface RawMove<Raw> {
  raw: Raw;
  /** the gated text, when the game takes free text (`freeText`) */
  text: string | null;
}

export interface GameModule<State = unknown, Move = unknown, Settings = unknown, Board = unknown, Outcome = unknown, Raw = unknown> {
  readonly game: MultiGame;
  readonly rules: GameRules<State, Move, Settings, Board, Outcome>;
  /** the settings a host may send (`POST /play/lobbies` settings, `POST /mp/:game/solo`): 400 on anything not offered */
  readonly lobbySchema: z.ZodType<LobbyChoices<Settings>>;
  /** a move's request body */
  readonly moveSchema: z.ZodType<Raw>;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** teams in a team game; 0 when every seat plays for itself */
  readonly teams: number;
  /**
   * The game takes free text from players (a clue, a guess, a definition):
   * the text of a move goes through the chat pipeline's gate before anything
   * else sees it (free-text.ts), capped at `maxLength`. A move with nothing
   * typed (a vote, a skip) gives null and passes no gate.
   */
  readonly freeText?: { maxLength: number; textOf: (raw: Raw) => string | null };
  /** played against Hevalo by one person: what the computer seat is */
  readonly solo?: { bot: 'hevalo' };
  /** the XP source placement is paid from (registered in GAME_XP_SOURCES) */
  readonly xpSource: string;
  /**
   * Whether these choices can be played now (a difficulty with enough approved
   * content, say), asked when the lobby is made; left out, any choices the
   * schema takes can. `availability` answers for the dialect as a whole.
   */
  offers?(db: Executor, choices: LobbyChoices<Settings>): Promise<boolean>;
  /**
   * What the game is dealt from approved content when it starts — a card, a
   * deck — handed to the rules' `init` inside the settings and kept in the
   * state only, never in the lobby's stored settings or any view. Inside the
   * start's transaction; a game that cannot be dealt refuses to start. The
   * seats starting are in `ctx`, for a game that deals each its own (the Who
   * Am I? race).
   */
  deal?(db: Executor, settings: Settings, ctx: { dialect: LetterDialect; seed: string; seats: readonly RulesSeat[] }): Promise<Settings>;
  /** what the invite banner and the chat card say about a lobby, besides Rated */
  summary(dialect: LetterDialect, settings: Settings): InviteSummary;
  /** the settings anyone in the lobby may see */
  publicSettings(settings: Settings): unknown;
  /** a move as the rules take it: the lookups the rules cannot do, inside the game's transaction */
  prepare(db: Executor, state: State, seat: number, move: RawMove<Raw>): Promise<PreparedMove<Move>>;
  /** Hevalo's move for a computer seat whose turn has come, or null for "could not think of one" */
  bot?(db: Executor, state: State, seat: number): Promise<Move | null>;
  /**
   * What a finished game against Hevalo pays the person (never placement: a
   * game with fewer than two people pays none), inside the finishing transaction.
   */
  payAgainstHevalo?(db: pg.PoolClient, game: SoloGame, state: State): Promise<number>;
  /**
   * Whether the game can be offered in this dialect now, with friends and
   * against Hevalo, and anything more the apps need to offer it (Kurdish
   * Bluff: the languages its cards have real meanings in).
   */
  availability?(db: Executor, dialect: LetterDialect): Promise<{ group: boolean; solo: boolean } & Record<string, unknown>>;
}

/** Paying XP from inside a finishing transaction (XpService.award with the transaction's client). */
export type SoloAward = (input: { userId: string; source: string; amount: number; refId: string }) => Promise<number>;

/** A finished game against Hevalo, for what it pays. */
export interface SoloGame {
  lobbyId: string;
  userId: string;
  seat: number;
  dialect: LetterDialect;
  /** the server's clock at the finish */
  now: Date;
  award: SoloAward;
}

/** Any game module, whatever its types: the engine treats state and moves as opaque. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any, any, any, any, any, any>;
