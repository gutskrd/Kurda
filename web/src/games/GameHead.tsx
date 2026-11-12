import { Link } from 'react-router-dom';
import { gameEmblemTone, type GameEmblem } from '@kurda/shared';
import { ArrowIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { GameArt } from './GameArt';
import './game-stage.css';

/**
 * The top of a game's own page: the way back to the games, the game's emblem
 * and its name. One header for every game, so a player always finds the way
 * out in the same corner and knows by the picture which game they are in.
 *
 * `children` sit at the far end of the row (the typing race's settings).
 *
 * A page with something to lose by leaving (a game on one phone, whose cards
 * live only on the page) gives `onBack`: the way back is then a button in the
 * same corner, and the page asks before it lets go.
 */
export function GameHead({ game, title, onBack, children }: { game: GameEmblem; title: string; onBack?: () => void; children?: React.ReactNode }): React.JSX.Element {
  const t = useT();
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
      <GameArt game={game} size={44} />
      <div className="gs-head-text">
        <span className="gs-head-eyebrow">{t('nav.games')}</span>
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
