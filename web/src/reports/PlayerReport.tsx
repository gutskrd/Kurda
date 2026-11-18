import type { PlayGame } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { ReportAction } from './ReportAction';

/**
 * The ⋯ with Report beside another player in a game's lobby, play or results. Games expose only seats (`seat:N`), so
 * a player is reported by game and seat and the server finds who sat there. Draw it for everyone but yourself; a
 * hidden name shows as "Opponent".
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
  /** The name the viewer sees for them, or null when hidden. */
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
