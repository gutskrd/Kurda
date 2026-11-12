import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  WHO_AM_I_GUESSES,
  WHO_AM_I_ROUND_ITEMS,
  learnGame,
  whoAmIPoints,
  type GameDialect,
  type GameDifficulty,
  type MultiMoveAnswer,
  type MultiView,
  type SoloResults,
  type WhoAmIAskResult,
  type WhoAmIAsked,
  type WhoAmICorrection,
  type WhoAmIHint,
  type WhoAmIItemView,
  type WhoAmIRaceBoard,
  type WhoAmIRaceOutcome,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { HelpIcon } from '../components/icons';
import { Loading } from '../components/states';
import { useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import type { ApiResult } from '../lib/types';
import { haptic } from '../lib/haptics';
import { InviteForm } from '../play/InviteSheet';
import { GameRoom, seatNamer } from '../play/MultiRoom';
import { useGameView } from '../play/useGameView';
import { useServerClock } from '../stories/useStoryGame';
import { GameHead, stageTone } from '../games/GameHead';
import { SoloGameShell, type SoloRound } from '../games/SoloGameShell';
import { useAvailability, useGameDialect } from '../games/soloRounds';
import { groupDialects, useMpAvailability } from '../games/mpAvailability';
import { DIFFICULTY_KEY, type RaceOffer } from '../games/partyChoices';
import { dialectName } from '../learn/map';
import { ForeheadCard, GuessTiles, QuestionDeck } from './WhoAmIStage';
import './whoami.css';

const PATH = '/app/games/who-am-i';
const TONE = learnGame('who-am-i').tone;

type Round = SoloRound<WhoAmIItemView, WhoAmIHint, WhoAmICorrection>;

/**
 * Who Am I? (/app/games/who-am-i): a hidden word on a card on Hevalo's
 * forehead, found by asking yes/no questions in Kurdish. Three ways in:
 *
 *   /app/games/who-am-i           the start: alone, or a race with friends
 *   /app/games/who-am-i?solo=1    a round alone (games/SoloGameShell.tsx)
 *   /app/games/who-am-i?id=…      a race's room (play/MultiRoom.tsx)
 *
 * Each is offered only where approved identities and questions allow, in
 * the learner's Kurdish; nothing says "coming soon".
 */
export function WhoAmI(): React.JSX.Element {
  const [params] = useSearchParams();
  const t = useT();
  const id = params.get('id');
  const solo = params.get('solo') === '1';
  if (solo && !id) return <SoloRoundPage />;
  return (
    <div className={`container game-page wa-page gs lp-tone-${TONE}`} style={stageTone('who-am-i')}>
      <GameHead game="who-am-i" title={t('games.whoAmI.name')} />
      {id ? <RaceRoom key={id} id={id} /> : <Start />}
    </div>
  );
}

function Start(): React.JSX.Element {
  const t = useT();
  const dialect = useGameDialect();
  const availability = useAvailability(dialect);
  const race = useMpAvailability<RaceOffer>('who-am-i');
  if (availability === null || race === null) return <Loading />;
  const alone = availability.games.find((g) => g.id === 'who-am-i')?.available ?? false;
  const together = groupDialects(race).length > 0;
  if (!alone && !together) {
    return (
      <div className="state wa-not-offered">
        <HelpIcon size={32} />
        <p>{t('games.whoAmI.notOffered')}</p>
        <Link to="/app/games" className="btn btn-secondary">
          {t('games.back')}
        </Link>
      </div>
    );
  }
  return (
    <div className="wa-start">
      <div className="gs-hero">
        <div className="wa-start-stage">
          <ForeheadCard dialect={dialect} category="animal" identity={null} />
        </div>
        <p className="gs-hero-line">{t('games.whoAmI.intro')}</p>
      </div>
      {alone && (
        <section className="wa-way" aria-labelledby="wa-alone">
          <h2 id="wa-alone" className="wa-way-title">
            {t('games.whoAmI.alone')}
          </h2>
          <p className="muted">{t('games.whoAmI.aloneBlurb')}</p>
          <Link to={`${PATH}?solo=1`} className="btn btn-primary">
            {t('games.play')}
          </Link>
        </section>
      )}
      {together && (
        <section className="wa-way" aria-labelledby="wa-race">
          <h2 id="wa-race" className="wa-way-title">
            {t('games.whoAmI.race')}
          </h2>
          <p className="muted">{t('games.whoAmI.raceBlurb')}</p>
          <InviteForm target={{ kind: 'new', game: 'who-am-i' }} lockGame heading={false} />
        </section>
      )}
    </div>
  );
}

// ---------- alone ----------

/** One hidden word of a round alone: the card, the questions, the tiles. */
function SoloBoard({ round, dialect, onAsked }: { round: Round; dialect: GameDialect; onAsked: (index: number, asked: WhoAmIAsked[]) => void }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const { item, result, busy, submit, sessionId, state } = round;
  const [asked, setAsked] = useState<WhoAmIAsked[]>(item.asked);
  const [crossed, setCrossed] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setAsked(item.asked);
    setCrossed([]);
    setError(null);
  }, [item.index, item.asked]);
  useEffect(() => {
    if (result?.hint?.notThis) setCrossed((c) => (c.includes(result.hint!.notThis) ? c : [...c, result.hint!.notThis]));
  }, [result]);
  const done = result?.done === true || state.done;
  const ask = async (question: string): Promise<void> => {
    setAsking(true);
    setError(null);
    const res = await client.post<WhoAmIAskResult>(`/games/who-am-i/sessions/${sessionId}/ask`, { index: item.index, question });
    setAsking(false);
    if (!res.ok) return setError(describeError(res.error, t));
    setAsked(res.data.asked);
    onAsked(item.index, res.data.asked);
    haptic(res.data.answer ? 'correct' : 'wrong');
  };
  const wrong = crossed.length;
  const worth = whoAmIPoints(asked.length, wrong, true);
  const identity = result?.correction ? { word: result.correction.word, meanings: result.correction.meanings } : null;
  return (
    <div className="wa-board">
      <ForeheadCard dialect={dialect} category={item.category} identity={identity} />
      <p className="wa-worth" aria-live="polite">
        {done
          ? result?.correct
            ? t('games.whoAmI.score', { count: whoAmIPoints(asked.length, wrong, true) })
            : t('games.whoAmI.out')
          : `${t('games.whoAmI.worth', { count: worth })} · ${t('games.whoAmI.guessesLeft', { count: WHO_AM_I_GUESSES - state.attempts })}`}
      </p>
      {/* who it could be comes first: a question is chosen by looking at the words it has to tell apart */}
      <GuessTiles
        dialect={dialect}
        tiles={item.tiles}
        crossed={crossed}
        right={result?.correction?.id ?? null}
        disabled={done || busy}
        onGuess={(tile) => void submit({ guess: tile })}
      />
      {error && <p className="field-error">{error}</p>}
      <QuestionDeck dialect={dialect} questions={item.questions} asked={asked} disabled={done || busy || asking} onAsk={(q) => void ask(q)} />
    </div>
  );
}

