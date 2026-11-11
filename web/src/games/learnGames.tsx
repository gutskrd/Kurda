import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listedLearnGames, toDialect, type GameDialect, type GamesAvailability, type LearnGame, type LearnGameId, type ListedLearnGame } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { defaultVariety } from '../stories/prefs';
import { LAST_LETTER_CARD, offeredDialects, useLastLetterAvailability } from '../lastletter/learnCard';
import { SceneMini } from './SceneMini';
import { CaseMini } from './CaseMini';
// the path's colours: a game's card wears one of its tones (`lp-tone-*`)
import '../learn/path.css';
import './games.css';
// the learning games' own cards are drawn by their own stylesheets
import './memory-thief.css';
import './hear-it.css';
import './party-minis.css';

/**
 * The learning games on the website: which of the shared registry's games
 * this app has a page for, the card each one wears in Learn's Games group,
 * and the variety they are played in.
 *
 * Learn's Games list is every game in the registry this app can open (here).
 * Those with enough approved content in the learner's variety right now (GET
 * /games/availability) come first with a way in; the rest follow as "coming
 * soon", seen but not opened, until their content is published.
 */

interface WebGame {
  href: string;
  nameKey: MessageKey;
  bodyKey: MessageKey;
  /** how it is played, as the card's tags say: alone, and for the word chain with friends too */
  modes: ReadonlyArray<'solo' | 'online'>;
  /** a small picture of the game, decorative, drawn without any Kurdish of its own */
  Visual: () => React.JSX.Element;
}

/** Tiles on a ruled line and a tray of more below: Build a Kurdish Sentence, without words. */
function SentenceMini(): React.JSX.Element {
  return (
    <div className="lg-mini lg-mini--sentence" aria-hidden>
      <span className="lg-mini-line">
        <span className="lg-mini-tile is-on" style={{ width: 44 }} />
        <span className="lg-mini-tile is-on" style={{ width: 62 }} />
        <span className="lg-mini-tile is-lifted" style={{ width: 38 }} />
      </span>
      <span className="lg-mini-tray">
        <span className="lg-mini-ghost" style={{ width: 44 }} />
        <span className="lg-mini-tile" style={{ width: 52 }} />
        <span className="lg-mini-ghost" style={{ width: 62 }} />
        <span className="lg-mini-tile" style={{ width: 30 }} />
        <span className="lg-mini-ghost" style={{ width: 38 }} />
      </span>
    </div>
  );
}

/** Word cards in a chain, each one's last letter lit where the next begins: The Last Letter, without words. */
function ChainMini(): React.JSX.Element {
  return (
    <div className="lg-mini lg-mini--chain" aria-hidden>
      <span className="lg-mini-line">
        <span className="lg-mini-tile is-on" style={{ width: 46 }} />
        <span className="lg-mini-link" />
        <span className="lg-mini-tile is-on" style={{ width: 58 }} />
        <span className="lg-mini-link" />
        <span className="lg-mini-tile is-lifted" style={{ width: 40 }} />
      </span>
    </div>
  );
}

/** A page with ruled lines of text, one word lifting off it and a glowing gap where it was: The Memory Thief. */
function MemoryMini(): React.JSX.Element {
  return (
    <div className="lg-mini lg-mini--memory" aria-hidden>
      <span className="lg-mini-page">
        <span className="lg-mini-row">
          <span className="lg-mini-ink" style={{ width: 54 }} />
          <span className="lg-mini-ink" style={{ width: 30 }} />
          <span className="lg-mini-gap" style={{ width: 40 }} />
        </span>
        <span className="lg-mini-row">
          <span className="lg-mini-ink" style={{ width: 36 }} />
          <span className="lg-mini-gap" style={{ width: 46 }} />
          <span className="lg-mini-ink" style={{ width: 50 }} />
        </span>
        <span className="lg-mini-row">
          <span className="lg-mini-ink" style={{ width: 62 }} />
          <span className="lg-mini-ink" style={{ width: 28 }} />
        </span>
        <span className="lg-mini-lift" style={{ width: 40 }} />
      </span>
    </div>
  );
}

