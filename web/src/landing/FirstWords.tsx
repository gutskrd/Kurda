import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { CheckIcon, CloseIcon } from '../components/icons';
import { SpeakingCharacter, type CharacterReaction } from '../characters/SpeakingCharacter';
import { FIRST_WORDS } from './samples';
import { Ku } from './parts';
import { learnWord } from './visitor';

/**
 * Three real words learned on the page before anything is asked of the visitor: a word, three meanings, and Xezo, the
 * road's village teacher, meeting each answer calmly, a small nod for a right one and a kind tilt of the head for a
 * miss, nothing that rocks or shakes. A right answer is kept in this browser (visitor.ts), so the closing words can
 * count it. None of these words has a recording in the website's build, so nothing plays.
 */
export function FirstWords(): React.JSX.Element {
  const t = useT();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<MessageKey | null>(null);
  const [right, setRight] = useState(0);
  const [reaction, setReaction] = useState<CharacterReaction | null>(null);
  const done = step >= FIRST_WORDS.length;
  const word = FIRST_WORDS[Math.min(step, FIRST_WORDS.length - 1)]!;
  // A keyboard moves on with the quiz: to the next word's first meaning, or to the words learned at the end.
  const card = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    card.current?.querySelector<HTMLElement>('.fp-answer, .fp-quiz-count')?.focus({ preventScroll: true });
  }, [step]);

  const pick = (key: MessageKey): void => {
    if (picked) return;
    setPicked(key);
    const ok = key === word.right;
    if (ok) {
      learnWord(word.ku);
      setRight((n) => n + 1);
    }
    setReaction(ok ? 'nod' : 'ponder');
  };
  // Each word starts her afresh, so the next answer's reaction plays even when it is the same as the last.
  const next = (): void => {
    moved.current = true;
    setPicked(null);
    setReaction(null);
    setStep((s) => s + 1);
  };
  const again = (): void => {
    moved.current = true;
    setPicked(null);
    setReaction(null);
    setRight(0);
    setStep(0);
  };

  return (
    <div className="fp-words-scene fp-reveal">
      <div className="fp-words-teacher" aria-hidden="true">
        <SpeakingCharacter speaker="xezo" audio={null} crop="bust" decorative reaction={reaction} />
      </div>
      <div className="fp-quiz" ref={card}>
        {done ? (
          <div className="fp-quiz-done">
            <p className="fp-quiz-count" tabIndex={-1}>{t(right === FIRST_WORDS.length ? 'landing.words.allRight' : 'landing.words.done')}</p>
            <ul className="fp-quiz-learned">
              {FIRST_WORDS.map((w) => (
                <li key={w.ku}>
                  <Ku className="fp-quiz-learned-ku">{w.ku}</Ku>
                  <span>{t(w.right)}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-secondary fp-quiz-next" onClick={again}>
              {t('landing.words.again')}
            </button>
          </div>
        ) : (
          <>
            <div className="fp-quiz-top">
              <span className="fp-quiz-steps" aria-hidden="true">
                {FIRST_WORDS.map((w, i) => (
                  <span key={w.ku} className={`fp-quiz-step${i < step ? ' is-done' : i === step ? ' is-on' : ''}`} />
                ))}
              </span>
              <span className="fp-quiz-of">{t('landing.words.of', { n: step + 1, total: FIRST_WORDS.length })}</span>
            </div>
            <p className="fp-quiz-word" key={word.ku}>
              <Ku>{word.ku}</Ku>
            </p>
            <p className="fp-quiz-ask" id="fp-quiz-ask">
              {t('landing.words.ask')}
            </p>
            <div className="fp-quiz-options" role="group" aria-labelledby="fp-quiz-ask">
              {word.options.map((o) => {
                const state = !picked ? '' : o === word.right ? ' is-right' : o === picked ? ' is-wrong' : ' is-out';
                return (
                  <button key={o} type="button" className={`fp-answer${state}`} onClick={() => pick(o)} aria-disabled={picked ? true : undefined}>
                    <span>{t(o)}</span>
                    {picked && o === word.right && <CheckIcon size={18} weight="bold" />}
                    {picked && o === picked && o !== word.right && <CloseIcon size={18} />}
                  </button>
                );
              })}
            </div>
            {/*
              Its place is kept before an answer, as tall as the longest thing it will ever say: every word's answer
              lies in the same spot, unseen, under the one shown, so neither the card nor Xezo beside it moves.
            */}
            <div className="fp-quiz-after">
              {FIRST_WORDS.map((w) => (
                <p key={w.ku} className="fp-quiz-say fp-quiz-room" aria-hidden="true">
                  <strong>{t('landing.words.notQuite', { meaning: t(w.right) })}</strong> {t(w.note)}
                </p>
              ))}
              <p className="fp-quiz-say" aria-live="polite">
                {picked && (
                  <>
                    <strong>{t(picked === word.right ? 'landing.words.right' : 'landing.words.notQuite', { meaning: t(word.right) })}</strong>{' '}
                    {t(word.note)}
                  </>
                )}
              </p>
              <div className="fp-quiz-next-place">
                {picked && (
                  <button type="button" className="btn btn-primary fp-quiz-next" onClick={next}>
                    {t(step + 1 < FIRST_WORDS.length ? 'landing.words.next' : 'landing.words.finish')}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