function SoloRoundPage(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const dialect = useGameDialect();
  const availability = useAvailability(dialect);
  const [open, setOpen] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  // what was asked about each word of the round in front of the player, for the score at the end
  const asked = useRef(new Map<number, number>());
  const session = useRef<string | null>(null);

  useEffect(() => {
    void client.get<{ id: string | null }>(`/games/solo/open?game=who-am-i&dialect=${dialect}`).then((res) => {
      if (res.ok) setOpen(res.data.id);
    });
  }, [client, dialect]);

  const finished = useCallback(
    async (results: SoloResults) => {
      // a round come back to may have had questions asked before this visit: the round itself says how many
      const id = session.current;
      const view = id ? await client.get<{ items: WhoAmIItemView[] }>(`/games/solo/sessions/${id}`) : null;
      const counts = new Map(asked.current);
      if (view?.ok) for (const item of view.data.items) counts.set(item.index, item.asked.length);
      setScore(results.items.reduce((sum, i) => sum + whoAmIPoints(counts.get(i.index) ?? 0, i.correct && !i.firstTry ? 1 : 0, i.correct), 0));
    },
    [client],
  );

  const game = availability?.games.find((g) => g.id === 'who-am-i');
  return (
    <div className={`container solo-page wa-page lp-tone-${TONE}`}>
      <SoloGameShell<WhoAmIItemView, WhoAmIHint, WhoAmICorrection>
        game="who-am-i"
        dialect={dialect}
        title={t('games.whoAmI.name')}
        blurb={t('games.whoAmI.intro')}
        difficulties={availability ? (game?.difficulties ?? []) : null}
        open={open}
        roundItems={WHO_AM_I_ROUND_ITEMS}
        renderRound={(round) => {
          session.current = round.sessionId;
          return <SoloBoard round={round} dialect={dialect} onAsked={(index, a) => asked.current.set(index, a.length)} />;
        }}
        explain={() => null}
        onFinished={(r) => void finished(r)}
        resultsExtra={score !== null ? <p className="wa-total">{t('games.whoAmI.score', { count: score })}</p> : null}
      />
    </div>
  );
}

// ---------- the race ----------

