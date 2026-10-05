import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useRealtimeEvent, useRealtimeRoom, useRealtimeSend } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { Loading } from '../components/states';
import { Button } from '../components/Button';
import { ArrowIcon } from '../components/icons';
import { useRail } from '../social/RailProvider';
import { PlayerChip } from '../ui/PlayerChip';
import { RankList, RankRow } from '../ui/RankRow';
import { useT } from '../i18n/I18nProvider';

/** Matchmaking → live 1v1 ranked quiz (KUR-051/61). Server-timed; the client
 *  only sends `ready` and `answer`, and renders the events the server pushes. */
type MatchmakingResult =
  | { status: 'queued' }
  | { status: 'matched'; roomId: string; opponent?: Opponent };

interface Opponent {
  id: string;
  username: string;
  rating?: number;
}

export function Quiz(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [screen, setScreen] = useState<'idle' | 'searching' | 'match'>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const find = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    const res = await client.post<MatchmakingResult>('/matchmaking/queue');
    setBusy(false);
    if (!res.ok) {
      setNotice(describeError(res.error, t));
      return;
    }
    if (res.data.status === 'matched') {
      setRoomId(res.data.roomId);
      setScreen('match');
    } else {
      setScreen('searching');
    }
  }, [client]);

  const cancel = useCallback(async () => {
    await client.post('/matchmaking/cancel').catch(() => undefined);
    setScreen('idle');
  }, [client]);

  // while searching, the server pushes a match on our user channel
  const onMatchFound = useCallback((env: RealtimeEventEnvelope) => {
    const ev = env.event as { roomId?: unknown };
    if (typeof ev.roomId !== 'string') return;
    setRoomId(ev.roomId);
    setScreen('match');
  }, []);
  useRealtimeEvent('match_found', onMatchFound);

  const onMatchTimeout = useCallback(() => {
    setScreen('idle');
    setNotice(t('games.quiz.noOpponent'));
  }, [t]);
  useRealtimeEvent('match_timeout', onMatchTimeout);

  return (
    <div className="container game-page">
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">{t('nav.games')}</span>
          <h1 className="page-title" style={{ margin: 0 }}>{t('games.quiz.name')}</h1>
        </div>
      </div>

      {screen === 'idle' && (
        <div className="quiz-lobby">
          <p className="page-sub">{t('games.quiz.intro')}</p>
          {notice && <div className="wordle-notice" role="status">{notice}</div>}
          <Button size="lg" disabled={busy} onClick={() => void find()}>
            {busy ? t('games.quiz.finding') : t('games.quiz.find')}
          </Button>
        </div>
      )}

      {screen === 'searching' && (
        <div className="quiz-lobby">
          <div className="quiz-searching">
            <span className="quiz-spinner" aria-hidden />
            <p>{t('games.quiz.searching')}</p>
          </div>
          <Button variant="ghost" onClick={() => void cancel()}>
            {t('common.cancel')}
          </Button>
        </div>
      )}

      {screen === 'match' && roomId && (
        <MatchRoom
          key={roomId}
          roomId={roomId}
          onLeave={() => {
            setScreen('idle');
            setRoomId(null);
          }}
        />
      )}
    </div>
  );
}

// ---- live match --------------------------------------------------------

type Phase = 'connecting' | 'lobby' | 'countdown' | 'question' | 'reveal' | 'results';

interface Player {
  id: string;
  username: string;
  rating?: number;
  ready?: boolean;
}
interface Question {
  index: number;
  total: number;
  prompt: string;
  options: string[];
  endsAt: number;
}
interface ScoreLine {
  userId: string;
  username: string;
  points: number;
  correct: number;
  rank: number;
  xp?: number;
  ratingDelta?: number;
}

