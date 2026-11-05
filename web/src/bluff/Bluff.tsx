import { Link, useSearchParams } from 'react-router-dom';
import { dialectDirection, type BluffBoard, type BluffOutcome, type LetterDialect } from '@kurda/shared';
import { ArrowIcon, QuotesIcon } from '../components/icons';
import { Loading } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import { dialectName } from '../learn/map';
import { InviteForm } from '../play/InviteSheet';
import { GameRoom, seatNamer } from '../play/MultiRoom';
import { useGameView } from '../play/useGameView';
import { groupDialects, useMpAvailability } from '../games/mpAvailability';
import { languageName, type BluffOffer } from '../games/partyChoices';
import { BluffTable, RevealPhase } from './BluffTable';
import './bluff.css';

const NEW_PATH = '/app/games/bluff';
const VARIETY: Record<LetterDialect, 'kurmanci' | 'sorani'> = { kmr: 'kurmanci', ckb: 'sorani' };

/**
 * Kurdish Bluff (/app/games/bluff): three to eight friends, one rare Kurdish
 * word a round, everyone's made-up meaning against the real one. Without an
 * id, the start: how it is played and a game with friends (the invite sheet's
 * form in place, with the language the meanings are written in, the number of
 * words and the time to write), offered only where reviewed cards allow. With
 * one, the room (play/MultiRoom.tsx) with the table inside.
 */
export function Bluff(): React.JSX.Element {
  const [params] = useSearchParams();
  const t = useT();
  const id = params.get('id');
  return (
    <div className="container game-page bf-page">
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">{t('nav.games')}</span>
          <h1 className="page-title" style={{ margin: 0 }}>
            {t('games.bluff.name')}
          </h1>
        </div>
      </div>
      {id ? <Room key={id} id={id} /> : <Start />}
    </div>
  );
}

function Start(): React.JSX.Element {
  const t = useT();
  const offers = useMpAvailability<BluffOffer>('bluff');
  if (offers === null) return <Loading />;
  if (groupDialects(offers).length === 0) {
    return (
      <div className="state bf-not-offered">
        <QuotesIcon size={32} />
        <p>{t('games.bluff.notOffered')}</p>
        <Link to="/app/games" className="btn btn-secondary">
          {t('games.back')}
        </Link>
      </div>
    );
  }
  return (
    <div className="bf-start">
      <p className="page-sub">{t('games.bluff.intro')}</p>
      <section className="bf-way" aria-labelledby="bf-friends">
        <h2 id="bf-friends" className="bf-way-title">
          {t('games.lastLetter.withFriends')}
        </h2>
        <p className="muted">{t('games.bluff.withFriendsBlurb')}</p>
        <InviteForm target={{ kind: 'new', game: 'bluff' }} lockGame heading={false} />
      </section>
    </div>
  );
}

function Room({ id }: { id: string }): React.JSX.Element {
  const t = useT();
  const room = useGameView<BluffBoard | null, BluffOutcome>('bluff', id, {
    deadlineOf: (v) => v.board?.phaseEndsAt ?? null,
  });
  return (
    <GameRoom
      game="bluff"
      id={id}
      room={room}
      newPath={NEW_PATH}
      newLabel={t('games.bluff.name')}
      lobbyNote={(v) => {
        const s = v.settings as { language?: string; rounds?: number };
        const script = dialectDirection(v.dialect);
        return (
          <p className="bf-lobby-note muted">
            <span lang={script.lang}>{dialectName(VARIETY[v.dialect])}</span>
            {s.language ? ` · ${languageName(s.language)}` : null}
            {s.rounds ? ` · ${t('games.bluff.roundsCount', { count: s.rounds })}` : null}
          </p>
        );
      }}
      playing={(v) => <BluffTable view={v} skew={room.skew} move={room.move} />}
      ending={(v) => {
        const history = v.board?.history ?? [];
        if (history.length === 0) return null;
        const name = seatNamer(v, t);
        return (
          <section className="bf-words" aria-labelledby="bf-words-title">
            <h2 id="bf-words-title" className="bf-way-title">
              {t('games.bluff.wordsPlayed')}
            </h2>
            {history.map((r) => (
              <details key={r.round} className="bf-word-row">
                <summary>
                  <span lang={dialectDirection(v.dialect).lang} dir={dialectDirection(v.dialect).dir} className="bf-word-row-word">
                    {r.word}
                  </span>
                  <span className="muted" dir="auto">
                    {r.real}
                  </span>
                </summary>
                <RevealPhase reveal={r} mySeat={v.me?.seat ?? null} name={name} dialect={v.dialect} />
              </details>
            ))}
          </section>
        );
      }}
      scoreOf={(r) => t('games.bluff.points', { count: r.score })}
    />
  );
}
