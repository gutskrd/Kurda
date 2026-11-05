import { useSearchParams } from 'react-router-dom';
import { dontSayMode, dontSayStartProblem, type DontSayBoard, type DontSayOutcome } from '@kurda/shared';
import { DontSayIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { GameRoom } from '../play/MultiRoom';
import { useGameView } from '../play/useGameView';
import { PartyLobbyNote, PartyPage, PartyStart } from '../party/PartyPage';
import { DontSayBoardView, DontSayEnding } from './Board';
import './dont-say.css';

const NEW_PATH = '/app/games/dont-say';

/**
 * Don't Say the Word! (/app/games/dont-say): describe the word on your card
 * in Kurdish without its forbidden words, your team guessing, a minute a
 * turn. Without an id it is the start; with one, the room
 * (play/MultiRoom.tsx), where the lobby is the two teams to choose from and
 * the game is the card table. Only the describer's view holds the card.
 */
export function DontSay(): React.JSX.Element {
  const [params] = useSearchParams();
  const id = params.get('id');
  return (
    <PartyPage titleKey="games.dontSay.name" className="ds-page">
      {id ? (
        <Room key={id} id={id} />
      ) : (
        <PartyStart
          game="dont-say"
          introKey="games.dontSay.intro"
          steps={['games.dontSay.how.describe', 'games.dontSay.how.guess', 'games.dontSay.how.teams']}
          blurbKey="games.dontSay.withFriendsBlurb"
          notOfferedKey="games.dontSay.notOffered"
          Icon={DontSayIcon}
        />
      )}
    </PartyPage>
  );
}

function Room({ id }: { id: string }): React.JSX.Element {
  const t = useT();
  const room = useGameView<DontSayBoard | null, DontSayOutcome>('dont-say', id, {
    // the moment to get ready ends on the board's own clock; the server's deadline is the turn's end
    deadlineOf: (v) => v.board?.turn?.endsAt ?? null,
  });
  return (
    <GameRoom
      game="dont-say"
      id={id}
      room={room}
      newPath={NEW_PATH}
      newLabel={t('games.dontSay.name')}
      lobbyNote={(v) => <PartyLobbyNote dialect={v.dialect} difficulty={(v.settings as { difficulty?: string }).difficulty} />}
      teamNote={(v) => {
        const present = v.players.filter((p) => !p.gone).length;
        return <p className="muted ds-team-note">{dontSayMode(present) === 'coop' ? t('games.dontSay.coopNote') : t('games.dontSay.teamsNote')}</p>;
      }}
      startProblem={(v) => {
        const seats = v.players.filter((p) => !p.gone).map((p) => ({ team: p.team }));
        const why = dontSayStartProblem(seats);
        return why === 'teams-uneven' ? t('play.teams.uneven') : null;
      }}
      playing={(v) => <DontSayBoardView view={v} skew={room.skew} move={room.move} />}
      ending={(v) => <DontSayEnding view={v} />}
      scoreOf={(r) => t('games.party.points', { count: r.score })}
    />
  );
}
