import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LAST_LETTER_DEFAULT_TURN_SECONDS,
  LAST_LETTER_TURN_SECONDS,
  type LastLetterBoard,
  type LastLetterOutcome,
  type LastLetterTurnSeconds,
  type LetterDialect,
  type MultiView,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { ArrowIcon, ChainIcon } from '../components/icons';
import { Loading } from '../components/states';
import { useLocale, useT } from '../i18n/I18nProvider';
import { dialectName } from '../learn/map';
import { InviteForm } from '../play/InviteSheet';
import { ChipRadio } from '../play/ChipRadio';
import { GameRoom } from '../play/MultiRoom';
import { playError } from '../play/playApi';
import { useGameView } from '../play/useGameView';
import { defaultVariety } from '../stories/prefs';
import { LastLetterBoardView, langOf } from './Board';
import { offeredDialects, useLastLetterAvailability } from './availability';
import './last-letter.css';

const NEW_PATH = '/app/games/last-letter';

/** The dictionary's spelling of a variety, as the rest of the website names them. */
const VARIETY: Record<LetterDialect, 'kurmanci' | 'sorani'> = { kmr: 'kurmanci', ckb: 'sorani' };

/**
 * The Last Letter (/app/games/last-letter): a word chain in one Kurdish, with
 * friends or against Hevalo. Without an id it is the start: how to play, a
 * game with friends (the invite sheet's form, in place) and a game against
 * Hevalo, each offered only in the dialects that have what it needs. With
 * one, it is the room (play/MultiRoom.tsx) with the chain inside.
 */
export function LastLetter(): React.JSX.Element {
  const [params] = useSearchParams();
  const t = useT();
  const id = params.get('id');
  return (
    <div className="container game-page ll-page">
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">{t('nav.games')}</span>
          <h1 className="page-title" style={{ margin: 0 }}>
            {t('games.lastLetter.name')}
          </h1>
        </div>
      </div>
      {id ? <Room key={id} id={id} /> : <Start />}
    </div>
  );
}

function Start(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const navigate = useNavigate();
  const answer = useLastLetterAvailability();
  const group = offeredDialects(answer, 'group');
  const solo = offeredDialects(answer, 'solo');
  const preferred: LetterDialect = defaultVariety(locale) === 'sorani' ? 'ckb' : 'kmr';
  const [dialect, setDialect] = useState<LetterDialect | null>(null);
  const [turnSeconds, setTurnSeconds] = useState<LastLetterTurnSeconds>(LAST_LETTER_DEFAULT_TURN_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (answer === null) return <Loading />;
  if (group.length === 0) {
    return (
      <div className="state ll-not-offered">
        <ChainIcon size={32} />
        <p>{t('games.lastLetter.notOffered')}</p>
        <Link to="/app/games" className="btn btn-secondary">
          {t('games.back')}
        </Link>
      </div>
    );
  }
  const soloDialect = dialect && solo.includes(dialect) ? dialect : solo.includes(preferred) ? preferred : (solo[0] ?? null);

  async function againstHevalo(): Promise<void> {
    if (!soloDialect) return;
    setBusy(true);
    setError(null);
    const res = await client.post<MultiView<LastLetterBoard | null>>('/mp/last-letter/solo', { dialect: soloDialect, turnSeconds });
    setBusy(false);
    if (res.ok && res.data?.id) navigate(`${NEW_PATH}?id=${encodeURIComponent(res.data.id)}`);
    else if (!res.ok) setError(playError(res.error, t));
  }

  return (
    <div className="ll-start">
      <p className="page-sub">{t('games.lastLetter.intro')}</p>
      <section className="ll-way" aria-labelledby="ll-friends">
        <h2 id="ll-friends" className="ll-way-title">
          {t('games.lastLetter.withFriends')}
        </h2>
        <p className="muted">{t('games.lastLetter.withFriendsBlurb')}</p>
        <InviteForm target={{ kind: 'new', game: 'last-letter' }} lockGame heading={false} />
      </section>
      {soloDialect && (
        <section className="ll-way" aria-labelledby="ll-hevalo">
          <h2 id="ll-hevalo" className="ll-way-title">
            {t('games.lastLetter.againstHevalo')}
          </h2>
          <p className="muted">{t('games.lastLetter.againstHevaloBlurb')}</p>
          {solo.length > 1 && (
            <ChipRadio
              label={t('games.lastLetter.kurdish')}
              value={soloDialect}
              onChange={setDialect}
              options={solo.map((d) => ({ value: d, label: dialectName(VARIETY[d]) }))}
            />
          )}
          <ChipRadio
            label={t('games.lastLetter.turnTime')}
            value={turnSeconds}
            onChange={setTurnSeconds}
            options={LAST_LETTER_TURN_SECONDS.map((sec) => ({ value: sec, label: t('games.lastLetter.seconds', { count: sec }) }))}
          />
          {error && (
            <p className="wordle-notice" role="status">
              {error}
            </p>
          )}
          <Button disabled={busy} onClick={() => void againstHevalo()}>
            {busy ? t('games.starting') : t('games.play')}
          </Button>
        </section>
      )}
    </div>
  );
}

function Room({ id }: { id: string }): React.JSX.Element {
  const t = useT();
  const room = useGameView<LastLetterBoard | null, LastLetterOutcome>('last-letter', id, {
    deadlineOf: (v) => v.board?.turn?.endsAt ?? null,
  });
  return (
    <GameRoom
      game="last-letter"
      id={id}
      room={room}
      newPath={NEW_PATH}
      newLabel={t('games.lastLetter.name')}
      lobbyNote={(v) => {
        const s = v.settings as { dialect?: LetterDialect; turnSeconds?: number };
        return (
          <p className="ll-lobby-note muted">
            <span lang={langOf(v.dialect)}>{dialectName(VARIETY[v.dialect])}</span>
            {s.turnSeconds ? ` · ${t('games.lastLetter.seconds', { count: s.turnSeconds })}` : null}
          </p>
        );
      }}
      playing={(v) => <LastLetterBoardView view={v} skew={room.skew} move={room.move} />}
      ending={(v) => {
        if (v.board?.endedBy === 'chain-full') return <p className="muted">{t('games.lastLetter.chainFull')}</p>;
        const winner = v.results?.[0];
        const hevaloWon = v.mode === 'solo' && winner && v.players.find((p) => p.seat === winner.seat)?.bot;
        if (hevaloWon) return <p className="muted">{t('games.lastLetter.hevaloWon')}</p>;
        if (winner && winner.seat === v.me?.seat) return <p className="muted">{t('games.lastLetter.lastStanding')}</p>;
        return null;
      }}
      scoreOf={(r) => t('games.lastLetter.words', { count: r.score })}
    />
  );
}
