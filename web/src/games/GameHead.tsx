import { Link } from 'react-router-dom';
import { gameEmblemTone, type GameEmblem } from '@kurda/shared';
import { ArrowIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { useGrowsInto } from '../lib/viewTransition';
import { GameArt } from './GameArt';
import './game-stage.css';

/**
 * The top of a game's own page: the way back to the games, the game's cover
 * and its name. One header for every game, so a player always finds the way
 * out in the same corner and knows by the picture which game they are in.
 *
 * A game's name is Kurmancî in every language. `meaning` is what it means in
 * the reader's own, said small above the name; without one (Peyvok means
 * only itself), or where the two are the same words, the line says "Games".
 *
 * `children` sit at the far end of the row (the typing race's settings).
 *
 * A page with something to lose by leaving (a game on one phone, whose cards
 * live only on the page) gives `onBack`: the way back is then a button in the
 * same corner, and the page asks before it lets go.
 *
 * The cover here is where the game's card lands when it is pressed on the
 * Games page, and what goes back to the card (lib/viewTransition.tsx). A
 * page that shows the cover larger as well, on its start, lands the card
 * there instead.
 */
export function GameHead({ game, title, meaning, onBack, children }: { game: GameEmblem; title: string; meaning?: string; onBack?: () => void; children?: React.ReactNode }): React.JSX.Element {
  const t = useT();
  const cover = useGrowsInto(`game:${game}`);
  return (
    <header className="gs-head">
      {onBack ? (
        <button type="button" className="gs-back" aria-label={t('games.back')} onClick={onBack}>
          <ArrowIcon size={18} />
        </button>
      ) : (
        <Link to="/app/games" className="gs-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
      )}
      <GameArt game={game} size={44} ref={cover} />
      <div className="gs-head-text">
        <span className="gs-head-eyebrow">{meaning && meaning !== title ? meaning : t('nav.games')}</span>
        <h1 className="gs-head-title">{title}</h1>
      </div>
      {children}
    </header>
  );
}

/** The stage's colour for a game: its emblem's own, as a style for the page's root. */
export function stageTone(game: GameEmblem): React.CSSProperties {
  return { '--gs-tone': gameEmblemTone(game) } as React.CSSProperties;
}
