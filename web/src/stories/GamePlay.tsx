import { useCallback, useEffect, useRef, useState } from 'react';
import {
  storyTextDirection,
  type StoryDetail,
  type StoryGameView,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { BookIcon, CheckIcon, CloseIcon, TimerIcon } from '../components/icons';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useT } from '../i18n/I18nProvider';
import { storyError } from './api';
import { EnglishToggle, Evidence, ExtraTimeToggle, FromMemoryNote, optionNumber, typingElsewhere, useTick, type Act, type Announce } from './GameParts';
import { rememberTextSize, rememberedEnglish, rememberedTextSize, showEnglishFor } from './prefs';
import { StoryPlayerBar, StorySpeaker, TextSizeControl } from './ReaderControls';
import { StoryText } from './StoryText';
import type { AnswerOutcome } from './useStoryGame';
import { useStoryAudio } from './useStoryAudio';
import { haptic } from '../lib/haptics';

/** "This question closes soon" shows in the last stretch of an untimed question's cap. */
const CLOSES_SOON_MS = 30_000;
/** "Questions start in about a minute" in the last minute before the reading's hard cap. */
const HARD_CAP_WARNING_MS = 60_000;

// ---------------------------------------------------------------------------
// reading

/**
 * Everyone reads at their own pace (contract §A1). Nobody is shown a clock:
 * only how many have finished — never who — and, after the soft cap, that the
 * host may start the questions; a minute before the hard cap, that they will
 * start on their own. A solo reader starts the questions when ready.
 */
