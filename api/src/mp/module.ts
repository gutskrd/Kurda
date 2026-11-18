import type pg from 'pg';
import type { z } from 'zod';
import type { GameAccess, GameRules, InviteSummary, LetterDialect, MultiGame, RulesSeat } from '@kurda/shared';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * One multiplayer learning game as the engine (service.ts) runs it: its pure rules plus the few server needs (reading
 * host settings, preparing a move that needs a lookup, Hevalo's move, whether content allows offering it). Lobbies,
 * invites, seats, the clock, presence, away players, the stand-in host, placement XP and reports by seat are the
 * engine's, the same for every game.
 */

/** What every lobby is made with, besides the game's own settings. */
export interface LobbyChoices<Settings> {
  settings: Settings;
  dialect: LetterDialect;
  /** 2..max for a group game */
  maxPlayers: number;
  access: GameAccess;
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
   * Free text from players (a clue, a guess, a definition) goes through the chat gate (free-text.ts) before anything
   * else sees it, capped at `maxLength`. A move with nothing typed gives null and skips the gate.
   */
  readonly freeText?: { maxLength: number; textOf: (raw: Raw) => string | null };
  /** played against Hevalo by one person: what the computer seat is */
  readonly solo?: { bot: 'hevalo' };
  /** the XP source placement is paid from (registered in GAME_XP_SOURCES) */
  readonly xpSource: string;
  /**
   * Whether these choices can be played now (e.g. a difficulty with enough approved content), asked when the lobby is
   * made; when absent, any choices the schema accepts can. `availability` answers for the dialect as a whole.
   */
  offers?(db: Executor, choices: LobbyChoices<Settings>): Promise<boolean>;
  /**
   * What the game is dealt from approved content at the start (a card, a deck). It goes to the rules' `init` in the
   * settings and lives only in the state, never in stored settings or a view. Runs in the start's transaction; a game
   * that cannot be dealt refuses to start. `ctx.seats` is for games that deal each seat its own (Who Am I?).
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
   * Whether the game can be offered in this dialect now, with friends and against Hevalo, plus anything the apps need
   * to offer it (Impostor: the categories its approved cards are in).
   */
  availability?(db: Executor, dialect: LetterDialect): Promise<{ group: boolean; solo: boolean } & Record<string, unknown>>;
}

/** Any game module, whatever its types: the engine treats state and moves as opaque. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any, any, any, any, any, any>;
