import type { PlayGame } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { ReportAction } from './ReportAction';

/**
 * The ⋯ with Report beside another player in a game — in its lobby, while
 * it is played, and on its results.
 *
 * A game never gives the page another player's account, only their seat
 * (the API's `seat:N`), so a player is reported by game and seat and the
 * server finds who sat there. Draw it for everyone but yourself; a name the
 * viewer may not see is "Opponent".
 *
 *   {!p.isMe && <PlayerReport game="wordle-battle" gameId={id} seat={p.seat} name={p.name} />}
 */
export function PlayerReport({
  game,
  gameId,
  seat,
  name,
}: {
  game: PlayGame;
  gameId: string;
  seat: number;
  /** the name the viewer sees for them, or null when they may not see one */
  name?: string | null;
}): React.JSX.Element {
  const t = useT();
  const shown = name || t('games.opponent');
  return (
    <ReportAction
      target={{ targetType: 'game_player', targetId: gameId, game, seat }}
      label={t('report.aboutPlayer', { name: shown })}
      name={shown}
      className="player-report"
    />
  );
}
