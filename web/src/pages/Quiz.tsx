import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useRealtimeEvent, useRealtimeRoom, useRealtimeSend } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { Loading } from '../components/states';
import { Button } from '../components/Button';
import { ArrowIcon } from '../components/icons';

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
      setNotice(describeError(res.error));
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
    setNotice('No opponent found right now — try again in a moment.');
  }, []);
  useRealtimeEvent('match_timeout', onMatchTimeout);

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 72 }}>
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label="Back to games">
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">Yarî · Ranked quiz</span>
          <h1 className="page-title" style={{ margin: 0 }}>Quiz match</h1>
        </div>
      </div>

      {screen === 'idle' && (
        <div className="quiz-lobby">
          <p className="page-sub">A fast 1-v-1: answer Kurdish questions quicker and more accurately than your opponent. Every match is scored on the server and moves your rating.</p>
          {notice && <div className="wordle-notice" role="status">{notice}</div>}
          <Button size="lg" disabled={busy} onClick={() => void find()}>
            {busy ? 'Finding…' : 'Find a match'}
          </Button>
        </div>
      )}

      {screen === 'searching' && (
        <div className="quiz-lobby">
          <div className="quiz-searching">
            <span className="quiz-spinner" aria-hidden />
            <p>Searching for an opponent…</p>
          </div>
          <Button variant="ghost" onClick={() => void cancel()}>
            Cancel
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
  const send = useRealtimeSend();
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
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
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

  if (phase === 'connecting') return <Loading />;

  if (phase === 'results' && results) {
    const mine = results.find((s) => s.userId === user?.id);
    const won = mine?.rank === 1;
    return (
      <div className="quiz-results">
        <h2 className="quiz-verdict">{won ? '🏆 You won!' : results.length > 1 ? 'Good game.' : 'Match over.'}</h2>
        <ol className="quiz-scoreboard">
          {results.map((s) => (
            <li key={s.userId} className={`quiz-scoreline${s.userId === user?.id ? ' me' : ''}`}>
              <span className="quiz-rank">{s.rank}</span>
              <span className="quiz-name">{s.username}</span>
              <span className="quiz-pts">{s.points} pts · {s.correct} correct</span>
              {typeof s.ratingDelta === 'number' && s.ratingDelta !== 0 && (
                <span className={`quiz-delta${s.ratingDelta > 0 ? ' up' : ' down'}`}>
                  {s.ratingDelta > 0 ? '+' : ''}{s.ratingDelta}
                </span>
              )}
              {s.xp ? <span className="quiz-xp">+{s.xp} XP</span> : null}
            </li>
          ))}
        </ol>
        <Button onClick={onLeave}>Back to matchmaking</Button>
      </div>
    );
  }

  const remaining = question && phase === 'question' ? Math.max(0, question.endsAt - now) : 0;
  const countdownLeft = countdownAt ? Math.max(0, Math.ceil((countdownAt - now) / 1000)) : 0;

  return (
    <div className="quiz-match">
      <div className="quiz-players">
        <span className="quiz-player me">{me?.username ?? 'You'}</span>
        <span className="quiz-vs">vs</span>
        <span className={`quiz-player${opponent?.ready ? ' ready' : ''}`}>{opponent?.username ?? 'Opponent'}</span>
      </div>

      {scores.length > 0 && phase !== 'lobby' && (
        <div className="quiz-live-score">
          {scores.map((s) => (
            <span key={s.userId} className={s.userId === user?.id ? 'me' : ''}>
              {s.username}: {s.points}
            </span>
          ))}
        </div>
      )}

      {phase === 'lobby' && (
        <div className="quiz-lobby">
          <p>Match found{opponent ? <> against <strong>{opponent.username}</strong></> : null}. Getting ready…</p>
          <Loading />
        </div>
      )}

      {phase === 'countdown' && (
        <div className="quiz-countdown">
          <span className="quiz-count">{countdownLeft || 'Go!'}</span>
        </div>
      )}

      {(phase === 'question' || phase === 'reveal') && question && (
        <div className="quiz-question">
          <div className="quiz-qmeta">
            <span>Question {question.index + 1} of {question.total}</span>
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
          {phase === 'question' && myChoice !== null && <p className="muted quiz-locked">Answer locked — waiting for the reveal…</p>}
        </div>
      )}
    </div>
  );
}