function RaceRoom({ id }: { id: string }): React.JSX.Element {
  const t = useT();
  const room = useGameView<WhoAmIRaceBoard | null, WhoAmIRaceOutcome>('who-am-i', id, { deadlineOf: (v) => v.board?.endsAt ?? null });
  return (
    <GameRoom
      game="who-am-i"
      id={id}
      room={room}
      newPath={PATH}
      newLabel={t('games.whoAmI.name')}
      lobbyNote={(v) => {
        const s = v.settings as { difficulty?: GameDifficulty; minutes?: number };
        return (
          <p className="wa-lobby-note muted">
            <span lang={v.dialect === 'ckb' ? 'ckb' : 'ku'}>{dialectName(v.dialect === 'ckb' ? 'sorani' : 'kurmanci')}</span>
            {s.difficulty ? ` · ${t(DIFFICULTY_KEY[s.difficulty])}` : null}
            {s.minutes ? ` · ${t('games.whoAmI.minutesCount', { count: s.minutes })}` : null}
          </p>
        );
      }}
      playing={(v) => <RaceBoard view={v} skew={room.skew} move={room.move} />}
      ending={(v) => {
        const reveal = v.board?.reveal ?? [];
        if (reveal.length === 0) return null;
        const name = seatNamer(v, t);
        return (
          <section className="wa-reveal" aria-labelledby="wa-reveal-title">
            <h2 id="wa-reveal-title" className="wa-way-title">
              {t('games.whoAmI.reveal')}
            </h2>
            <ul>
              {reveal.map((r) => (
                <li key={r.seat}>
                  <span className="wa-reveal-name">{name(r.seat)}</span>
                  <span lang={v.dialect === 'ckb' ? 'ckb' : 'ku'} dir={v.dialect === 'ckb' ? 'rtl' : 'ltr'} className="wa-reveal-word">
                    {r.word}
                  </span>
                  <span className="muted">{r.meanings.en}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      }}
      scoreOf={(r) => t('games.whoAmI.points', { count: r.score })}
    />
  );
}

function RaceBoard({
  view,
  skew,
  move,
}: {
  view: MultiView<WhoAmIRaceBoard | null>;
  skew: number;
  move: (body: unknown) => Promise<ApiResult<MultiMoveAnswer<WhoAmIRaceBoard | null, WhoAmIRaceOutcome>>>;
}): React.JSX.Element | null {
  const t = useT();
  const board = view.board;
  const now = useServerClock(skew, view.status === 'active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!board) return null;
  const mine = board.mine;
  const name = seatNamer(view, t);
  const left = Math.max(0, Math.ceil((Date.parse(board.endsAt) - now) / 1000));
  const act = async (body: unknown): Promise<void> => {
    setBusy(true);
    setError(null);
    const res = await move(body);
    setBusy(false);
    if (!res.ok) return setError(describeError(res.error, t));
    const outcome = res.data.outcome;
    if (outcome.kind === 'guess') haptic(outcome.correct ? 'celebrate' : 'wrong');
  };
  const playing = !!mine && !mine.solved && !mine.out;
  const crossed = mine?.guesses.filter((g) => !g.correct).map((g) => g.tile) ?? [];
  return (
    <div className="wa-board wa-race">
      <div className="wa-race-head">
        <span className="wa-clock" role="timer" aria-label={t('games.whoAmI.timeLeft', { count: left })}>
          {t('games.whoAmI.timeLeft', { count: left })}
        </span>
        {board.firstSolver !== null && (
          <span className="wa-first" role="status">
            {board.firstSolver === view.me?.seat ? t('games.whoAmI.youFirst') : t('games.whoAmI.first', { name: name(board.firstSolver) })}
          </span>
        )}
      </div>
      {mine && (
        <>
          <ForeheadCard dialect={board.dialect} category={mine.category} identity={mine.identity} />
          <p className="wa-worth" aria-live="polite">
            {mine.solved
              ? `${t('games.whoAmI.gotIt')} ${t('games.whoAmI.score', { count: mine.points })}`
              : mine.out
                ? t('games.whoAmI.out')
                : `${t('games.whoAmI.worth', { count: whoAmIPoints(mine.asked.length, crossed.length, true) })} · ${t('games.whoAmI.guessesLeft', { count: mine.guessesLeft })}`}
          </p>
          <GuessTiles
            dialect={board.dialect}
            tiles={mine.tiles}
            crossed={crossed}
            right={mine.identity?.id ?? null}
            disabled={!playing || busy}
            onGuess={(tile) => void act({ kind: 'guess', tile })}
          />
          {error && <p className="field-error">{error}</p>}
          <QuestionDeck dialect={board.dialect} questions={mine.questions} asked={mine.asked} disabled={!playing || busy} onAsk={(q) => void act({ kind: 'ask', question: q })} />
        </>
      )}
      <section className="wa-others" aria-labelledby="wa-others-title">
        <h2 id="wa-others-title" className="wa-title">
          {t('games.whoAmI.others')}
        </h2>
        <ul>
          {board.seats
            .filter((s) => s.seat !== view.me?.seat)
            .map((s) => (
              <li key={s.seat} className={`${s.solved ? 'is-solved' : ''}${s.out || s.left ? ' is-out' : ''}`}>
                <span className="wa-other-name">{name(s.seat)}</span>
                <span className="muted">{t('games.whoAmI.seatAsked', { count: s.asked })}</span>
                {s.solved && <span className="wa-chip">{t('games.whoAmI.solved')}</span>}
                {s.out && <span className="wa-chip is-out">{t('games.whoAmI.out')}</span>}
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
