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
import { useLocale, useT } from '../i18n/I18nProvider';
import { storyError } from './api';
import { EnglishToggle, Evidence, ExtraTimeToggle, FromMemoryNote, QuestionCounter, helpDir, optionNumber, questionHelp, typingElsewhere, useTick, type Act, type Announce } from './GameParts';
import { rememberTextSize, rememberedEnglish, rememberedTextSize, showEnglishFor } from './prefs';
import { StoryPlayerBar, StorySpeaker, TextSizeControl } from './ReaderControls';
import { StoryText } from './StoryText';
import type { AnswerOutcome } from './useStoryGame';
import { useStoryAudio } from './useStoryAudio';
import { haptic } from '../lib/haptics';

/** "This question closes soon" shows in the last stretch of an untimed question's cap. */
const CLOSES_SOON_MS = 30_000;
/** "Questions start in about a minute", in the last minute before the reading's hard cap. */
const HARD_CAP_WARNING_MS = 60_000;

/**
 * Everyone reads at their own pace with no clock shown: only how many have finished (never who), after the soft cap
 * that the host may start, and a minute before the hard cap that questions start by themselves. A solo reader starts
 * when ready.
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
  const audio = useStoryAudio(story?.paragraphs ?? NO_PARAGRAPHS, story?.audio ?? NO_AUDIO, story?.voices, false, story?.narration);
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
            {/* Whatever is recorded plays as one track; a partly recorded story says so on the bar. */}
            {audio.track.length > 0 && <StoryPlayerBar audio={audio} />}
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
 * One question: the counter, the prompt (with English under it at level 1 or on request), the options as pills that keys
 * 1–4 answer, and for a timed question a bar announced only at "10 seconds left". The heading takes focus when the
 * question appears, and nothing after. Answers show "Sending…" until the server has them, retry after network failures,
 * then "Answer locked — 2 of 4 answered".
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
  const locale = useLocale();
  const q = view.question;
  const heading = useRef<HTMLHeadingElement>(null);
  const [english, setEnglish] = useState(() => showEnglishFor(view.settings.level, rememberedEnglish()));
  // In the reader's language where translated, else English.
  const help = q ? questionHelp(q, locale, view.settings.dialect) : null;
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

  // The new question's heading takes focus and is announced.
  useEffect(() => {
    if (!q) return;
    heading.current?.focus();
    announce(t('stories.status.question', { index: q.index + 1, total: q.total }));
    // Once per question.
  }, [q?.index]);

  // "10 seconds left", announced once; the count itself is never read out.
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

  // Keys 1–4 answer, unless someone is typing or a dialog is open.
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
          <QuestionCounter id="sg-q-title" ref={heading} index={q.index + 1} total={q.total} />
          {timed && left !== null && (
            <span className={`sg-clock${left <= 10_000 ? ' is-low' : ''}`} aria-hidden>
              <TimerIcon size={16} />
              {Math.ceil(left / 1000)}
            </span>
          )}
        </div>
        {timed && left !== null && ends !== null && (
          <div className={`sg-timebar${left <= 10_000 ? ' is-low' : ''}`} aria-hidden>
            <span style={{ transform: `scaleX(${Math.min(1, left / (view.settings.timerSeconds * (view.extraTime ? 2 : 1) * 1000))})` }} />
          </div>
        )}

        <p className="sg-prompt" lang={lang} dir={dir}>
          {q.prompt}
        </p>
        {help?.prompt && english && (
          <p className="sg-prompt-en" lang={help.lang} dir={helpDir(help.lang)}>
            {help.prompt}
          </p>
        )}
        {help?.prompt && <EnglishToggle on={english} onChange={setEnglish} english={help.lang === 'en'} />}

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
              {english && help?.options?.[i] && (
                <span className="sg-option-tr" lang={help.lang} dir={helpDir(help.lang)}>
                  {help.options[i]}
                </span>
              )}
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

/**
 * A question's answer: the right option marked "Right answer", the viewer's choice, the explanation, and the story's own
 * words where it says so. Duo and group games move on when everyone continues (or after a while); the host cannot skip.
 * Only the verdict and right option are announced.
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
  const locale = useLocale();
  const q = view.question;
  const r = view.reveal;
  const [english, setEnglish] = useState(() => showEnglishFor(view.settings.level, rememberedEnglish()));
  // The reveal carries the question's translations with its explanation.
  const help = q && r ? questionHelp({ promptEn: q.promptEn, explanationEn: r.explanationEn, translations: r.translations ?? q.translations }, locale, view.settings.dialect) : null;
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
    // A buzz with the verdict where the device can, unless no answer was given.
    if (r.myChoice !== null) haptic(r.myCorrect ? 'correct' : 'wrong');
    next.current?.focus();
    // Once per answer.
  }, [r?.index]);

  if (!q || !r) return null;

  async function go(): Promise<void> {
    setBusy(true);
    await act('/continue', { index: r!.index });
    setBusy(false);
  }

  return (
    <section className="sg-reveal" aria-labelledby="sg-r-title">
      <QuestionCounter id="sg-r-title" index={r.index + 1} total={q.total} />
      <p className={`sg-verdict ${r.myCorrect ? 'is-right' : r.myChoice === null ? 'is-none' : 'is-wrong'}`}>
        {r.myCorrect ? <CheckIcon size={20} /> : r.myChoice === null ? null : <CloseIcon size={20} />}
        {r.myCorrect ? t('stories.game.right') : r.myChoice === null ? t('stories.game.noAnswer') : t('stories.game.notThisTime')}
      </p>
      <p className="sg-prompt" lang={lang} dir={dir}>
        {q.prompt}
      </p>
      {help?.prompt && english && (
        <p className="sg-prompt-en" lang={help.lang} dir={helpDir(help.lang)}>
          {help.prompt}
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
              {english && help?.options?.[i] && (
                <span className="sg-option-tr" lang={help.lang} dir={helpDir(help.lang)}>
                  {help.options[i]}
                </span>
              )}
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
      {help?.explanation && english && (
        <p className="sg-explain-en" lang={help.lang} dir={helpDir(help.lang)}>
          {help.explanation}
        </p>
      )}
      {/* The question's own toggle, so the translation can be asked for here too. */}
      {help && (help.prompt || help.explanation) && <EnglishToggle on={english} onChange={setEnglish} english={help.lang === 'en'} />}
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