/** Note cards fanned on a table with a token on one: Kurdish Bluff, without words. */
function BluffMini(): React.JSX.Element {
  return (
    <div className="lg-mini lg-mini--bluff" aria-hidden>
      <span className="lg-mini-note" style={{ transform: 'rotate(-7deg)' }} />
      <span className="lg-mini-note is-on" style={{ transform: 'rotate(2deg)' }}>
        <span className="lg-mini-token" />
      </span>
      <span className="lg-mini-note" style={{ transform: 'rotate(8deg)' }} />
    </div>
  );
}

/** A card with a question mark held up, and two answers stamped below: Who Am I?, without words. */
function WhoAmIMini(): React.JSX.Element {
  return (
    <div className="lg-mini lg-mini--whoami" aria-hidden>
      <span className="lg-mini-forehead">?</span>
      <span className="lg-mini-line">
        <span className="lg-mini-stamp is-yes" />
        <span className="lg-mini-stamp" />
      </span>
    </div>
  );
}

/** A small radio: a grille, a play key and the bars of a voice: Hear It, Find It. */
function HearMini(): React.JSX.Element {
  return (
    <div className="lg-mini lg-mini--hear" aria-hidden>
      <span className="lg-mini-radio">
        <span className="lg-mini-grille" />
        <span className="lg-mini-key" />
        <span className="lg-mini-wave">
          {[10, 18, 28, 16, 24, 12, 20].map((h, i) => (
            <span key={i} className="lg-mini-bar" style={{ height: h }} />
          ))}
        </span>
      </span>
    </div>
  );
}

/** Seats along a table with one of them lit: Kurdish Impostor, without words. */
function TableMini(): React.JSX.Element {
  return (
    <div className="lg-mini lg-mini--table" aria-hidden>
      <span className="lg-mini-seats">
        <span className="lg-mini-seat" />
        <span className="lg-mini-seat is-lit" />
        <span className="lg-mini-seat" />
      </span>
      <span className="lg-mini-tile is-on" style={{ width: 96 }} />
      <span className="lg-mini-seats">
        <span className="lg-mini-seat" />
        <span className="lg-mini-seat" />
      </span>
    </div>
  );
}

/** A card with its words struck through, and a buzzer: Don't Say the Word!, without words. */
function CardMini(): React.JSX.Element {
  return (
    <div className="lg-mini lg-mini--card" aria-hidden>
      <span className="lg-mini-card">
        <span className="lg-mini-tile is-on" style={{ width: 54 }} />
        <span className="lg-mini-strike" style={{ width: 40 }} />
        <span className="lg-mini-strike" style={{ width: 48 }} />
        <span className="lg-mini-strike" style={{ width: 34 }} />
      </span>
      <span className="lg-mini-buzzer" />
    </div>
  );
}

export const WEB_LEARN_GAMES: Partial<Record<LearnGameId, WebGame>> = {
  'build-sentence': { href: '/app/games/build-sentence', nameKey: 'games.sentence.name', bodyKey: 'games.sentence.body', modes: ['solo'], Visual: SentenceMini },
  'memory-thief': { href: '/app/games/memory-thief', nameKey: 'games.memory.name', bodyKey: 'games.memory.body', modes: ['solo'], Visual: MemoryMini },
  'hear-it': { href: '/app/games/hear-it', nameKey: 'games.hear.name', bodyKey: 'games.hear.body', modes: ['solo'], Visual: HearMini },
  'what-would-you-say': { href: '/app/games/what-would-you-say', nameKey: 'games.say.name', bodyKey: 'games.say.body', modes: ['solo'], Visual: SceneMini },
  detective: { href: '/app/games/detective', nameKey: 'games.detective.name', bodyKey: 'games.detective.body', modes: ['solo'], Visual: CaseMini },
  'last-letter': { href: LAST_LETTER_CARD.href, nameKey: LAST_LETTER_CARD.nameKey, bodyKey: LAST_LETTER_CARD.blurbKey, modes: ['online', 'solo'], Visual: ChainMini },
  // the party games are listed where /games/availability finds enough approved cards for the learner's variety
  impostor: { href: '/app/games/impostor', nameKey: 'games.impostor.name', bodyKey: 'games.invite.blurb.impostor', modes: ['online'], Visual: TableMini },
  'dont-say': { href: '/app/games/dont-say', nameKey: 'games.dontSay.name', bodyKey: 'games.invite.blurb.dontSay', modes: ['online'], Visual: CardMini },
  bluff: { href: '/app/games/bluff', nameKey: 'games.bluff.name', bodyKey: 'games.bluff.blurb', modes: ['online'], Visual: BluffMini },
  'who-am-i': { href: '/app/games/who-am-i', nameKey: 'games.whoAmI.name', bodyKey: 'games.whoAmI.blurb', modes: ['solo', 'online'], Visual: WhoAmIMini },
};

