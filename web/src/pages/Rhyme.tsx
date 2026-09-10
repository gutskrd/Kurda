import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { RhymeGame, RhymeResult } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { ArrowIcon } from '../components/icons';
import { useTypeOnly } from '../components/typeOnly';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

type Dialect = 'kurmanci' | 'sorani';

/** A found rhyme, kept for the on-screen list this round. */
interface Found {
  word: string;
  quality: RhymeResult['quality'];
  points: number;
}

/**
 * Why a word was refused. Keys rather than sentences: the reason comes back
 * from the server as a code, and the words for it belong in the catalogues
 * with everything else the player reads.
 */
const REJECT_KEY: Record<string, MessageKey> = {
  'not-a-word': 'games.rhyme.reject.notAWord',
  'is-prompt': 'games.rhyme.reject.isPrompt',
  'already-used': 'games.rhyme.reject.alreadyUsed',
  'no-rhyme': 'games.rhyme.reject.noRhyme',
  profane: 'games.rhyme.reject.profane',
};

/** Solo Rhyming Words — a timed round; each rhyme is scored server-side. */
export function Rhyme(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [dialect, setDialect] = useState<Dialect>('kurmanci');
  const [game, setGame] = useState<RhymeGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emptyLexicon, setEmptyLexicon] = useState(false);
  const [found, setFound] = useState<Found[]>([]);
  const [word, setWord] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const { handlers: typeOnly, notice: pasteNotice } = useTypeOnly(t('games.rhyme.noPasting'));
  const inputRef = useRef<HTMLInputElement>(null);

  const start = useCallback(async () => {
    setGame(null);
    setLoadError(null);
    setEmptyLexicon(false);
    setFound([]);
    setWord('');
    setNotice(null);
    const res = await client.post<RhymeGame>('/rhyme/training', { dialect });
    if (res.ok) {
      setGame(res.data);
      setRemaining(res.data.remainingMs);
    } else if (res.error.code === 'EMPTY_LEXICON') {
      setEmptyLexicon(true);
    } else {
      setLoadError(describeError(res.error));
    }
  }, [client, dialect]);

  useEffect(() => {
    void start();
  }, [start]);

  const active = game?.status === 'active' && remaining > 0;

  const end = useCallback(async () => {
    if (!game) return;
    const res = await client.post<{ game: RhymeGame }>(`/rhyme/training/${game.id}/end`);
    if (res.ok) setGame(res.data.game);
  }, [client, game]);

  // countdown; when it runs out, finalize the round on the server
  useEffect(() => {
    if (!game || game.status !== 'active') return;
    if (remaining <= 0) {
      void end();
      return;
    }
    const t = setTimeout(() => setRemaining((ms) => Math.max(0, ms - 100)), 100);
    return () => clearTimeout(t);
  }, [remaining, game, end]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const w = word.trim();
    if (!w || !game || !active || busy) return;
    setBusy(true);
    setNotice(null);
    const res = await client.post<{ game: RhymeGame; result: RhymeResult }>(`/rhyme/training/${game.id}/guesses`, { word: w });
    setBusy(false);
    if (res.ok) {
      const { game: g, result } = res.data;
      setGame(g);
      setRemaining(g.remainingMs);
      setWord('');
      if (result.accepted) {
        setFound((f) => [{ word: result.normalized, quality: result.quality, points: result.points }, ...f]);
      } else {
        setNotice(t(REJECT_KEY[result.reason ?? ''] ?? 'games.rhyme.reject.other'));
      }
      inputRef.current?.focus();
    } else {
      setNotice(res.error.code === 'GAME_OVER' ? t('games.rhyme.timeUpRound') : describeError(res.error));
    }
  }

  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="container game-page">
      <div className="wordle-head">
        <Link to="/app/games" className="chat-back" aria-label={t('games.back')}>
          <ArrowIcon size={18} />
        </Link>
        <div>
          <span className="eyebrow">{t('nav.games')}</span>
          <h1 className="page-title" style={{ margin: 0 }}>{t('games.rhyme.name')}</h1>
        </div>
      </div>

      <div className="chat-tabs" role="tablist" aria-label={t('games.dialect')} style={{ marginBottom: 8 }}>
        {(['kurmanci', 'sorani'] as const).map((d) => (
          <button key={d} role="tab" aria-selected={dialect === d} className={`chip${dialect === d ? ' active' : ''}`} onClick={() => setDialect(d)}>
            {d === 'kurmanci' ? 'Kurmancî' : 'Soranî'}
          </button>
        ))}
      </div>

      {emptyLexicon ? (
        <div className="wordle-msg">{t('games.emptyPool')}</div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => void start()} />
      ) : game === null ? (
        <Loading />
      ) : (
        <>
          <div className="rhyme-stage">
            <div className="rhyme-prompt-box">
              <span className="rhyme-label">{t('games.rhyme.rhymeWith')}</span>
              <span className="rhyme-prompt">{game.prompt}</span>
            </div>
            <div className="rhyme-meters">
              <div className={`rhyme-timer${seconds <= 5 && active ? ' low' : ''}`} aria-label={t('games.timeLeft')}>
                {seconds}s
              </div>
              <div className="rhyme-score" aria-label={t('games.rhyme.score')}>
                {t('games.rhyme.scoreLine', { score: game.score, count: game.accepted })}
              </div>
            </div>
          </div>

          {active ? (
            <form className="rhyme-compose" onSubmit={submit}>
              {/* a rhyme is a word you thought of; a dictionary tab is one paste away */}
              <input
                ref={inputRef}
                className="input"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder={t('games.rhyme.placeholder', { word: game.prompt })}
                maxLength={64}
                aria-label={t('games.rhyme.yourRhyme')}
                autoFocus
                {...typeOnly}
              />
              <Button type="submit" disabled={busy || word.trim().length === 0}>
                {busy ? '…' : t('games.submit')}
              </Button>
            </form>
          ) : (
            <div className="wordle-result">
              <p className="wordle-result-title">
                {t('games.rhyme.roundOver', { score: game.score, count: game.accepted })}
                {game.xpAwarded ? <> +{game.xpAwarded} XP</> : null}
              </p>
              <Button onClick={() => void start()}>{t('games.playAgain')}</Button>
            </div>
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

          {active && (
            <div className="rhyme-actions">
              <Button variant="ghost" size="sm" onClick={() => void end()}>
                {t('games.rhyme.endRound')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
