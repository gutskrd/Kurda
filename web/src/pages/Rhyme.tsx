import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { RhymeGame, RhymeResult } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { Button } from '../components/Button';
import { useTypeOnly } from '../components/typeOnly';
import { useLocale, useT } from '../i18n/I18nProvider';
import { useGameFinished } from '../feedback/gameFinished';
import type { MessageKey } from '../i18n/en';
import { haptic } from '../lib/haptics';
import { GameArt } from '../games/GameArt';
import { useGrowsInto } from '../lib/viewTransition';
import { GameHead, stageTone } from '../games/GameHead';
import { dialectDirection } from '@kurda/shared';
import { MissedRhymes, type RhymeHint } from '../components/WordAnswer';
import { courseDialect } from '../stories/prefs';

type Dialect = 'kurmanci' | 'sorani';
const DIALECTS: readonly Dialect[] = ['kurmanci', 'sorani'];

/** This reader's variety: their course, else Soranî when the interface is, else Kurmancî. */
function ownVariety(locale: string): Dialect {
  return courseDialect() ?? (locale === 'ckb' ? 'sorani' : 'kurmanci');
}

/** A round as the server sends it, with the unfound rhymes once ended (absent from older servers). */
type RhymeRound = RhymeGame & { missed?: RhymeHint[] | null };

/**
 * Which varieties a round can be played in now (`GET /rhyme/availability`); one without enough prompts shows as coming
 * soon. Null until the server answers or when it cannot say, and then both are offered.
 */
function useRhymeOffered(): Partial<Record<Dialect, boolean>> | null {
  const { client } = useAuth();
  const [offered, setOffered] = useState<Partial<Record<Dialect, boolean>> | null>(null);
  useEffect(() => {
    let alive = true;
    void client.get<{ dialects?: Partial<Record<Dialect, { available?: boolean }>> }>('/rhyme/availability').then((r) => {
      const dialects = r.ok ? r.data?.dialects : undefined;
      if (!alive || !dialects) return;
      const known: Partial<Record<Dialect, boolean>> = {};
      for (const d of DIALECTS) if (typeof dialects[d]?.available === 'boolean') known[d] = dialects[d].available;
      // An answer offering nothing says nothing either: better both chips than none.
      if (DIALECTS.some((d) => known[d] === true)) setOffered(known);
    });
    return () => {
      alive = false;
    };
  }, [client]);
  return offered;
}

/** A found rhyme, kept for this round's list. */
interface Found {
  word: string;
  quality: RhymeResult['quality'];
  points: number;
}

/** Why a word was refused, as catalogue keys for the server's reason codes. */
const REJECT_KEY: Record<string, MessageKey> = {
  'not-a-word': 'games.rhyme.reject.notAWord',
  'is-prompt': 'games.rhyme.reject.isPrompt',
  'already-used': 'games.rhyme.reject.alreadyUsed',
  'no-rhyme': 'games.rhyme.reject.noRhyme',
  profane: 'games.rhyme.reject.profane',
  // An ending doing all the rhyming (malan for baran) has no sentence of its own yet; the general one is fair.
  inflected: 'games.rhyme.reject.other',
};

/**
 * Solo rhyming: a timed round with each rhyme scored by the server. The page opens on Start, not a running clock, and
 * switching variety returns to it. Played alone it earns no XP; the result gives the score, the rhymes found and the ones
 * missed with their meanings. It opens on the reader's variety when rounds are offered there, else Kurmancî; a variety
 * without rounds keeps its chip marked coming soon.
 */
