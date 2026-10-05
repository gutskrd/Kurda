import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { RhymeResult } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { ArrowIcon } from '../components/icons';
import { useRail } from '../social/RailProvider';
import { PlayerChip } from '../ui/PlayerChip';
import { RankList, RankRow } from '../ui/RankRow';
import { useTypeOnly } from '../components/typeOnly';
import { buildInviteUrl } from '../lib/gameInvites';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

type Dialect = 'kurmanci' | 'sorani';

interface ScoreEntry {
  userId: string;
  score: number;
  accepted: number;
}
interface MatchState {
  id: string;
  status: 'lobby' | 'active' | 'finished';
  dialect: Dialect;
  prompt: string | null;
  windowMs: number;
  remainingMs: number;
  maxPlayers: number;
  createdBy: string;
  me: { score: number; accepted: number; usedWords: string[] } | null;
  scoreboard: ScoreEntry[];
}
interface MatchResults {
  prompt: string;
  dialect: Dialect;
  ranking: Array<{ userId: string; rank: number; score: number; accepted: number; xpAwarded: number | null }>;
}

const REJECT_KEY: Record<string, MessageKey> = {
  'not-a-word': 'games.rhyme.reject.notAWord',
  'is-prompt': 'games.rhyme.reject.isPromptShort',
  'already-used': 'games.rhyme.reject.alreadyUsed',
  'no-rhyme': 'games.rhyme.reject.noRhyme',
  profane: 'games.rhyme.reject.profane',
};

/** Rhyme Match (KUR-299): head-to-head timed rhyming. Create → share → play. */
export function RhymeMatch(): React.JSX.Element {
  const [params] = useSearchParams();
  const t = useT();
  const id = params.get('id');
  return (
    <div className="container game-page">
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">{t('nav.games')}</span>
          <h1 className="page-title" style={{ margin: 0 }}>{t('games.rhymeMatch.name')}</h1>
        </div>
      </div>
      {id ? <MatchRoom key={id} id={id} /> : <CreateMatch />}
    </div>
  );
}

function CreateMatch(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [dialect, setDialect] = useState<Dialect>('kurmanci');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(): Promise<void> {
    setBusy(true);
    setErr(null);
    const res = await client.post<MatchState>('/rhyme/matches', { dialect });
    setBusy(false);
    if (res.ok) navigate(`/app/games/rhyme-match?id=${res.data.id}`);
    else setErr(res.error.code === 'EMPTY_LEXICON' ? t('games.emptyPool') : describeError(res.error, t));
  }

  return (
    <div className="quiz-lobby">
      <p className="page-sub">{t('games.rhymeMatch.intro')}</p>
      {err && <div className="wordle-notice">{err}</div>}
      <div className="chat-tabs" role="tablist" aria-label={t('games.dialect')}>
        {(['kurmanci', 'sorani'] as const).map((d) => (
          <button key={d} role="tab" aria-selected={dialect === d} className={`chip${dialect === d ? ' active' : ''}`} onClick={() => setDialect(d)}>
            {d === 'kurmanci' ? 'Kurmancî' : 'Soranî'}
          </button>
        ))}
      </div>
      <Button size="lg" disabled={busy} onClick={() => void create()}>
        {busy ? t('games.creating') : t('games.rhymeMatch.create')}
      </Button>
    </div>
  );
}

