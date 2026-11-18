import { Link } from 'react-router-dom';
import { gameEmblemTone, type GameEmblem } from '@kurda/shared';
import { ArrowIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { useGrowsInto } from '../lib/viewTransition';
import { GameArt } from './GameArt';
import './game-stage.css';

/**
 * The top of every game's page: the way back, the cover and the name, always in the same place. The name is Kurmancî
 * in every language, with `meaning` small above it, or "Games" when there is none or it is the same. `children` sit at
 * the row's end. A page that would lose state on leaving passes `onBack`, making the way back a button that confirms
 * first. The cover is the card transition's landing spot (lib/viewTransition.tsx) unless the page shows a larger one.
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