export function GameReading({
  view,
  story,
  act,
  skew,
  announce,
}: {
  view: StoryGameView;
  story: StoryDetail | null;
  act: Act;
  skew: number;
  announce: Announce;
}): React.JSX.Element {
  const t = useT();
  const [size, setSize] = useState(rememberedTextSize);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audio = useStoryAudio(story?.paragraphs ?? NO_PARAGRAPHS, story?.audio ?? NO_AUDIO, story?.voices);
  const solo = view.mode === 'solo';
  const soft = view.readingSoftCapAt ? Date.parse(view.readingSoftCapAt) : null;
  const hard = view.readingHardCapAt ? Date.parse(view.readingHardCapAt) : null;
  useTick(!solo && (soft !== null || hard !== null));
  const now = Date.now() + skew;
  const afterSoft = soft !== null && now >= soft;
  const nearHard = hard !== null && hard - now <= HARD_CAP_WARNING_MS;

  const saidSoft = useRef(false);
  useEffect(() => {
    if (afterSoft && !saidSoft.current) {
      saidSoft.current = true;
      announce(t('stories.game.hostCanStart'));
    }
  }, [afterSoft, announce, t]);

  async function done(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await act('/done-reading');
    setBusy(false);
    if (!res.ok) setError(storyError(res.error, t));
    else if (!solo) announce(t('stories.game.doneWaiting', { done: res.data.readingDoneCount, total: res.data.activeCount }));
  }

  async function startQuestions(): Promise<void> {
    setBusy(true);
    const res = await act('/advance', { from: { status: 'reading', index: 0 } });
    setBusy(false);
    if (!res.ok) setError(storyError(res.error, t));
  }

  return (
    <section className="sg-reading" aria-labelledby="sg-reading-title">
      <h2 id="sg-reading-title" className="sr-only">
        {t('stories.game.reading')}
      </h2>
      <FromMemoryNote view={view} />
      {story ? (
        <>
          <div className="story-tools">
            <StorySpeaker audio={audio} />
            <TextSizeControl
              step={size}
              onChange={(n) => {
                setSize(n);
                rememberTextSize(n);
              }}
            />
            {story.fullyNarrated && <StoryPlayerBar audio={audio} />}
          </div>
          <StoryText paragraphs={story.paragraphs} glossary={story.glossary} dialect={story.dialect} textSize={size} audio={audio} />
        </>
      ) : (
        <div className="sg-text-loading" aria-hidden />
      )}

      <div className="sg-dock" role="region" aria-label={t('stories.game.readingStatus')}>
        <div className="sg-dock-text">
          {!solo && (
            <span className="sg-count">
              {t('stories.game.finishedCount', { done: view.readingDoneCount, total: view.activeCount })}
            </span>
          )}
          {!solo && nearHard ? (
            <span className="sg-dock-note">{t('stories.game.startsSoon')}</span>
          ) : !solo && afterSoft ? (
            <span className="sg-dock-note">{t('stories.game.hostCanStart')}</span>
          ) : null}
          {error && (
            <span className="sg-dock-error" role="alert">
              {error}
            </span>
          )}
        </div>
        <div className="sg-dock-actions">
          {view.isHost && !solo && afterSoft && (
            <Button variant="secondary" disabled={busy} onClick={() => void startQuestions()}>
              {t('stories.game.startQuestions')}
            </Button>
          )}
          {view.meDoneReading && !solo ? (
            <span className="sg-done-mark">
              <CheckIcon size={16} />
              {t('stories.game.youFinished')}
            </span>
          ) : (
            <Button disabled={busy} onClick={() => void done()}>
              {solo ? t('stories.game.startQuestions') : t('stories.game.finishedReading')}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

const NO_PARAGRAPHS: string[] = [];
const NO_AUDIO: Record<string, string> = {};

// ---------------------------------------------------------------------------
// a question

/** The story beside the question (wide screens) or behind a "Story" button (phones). */
function StoryPane({ story, size, wide, label }: { story: StoryDetail; size: number; wide: boolean; label: string }): React.JSX.Element {
  if (wide) {
    return (
      <aside className="sg-pane" aria-label={label}>
        <StoryText paragraphs={story.paragraphs} glossary={story.glossary} dialect={story.dialect} textSize={size} />
      </aside>
    );
  }
  return <StoryText paragraphs={story.paragraphs} glossary={story.glossary} dialect={story.dialect} textSize={size} />;
}

/**
 * One question (contract §A1): its number, the prompt (and English under it
 * at level 1, or when asked for), the options numbered 1–4 — the keys 1–4
 * answer on a keyboard — and, for a timed question, a bar and a count that
 * are only ever announced at "10 seconds left". The heading takes the focus
 * when the question appears, and nothing takes it after.
 *
 * Sending is careful: "Sending…" until the server has it, the same answer
 * again after a network failure, then "Answer locked — 2 of 4 answered".
 */
export function GameQuestion({
  view,
  story,
  act,
  answer,
  skew,
  announce,
}: {
  view: StoryGameView;
  story: StoryDetail | null;
  act: Act;
  answer: (index: number, choice: number) => Promise<AnswerOutcome>;
  skew: number;
  announce: Announce;
}): React.JSX.Element | null {
  const t = useT();
  const q = view.question;
  const heading = useRef<HTMLHeadingElement>(null);
  const [english, setEnglish] = useState(() => showEnglishFor(view.settings.level, rememberedEnglish()));
  const [sending, setSending] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const wide = useMediaQuery('(min-width: 1000px)');
  const size = rememberedTextSize();
  const timed = view.settings.timerSeconds > 0;
  const ends = view.phaseEndsAt ? Date.parse(view.phaseEndsAt) : null;
  useTick(ends !== null);
  const left = ends !== null ? Math.max(0, ends - (Date.now() + skew)) : null;
  const locked = q?.myChoice !== null && q?.myChoice !== undefined;
  const visibleText = view.settings.textDuring === 'visible' && story !== null;
  const { lang, dir } = storyTextDirection(view.settings.dialect);

  // the new question's heading takes the focus, and is said
  useEffect(() => {
    if (!q) return;
    heading.current?.focus();
    announce(t('stories.status.question', { index: q.index + 1, total: q.total }));
    // once per question: a new index is a new question
  }, [q?.index]);

  // "10 seconds left", said once; the count itself is never read out
  const saidTen = useRef(false);
  useEffect(() => {
    if (timed && left !== null && left <= 10_000 && left > 0 && !locked && !saidTen.current) {
      saidTen.current = true;
      announce(t('stories.game.tenSeconds'));
    }
  }, [timed, left, locked, announce, t]);

  const choose = useCallback(
    async (choice: number) => {
      if (!q || locked || sending !== null) return;
      setSending(choice);
      setProblem(null);
      const outcome = await answer(q.index, choice);
      setSending(null);
      if (outcome === 'ok') {
        if (view.mode !== 'solo') announce(t('stories.game.locked'));
      } else if (outcome === 'late') {
        setProblem(t('stories.error.tooLate'));
        announce(t('stories.error.tooLate'));
      } else if (outcome !== 'moved') {
        setProblem(storyError({ kind: 'client', code: outcome.error, status: outcome.status, message: '' }, t));
      }
    },
    [q, locked, sending, answer, view.mode, announce, t],
  );

  // keys 1–4 answer, unless someone is typing or a dialog is open
  useEffect(() => {
    if (!q || locked) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || typingElsewhere(e)) return;
      const n = optionNumber(e);
      if (n !== null && n <= q.options.length) {
        e.preventDefault();
        void choose(n - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, locked, choose]);

  if (!q) return null;
  const untimedShared = !timed && view.mode !== 'solo';
  const closesSoon = untimedShared && left !== null && left <= CLOSES_SOON_MS;
  const pick = q.myChoice ?? sending;

  return (
    <section className={`sg-question${wide && visibleText ? ' is-split' : ''}`} aria-labelledby="sg-q-title">
      {wide && visibleText && story && <StoryPane story={story} size={size} wide label={t('stories.game.storyPane')} />}
      <div className="sg-q">
        <div className="sg-q-top">
          <h2 id="sg-q-title" ref={heading} tabIndex={-1} className="sg-q-title">
            {t('stories.status.question', { index: q.index + 1, total: q.total })}
          </h2>
          {timed && left !== null && (
            <span className={`sg-clock${left <= 10_000 ? ' is-low' : ''}`} aria-hidden>
              <TimerIcon size={16} />
              {Math.ceil(left / 1000)}
            </span>
          )}
        </div>
        {timed && left !== null && ends !== null && (
          <div className="sg-timebar" aria-hidden>
            <span style={{ transform: `scaleX(${Math.min(1, left / (view.settings.timerSeconds * (view.extraTime ? 2 : 1) * 1000))})` }} />
          </div>
        )}

        <p className="sg-prompt" lang={lang} dir={dir}>
          {q.prompt}
        </p>
        {q.promptEn && english && (
          <p className="sg-prompt-en" lang="en" dir="ltr">
            {q.promptEn}
          </p>
        )}
        {q.promptEn && <EnglishToggle on={english} onChange={setEnglish} />}

        <div className="sg-options" role="group" aria-labelledby="sg-q-title">
          {q.options.map((option, i) => (
            <button
              key={i}
              type="button"
              className={`sg-option${pick === i ? ' is-picked' : ''}`}
              disabled={locked || sending !== null}
              aria-pressed={pick === i}
              onClick={() => void choose(i)}
            >
              <span className="sg-key" aria-hidden>
                {i + 1}
              </span>
              <span className="sg-option-text" lang={lang} dir={dir}>
                {option}
              </span>
            </button>
          ))}
        </div>

        <p className="sg-status" aria-hidden={sending === null && !locked}>
          {sending !== null
            ? t('stories.game.sending')
            : locked && view.mode !== 'solo'
              ? t('stories.game.lockedCount', { done: view.answeredCount, total: view.activeCount })
              : ''}
        </p>
        {problem && (
          <p className="msg msg-error" role="alert">
            {problem}
          </p>
        )}
        {closesSoon && <p className="sg-note">{t('stories.game.closesSoon')}</p>}

        <div className="sg-q-foot">
          {visibleText && !wide && (
            <Button variant="secondary" size="sm" onClick={() => setStoryOpen(true)}>
              <BookIcon size={16} />
              {t('stories.game.story')}
            </Button>
          )}
          {untimedShared && view.isHost && (
            <Button variant="ghost" size="sm" onClick={() => void act('/advance', { from: { status: 'question', index: q.index } })}>
              {t('stories.game.revealNow')}
            </Button>
          )}
          <ExtraTimeToggle view={view} act={act} />
        </div>
      </div>

      {storyOpen && story && (
        <Modal open onClose={() => setStoryOpen(false)} label={t('stories.game.storyPane')}>
          <div className="sg-sheet">
            <StoryPane story={story} size={size} wide={false} label={t('stories.game.storyPane')} />
          </div>
        </Modal>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// the answer

/**
 * The answer to a question (contract §A1): the right option with a mark and
 * the words "Right answer", the viewer's own choice marked, the one-line
 * explanation, and where the story says so, quoted. A duo or group moves on
 * when everyone has continued (or after a while); the host cannot skip it.
 * Only the verdict and the right option are announced.
 */
export function GameReveal({
  view,
  story,
  act,
  announce,
}: {
  view: StoryGameView;
  story: StoryDetail | null;
  act: Act;
  announce: Announce;
}): React.JSX.Element | null {
  const t = useT();
  const q = view.question;
  const r = view.reveal;
  const [english, setEnglish] = useState(() => showEnglishFor(view.settings.level, rememberedEnglish()));
  const [busy, setBusy] = useState(false);
  const next = useRef<HTMLButtonElement>(null);
  const { lang, dir } = storyTextDirection(view.settings.dialect);
  const solo = view.mode === 'solo';
  const last = r !== null && q !== null && r.index + 1 >= q.total;

  useEffect(() => {
    if (!q || !r) return;
    const right = q.options[r.correctIndex] ?? '';
    const verdict =
      r.myCorrect === true ? t('stories.game.right') : r.myChoice === null ? t('stories.game.noAnswer') : t('stories.game.notThisTime');
    announce(t('stories.game.revealSaid', { verdict, answer: right }));
    // felt as the verdict on your answer is shown, on a touch screen that can; nothing when you gave none
    if (r.myChoice !== null) haptic(r.myCorrect ? 'correct' : 'wrong');
    next.current?.focus();
    // once per answer
  }, [r?.index]);

  if (!q || !r) return null;

  async function go(): Promise<void> {
    setBusy(true);
    await act('/continue', { index: r!.index });
    setBusy(false);
  }

  return (
    <section className="sg-reveal" aria-labelledby="sg-r-title">
      <h2 id="sg-r-title" className="sg-q-title">
        {t('stories.status.question', { index: r.index + 1, total: q.total })}
      </h2>
      <p className={`sg-verdict ${r.myCorrect ? 'is-right' : r.myChoice === null ? 'is-none' : 'is-wrong'}`}>
        {r.myCorrect ? <CheckIcon size={20} /> : r.myChoice === null ? null : <CloseIcon size={20} />}
        {r.myCorrect ? t('stories.game.right') : r.myChoice === null ? t('stories.game.noAnswer') : t('stories.game.notThisTime')}
      </p>
      <p className="sg-prompt" lang={lang} dir={dir}>
        {q.prompt}
      </p>
      {q.promptEn && english && (
        <p className="sg-prompt-en" lang="en" dir="ltr">
          {q.promptEn}
        </p>
      )}
      <ul className="sg-options is-revealed">
        {q.options.map((option, i) => {
          const right = i === r.correctIndex;
          const mine = i === r.myChoice;
          return (
            <li key={i} className={`sg-option${right ? ' is-right' : mine ? ' is-wrong' : ' is-dim'}`}>
              <span className="sg-key" aria-hidden>
                {right ? <CheckIcon size={16} /> : mine ? <CloseIcon size={16} /> : i + 1}
              </span>
              <span className="sg-option-text" lang={lang} dir={dir}>
                {option}
              </span>
              {(right || mine) && (
                <span className="sg-option-tag">
                  {right && mine ? t('stories.game.yourRight') : right ? t('stories.game.rightAnswer') : t('stories.game.yourAnswer')}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {r.explanation && (
        <p className="sg-explain" lang={lang} dir={dir}>
          {r.explanation}
        </p>
      )}
      {r.explanationEn && english && (
        <p className="sg-explain-en" lang="en" dir="ltr">
          {r.explanationEn}
        </p>
      )}
      {/* the question's own choice, so English can be asked for here too */}
      {(q.promptEn || r.explanationEn) && <EnglishToggle on={english} onChange={setEnglish} />}
      <Evidence story={story} paragraph={r.evidenceParagraph} sentence={r.evidenceSentence} />

      {!solo && (
        <p className="sg-count">
          {t('stories.game.gotIt', { right: r.correctCount, total: r.answeredCount })} · {t('stories.game.seeAgain')}
        </p>
      )}

      <div className="sg-actions">
        {view.meContinued && !solo ? (
          <p className="sg-wait">{t('stories.game.waitingOthers', { done: view.continuedCount, total: view.activeCount })}</p>
        ) : (
          <button ref={next} type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void go()}>
            {last ? t('stories.game.seeResults') : solo ? t('stories.game.next') : t('stories.continue')}
          </button>
        )}
      </div>
    </section>
  );
}
