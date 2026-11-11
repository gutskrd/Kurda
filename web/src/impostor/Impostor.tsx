import { Link, useSearchParams } from 'react-router-dom';
import type { GameDialect, ImpostorBoard, ImpostorOutcome } from '@kurda/shared';
import { ImpostorIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { GameRoom } from '../play/MultiRoom';
import { useGameView } from '../play/useGameView';
import { PartyLobbyNote, PartyPage, PartyStart } from '../party/PartyPage';
import { ImpostorBoardView, ImpostorReveal } from './Board';
import { Couch } from './Couch';
import './impostor.css';

const NEW_PATH = '/app/games/impostor';

/**
 * Kurdish Impostor (/app/games/impostor): one word for everyone but the
 * impostor, two rounds of Kurdish clues, a vote. Without an id it is the
 * start: how to play and a game with friends, offered only where approved
 * word cards are; with one, the room (play/MultiRoom.tsx) with the table
 * inside. The word is never in the address: the room is found by its id.
 * With `couch=1` it is the game for people in one room, on this one phone
 * (Couch.tsx).
 */
export function Impostor(): React.JSX.Element {
  const [params] = useSearchParams();
  const id = params.get('id');
  if (!id && params.get('couch') === '1') {
    return (
      <PartyPage titleKey="games.couch.title" className="imp-page">
        <Couch />
      </PartyPage>
    );
  }
  return (
    <PartyPage titleKey="games.impostor.name" className="imp-page">
      {id ? (
        <Room key={id} id={id} />
      ) : (
        <PartyStart
          game="impostor"
          introKey="games.impostor.intro"
          steps={['games.impostor.how.card', 'games.impostor.how.clues', 'games.impostor.how.vote']}
          blurbKey="games.impostor.withFriendsBlurb"
          notOfferedKey="games.impostor.notOffered"
          Icon={ImpostorIcon}
          also={<CouchWay />}
        />
      )}
    </PartyPage>
  );
}

/** The other way to play, for people sitting together: one phone, passed round. */
function CouchWay(): React.JSX.Element {
  const t = useT();
  return (
    <section className="party-way couch-way" aria-labelledby="party-couch">
      <h2 id="party-couch" className="party-way-title">
        {t('games.couch.title')}
      </h2>
      <p className="muted">{t('games.couch.blurb')}</p>
      <Link to={`${NEW_PATH}?couch=1`} className="btn btn-secondary">
        {t('games.couch.open')}
      </Link>
    </section>
  );
}

function Room({ id }: { id: string }): React.JSX.Element {
  const t = useT();
  const room = useGameView<ImpostorBoard | null, ImpostorOutcome>('impostor', id, {
    deadlineOf: (v) => v.board?.turn?.endsAt ?? v.board?.vote?.endsAt ?? v.board?.guess?.endsAt ?? null,
  });
  return (
    <GameRoom
      game="impostor"
      id={id}
      room={room}
      newPath={NEW_PATH}
      newLabel={t('games.impostor.name')}
      lobbyNote={(v) => {
        const s = v.settings as { dialect?: GameDialect; difficulty?: string; clueSeconds?: number };
        return <PartyLobbyNote dialect={v.dialect} difficulty={s.difficulty} extra={s.clueSeconds ? t('games.party.seconds', { count: s.clueSeconds }) : undefined} />;
      }}
      playing={(v) => <ImpostorBoardView view={v} skew={room.skew} move={room.move} />}
      ending={(v) => <ImpostorReveal view={v} />}
      scoreOf={(r) => t('games.party.points', { count: r.score })}
    />
  );
}