function MatchRoom({ roomId, onLeave }: { roomId: string; onLeave: () => void }): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  const send = useRealtimeSend();
  const myAvatar = useRail().data.you?.avatarUrl ?? null;
  useRealtimeRoom(roomId); // join to receive the match events

  const [phase, setPhase] = useState<Phase>('connecting');
  const [players, setPlayers] = useState<Player[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [myChoice, setMyChoice] = useState<number | null>(null);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [scores, setScores] = useState<ScoreLine[]>([]);
  const [results, setResults] = useState<ScoreLine[] | null>(null);
  const [countdownAt, setCountdownAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const readySent = useRef(false);

  // one clock for countdown + question timers
  useEffect(() => {
    if (phase !== 'question' && phase !== 'countdown') return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [phase]);

  const sendReady = useCallback(() => {
    if (readySent.current) return;
    readySent.current = true;
    send({ type: 'ready', room: roomId });
  }, [send, roomId]);

  // seed from a snapshot (covers reconnect / joining mid-game), then ready up
  useEffect(() => {
    let cancelled = false;
    void client.get<{ phase: Phase; players: Player[]; currentQuestion?: Question; scores?: ScoreLine[] }>(`/games/${roomId}/state`).then((res) => {
      if (cancelled || !res.ok) return;
      setPlayers(res.data.players ?? []);
      setPhase(res.data.phase);
      if (res.data.currentQuestion) setQuestion(res.data.currentQuestion);
      if (res.data.scores) setScores(res.data.scores);
      if (res.data.phase === 'lobby') sendReady();
    });
    return () => {
      cancelled = true;
    };
  }, [client, roomId, sendReady]);

  useRealtimeEvent(
    'lobby',
    useCallback(
      (env: RealtimeEventEnvelope) => {
        const ev = env.event as { players?: Player[] };
        setPlayers(ev.players ?? []);
        setPhase((p) => (p === 'connecting' ? 'lobby' : p));
        sendReady();
      },
      [sendReady],
    ),
  );
  useRealtimeEvent(
    'player_ready',
    useCallback((env: RealtimeEventEnvelope) => {
      const ev = env.event as { userId?: string };
      setPlayers((ps) => ps.map((p) => (p.id === ev.userId ? { ...p, ready: true } : p)));
    }, []),
  );
  useRealtimeEvent(
    'countdown',
    useCallback((env: RealtimeEventEnvelope) => {
      const ev = env.event as { startsAt?: number };
      setCountdownAt(ev.startsAt ?? Date.now());
      setPhase('countdown');
    }, []),
  );
  useRealtimeEvent(
    'question',
    useCallback((env: RealtimeEventEnvelope) => {
      const ev = env.event as unknown as Question;
      setQuestion(ev);
      setMyChoice(null);
      setCorrectIndex(null);
      setPhase('question');
    }, []),
  );
  useRealtimeEvent(
    'reveal',
    useCallback((env: RealtimeEventEnvelope) => {
      const ev = env.event as { correctIndex?: number };
      if (typeof ev.correctIndex === 'number') setCorrectIndex(ev.correctIndex);
      setPhase('reveal');
    }, []),
  );
  useRealtimeEvent(
    'scoreboard',
    useCallback((env: RealtimeEventEnvelope) => {
      const ev = env.event as { scores?: ScoreLine[] };
      if (ev.scores) setScores(ev.scores);
    }, []),
  );
  useRealtimeEvent(
    'results',
    useCallback((env: RealtimeEventEnvelope) => {
      const ev = env.event as { scores?: ScoreLine[] };
      setResults(ev.scores ?? []);
      setPhase('results');
    }, []),
  );

  function answer(choice: number): void {
    if (!question || myChoice !== null || phase !== 'question') return;
    setMyChoice(choice);
    send({ type: 'answer', room: roomId, index: question.index, choice });
  }

  const opponent = players.find((p) => p.id !== user?.id);
  const me = players.find((p) => p.id === user?.id);
  // nobody has scored before the first question, and that is still a score
  const scoreLine = (id: string | undefined): string => {
    const line = scores.find((s) => s.userId === id);
    return t('games.quiz.playerScore', { points: line?.points ?? 0, correct: line?.correct ?? 0 });
  };

  if (phase === 'connecting') return <Loading />;

  if (phase === 'results' && results) {
    const mine = results.find((s) => s.userId === user?.id);
    const won = mine?.rank === 1;
    return (
      <div className="quiz-results">
        <h2 className="quiz-verdict">
          {won ? t('games.youWon') : results.length > 1 ? t('games.quiz.goodGame') : t('games.quiz.matchOver')}
        </h2>
        <RankList>
          {results.map((s) => (
            <RankRow
              key={s.userId}
              rank={s.rank}
              name={s.username}
              avatarUrl={s.userId === user?.id ? myAvatar : null}
              me={s.userId === user?.id}
              score={t('games.quiz.playerScore', { points: s.points, correct: s.correct })}
              trailing={
                <>
                  {typeof s.ratingDelta === 'number' && s.ratingDelta !== 0 && (
                    <span className={`rank-delta${s.ratingDelta > 0 ? ' up' : ' down'}`}>
                      {s.ratingDelta > 0 ? '+' : ''}{s.ratingDelta}
                    </span>
                  )}
                  {s.xp ? <span className="rank-xp">+{s.xp} XP</span> : null}
                </>
              }
            />
          ))}
        </RankList>
        <Button onClick={onLeave}>{t('games.quiz.backToMatchmaking')}</Button>
      </div>
    );
  }

  const remaining = question && phase === 'question' ? Math.max(0, question.endsAt - now) : 0;
  const countdownLeft = countdownAt ? Math.max(0, Math.ceil((countdownAt - now) / 1000)) : 0;

  return (
    <div className="quiz-match">
      {/* the same chips as the front page's battle: who is playing, and the score so far */}
      <div className="players quiz-players">
        <PlayerChip
          name={me?.username ?? t('games.you')}
          avatarUrl={myAvatar}
          status={scoreLine(user?.id)}
        />
        <PlayerChip
          name={opponent?.username ?? t('games.opponent')}
          avatarUrl={null}
          done={phase === 'lobby' && !!opponent?.ready}
          status={scoreLine(opponent?.id)}
        />
      </div>

      {phase === 'lobby' && (
        <div className="quiz-lobby">
          <p>{opponent ? t('games.quiz.matchFoundAgainst', { name: opponent.username }) : t('games.quiz.matchFound')}</p>
          <Loading />
        </div>
      )}

      {phase === 'countdown' && (
        <div className="quiz-countdown">
          <span className="quiz-count">{countdownLeft || t('games.quiz.go')}</span>
        </div>
      )}

      {(phase === 'question' || phase === 'reveal') && question && (
        <div className="quiz-question">
          <div className="quiz-qmeta">
            <span>{t('games.quiz.questionOf', { index: question.index + 1, total: question.total })}</span>
            {phase === 'question' && <span className="quiz-timer">{Math.ceil(remaining / 1000)}s</span>}
          </div>
          <h2 className="quiz-prompt">{question.prompt}</h2>
          <div className="quiz-options">
            {question.options.map((opt, i) => {
              const isCorrect = correctIndex === i;
              const isMine = myChoice === i;
              const cls =
                phase === 'reveal'
                  ? isCorrect
                    ? ' correct'
                    : isMine
                      ? ' wrong'
                      : ''
                  : isMine
                    ? ' picked'
                    : '';
              return (
                <button
                  key={i}
                  className={`quiz-option${cls}`}
                  disabled={phase === 'reveal' || myChoice !== null}
                  onClick={() => answer(i)}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {phase === 'question' && myChoice !== null && (
            <p className="muted quiz-locked">{t('games.quiz.answerLocked')}</p>
          )}
        </div>
      )}
    </div>
  );
}