export function Rhyme(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  // Where the game's card lands from the Games page: its cover, large, before a round starts.
  const cover = useGrowsInto('game:rhyme');
  const locale = useLocale();
  const offered = useRhymeOffered();
  // Where the page opens until a chip is pressed: the reader's own variety, when offered.
  const [preferred] = useState<Dialect>(() => ownVariety(locale));
  const [picked, setPicked] = useState<Dialect | null>(null);
  const isOffered = (d: Dialect): boolean => offered?.[d] !== false;
  const dialect: Dialect = picked ?? (isOffered(preferred) ? preferred : (DIALECTS.find(isOffered) ?? preferred));
  const [game, setGame] = useState<RhymeRound | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emptyLexicon, setEmptyLexicon] = useState(false);
  const [found, setFound] = useState<Found[]>([]);
  const [word, setWord] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const { handlers: typeOnly, notice: pasteNotice } = useTypeOnly(t('games.rhyme.noPasting'));
  const inputRef = useRef<HTMLInputElement>(null);
  // "End round" before time is giving the round up.
  const [endedEarly, setEndedEarly] = useState(false);
  // Nothing is asked and no clock runs until Start.
  const [started, setStarted] = useState(false);

  const start = useCallback(async () => {
    // The round is in this variety now, whatever is heard about the others meanwhile.
    setPicked(dialect);
    setStarted(true);
    setGame(null);
    setEndedEarly(false);
    setLoadError(null);
    setEmptyLexicon(false);
    setFound([]);
    setWord('');
    setNotice(null);
    const res = await client.post<RhymeRound>('/rhyme/training', { dialect });
    if (res.ok) {
      setGame(res.data);
      setRemaining(res.data.remainingMs);
    } else if (res.error.code === 'EMPTY_LEXICON') {
      setEmptyLexicon(true);
    } else {
      setLoadError(describeError(res.error, t));
    }
  }, [client, dialect]);

  /** The other variety: back to the start, nothing running. */
  const choose = (d: Dialect): void => {
    if (d === dialect) return;
    setPicked(d);
    setStarted(false);
    setGame(null);
    setLoadError(null);
    setEmptyLexicon(false);
    setFound([]);
    setWord('');
    setNotice(null);
  };

  const active = game?.status === 'active' && remaining > 0;
  // The rating box hears of a round the server ended, not one given up.
  useGameFinished('rhyme', game?.id ?? null, game?.status === 'ended', endedEarly);

  const end = useCallback(async () => {
    if (!game) return;
    const res = await client.post<{ game: RhymeRound }>(`/rhyme/training/${game.id}/end`);
    if (res.ok) setGame(res.data.game);
  }, [client, game]);

  // Countdown; when it runs out, finalise the round on the server.
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
    const res = await client.post<{ game: RhymeRound; result: RhymeResult }>(`/rhyme/training/${game.id}/guesses`, { word: w });
    setBusy(false);
    if (res.ok) {
      const { game: g, result } = res.data;
      setGame(g);
      setRemaining(g.remainingMs);
      setWord('');
      haptic(result.accepted ? 'correct' : 'wrong');
      if (result.accepted) {
        setFound((f) => [{ word: result.normalized, quality: result.quality, points: result.points }, ...f]);
      } else {
        setNotice(t(REJECT_KEY[result.reason ?? ''] ?? 'games.rhyme.reject.other'));
      }
      inputRef.current?.focus();
    } else {
      setNotice(res.error.code === 'GAME_OVER' ? t('games.rhyme.timeUpRound') : describeError(res.error, t));
    }
  }

  const seconds = Math.ceil(remaining / 1000);
  // The prompt and rhymes are in the round's own script, so a Soranî word reads right to left.
  const script = dialectDirection(game?.dialect === 'sorani' ? 'ckb' : 'kmr');

  return (
    <div className="container game-page gs" style={stageTone('rhyme')}>
      <GameHead game="rhyme" title={t('games.rhyme.name')} meaning={t('games.rhyme.meaning')} />

      <div className="chat-tabs" role="tablist" aria-label={t('games.dialect')}>
        {DIALECTS.map((d) => (
          <button key={d} role="tab" aria-selected={dialect === d} className={`chip${dialect === d ? ' active' : ''}`} onClick={() => choose(d)}>
            {d === 'kurmanci' ? 'Kurmancî' : 'Soranî'}
            {!isOffered(d) && <span className="wg-soon">{t('games.comingSoon')}</span>}
          </button>
        ))}
      </div>

      {!started ? (
        <div className="gs-start">
          <div className="gs-hero">
            <GameArt game="rhyme" size={148} moving ref={cover} />
            {/* A variety without rounds says so where Start would be. */}
            <p className="gs-hero-line">{isOffered(dialect) ? t('games.rhyme.body') : t('games.rhyme.notOffered')}</p>
          </div>
          {isOffered(dialect) && (
            <Button size="lg" className="gs-go" onClick={() => void start()}>
              {t('games.solo.start')}
            </Button>
          )}
        </div>
      ) : emptyLexicon ? (
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
              <span className="rhyme-prompt" lang={script.lang} dir={script.dir}>
                {game.prompt}
              </span>
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
              {/* A rhyme is a word you thought of; a dictionary tab is one paste away. */}
              <input
                ref={inputRef}
                className="input"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder={t('games.rhyme.placeholder', { word: game.prompt })}
                maxLength={64}
                dir="auto"
                aria-label={t('games.rhyme.yourRhyme')}
                autoFocus
                {...typeOnly}
              />
              {/* Busy, it keeps its word and width; an ellipsis shrank it and said nothing. */}
              <Button type="submit" disabled={busy || word.trim().length === 0} aria-busy={busy || undefined}>
                {t('games.submit')}
              </Button>
            </form>
          ) : (
            <div className="wordle-result">
              <p className="wordle-result-title">{t('games.rhyme.roundOver', { score: game.score, count: game.accepted })}</p>
              {/* A solo round earns no XP, said once. */}
              <p className="gs-alone">{t('games.noXpAlone')}</p>
              <Button onClick={() => void start()}>{t('games.playAgain')}</Button>
            </div>
          )}

          {/* One slot; a refused paste is the more urgent message. */}
          {(pasteNotice ?? notice) && (
            <div className="wordle-notice" role="status">
              {pasteNotice ?? notice}
            </div>
          )}

          {found.length > 0 && (
            <ul className="rhyme-found" aria-label={t('games.rhyme.foundList')}>
              {found.map((f, i) => (
                <li key={`${f.word}-${i}`} className={`rhyme-chip rhyme-${f.quality}`}>
                  <span lang={script.lang} dir={script.dir}>
                    {f.word}
                  </span>
                  <span className="rhyme-pts">+{f.points}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Once over: what it could also have found, each with its meaning. */}
          {!active && <MissedRhymes hints={game.missed} dialect={game.dialect} />}

          {active && (
            <div className="rhyme-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEndedEarly(true);
                  void end();
                }}
              >
                {t('games.rhyme.endRound')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