function MatchRoom({ id }: { id: string }): React.JSX.Element {
  const { client, user } = useAuth();
  const myAvatar = useRail().data.you?.avatarUrl ?? null;
  const t = useT();
  const [match, setMatch] = useState<MatchState | null>(null);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [word, setWord] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [found, setFound] = useState<Array<{ word: string; quality: RhymeResult['quality']; points: number }>>([]);
  const { handlers: typeOnly, notice: pasteNotice } = useTypeOnly(t('games.rhyme.noPasting'));
  const loadedOnce = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await client.get<MatchState>(`/rhyme/matches/${id}`);
    if (res.ok) {
      setMatch(res.data);
      setRemaining(res.data.remainingMs);
      loadedOnce.current = true;
    } else if (!loadedOnce.current) {
      setError(describeError(res.error, t));
    }
  }, [client, id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (match?.status !== 'finished') void load();
    }, 1500);
    return () => clearInterval(timer);
  }, [load, match?.status]);

  useEffect(() => {
    if (match?.status === 'finished' && !results) {
      void client.get<MatchResults>(`/rhyme/matches/${id}/results`).then((r) => {
        if (r.ok) setResults(r.data);
      });
    }
  }, [match?.status, results, client, id]);

  // local countdown between polls (resynced on each load/submit)
  const active = match?.status === 'active' && match.me != null && remaining > 0;
  useEffect(() => {
    if (match?.status !== 'active') return;
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((ms) => Math.max(0, ms - 200)), 200);
    return () => clearTimeout(timer);
  }, [remaining, match?.status]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const w = word.trim();
    if (!w || !active || busy) return;
    setBusy(true);
    setNotice(null);
    const res = await client.post<{ match: MatchState; result: RhymeResult }>(`/rhyme/matches/${id}/submissions`, { word: w });
    setBusy(false);
    if (res.ok) {
      setMatch(res.data.match);
      setRemaining(res.data.match.remainingMs);
      setWord('');
      const { result } = res.data;
      if (result.accepted) setFound((f) => [{ word: result.normalized, quality: result.quality, points: result.points }, ...f]);
      else setNotice(t(REJECT_KEY[result.reason ?? ''] ?? 'games.rhyme.reject.other'));
      inputRef.current?.focus();
    } else {
      setNotice(res.error.code === 'NOT_ACTIVE' ? t('games.rhymeMatch.timeUpMatch') : describeError(res.error, t));
    }
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildInviteUrl('rhyme-match', id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice(t('games.copyFailed'));
    }
  }

  async function join(): Promise<void> {
    setBusy(true);
    const res = await client.post<MatchState>(`/rhyme/matches/${id}/join`);
    setBusy(false);
    if (res.ok) setMatch(res.data);
    else setNotice(describeError(res.error, t));
  }
  async function start(): Promise<void> {
    setBusy(true);
    const res = await client.post<MatchState>(`/rhyme/matches/${id}/start`);
    setBusy(false);
    if (res.ok) setMatch(res.data);
    else setNotice(describeError(res.error, t));
  }

  if (error && !match) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!match) return <Loading />;

  const playerCount = match.scoreboard.length || (match.me ? 1 : 0);
  const isHost = match.createdBy === user?.id;
  const seconds = Math.ceil(remaining / 1000);

  if (match.status === 'lobby') {
    return (
      <div className="quiz-lobby">
        <p>{t('games.lobbyWaiting', { count: playerCount })}</p>
        <div className="battle-invite">
          <span className="battle-invite-label">{t('games.inviteLink')}</span>
          <code className="battle-invite-url">{buildInviteUrl('rhyme-match', id)}</code>
          <Button size="sm" onClick={() => void copyLink()}>{copied ? t('games.copied') : t('games.copyLink')}</Button>
        </div>
        {notice && <div className="wordle-notice">{notice}</div>}
        {match.me == null ? (
          <Button size="lg" disabled={busy} onClick={() => void join()}>
            {busy ? t('games.joining') : t('games.rhymeMatch.join')}
          </Button>
        ) : isHost ? (
          <Button size="lg" disabled={busy || playerCount < 2} onClick={() => void start()}>
            {playerCount < 2 ? t('games.waitingForPlayer') : busy ? t('games.starting') : t('games.rhymeMatch.start')}
          </Button>
        ) : (
          <p className="muted">{t('games.waitingForHost')}</p>
        )}
      </div>
    );
  }

  if (match.status === 'finished') {
    const mine = results?.ranking.find((r) => r.userId === user?.id);
    return (
      <div className="quiz-results">
        <h2 className="quiz-verdict">{mine?.rank === 1 ? t('games.youWon') : t('games.rhymeMatch.over')}</h2>
        {results && (
          <>
            <p className="muted">{t('games.rhymeMatch.promptWas', { word: results.prompt })}</p>
            <RankList>
              {results.ranking.map((r) => {
                const me = r.userId === user?.id;
                return (
                  <RankRow
                    key={r.userId}
                    rank={r.rank}
                    name={me ? t('games.you') : t('games.opponent')}
                    avatarUrl={me ? myAvatar : null}
                    me={me}
                    score={t('games.rhymeMatch.playerScore', { score: r.score, count: r.accepted })}
                    trailing={r.xpAwarded ? <span className="rank-xp">+{r.xpAwarded} XP</span> : undefined}
                  />
                );
              })}
            </RankList>
          </>
        )}
        <Link to="/app/games/rhyme-match" className="btn btn-primary">{t('games.rhymeMatch.new')}</Link>
      </div>
    );
  }

  // active
  return (
    <div className="quiz-match">
      <div className="rhyme-stage">
        <div className="rhyme-prompt-box">
          <span className="rhyme-label">{t('games.rhyme.rhymeWith')}</span>
          <span className="rhyme-prompt">{match.prompt}</span>
        </div>
        <div className="rhyme-meters">
          <div className={`rhyme-timer${seconds <= 5 && active ? ' low' : ''}`} aria-label={t('games.timeLeft')}>{seconds}s</div>
        </div>
      </div>

      <div className="players">
        {match.scoreboard.map((s) => {
          const me = s.userId === user?.id;
          return (
            <PlayerChip
              key={s.userId}
              name={me ? t('games.you') : t('games.opponent')}
              avatarUrl={me ? myAvatar : null}
              status={t('games.rhymeMatch.playerScore', { score: s.score, count: s.accepted })}
            />
          );
        })}
      </div>

      {active ? (
        <form className="rhyme-compose" onSubmit={submit}>
          {/* against another person, a pasted rhyme is somebody else's point */}
          <input
            ref={inputRef}
            className="input"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={t('games.rhyme.placeholder', { word: match.prompt ?? '' })}
            maxLength={64}
            aria-label={t('games.rhyme.yourRhyme')}
            autoFocus
            {...typeOnly}
          />
          <Button type="submit" disabled={busy || word.trim().length === 0}>{busy ? '…' : t('games.submit')}</Button>
        </form>
      ) : (
        <p className="muted" style={{ textAlign: 'center' }}>{t('games.rhymeMatch.timeUpFinishing')}</p>
      )}

      {/* one slot: a refused paste is the more urgent of the two to answer */}
      {(pasteNotice ?? notice) && (
        <div className="wordle-notice" role="status">
          {pasteNotice ?? notice}
        </div>
      )}

      {found.length > 0 && (
        <ul className="rhyme-found" aria-label={t('games.rhyme.foundList')}>
          {found.map((f, i) => (
            <li key={`${f.word}-${i}`} className={`rhyme-chip rhyme-${f.quality}`}>
              <span>{f.word}</span>
              <span className="rhyme-pts">+{f.points}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
