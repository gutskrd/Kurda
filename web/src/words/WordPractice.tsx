import { useCallback, useEffect, useRef, useState } from 'react';
import { askWordAgain, makeWordRound, wordIn, type AlphabetScript, type AppLocale, type SetWord, type WordQuestion, type WordSetId } from '@kurda/shared';
import { currentWordSounds, play, spokenAlphabet, useRecordings, wordSound } from '../alphabet/audio';
import { Sound } from '../alphabet/Sound';
import { Button } from '../components/Button';
import { CharacterStage, STAGE } from '../characters/CharacterStage';
import type { SpokenClip } from '../characters/clips';
import type { CharacterReaction } from '../characters/SpeakingCharacter';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { DayName, Digits, MeaningText, Swatch, WordText, meaningOf } from './parts';

/**
 * "Check yourself" for a word set: a round of eight short questions made in
 * @kurda/shared (`makeWordRound` says how and why), drawn the way the
 * alphabet's round is (alphabet/Practice.tsx) — a miss shows the right answer
 * with its sound at once and comes back later in the round; nothing is scored,
 * saved or ranked, and the end names the words to look at again, with a round
 * of just those. Keys 1–3 answer and Enter goes on, so a reader at a keyboard
 * never has to reach for the mouse.
 */

interface Item {
  q: WordQuestion;
  /** a miss coming back later in the round; it does not count toward the score */
  retry: boolean;
}

/** How far back a missed question comes: far enough to be recalled, not just remembered. */
const COMEBACK = 3;

/** What each kind asks, by set where the set changes the question. */
function askKey(q: WordQuestion): MessageKey {
  const by = (colour: MessageKey, number: MessageKey, word: MessageKey): MessageKey => (q.set === 'colours' ? colour : q.set === 'numbers' ? number : word);
  switch (q.kind) {
    case 'hear':
      return by('words.practice.qHearColour', 'words.practice.qHearNumber', 'words.practice.qHearWord');
    case 'see':
      return by('words.practice.qSeeColour', 'words.practice.qSeeNumber', 'words.practice.qSeeWord');
    case 'read':
      return by('words.practice.qReadColour', 'words.practice.qReadNumber', 'words.practice.qReadWord');
    case 'after':
      return 'words.practice.qAfter';
    case 'next':
      return 'words.practice.qNext';
    case 'newroz':
      return q.topic.set === 'months' && q.topic.calendar === 'kurdish' ? 'words.practice.qNewrozKurdish' : 'words.practice.qNewroz';
  }
}

/** A question asked out loud by a character: that character standing on a stage beside its button, pleased with a right answer. */
function Asked({ clips, reaction, children }: { clips: SpokenClip[]; reaction: CharacterReaction | null; children: React.ReactNode }): React.JSX.Element {
  if (clips.length === 0) return <>{children}</>;
  return (
    <CharacterStage clips={clips} height={STAGE.card} reaction={reaction} className="ab-q-stage">
      {children}
    </CharacterStage>
  );
}

