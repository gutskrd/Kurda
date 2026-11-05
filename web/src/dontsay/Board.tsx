import { useEffect, useRef, useState } from 'react';
import {
  DONT_SAY_CLUE_LIMITS,
  DONT_SAY_GUESS_LIMITS,
  dialectDirection,
  dontSayClueSlip,
  dontSayGuessSlip,
  meaningIn,
  sameClue,
  type DontSayBoard,
  type DontSayOutcome,
  type DontSayResult,
  type MultiMoveAnswer,
  type MultiView,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { haptic } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/motion';
import type { ApiResult } from '../lib/types';
import { seatNamer } from '../play/MultiRoom';
import { teamName, teamTone } from '../play/TeamPicker';
import { useServerClock } from '../stories/useStoryGame';
import { PartyComposer } from '../party/Composer';
import { PartyTimer, secondsLeft } from '../party/PartyPage';
import { SLIP_KEY, partyTextError } from '../party/text';

export type DontSayView = MultiView<DontSayBoard | null>;
type Move = (body: unknown) => Promise<ApiResult<MultiMoveAnswer<DontSayBoard | null, DontSayOutcome>>>;
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export const RESULT_KEY: Record<DontSayResult, MessageKey> = {
  guessed: 'games.dontSay.result.guessed',
  buzzed: 'games.dontSay.result.buzzed',
  skipped: 'games.dontSay.result.skipped',
  time: 'games.dontSay.result.time',
};

/** A team's name, or in a co-op game the one table everyone plays at. */
export function sideName(board: Pick<DontSayBoard, 'mode'>, team: number, t: Translate): string {
  return board.mode === 'coop' ? t('games.dontSay.together') : teamName(team, t);
}

/**
 * Don't Say the Word!'s own staging, inside the room (play/MultiRoom.tsx):
 *
 * - the teams' scores in their colours, the describing team's lit;
 * - a bar that empties over the turn's minute (after a moment to get ready),
 *   from the server's clock;
 * - the stack of cards: the describer sees the one on top — the word and,
 *   struck through, the words it may not say — and everyone else its back;
 * - the buzzer, which lights and buzzes when a clue says a forbidden word
 *   (its text is never shown); the clues and the guesses for the card in play;
 * - the box for the viewer's part: a clue and Skip for the describer, a guess
 *   for their team, nothing for the other team, who watch;
 * - the cards played so far, each with how it went.
 *
 * Under Reduce Motion the cards do not slide and the buzzer does not shake;
 * the colours say it.
 */
export function DontSayBoardView({ view, skew, move }: { view: DontSayView; skew: number; move: Move }): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const board = view.board;
  const now = useServerClock(skew, view.status === 'active');
  const [still] = useState(prefersReducedMotion);
  const name = seatNamer(view, t);
  const [buzzing, setBuzzing] = useState(false);
  const buzzKey = board?.buzz ? board.buzz.n : 0;
  const seenBuzz = useRef(buzzKey);
  const doneCount = board?.done.length ?? 0;
  const seenDone = useRef(doneCount);

  useEffect(() => {
    if (buzzKey === seenBuzz.current) return;
    seenBuzz.current = buzzKey;
    if (board?.buzz?.seat === view.me?.seat) haptic('wrong');
    setBuzzing(true);
    const timer = setTimeout(() => setBuzzing(false), 900);
    return () => clearTimeout(timer);
  }, [buzzKey, board?.buzz?.seat, view.me?.seat]);
  useEffect(() => {
    if (doneCount > seenDone.current && board?.done.at(-1)?.result === 'guessed' && board.done.at(-1)?.team === view.me?.team) haptic('correct');
    seenDone.current = doneCount;
  }, [doneCount, board, view.me?.team]);

  if (!board) return null;
  const script = dialectDirection(board.dialect);
  const turn = board.turn;
  const ready = turn ? now >= Date.parse(turn.readyAt) : false;
  const seconds = secondsLeft(ready ? turn?.endsAt : turn?.readyAt, now);
  const describer = turn ? name(turn.seat) : '';
  const lastDone = board.done.at(-1);
  const roleLine =
    board.role === 'describer'
      ? t('games.dontSay.youDescribe')
      : board.role === 'guesser'
        ? t('games.dontSay.youGuess', { name: describer })
        : turn
          ? t('games.dontSay.theyDescribe', { name: describer, team: sideName(board, turn.team, t) })
          : '';
  const myGuesses = board.guesses.filter((g) => g.seat === view.me?.seat).map((g) => g.text);

  return (
    <div className={`ds-board${still ? ' is-still' : ''}`}>
      <ul className="ds-scores" aria-label={t('games.dontSay.scores')}>
        {board.teams.map((team) => (
          <li key={team.team} className={`ds-score lp-tone-${teamTone(team.team)}${turn?.team === team.team ? ' is-on' : ''}`}>
            <span className="ds-score-swatch" aria-hidden="true" />
            <span className="ds-score-name">{sideName(board, team.team, t)}</span>
            <span className="ds-score-n">{team.score}</span>
          </li>
        ))}
        {board.goal !== null && <li className="ds-goal">{t('games.dontSay.goal', { count: board.goal })}</li>}
      </ul>

      {turn && (
        <div className={`ds-status lp-tone-${teamTone(turn.team)}`} aria-live="polite">
          <p className="ds-turn">{t('games.dontSay.turn', { n: turn.n, of: turn.of })}</p>
          <p className="ds-role">{ready ? roleLine : t('games.dontSay.getReady')}</p>
          <PartyTimer
            startedAt={ready ? turn.readyAt : turn.startedAt}
            endsAt={ready ? turn.endsAt : turn.readyAt}
            now={now}
            low={ready && board.role !== 'watcher' && seconds <= 5}
            label={t('games.party.timeLeft', { count: seconds })}
          />
        </div>
      )}

      <div className="ds-table">
        <div className={`ds-stack lp-tone-${teamTone(turn?.team)}`} data-drawn={board.drawn}>
          <span className="ds-stack-under" aria-hidden="true" />
          <span className="ds-stack-under is-two" aria-hidden="true" />
          {board.card ? (
            <div className="ds-card is-face" key={board.drawn} role="group" aria-label={t('games.dontSay.card')}>
              <p className="ds-card-target" lang={script.lang} dir={script.dir}>
                {board.card.target}
              </p>
              <p className="ds-card-meaning">{meaningIn(board.card.meanings, locale)}</p>
              <p className="ds-card-label">{t('games.dontSay.forbidden')}</p>
              <ul className="ds-forbidden">
                {board.card.forbidden.map((f) => (
                  <li key={f}>
                    <s lang={script.lang} dir={script.dir}>
                      {f}
                    </s>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="ds-card is-back" key={board.drawn} aria-hidden="true">
              <span className="ds-card-back-mark">?</span>
            </div>
          )}
        </div>
        <div className={`ds-buzzer${buzzing ? ' is-buzzing' : ''}`} aria-hidden="true">
          <span className="ds-buzzer-cap" />
          <span className="ds-buzzer-base" />
        </div>
      </div>
      {board.buzz && buzzing && (
        <p className="ds-buzz-line" role="alert">
          {t('games.dontSay.buzz', { name: name(board.buzz.seat) })}
        </p>
      )}
      {lastDone && lastDone.result === 'guessed' && lastDone.by !== null && (
        <p className="ds-right-line" role="status" key={doneCount}>
          {t('games.dontSay.right', { name: name(lastDone.by) })}{' '}
          <span lang={script.lang} dir={script.dir}>
            {lastDone.target}
          </span>
        </p>
      )}

      <div className="ds-feed">
        <section aria-labelledby="ds-clues-title">
          <h3 id="ds-clues-title" className="ds-section-title">
            {t('games.dontSay.clues')}
          </h3>
          {board.clues.length === 0 ? (
            <p className="muted">{t('games.dontSay.noClues')}</p>
          ) : (
            <ul className="ds-lines">
              {board.clues.map((c) => (
                <li key={c.n} className="ds-line is-clue">
                  <span lang={script.lang} dir={script.dir}>
                    {c.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="ds-guesses-title">
          <h3 id="ds-guesses-title" className="ds-section-title">
            {t('games.dontSay.guesses')}
          </h3>
          {board.guesses.length === 0 ? (
            <p className="muted">—</p>
          ) : (
            <ul className="ds-lines">
              {board.guesses.map((g) => (
                <li key={g.n} className="ds-line is-guess">
                  <span className="ds-line-by">{name(g.seat)}</span>
                  <span lang={script.lang} dir={script.dir}>
                    {g.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {board.role === 'describer' && ready && (
        <div className="ds-describe">
          <PartyComposer
            id="ds-clue"
            label={t('games.dontSay.clue')}
            placeholder={script.dir === 'rtl' ? '…' : t('games.dontSay.cluePlaceholder')}
            sendLabel={t('games.dontSay.sendClue')}
            dialect={board.dialect}
            maxLength={DONT_SAY_CLUE_LIMITS.maxChars}
            slip={(text) => {
              const why = dontSayClueSlip(board, text);
              if (!why) return null;
              if (why === 'says-word') return t('games.dontSay.slip.saysWord');
              const key = SLIP_KEY[why];
              return key ? t(key) : null;
            }}
            onSend={async (clue) => {
              const res = await move({ clue });
              if (res.ok && res.data.outcome.kind === 'buzz') haptic('wrong');
              return res;
            }}
            errorOf={(e) => partyTextError(e, t, 'games.dontSay.slip.saysWord')}
          />
          <SkipButton left={board.skipsLeft ?? 0} move={move} />
        </div>
      )}
      {board.role === 'guesser' && ready && (
        <PartyComposer
          id="ds-guess"
          label={t('games.dontSay.guess')}
          placeholder={script.dir === 'rtl' ? '…' : t('games.dontSay.guessPlaceholder')}
          sendLabel={t('games.dontSay.sendGuess')}
          dialect={board.dialect}
          maxLength={DONT_SAY_GUESS_LIMITS.maxChars}
          slip={(text) => {
            // the same guess twice is no new guess, and the chat's spam check counts repeats
            if (myGuesses.some((g) => sameClue(g, text, board.dialect))) return t('games.dontSay.slip.repeat');
            const why = dontSayGuessSlip(board.dialect, text);
            const key = why ? SLIP_KEY[why] : null;
            return key ? t(key) : null;
          }}
          onSend={(guess) => move({ guess })}
          errorOf={(e) => partyTextError(e, t, 'games.dontSay.slip.saysWord')}
        />
      )}
      {board.role === 'watcher' && turn && <p className="muted ds-watch">{t('games.dontSay.youWatch')}</p>}

      {board.done.length > 0 && <DoneCards board={board} name={name} />}
    </div>
  );
}

function SkipButton({ left, move }: { left: number; move: Move }): React.JSX.Element {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      className="ds-skip"
      disabled={busy || left <= 0}
      onClick={async () => {
        setBusy(true);
        await move({ skip: true });
        setBusy(false);
      }}
    >
      {t('games.dontSay.skip', { count: left })}
    </Button>
  );
}

/** The cards played so far, newest first: the word, what it means, and how it went; their forbidden words once the game is over. */
export function DoneCards({ board, name, title }: { board: DontSayBoard; name: (seat: number) => string; title?: string }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const script = dialectDirection(board.dialect);
  return (
    <section className="ds-done" aria-labelledby="ds-done-title">
      <h3 id="ds-done-title" className="ds-section-title">
        {title ?? t('games.dontSay.done')}
      </h3>
      <ul className="ds-done-list">
        {[...board.done].reverse().map((d, i) => (
          <li key={`${d.turn}:${i}`} className={`ds-done-card lp-tone-${teamTone(d.team)} is-${d.result}`}>
            <span className="ds-done-target" lang={script.lang} dir={script.dir}>
              {d.target}
            </span>
            <span className="ds-done-meaning">{meaningIn(d.meanings, locale)}</span>
            {d.forbidden && (
              <span className="ds-done-forbidden">
                {d.forbidden.map((f) => (
                  <s key={f} lang={script.lang} dir={script.dir}>
                    {f}
                  </s>
                ))}
              </span>
            )}
            <span className="ds-done-result">
              {t(RESULT_KEY[d.result])}
              {d.result === 'guessed' && d.by !== null ? ` · ${name(d.by)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The end: the final scores and how it ended, then every card in full, its forbidden words now shown. */
export function DontSayEnding({ view }: { view: DontSayView }): React.JSX.Element | null {
  const t = useT();
  const board = view.board;
  if (!board) return null;
  const name = seatNamer(view, t);
  const [a, b] = board.teams;
  const line =
    board.mode === 'coop'
      ? (board.teams[0]?.score ?? 0) >= (board.goal ?? 0)
        ? t('games.dontSay.end.goalMet')
        : t('games.dontSay.end.goalMissed', { count: board.teams[0]?.score ?? 0, goal: board.goal ?? 0 })
      : a && b && a.score === b.score
        ? t('games.dontSay.end.draw')
        : t('games.dontSay.end.teamWon', { team: teamName((a && b && a.score > b.score ? a : b)?.team ?? 1, t) });
  const why = board.endedBy === 'deck-empty' ? 'games.dontSay.end.deckEmpty' : board.endedBy === 'too-few' || board.endedBy === 'abandoned' ? 'games.dontSay.end.tooFew' : null;
  return (
    <div className="ds-ending">
      <ul className="ds-scores">
        {board.teams.map((team) => (
          <li key={team.team} className={`ds-score lp-tone-${teamTone(team.team)}`}>
            <span className="ds-score-swatch" aria-hidden="true" />
            <span className="ds-score-name">{sideName(board, team.team, t)}</span>
            <span className="ds-score-n">{team.score}</span>
          </li>
        ))}
      </ul>
      <p className="ds-end-line">{line}</p>
      {why && <p className="muted">{t(why)}</p>}
      {board.done.length > 0 && <DoneCards board={board} name={name} title={t('games.dontSay.recap')} />}
    </div>
  );
}