const PLAYABLE = Object.keys(WEB_LEARN_GAMES) as LearnGameId[];

/** The learner's variety for the games: their course's, else the interface's, else the one chosen last, else Kurmancî. */
export function useGameDialect(): GameDialect {
  const { locale } = useI18n();
  return toDialect(defaultVariety(locale)) ?? 'kmr';
}

/** What can be played in a variety, asked once per visit; null until it answers (or when it cannot). */
export function useAvailability(dialect: GameDialect): GamesAvailability | null {
  const { client } = useAuth();
  const [availability, setAvailability] = useState<GamesAvailability | null>(null);
  useEffect(() => {
    let live = true;
    void client.get<GamesAvailability>(`/games/availability?dialect=${dialect}`).then((res) => {
      if (live && res.ok) setAvailability(res.data);
    });
    return () => {
      live = false;
    };
  }, [client, dialect]);
  return availability;
}

/** A round of a game this learner left unfinished in a variety, to offer first; null when there is none (or until it answers). */
export function useOpenRound(game: LearnGameId, dialect: GameDialect): string | null {
  const { client } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void client.get<{ id: string | null }>(`/games/solo/open?game=${game}&dialect=${dialect}`).then((res) => {
      if (live && res.ok) setOpen(res.data.id);
    });
    return () => {
      live = false;
    };
  }, [client, game, dialect]);
  return open;
}

/** The learning games to list for this learner now, each with whether it can be played yet. */
export function useListedLearnGames(): ListedLearnGame[] {
  const dialect = useGameDialect();
  const { status } = useAuth();
  const availability = useAvailability(dialect);
  // The Last Letter is offered where its dictionary can check words (its own answer, from the multiplayer games' API)
  const chain = useLastLetterAvailability();
  const offered = [...offeredDialects(chain, 'group'), ...offeredDialects(chain, 'solo')].includes(dialect);
  // both answers before anything is listed, so its card does not start as coming soon and then move; a visitor
  // without an account is never asked that one, and for them it is not open yet
  const chainKnown = chain !== null || status === 'signedOut';
  const merged =
    availability && chainKnown
      ? { ...availability, games: [...(availability.games ?? []).filter((g) => g.id !== 'last-letter'), { id: 'last-letter', available: offered }] }
      : null;
  return listedLearnGames(merged, PLAYABLE);
}

/**
 * One learning game's card, in the same box as Peyvok's and the race's. A game
 * still short of approved content says so in its badge, where "sign in to
 * play" would otherwise be, and has no Play button: there is nothing to open
 * yet, signed in or not.
 */
export function LearnGameTile({ game, ready = true, signedIn }: { game: LearnGame; ready?: boolean; signedIn: boolean }): React.JSX.Element | null {
  const t = useT();
  const web = WEB_LEARN_GAMES[game.id];
  if (!web) return null;
  const { Visual } = web;
  return (
    <article className={`game-tile game-tile--learn game-tile--${game.id} lp-tone-${game.tone}${ready ? '' : ' is-soon'}`}>
      <div className="game-tile-visual">
        <Visual />
      </div>
      <div className="game-tile-text">
        <div className="game-tile-head">
          <h3>{t(web.nameKey)}</h3>
          {!ready ? (
            <span className="badge">{t('games.comingSoon')}</span>
          ) : (
            !signedIn && <span className="badge">{t('games.signInToPlay')}</span>
          )}
        </div>
        <p>{t(web.bodyKey)}</p>
        <ul className="game-tags">
          {web.modes.map((mode) => (
            <li key={mode} className={signedIn && ready ? undefined : 'is-locked'}>
              {t(mode === 'solo' ? 'games.mode.solo' : 'games.mode.online')}
              {ready && !signedIn && <span className="mode-locked"> · {t('games.mode.needsAccount')}</span>}
            </li>
          ))}
        </ul>
        {signedIn && ready && (
          <Link to={web.href} className="btn btn-primary btn-sm">
            {t('games.play')}
          </Link>
        )}
      </div>
    </article>
  );
}