export function WordPractice({
  set,
  dialect,
  locale,
  onOpen,
}: {
  set: WordSetId;
  dialect: AlphabetScript;
  locale: AppLocale;
  /** open a word missed in the round */
  onOpen: (id: string) => void;
}): React.JSX.Element {
  const t = useT();
  // a round started after the recordings arrive asks with them
  useRecordings();
  const [queue, setQueue] = useState<Item[] | null>(null);
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [missed, setMissed] = useState<SetWord[]>([]);
  const [results, setResults] = useState<Array<boolean | null>>([]);
  const nextRef = useRef<HTMLButtonElement>(null);

  const start = (focus: string[] | null = null): void => {
    const round = makeWordRound(set, dialect, focus, Math.random, currentWordSounds());
    setQueue(round.map((q) => ({ q, retry: false })));
    setResults(round.map(() => null));
    setAt(0);
    setChosen(null);
    setMissed([]);
  };

  const item = queue?.[at];
  const q = item?.q;
  const done = queue !== null && at >= queue.length;

  // a listening question speaks as it appears: Start, or Next, was the tap that lets it
  useEffect(() => {
    if (q?.clip) play(q.clip);
  }, [q]);

  const choose = useCallback(
    (id: string) => {
      if (!q || !item || chosen !== null) return;
      setChosen(id);
      const right = id === q.answer;
      if (!item.retry) {
        const original = queue!.slice(0, at + 1).filter((i) => !i.retry).length - 1;
        setResults((r) => r.map((v, i) => (i === original ? right : v)));
      }
      if (!right) {
        setMissed((m) => (m.includes(q.topic) ? m : [...m, q.topic]));
        if (!item.retry) {
          setQueue((qs) => {
            const list = [...qs!];
            list.splice(Math.min(at + 1 + COMEBACK, list.length), 0, { q: askWordAgain(q), retry: true });
            return list;
          });
        }
      }
    },
    [q, item, chosen, queue, at],
  );

  const advance = useCallback(() => {
    setAt((n) => n + 1);
    setChosen(null);
  }, []);

  useEffect(() => {
    if (chosen !== null) nextRef.current?.focus();
  }, [chosen]);

  useEffect(() => {
    if (!q) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (chosen === null && n >= 1 && n <= q.options.length) {
        e.preventDefault();
        choose(q.options[n - 1]!.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, chosen, choose]);

  const firstTries = results.length;
  const firstRight = results.filter((r) => r === true).length;
  const answered = results.filter((r) => r !== null).length;
  const reaction: CharacterReaction | null = chosen === null || !q ? null : chosen === q.answer ? 'cheer' : 'hmm';

  return (
    <section className="ab-practice wd-practice" aria-labelledby="wd-practice">
      <h2 className="ab-group-title" id="wd-practice">
        {t('alphabet.practice.title')}
      </h2>

      {!queue && (
        <>
          <p className="ab-group-body">{t('alphabet.practice.body')}</p>
          <Button onClick={() => start()}>{t('alphabet.practice.start')}</Button>
        </>
      )}

      {q && item && (
        <div className="ab-q">
          <div className="ab-q-top">
            <ol
              className="ab-dots"
              aria-label={t('alphabet.practice.progress', { n: Math.min(answered + (item.retry || chosen !== null ? 0 : 1), firstTries), total: firstTries })}
            >
              {results.map((r, i) => (
                <li key={i} className={r === true ? 'is-right' : r === false ? 'is-wrong' : ''} />
              ))}
            </ol>
            {item.retry && <span className="ab-q-retry">{t('alphabet.practice.retry')}</span>}
          </div>

          <p className="ab-q-ask">{t(askKey(q))}</p>

          {q.clip ? (
            <Asked clips={spokenAlphabet(q.clip)} reaction={reaction}>
              <div className="ab-q-prompt">
                <Sound src={q.clip} label={t('alphabet.practice.replay')} size="lg" />
              </div>
            </Asked>
          ) : q.prompt ? (
            <div className="ab-q-prompt wd-q-prompt">
              <Face word={q.prompt} dialect={dialect} locale={locale} shows={q.kind === 'see' ? 'meaning' : 'word'} size="prompt" />
            </div>
          ) : null}

          <div className={`ab-q-options wd-q-options${q.shows === 'word' ? ' is-words' : ''}`}>
            {q.options.map((o, i) => (
              <Choice
                key={o.id}
                index={i}
                word={o}
                dialect={dialect}
                locale={locale}
                shows={q.shows}
                state={chosen === null ? 'open' : o.id === q.answer ? 'right' : o.id === chosen ? 'wrong' : 'dim'}
                onPress={() => choose(o.id)}
              />
            ))}
          </div>

          {chosen !== null && (
            <div className="ab-q-feedback" role="status">
              <p className={chosen === q.answer ? 'ab-right' : 'ab-wrong'}>
                {chosen === q.answer ? t('alphabet.practice.right') : t('alphabet.practice.wrong', { letter: wordIn(q.topic, dialect) })}
                {chosen !== q.answer && !item.retry && <span className="ab-q-comeback"> {t('alphabet.practice.comeback')}</span>}
              </p>
              <Explain word={q.topic} dialect={dialect} locale={locale} />
              <button type="button" className="btn btn-primary btn-sm" ref={nextRef} onClick={advance}>
                {t('alphabet.practice.next')}
              </button>
            </div>
          )}
          <p className="ab-q-keys">{t('alphabet.practice.keys')}</p>
        </div>
      )}

      {done && (
        <div className={`ab-q-done${missed.length === 0 ? ' is-perfect' : ''}`} role="status">
          {missed.length === 0 && (
            <span className="ab-burst" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} style={{ '--i': i } as React.CSSProperties} />
              ))}
            </span>
          )}
          <ol className="ab-dots" aria-hidden="true">
            {results.map((r, i) => (
              <li key={i} className={r ? 'is-right' : 'is-wrong'} />
            ))}
          </ol>
          <p className="ab-q-score">{t('alphabet.practice.score', { right: firstRight, total: firstTries })}</p>
          {missed.length === 0 ? (
            <p className="ab-group-body">{t('words.practice.perfect')}</p>
          ) : (
            <>
              <p className="ab-group-body">
                {t('alphabet.practice.review')} <span className="muted">{t('words.practice.reviewHint')}</span>
              </p>
              <div className="ab-review wd-review">
                {missed.map((w) => (
                  <button key={w.id} type="button" className="ab-tile ab-review-tile wd-option" onClick={() => onOpen(w.id)}>
                    <Face word={w} dialect={dialect} locale={locale} shows="word" size="option" />
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="ab-q-actions">
            {missed.length > 0 && <Button onClick={() => start(missed.map((w) => w.id))}>{t('alphabet.practice.focus')}</Button>}
            <Button variant="secondary" onClick={() => start()}>
              {t('alphabet.practice.again')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * A word as a question or an option shows it: the Kurdish word (a day with its
 * number marked) — or what it means: a colour's swatch, a number's digits, the
 * reader's own word for a day or a month.
 */
function Face({
  word,
  dialect,
  locale,
  shows,
  size,
}: {
  word: SetWord;
  dialect: AlphabetScript;
  locale: AppLocale;
  shows: 'word' | 'meaning';
  size: 'prompt' | 'option';
}): React.JSX.Element {
  const t = useT();
  if (shows === 'word') {
    if (word.set !== 'days') return <WordText word={word} dialect={dialect} className={`wd-face wd-face--${size}`} latin={size === 'prompt'} />;
    return <DayName day={word} dialect={dialect} className={`wd-face wd-face--${size} wd-word-text`} />;
  }
  if (word.set === 'colours') return <Swatch hex={word.hex} size={size === 'prompt' ? 72 : 40} />;
  if (word.set === 'numbers') return <Digits value={word.value} dialect={dialect} size={size} />;
  return <MeaningText meaning={meaningOf(word, dialect, locale, t)} className={`wd-face-meaning wd-face--${size}`} />;
}

/** One answer: a tile that says, once chosen, whether it was the one — in colour and with a mark. */
function Choice({
  index,
  word,
  dialect,
  locale,
  shows,
  state,
  onPress,
}: {
  index: number;
  word: SetWord;
  dialect: AlphabetScript;
  locale: AppLocale;
  shows: 'word' | 'meaning';
  state: 'open' | 'right' | 'wrong' | 'dim';
  onPress: () => void;
}): React.JSX.Element {
  const t = useT();
  const cls = state === 'right' ? ' is-right' : state === 'wrong' ? ' is-wrong' : state === 'dim' ? ' is-dim' : '';
  // a swatch or a pair of digits is read out as what it is; a word reads itself
  const label = shows === 'meaning' && (word.set === 'colours' || word.set === 'numbers') ? meaningOf(word, dialect, locale, t).text : undefined;
  return (
    <button type="button" className={`ab-tile ab-option wd-option${cls}`} disabled={state !== 'open'} aria-label={label} onClick={onPress}>
      <span className="ab-key" aria-hidden="true">
        {index + 1}
      </span>
      <Face word={word} dialect={dialect} locale={locale} shows={shows} size="option" />
    </button>
  );
}

/** Why the answer is what it is: the word, what it means, and its sound. */
function Explain({ word, dialect, locale }: { word: SetWord; dialect: AlphabetScript; locale: AppLocale }): React.JSX.Element {
  const t = useT();
  return (
    <div className="ab-explain wd-explain">
      {word.set === 'colours' && <Swatch hex={word.hex} size={32} />}
      <span className="ab-explain-text">
        <WordText word={word} dialect={dialect} className="wd-explain-word" />
        <MeaningText meaning={meaningOf(word, dialect, locale, t)} className="ab-card-meaning" />
      </span>
      <Sound src={wordSound(word, dialect)} label={t('alphabet.listen')} size="sm" />
    </div>
  );
}
