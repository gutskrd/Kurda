import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  characterSvg,
  dialectDirection,
  learnGame,
  meaningIn,
  type DetectiveBoardView,
  type DetectiveCorrection,
  type DetectiveHint,
  type DetectiveItemView,
  type EvidenceKind,
  type GameDialect,
  type SoloResults,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { AccuseIcon, HintIcon, MailIcon, NoteIcon, NotebookIcon, OverheardIcon, PinIcon, StatementIcon, UserIcon } from '../components/icons';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { describeError } from '../lib/api';
import { PlayButton } from '../learn/PlayButton';
import { SoloGameShell, type SoloRound } from './SoloGameShell';
import { useAvailability, useGameDialect } from './soloRounds';
import { GameArt } from './GameArt';
import './detective.css';

/**
 * Kurdish Detective (/app/games/detective).
 *
 * The stage is a case board: the case file's title and story at the top, the
 * suspects' portraits (the app's own characters where one plays a suspect,
 * a plain silhouette for anyone else), and the evidence pinned up in rows —
 * messages, statements, notes, and talk overheard with its recording — each
 * in its Kurdish only, with "Meaning not found yet" where its meaning would
 * be. Beside it the question in hand and the notebook, which fills with each
 * deduction made and the cards that prove it. On a phone the question comes
 * first and the board under it, so the player knows what to look for.
 *
 * A card's meaning is found by the deduction it proves (the correction
 * brings it, and the board keeps it) or bought with a hint, as is the case's
 * next written hint; each hint costs a point of XP at the finish, and the
 * board says so before it is spent. A wrong first try marks the cards to read
 * again. The verdict and the way on come right under the question
 * (`feedbackInRound`), not under the board. The accusation is the last item:
 * the suspects become the buttons, and once it is made the solution walks
 * back through every deduction.
 *
 * The board is the round's (`board`), kept here as it changes: what a hint
 * bought comes back from the server as the whole board, and what a deduction
 * found is added from its correction. Soranî evidence reads right to left.
 * Nothing on the board moves.
 */

type Round = SoloRound<DetectiveItemView, DetectiveHint, DetectiveCorrection, DetectiveBoardView>;
type Board = DetectiveBoardView;
type Suspect = Board['suspects'][number];

const TONE = learnGame('detective').tone;

const KIND_KEY: Record<EvidenceKind, MessageKey> = {
  message: 'games.detective.kind.message',
  statement: 'games.detective.kind.statement',
  overheard: 'games.detective.kind.overheard',
  note: 'games.detective.kind.note',
};

const KIND_ICON: Record<EvidenceKind, (p: { size?: number }) => React.JSX.Element> = {
  message: MailIcon,
  statement: StatementIcon,
  overheard: OverheardIcon,
  note: NoteIcon,
};

/** A suspect's portrait: the character who plays them, drawn from the art kit, or a plain silhouette with their initial. */
export function Portrait({ suspect, size = 64 }: { suspect: Pick<Suspect, 'id' | 'name' | 'portrait'>; size?: number }): React.JSX.Element {
  const svg = useMemo(
    () => (suspect.portrait ? { __html: characterSvg(suspect.portrait, { crop: 'head', width: size, idPrefix: `dt-${suspect.id}`, title: suspect.name }) } : null),
    [suspect.portrait, suspect.id, suspect.name, size],
  );
  if (svg) return <span className="dt-portrait" style={{ width: size, height: size }} aria-hidden dangerouslySetInnerHTML={svg} />;
  return (
    <span className="dt-portrait dt-portrait--plain" style={{ width: size, height: size }} aria-hidden>
      <UserIcon size={Math.round(size * 0.55)} />
      <span className="dt-initial">{[...suspect.name][0] ?? ''}</span>
    </span>
  );
}

