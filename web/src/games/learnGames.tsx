import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listedLearnGames, toDialect, type GameDialect, type GamesAvailability, type LearnGame, type LearnGameId } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { defaultVariety } from '../stories/prefs';
import { LAST_LETTER_CARD, offeredDialects, useLastLetterAvailability } from '../lastletter/learnCard';
// the path's colours: a game's card wears one of its tones (`lp-tone-*`)
import '../learn/path.css';
import './games.css';

/**
 * The learning games on the website: which of the shared registry's games
 * this app has a page for, the card each one wears in Learn's Games group,
 * and the variety they are played in.
 *
 * Learn's Games list is the registry filtered twice — by what this app can
 * open (here) and by what has enough approved content in the learner's
 * variety right now (GET /games/availability) — so a game shows up the day its
 * content is published, and never as "coming soon".
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

export const WEB_LEARN_GAMES: Partial<Record<LearnGameId, WebGame>> = {
  'build-sentence': { href: '/app/games/build-sentence', nameKey: 'games.sentence.name', bodyKey: 'games.sentence.body', modes: ['solo'], Visual: SentenceMini },
  'last-letter': { href: LAST_LETTER_CARD.href, nameKey: LAST_LETTER_CARD.nameKey, bodyKey: LAST_LETTER_CARD.blurbKey, modes: ['online', 'solo'], Visual: ChainMini },
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

/** The learning games to list for this learner now. */
export function useListedLearnGames(): LearnGame[] {
  const dialect = useGameDialect();
  const availability = useAvailability(dialect);
  // The Last Letter is offered where its dictionary can check words (its own answer, from the multiplayer games' API)
  const chain = useLastLetterAvailability();
  const offered = [...offeredDialects(chain, 'group'), ...offeredDialects(chain, 'solo')].includes(dialect);
  const merged = availability && { ...availability, games: [...(availability.games ?? []).filter((g) => g.id !== 'last-letter'), { id: 'last-letter', available: offered }] };
  return listedLearnGames(merged, PLAYABLE);
}

/** One learning game's card, in the same box as Peyvok's and the race's. */
export function LearnGameTile({ game, signedIn }: { game: LearnGame; signedIn: boolean }): React.JSX.Element | null {
  const t = useT();
  const web = WEB_LEARN_GAMES[game.id];
  if (!web) return null;
  const { Visual } = web;
  return (
    <article className={`game-tile game-tile--learn game-tile--${game.id} lp-tone-${game.tone}`}>
      <div className="game-tile-visual">
        <Visual />
      </div>
      <div className="game-tile-text">
        <div className="game-tile-head">
          <h3>{t(web.nameKey)}</h3>
          {!signedIn && <span className="badge">{t('games.signInToPlay')}</span>}
        </div>
        <p>{t(web.bodyKey)}</p>
        <ul className="game-tags">
          {web.modes.map((mode) => (
            <li key={mode} className={signedIn ? undefined : 'is-locked'}>
              {t(mode === 'solo' ? 'games.mode.solo' : 'games.mode.online')}
              {!signedIn && <span className="mode-locked"> · {t('games.mode.needsAccount')}</span>}
            </li>
          ))}
        </ul>
        {signedIn && (
          <Link to={web.href} className="btn btn-primary btn-sm">
            {t('games.play')}
          </Link>
        )}
      </div>
    </article>
  );
}
