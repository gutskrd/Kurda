import { useSearchParams } from 'react-router-dom';
import type { GameDialect, GameDifficulty, ImpostorBoard, ImpostorOutcome } from '@kurda/shared';
import { useT } from '../i18n/I18nProvider';
import { GameRoom } from '../play/MultiRoom';
import { useGameView } from '../play/useGameView';
import { PartyLobbyNote, PartyPage } from '../party/PartyPage';
import { ImpostorBoardView, ImpostorReveal } from './Board';
import { categoriesAt, useImpostorCategories } from './categories';
import { Couch } from './Couch';
import { ImpostorStart } from './Start';
import './impostor.css';

const NEW_PATH = '/app/games/impostor';

/**
 * Impostor (/app/games/impostor): one word for everyone but the
 * impostor, two rounds of Kurdish clues, a vote. Without an id it is the
 * start (Start.tsx): the game in a line and one thing to press, offered only
 * where approved word cards are; with one, the room (play/MultiRoom.tsx) with
 * the table inside. The word is never in the address: the room is found by its id.
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
        <ImpostorStart />
      )}
    </PartyPage>
  );
}

type LobbySettings = { difficulty?: string; clueSeconds?: number; category?: string | null };

/**
 * What a lobby plays with, for the people waiting in it: the variety, the
 * level, the category when the host chose one (by its Kurdish name, read from
 * the list the host chose in) and the time for a clue.
 */
function LobbyNote({ dialect, settings }: { dialect: GameDialect; settings: LobbySettings }): React.JSX.Element {
  const t = useT();
  const offer = useImpostorCategories(settings.category ? dialect : null);
  const category = categoriesAt(offer, settings.difficulty as GameDifficulty | undefined).find((c) => c.slug === settings.category);
  return (
    <PartyLobbyNote
      dialect={dialect}
      difficulty={settings.difficulty}
      topic={category?.ku}
      extra={settings.clueSeconds ? t('games.party.seconds', { count: settings.clueSeconds }) : undefined}
    />
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
      lobbyNote={(v) => <LobbyNote dialect={v.dialect} settings={v.settings as LobbySettings} />}
      playing={(v) => <ImpostorBoardView view={v} skew={room.skew} move={room.move} />}
      ending={(v) => <ImpostorReveal view={v} />}
      scoreOf={(r) => t('games.party.points', { count: r.score })}
    />
  );
}