/** The board as it stands: the round's, with what hints bought and deductions found since. */
function useBoard(round: Round): { board: Board | null; spend: (evidence?: string) => Promise<void>; spending: boolean; error: string | null } {
  const t = useT();
  const { client } = useAuth();
  const [board, setBoard] = useState<Board | null>(round.board);
  const [spending, setSpending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { result, sessionId } = round;

  // a deduction made finds the cards it rests on, and goes in the notebook
  useEffect(() => {
    const c = result?.done ? result.correction : null;
    if (!c) return;
    setBoard((b) => {
      if (!b) return b;
      const found = new Map(c.evidence.map((e) => [e.id, e.meanings]));
      const notebook = c.entry && !b.notebook.some((n) => n.step === c.entry!.step) ? [...b.notebook, c.entry] : b.notebook;
      return { ...b, notebook, evidence: b.evidence.map((e) => (found.has(e.id) ? { ...e, meanings: found.get(e.id)! } : e)) };
    });
  }, [result]);

  const spend = useCallback(
    async (evidence?: string) => {
      setSpending(true);
      setError(null);
      const res = await client.post<{ board: Board }>(`/games/solo/sessions/${sessionId}/hints`, evidence ? { evidence } : {});
      setSpending(false);
      if (res.ok) setBoard(res.data.board);
      else setError(describeError(res.error, t));
    },
    [client, sessionId, t],
  );
  return { board, spend, spending, error };
}

function CaseFile({
  board,
  dialect,
  look,
  spend,
  spending,
}: {
  board: Board;
  dialect: GameDialect;
  look: readonly string[];
  spend: (evidence?: string) => void;
  spending: boolean;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const name = (id: string | null) => board.suspects.find((s) => s.id === id)?.name ?? null;
  const canSpend = board.hintsLeft > 0 && !spending;
  const script = dialectDirection(dialect);
  return (
    <section className="dt-board" aria-labelledby="dt-board-title">
      <h2 id="dt-board-title" className="dt-board-title">
        {t('games.detective.board')}
      </h2>
      <h3 className="dt-section">{t('games.detective.suspects')}</h3>
      <ul className="dt-suspects">
        {board.suspects.map((s) => (
          <li key={s.id} className="dt-suspect">
            <Portrait suspect={s} />
            <span className="dt-suspect-name">{s.name}</span>
            <span className="dt-suspect-about">{meaningIn(s.about, locale) ?? s.about.en}</span>
          </li>
        ))}
      </ul>
      <h3 className="dt-section">{t('games.detective.evidence')}</h3>
      <ul className="dt-cards">
        {board.evidence.map((e, i) => {
          const Kind = KIND_ICON[e.kind];
          const from = name(e.from);
          return (
            <li key={e.id} className={`dt-card dt-card--${e.kind}${look.includes(e.id) ? ' is-look' : ''}`} style={{ ['--tilt' as string]: `${((i % 3) - 1) * 0.8}deg` }}>
              <span className="dt-pin" aria-hidden>
                <PinIcon size={18} />
              </span>
              <span className="dt-card-kind">
                <Kind size={16} /> {t(KIND_KEY[e.kind])}
                {from && <span className="dt-card-from"> · {t('games.detective.from', { name: from })}</span>}
              </span>
              <p className="dt-card-ku" lang={script.lang} dir={script.dir}>
                {e.ku}
              </p>
              {e.audio && <PlayButton src={e.audio.src} label={t('games.detective.listen')} />}
              {e.meanings ? (
                <p className="dt-card-meaning" lang={locale} dir="auto">
                  {meaningIn(e.meanings, locale) ?? e.meanings.en}
                </p>
              ) : (
                <p className="dt-card-unknown">
                  <span>{t('games.detective.unknown')}</span>
                  <button type="button" className="dt-translate" onClick={() => spend(e.id)} disabled={!canSpend}>
                    <HintIcon size={16} /> {t('games.detective.translate')}
                  </button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Notebook({ board }: { board: Board }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  return (
    <section className="dt-notebook" aria-labelledby="dt-notebook-title">
      <h2 id="dt-notebook-title" className="dt-notebook-title">
        <NotebookIcon size={20} /> {t('games.detective.notebook')}
      </h2>
      {board.notebook.length === 0 ? (
        <p className="dt-muted">{t('games.detective.notebookEmpty')}</p>
      ) : (
        <ol className="dt-notes">
          {board.notebook.map((n) => (
            <li key={n.step} className="dt-note">
              <span className="dt-note-q">{meaningIn(n.prompt, locale) ?? n.prompt.en}</span>
              <span className="dt-note-a">{meaningIn(n.answer, locale) ?? n.answer.en}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Question({ round, board }: { round: Round; board: Board }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { item, result, busy, submit, feedback } = round;
  const [picked, setPicked] = useState<number | null>(null);
  const done = result?.done === true;
  const locked = done || busy;
  useEffect(() => setPicked(null), [item.index]);
  useEffect(() => {
    if (result && !result.correct && !result.done) setPicked(null);
  }, [result]);
  const right = done ? (result?.correction?.correctIndex ?? -1) : -1;
  const mark = (i: number) => (done ? (i === right ? ' is-right' : i === picked ? ' is-wrong' : ' is-dim') : picked === i ? ' is-picked' : '');
  const steps = board.steps;

  if (item.kind === 'accuse') {
    const correction = done ? result?.correction : null;
    const culprit = board.suspects.find((s) => s.id === correction?.culprit);
    return (
      <section className="dt-question dt-question--accuse" aria-labelledby="dt-question-title">
        <h2 id="dt-question-title" className="dt-question-title">
          <AccuseIcon size={22} /> {t('games.detective.accuse')}
        </h2>
        <p className="dt-muted">{t('games.detective.accuseHelp')}</p>
        <div className="dt-accused" role="group" aria-label={t('games.detective.suspects')}>
          {item.suspects.map((id, i) => {
            const s = board.suspects.find((x) => x.id === id);
            if (!s) return null;
            return (
              <button key={id} type="button" className={`dt-accuse${mark(i)}`} aria-pressed={!done ? picked === i : undefined} disabled={locked} onClick={() => setPicked(i)}>
                <Portrait suspect={s} size={56} />
                <span>{s.name}</span>
              </button>
            );
          })}
        </div>
        {!done && (
          <Button onClick={() => picked !== null && void submit({ choice: picked })} disabled={locked || picked === null}>
            {result && !result.correct ? t('games.solo.tryAgain') : t('games.detective.accuseButton')}
          </Button>
        )}
        {feedback}
        {correction && (
          <div className="dt-solution">
            <h3 className="dt-solution-title">{t('games.detective.solution')}</h3>
            {culprit && (
              <p className="dt-culprit">
                <Portrait suspect={culprit} size={48} /> {t('games.detective.culprit', { name: culprit.name })}
              </p>
            )}
            {correction.solution && <p className="dt-solution-text">{meaningIn(correction.solution, locale) ?? correction.solution.en}</p>}
            {correction.walk && (
              <ol className="dt-walk">
                {correction.walk.map((w) => (
                  <li key={w.step}>
                    <span className="dt-note-q">{meaningIn(w.prompt, locale) ?? w.prompt.en}</span>
                    <span className="dt-note-a">{meaningIn(w.answer, locale) ?? w.answer.en}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="dt-question" aria-labelledby="dt-question-title">
      <p className="dt-step-count">{t('games.detective.step', { n: item.index + 1, total: steps })}</p>
      <h2 id="dt-question-title" className="dt-question-title">
        {meaningIn(item.prompt, locale) ?? item.prompt.en}
      </h2>
      <div className="dt-options" role="group" aria-label={t('games.detective.options')}>
        {item.options.map((o, i) => (
          <button key={i} type="button" className={`dt-option${mark(i)}`} aria-pressed={!done ? picked === i : undefined} disabled={locked} onClick={() => setPicked(i)}>
            {meaningIn(o, locale) ?? o.en}
          </button>
        ))}
      </div>
      {result?.hint && !done && <p className="dt-look">{t('games.detective.look')}</p>}
      {!done && (
        <Button onClick={() => picked !== null && void submit({ choice: picked })} disabled={locked || picked === null}>
          {result && !result.correct ? t('games.solo.tryAgain') : t('games.solo.check')}
        </Button>
      )}
      {done && result?.correction?.entry && <p className="dt-noted">{t('games.detective.noted')}</p>}
      {feedback}
    </section>
  );
}

function CaseRound({ round, dialect }: { round: Round; dialect: GameDialect }): React.JSX.Element | null {
  const t = useT();
  const { locale } = useI18n();
  const { board, spend, spending, error } = useBoard(round);
  if (!board) return null;
  const look = round.result && !round.result.done ? (round.result.hint?.look ?? []) : [];
  return (
    <div className={`dt-case lp-tone-${TONE}`}>
      <header className="dt-file">
        <h2 className="dt-title">{meaningIn(board.title, locale) ?? board.title.en}</h2>
        <p className="dt-intro">{meaningIn(board.intro, locale) ?? board.intro.en}</p>
      </header>
      {/* the question first, then the board it is answered from: on a wide screen the board takes the left column */}
      <div className="dt-layout">
        <Question round={round} board={board} />
        <CaseFile board={board} dialect={dialect} look={look} spend={(e) => void spend(e)} spending={spending} />
        <section className="dt-hints" aria-labelledby="dt-hints-title">
          <h2 id="dt-hints-title" className="dt-hints-title">
            <HintIcon size={20} /> {t('games.detective.hintsLeft', { n: board.hintsLeft })}
          </h2>
          <p className="dt-muted">{t('games.detective.hintCost')}</p>
          {board.hints.map((h, i) => (
            <p key={i} className="dt-hint">
              {meaningIn(h, locale) ?? h.en}
            </p>
          ))}
          <Button variant="secondary" size="sm" onClick={() => void spend()} disabled={spending || board.hintsLeft === 0 || !board.moreHints}>
            {t('games.detective.hint')}
          </Button>
          {error && <p className="field-error">{error}</p>}
        </section>
        <Notebook board={board} />
      </div>
    </div>
  );
}

export function Detective(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const dialect: GameDialect = useGameDialect();
  const availability = useAvailability(dialect);
  const [open, setOpen] = useState<string | null>(null);
  const [deducted, setDeducted] = useState(0);

  useEffect(() => {
    let live = true;
    void client.get<{ id: string | null }>(`/games/solo/open?game=detective&dialect=${dialect}`).then((res) => {
      if (live && res.ok) setOpen(res.data.id);
    });
    return () => {
      live = false;
    };
  }, [client, dialect]);

  const game = availability?.games.find((g) => g.id === 'detective');
  const difficulties = availability ? (game?.difficulties ?? []) : null;

  return (
    <div className="container solo-page dt-page">
      <SoloGameShell<DetectiveItemView, DetectiveHint, DetectiveCorrection, DetectiveBoardView>
        game="detective"
        dialect={dialect}
        title={t('games.detective.name')}
        blurb={t('games.detective.intro')}
        intro={<GameArt game="detective" size={132} moving />}
        difficulties={difficulties}
        open={open}
        renderRound={(round) => <CaseRound key={round.sessionId} round={round} dialect={dialect} />}
        feedbackInRound
        explain={(why) => (why === 'step' ? t('games.detective.why.step') : why === 'accuse' ? t('games.detective.why.accuse') : null)}
        onFinished={(results: SoloResults) => setDeducted(results.deducted ?? 0)}
        resultsExtra={deducted > 0 ? <p className="dt-deducted">{t('games.detective.deducted', { xp: deducted })}</p> : null}
      />
    </div>
  );
}
