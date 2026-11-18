import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  FOREHEAD,
  WHO_AM_I_GUESSES,
  WHO_AM_I_HELP_CAP,
  WHO_AM_I_HELP_POINTS,
  WHO_AM_I_QUESTION_COST,
  WHO_AM_I_START_POINTS,
  WHO_AM_I_WRONG_GUESS_COST,
  askedVerdict,
  deerSilhouetteSvg,
  dialectDirection,
  meaningIn,
  type GameDialect,
  type Meanings,
  type WhoAmIAnswer,
  type WhoAmIAnswerCount,
  type WhoAmIAsked,
  type WhoAmIQuestion,
  type WhoAmISays,
  type WhoAmITableBoard,
  type WhoAmITableMark,
  type WhoAmITile,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { CheckIcon, CloseIcon, FlagIcon, HelpIcon } from '../components/icons';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { describeError } from '../lib/api';

/**
 * Who Am I?'s stage, shared by the online table (WhoAmI.tsx) and the one-phone game (Couch.tsx): Hevalo's silhouette
 * with the forehead card (a question mark until readable, then the word and meaning); the table of foreheads; the
 * Kurdish questions with suggested ones first and the card's answer stamped in the dialect's words; the guess tiles
 * (online, only after "I know who I am"); the answer and judge keys, each with a word and mark as well as colour; and
 * the verdict card.
 *
 * Nothing here decides what may be shown: a card is drawn only when its word is passed in, so the rules' view
 * (`viewFor`) is the only judge. Kurdish carries its own language and direction, and a button holding a Kurdish word
 * and its meaning keeps a space between them so screen readers read two words. Under Reduce Motion nothing turns or
 * drops.
 */

const CATEGORY_KEY: Record<string, MessageKey> = {
  animal: 'games.whoAmI.cat.animal',
  object: 'games.whoAmI.cat.object',
  profession: 'games.whoAmI.cat.profession',
  food: 'games.whoAmI.cat.food',
  place: 'games.whoAmI.cat.place',
  nature: 'games.whoAmI.cat.nature',
};

/** Each answer in the dialect's own words, from the catalogue, the same in every language of the page. */
const WORD_KEY: Record<GameDialect, Record<WhoAmISays, MessageKey>> = {
  kmr: { yes: 'games.whoAmI.yesKmr', sometimes: 'games.whoAmI.sometimesKmr', no: 'games.whoAmI.noKmr', unsure: 'games.whoAmI.unsureKmr' },
  ckb: { yes: 'games.whoAmI.yesCkb', sometimes: 'games.whoAmI.sometimesCkb', no: 'games.whoAmI.noCkb', unsure: 'games.whoAmI.unsureCkb' },
};

/** The same answers in the reader's language, for under the Kurdish. */
const GLOSS_KEY: Record<WhoAmISays, MessageKey> = {
  yes: 'games.whoAmI.yes',
  sometimes: 'games.whoAmI.sometimes',
  no: 'games.whoAmI.no',
  unsure: 'games.whoAmI.unsure',
};

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** The game's own page: its start, and where a game on one phone or with friends is left for. */
export const WHO_AM_I_PATH = '/app/games/who-am-i';

/** How each way a game can end reads, above who everyone was. */
export const WHO_AM_I_END_KEY: Record<NonNullable<WhoAmITableBoard['endedBy']>, MessageKey> = {
  'all-done': 'games.whoAmI.end.allDone',
  time: 'games.whoAmI.end.time',
  'too-few': 'games.whoAmI.end.tooFew',
  // called off with everyone gone: nobody is left at the table to tell it apart from too few
  abandoned: 'games.whoAmI.end.tooFew',
};

/** An answer (yes, could be, no, or a friend's not sure) in the Kurdish being played, whatever the page's language. */
export function answerWord(dialect: GameDialect, answer: WhoAmIAnswer | 'unsure', t: Translate): string {
  return t(WORD_KEY[dialect][answer]);
}

/** The dialect's own yes or no, for a line that has only those two. */
export function yesNo(dialect: GameDialect, answer: boolean, t: Translate): string {
  return answerWord(dialect, answer ? 'yes' : 'no', t);
}

/** An answer in the reader's language, for under the Kurdish; none when the reader's language is that Kurdish. */
function gloss(dialect: GameDialect, answer: WhoAmISays, t: Translate): string | null {
  const own = t(GLOSS_KEY[answer]);
  return own.toLocaleLowerCase() === answerWord(dialect, answer, t).toLocaleLowerCase() ? null : own;
}

export function categoryName(category: string | null, t: Translate): string | null {
  const key = category === null ? undefined : CATEGORY_KEY[category];
  return key ? t(key) : null;
}

/** The silhouette as decoration, without a title or ids, since nearby words name it and a table draws it per player. */
function plainDeer(width: number): string {
  return deerSilhouetteSvg('currentColor', width, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/, '')
    .replace(/ aria-labelledby="[^"]*"/, '')
    .replace(' role="img"', '');
}

/** A sentence in the reader's language with Kurdish words filled in, each marked with its language and direction. */
export function WithWords({ text, words, dialect }: { text: string; words: Readonly<Record<string, string>>; dialect: GameDialect }): React.JSX.Element {
  const script = dialectDirection(dialect);
  // split at the holes and keep their names: every second part is a hole
  const parts = text.split(/\{(\w+)\}/);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const word = words[part];
        // a hole nobody filled is left as it was written, as the catalogue's own lookup leaves it
        if (typeof word !== 'string') return `{${part}}`;
        return (
          <span key={i} className="wa-word" lang={script.lang} dir={script.dir}>
            {word}
          </span>
        );
      })}
    </>
  );
}

/** The same for a sentence with one Kurdish word in it ("You are {word}!"). */
export function WithWord({ text, word, dialect }: { text: string; word: string; dialect: GameDialect }): React.JSX.Element {
  return <WithWords text={text} words={{ word }} dialect={dialect} />;
}

/** Hevalo as a silhouette, the card on his forehead: a question mark until the word may be read. */
export function ForeheadCard({
  dialect,
  category,
  identity,
  label,
  hidden,
}: {
  dialect: GameDialect;
  /** what kind of thing it is, when the card may say (every tile that kind); null when it may not */
  category: string | null;
  identity: { word: string; meanings: Meanings } | null;
  /** whose card it is, where the page shows more than one */
  label?: string;
  /** what a hidden card is called; the card on the reader's own forehead unless said */
  hidden?: string;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const svg = useMemo(() => plainDeer(240), []);
  const script = dialectDirection(dialect);
  const kind = categoryName(category, t);
  return (
    <figure className="wa-stage" aria-label={label}>
      <div className="wa-silhouette" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      <div
        className={`wa-card${identity ? ' is-turned' : ''}`}
        // at least the forehead's width; a long word makes its card wider rather than breaking in the middle (whoami.css)
        style={{ left: `${FOREHEAD.x * 100}%`, top: `${FOREHEAD.y * 100}%`, minWidth: `${FOREHEAD.width * 100}%` }}
        aria-live="polite"
      >
        {identity ? (
          <>
            <span className="wa-card-word" lang={script.lang} dir={script.dir}>
              {identity.word}
            </span>
            <span className="wa-card-meaning">{meaningIn(identity.meanings, locale) ?? identity.meanings.en}</span>
          </>
        ) : (
          <>
            <span className="wa-card-mark" aria-hidden="true">
              ?
            </span>
            <span className="sr-only">{hidden ?? t('games.whoAmI.card')}</span>
            {kind && <span className="wa-card-kind">{kind}</span>}
          </>
        )}
      </div>
    </figure>
  );
}

/** One player at the table, as the reader of the page may see them. */
export interface TableSeat {
  seat: number;
  name: string;
  /** the card on their forehead, when this reader may read it; null while it is hidden from them */
  card: { word: string; meanings: Meanings } | null;
  /** the reader's own seat: a hidden card there is the one on their own forehead */
  own: boolean;
  asked: number;
  points: number;
  solved: boolean;
  out: boolean;
  left: boolean;
}

/** The table: each player's forehead and card, points, questions asked, done or gone marks, and whose turn it is. */
export function Foreheads({ dialect, seats, turn, label }: { dialect: GameDialect; seats: readonly TableSeat[]; turn: number | null; label: string }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const svg = useMemo(() => plainDeer(96), []);
  const script = dialectDirection(dialect);
  return (
    <ol className="wa-table" aria-label={label}>
      {seats.map((s) => {
        const onTurn = turn === s.seat;
        const mark = s.left
          ? t('games.lastLetter.reason.gone')
          : s.solved
            ? t('games.whoAmI.solved')
            : s.out
              ? t('games.whoAmI.out')
              : onTurn
                ? t('games.whoAmI.onTurn')
                : null;
        return (
          <li
            key={s.seat}
            className={`wa-seat${onTurn ? ' is-turn' : ''}${s.own ? ' is-me' : ''}${s.solved ? ' is-solved' : ''}${s.out || s.left ? ' is-out' : ''}`}
            aria-current={onTurn ? 'true' : undefined}
          >
            <span className="wa-seat-figure">
              <span className="wa-seat-deer" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
              <span className={`wa-seat-card${s.card ? ' is-turned' : ''}`}>
                {s.card ? (
                  <>
                    <span className="wa-seat-word" lang={script.lang} dir={script.dir}>
                      {s.card.word}
                    </span>
                    <span className="wa-seat-meaning">{meaningIn(s.card.meanings, locale) ?? s.card.meanings.en}</span>
                  </>
                ) : (
                  <>
                    <span className="wa-card-mark" aria-hidden="true">
                      ?
                    </span>
                    <span className="sr-only">{s.own ? t('games.whoAmI.card') : t('games.whoAmI.cardHidden')}</span>
                  </>
                )}
              </span>
            </span>
            <span className="wa-seat-name">{s.name}</span>
            <span className="wa-seat-meta">
              <span>{t('games.whoAmI.points', { count: s.points })}</span>
              <span>{t('games.whoAmI.seatAsked', { count: s.asked })}</span>
            </span>
            {mark && <span className={`wa-chip${s.out || s.left ? ' is-out' : onTurn ? ' is-turn' : ''}`}>{mark}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** An answer as a stamp, in the dialect's own words: the card's yes, could be or no, or what a friend said, not sure among them. */
export function Stamp({ dialect, answer }: { dialect: GameDialect; answer: WhoAmISays }): React.JSX.Element {
  const t = useT();
  const script = dialectDirection(dialect);
  return (
    <span className={`wa-stamp is-${answer}`} lang={script.lang} dir={script.dir}>
      {answerWord(dialect, answer, t)}
    </span>
  );
}

/**
 * One Kurdish question whose meaning shows on a tap, with `hint` saying so. With `shown` the meaning is visible from
 * the start, for a screen read by a room.
 */
export function QuestionCard({
  dialect,
  question,
  large = false,
  hint = true,
  shown = false,
}: {
  dialect: GameDialect;
  question: WhoAmIQuestion;
  large?: boolean;
  hint?: boolean;
  shown?: boolean;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const script = dialectDirection(dialect);
  const [open, setOpen] = useState(false);
  const meaning = meaningIn(question.meanings, locale) ?? question.meanings.en;
  if (shown) {
    return (
      <div className={`wa-asked${large ? ' is-large' : ''}`}>
        <p className="wa-asked-text">
          <span lang={script.lang} dir={script.dir}>
            {question.ku}
          </span>{' '}
          <span className="wa-q-meaning">{meaning}</span>
        </p>
      </div>
    );
  }
  return (
    <div className={`wa-asked${large ? ' is-large' : ''}`}>
      <button type="button" className="wa-asked-text" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span lang={script.lang} dir={script.dir}>
          {question.ku}
        </span>
        {open && (
          <>
            {' '}
            <span className="wa-q-meaning">{meaning}</span>
          </>
        )}
      </button>
      {hint && !open && <p className="muted wa-hint">{t('games.whoAmI.tapToSee')}</p>}
    </div>
  );
}

/** Questions as rows in order, each with its meaning (shown per `meanings` or on a tap) and the answer stamp or Ask. */
export function QuestionList({
  dialect,
  questions,
  asked,
  meanings,
  onAsk,
  disabled = false,
  labelledBy,
}: {
  dialect: GameDialect;
  questions: readonly WhoAmIQuestion[];
  asked: readonly WhoAmIAsked[];
  /** every question's meaning is under it without a tap, as a beginner reads them */
  meanings: boolean;
  /** asks a question, while one may be asked; without it the rows are the player's notes, to read */
  onAsk?: (question: string) => void;
  /** a move is on its way: nothing more is taken until it has answered */
  disabled?: boolean;
  /** the heading these rows stand under, where they are one group of several */
  labelledBy?: string;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const script = dialectDirection(dialect);
  const [open, setOpen] = useState<string | null>(null);
  // the card's own word for each question asked: a list kept before there were three answers holds yes or not, and is read so
  const answers = new Map(asked.map((a) => [a.question, askedVerdict(a)]));
  return (
    <ul className="wa-questions" aria-labelledby={labelledBy}>
      {questions.map((q) => {
        const answer = answers.get(q.id);
        const shown = open === q.id;
        const meaning = meaningIn(q.meanings, locale) ?? q.meanings.en;
        return (
          <li key={q.id} className={`wa-q${answer !== undefined ? ' is-asked' : ''}`}>
            {meanings ? (
              <p className="wa-q-text">
                <span lang={script.lang} dir={script.dir}>
                  {q.ku}
                </span>{' '}
                <span className="wa-q-meaning">{meaning}</span>
              </p>
            ) : (
              <button type="button" className="wa-q-text" aria-expanded={shown} onClick={() => setOpen(shown ? null : q.id)}>
                <span lang={script.lang} dir={script.dir}>
                  {q.ku}
                </span>
                {shown && (
                  <>
                    {' '}
                    <span className="wa-q-meaning">{meaning}</span>
                  </>
                )}
              </button>
            )}
            {answer !== undefined ? (
              <Stamp dialect={dialect} answer={answer} />
            ) : onAsk ? (
              <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onAsk(q.id)}>
                {t('games.whoAmI.ask')}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** A player's questions in the order their list is read: those asked first, as they were asked, and the rest after. */
export function askedFirst(questions: readonly WhoAmIQuestion[], asked: readonly WhoAmIAsked[]): WhoAmIQuestion[] {
  const done = new Set(asked.map((a) => a.question));
  return [...asked.flatMap((a) => questions.filter((q) => q.id === a.question)), ...questions.filter((q) => !done.has(q.id))];
}

/**
 * The question deck on a player's own screen: suggested questions first while one may be asked, then the rest with
 * any answers; when nothing may be asked it serves as notes with nothing suggested.
 */
export function QuestionDeck({
  dialect,
  questions,
  asked,
  suggested,
  meanings,
  canAsk,
  disabled,
  onAsk,
}: {
  dialect: GameDialect;
  questions: readonly WhoAmIQuestion[];
  asked: readonly WhoAmIAsked[];
  /** the questions to ask next, best first, by id (the rules' own choice) */
  suggested: readonly string[];
  /** every question's meaning is under it without a tap */
  meanings: boolean;
  /** a question may be asked now; when not, the deck is the player's notes, to read */
  canAsk: boolean;
  disabled: boolean;
  onAsk: (question: string) => void;
}): React.JSX.Element {
  const t = useT();
  const title = useId();
  const label = useId();
  const others = useId();
  const first = canAsk ? suggested.flatMap((id) => questions.filter((q) => q.id === id)) : [];
  const rest = askedFirst(questions, asked).filter((q) => !first.includes(q));
  return (
    <section className="wa-deck" aria-labelledby={title}>
      <h2 id={title} className="wa-title">
        {t(canAsk ? 'games.whoAmI.questions' : 'games.whoAmI.yourQuestions')}
      </h2>
      {!meanings && <p className="muted wa-hint">{t('games.whoAmI.tapToSee')}</p>}
      {first.length > 0 && (
        <>
          <h3 id={label} className="wa-label">
            {t('games.whoAmI.suggested')}
          </h3>
          <QuestionList dialect={dialect} questions={first} asked={asked} meanings={meanings} onAsk={onAsk} disabled={disabled} labelledBy={label} />
        </>
      )}
      {/* the rest is named only beside the suggested ones: on its own it is simply the list */}
      {first.length > 0 && rest.length > 0 && (
        <h3 id={others} className="wa-label">
          {t('games.whoAmI.otherQuestions')}
        </h3>
      )}
      {rest.length > 0 && (
        <QuestionList
          dialect={dialect}
          questions={rest}
          asked={asked}
          meanings={meanings}
          onAsk={canAsk ? onAsk : undefined}
          disabled={disabled}
          labelledBy={first.length > 0 ? others : undefined}
        />
      )}
    </section>
  );
}

/** Suggested questions on one phone, as large keys with the meaning always shown; one tap picks a question. */
export function SuggestedQuestions({
  dialect,
  questions,
  onPick,
}: {
  dialect: GameDialect;
  questions: readonly WhoAmIQuestion[];
  onPick: (question: string) => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const label = useId();
  const script = dialectDirection(dialect);
  return (
    <div className="wa-suggest">
      <h3 id={label} className="wa-label">
        {t('games.whoAmI.suggested')}
      </h3>
      <ul className="wa-suggest-list" aria-labelledby={label}>
        {questions.map((q) => (
          <li key={q.id}>
            <button type="button" className="wa-suggest-q" onClick={() => onPick(q.id)}>
              <span className="wa-suggest-ku" lang={script.lang} dir={script.dir}>
                {q.ku}
              </span>{' '}
              <span className="wa-q-meaning">{meaningIn(q.meanings, locale) ?? q.meanings.en}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The guess tiles at an online table: pick one, then Guess; wrong guesses are crossed out. */
export function GuessTiles({
  dialect,
  tiles,
  crossed,
  canGuess,
  busy,
  onGuess,
  children,
}: {
  dialect: GameDialect;
  tiles: readonly WhoAmITile[];
  crossed: readonly string[];
  /** a guess may be made now; when not, the tiles are the player's notes, to read */
  canGuess: boolean;
  /** a move is on its way: nothing more is taken until it has answered */
  busy: boolean;
  onGuess: (tile: string) => void;
  /** what else stands beside Guess (the way back from guessing) */
  children?: ReactNode;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const title = useId();
  const script = dialectDirection(dialect);
  const [picked, setPicked] = useState<string | null>(null);
  const can = picked !== null && !crossed.includes(picked) && canGuess && !busy;
  return (
    <section className="wa-guess" aria-labelledby={title}>
      <h2 id={title} className="wa-title">
        {t('games.whoAmI.oneOf')}
      </h2>
      <div className="wa-tiles" role="radiogroup" aria-labelledby={title}>
        {tiles.map((tile) => {
          const out = crossed.includes(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              role="radio"
              aria-checked={picked === tile.id}
              className={`wa-tile${picked === tile.id ? ' is-picked' : ''}${out ? ' is-crossed' : ''}`}
              disabled={!canGuess || busy || out}
              onClick={() => setPicked(tile.id)}
              aria-label={out ? `${tile.word}, ${t('games.whoAmI.notThis')}` : undefined}
            >
              <span className="wa-tile-word" lang={script.lang} dir={script.dir}>
                {tile.word}
              </span>
              {tile.meanings && (
                <>
                  {' '}
                  <span className="wa-tile-meaning">{meaningIn(tile.meanings, locale) ?? tile.meanings.en}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {canGuess && (
        <div className="wa-guess-actions">
          <Button
            onClick={() => {
              if (can && picked) onGuess(picked);
            }}
            disabled={!can}
          >
            {t('games.whoAmI.guess')}
          </Button>
          {children}
        </div>
      )}
    </section>
  );
}

/** The "could be" wave mark, drawn here on the icon set's 256-unit grid to match the check and cross. */
function MaybeMark(): React.JSX.Element {
  return (
    <svg width={22} height={22} viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <path d="M40 148c24-40 56-56 88-20s64 20 88-20" fill="none" stroke="currentColor" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The mark each answer wears beside its word and colour: a check, a wave, a cross, a question mark. */
function AnswerMark({ answer }: { answer: WhoAmISays }): React.JSX.Element {
  return (
    <span className="wa-answer-mark" aria-hidden="true">
      {answer === 'yes' ? <CheckIcon size={22} /> : answer === 'no' ? <CloseIcon size={22} weight="bold" /> : answer === 'sometimes' ? <MaybeMark /> : <HelpIcon size={22} weight="bold" />}
    </span>
  );
}

/** One answer as a key: its mark, the dialect's word, and the reader's word for it under that. */
function AnswerKey({ dialect, answer, disabled, onAnswer }: { dialect: GameDialect; answer: WhoAmISays; disabled: boolean; onAnswer: (says: WhoAmISays) => void }): React.JSX.Element {
  const t = useT();
  const script = dialectDirection(dialect);
  const own = gloss(dialect, answer, t);
  return (
    <button type="button" className={`wa-answer-btn is-${answer}`} disabled={disabled} onClick={() => onAnswer(answer)}>
      <AnswerMark answer={answer} />
      <span className="wa-answer-ku" lang={script.lang} dir={script.dir}>
        {answerWord(dialect, answer, t)}
      </span>
      {own && (
        <>
          {' '}
          <span className="wa-answer-gloss">{own}</span>
        </>
      )}
    </button>
  );
}

/**
 * A friend's answer keys: yes, could be and no in the dialect's words and reading order, with a quieter not sure
 * below; `answers` 2 offers only yes and no.
 */
export function AnswerKeys({
  dialect,
  label,
  answers,
  disabled,
  onAnswer,
}: {
  dialect: GameDialect;
  label: string;
  answers: WhoAmIAnswerCount;
  disabled: boolean;
  onAnswer: (says: WhoAmISays) => void;
}): React.JSX.Element {
  const script = dialectDirection(dialect);
  // the order the keys stand in, as the rules list them (WHO_AM_I_SAYS): not sure is its own key, below the row
  const row: readonly WhoAmISays[] = answers === 4 ? ['yes', 'sometimes', 'no'] : ['yes', 'no'];
  return (
    <div className="wa-answer-keys" role="group" aria-label={label}>
      <div className={`wa-answer${answers === 4 ? ' is-three' : ''}`} dir={script.dir}>
        {row.map((answer) => (
          <AnswerKey key={answer} dialect={dialect} answer={answer} disabled={disabled} onAnswer={onAnswer} />
        ))}
      </div>
      {answers === 4 && <AnswerKey dialect={dialect} answer="unsure" disabled={disabled} onAnswer={onAnswer} />}
    </div>
  );
}

/** What a room says to a guess said out loud: that is who they are, it is close (another word for the same thing), or not yet. */
export type Judged = 'right' | 'close' | 'wrong';

/** Each judgement in the colours and marks of the answer it stands nearest to, so the two sets of keys read alike. */
const JUDGED_AS: Record<Judged, WhoAmISays> = { right: 'yes', close: 'sometimes', wrong: 'no' };

/** The room's keys for a spoken guess (right, close, not yet) in the reader's language, styled like yes, could be and no. */
export function JudgeKeys({ label, words, onJudge }: { label: string; words: Readonly<Record<Judged, string>>; onJudge: (judged: Judged) => void }): React.JSX.Element {
  const order: readonly Judged[] = ['right', 'close', 'wrong'];
  return (
    <div className="wa-answer is-three" role="group" aria-label={label}>
      {order.map((judged) => (
        <button key={judged} type="button" className={`wa-answer-btn is-${JUDGED_AS[judged]}`} onClick={() => onJudge(judged)}>
          <AnswerMark answer={JUDGED_AS[judged]} />
          <span className="wa-answer-say">{words[judged]}</span>
        </button>
      ))}
    </div>
  );
}

/** How one friend's answer went, as the list under a verdict names it. */
export const MARK_KEY: Record<WhoAmITableMark, MessageKey> = {
  right: 'games.whoAmI.right',
  close: 'games.whoAmI.close',
  wrong: 'games.whoAmI.wrong',
  unsure: 'games.whoAmI.unsureMark',
  none: 'games.whoAmI.noAnswer',
};

/**
 * The card's verdict on a question, in the answer's colour so it is not mistaken for an opinion, with "could be"
 * explained and the page's extras below. `shown` shows the question's meaning without a tap.
 */
export function VerdictCard({
  dialect,
  by,
  question,
  verdict,
  shown = false,
  children,
}: {
  dialect: GameDialect;
  /** who asked, as a line ("Rojda asked:") */
  by: string;
  question: WhoAmIQuestion;
  verdict: WhoAmIAnswer;
  shown?: boolean;
  children?: ReactNode;
}): React.JSX.Element {
  const t = useT();
  const title = useId();
  const own = gloss(dialect, verdict, t);
  return (
    <section className={`wa-verdict is-${verdict}`} aria-labelledby={title}>
      <p className="wa-verdict-by">{by}</p>
      <QuestionCard key={question.id} dialect={dialect} question={question} hint={false} shown={shown} />
      <h2 id={title} className="wa-verdict-says">
        <span>{t('games.whoAmI.cardSays')}</span> <Stamp dialect={dialect} answer={verdict} />
        {own && (
          <>
            {' '}
            <span className="wa-verdict-gloss">{own}</span>
          </>
        )}
      </h2>
      {verdict === 'sometimes' && <p className="wa-verdict-either">{t('games.whoAmI.eitherNote')}</p>}
      {children}
    </section>
  );
}

/** A card and a question as the server knows them: by their ids on one phone, by the game and the seat at a table it runs. */
export type ReportBody = { identity: string; question: string } | { game: string; seat: number; question: string };

/**
 * One tap to report a card's answer as wrong, replaced by a thank-you that takes focus and is announced. The server only
 * counts it for the content editors; it never changes the card.
 */
export function ReportAnswer({ body }: { body: ReportBody }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [state, setState] = useState<'ready' | 'sending' | 'done'>('ready');
  const [error, setError] = useState<string | null>(null);
  const thanks = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state === 'done') thanks.current?.focus();
  }, [state]);
  const send = async (): Promise<void> => {
    setState('sending');
    setError(null);
    const res = await client.post<{ counted: boolean }>('/games/who-am-i/report', body);
    if (res.ok) return setState('done');
    setState('ready');
    setError(describeError(res.error, t));
  };
  return (
    <div className="wa-report" aria-live="polite">
      {state === 'done' ? (
        <p ref={thanks} className="wa-reported" tabIndex={-1}>
          {t('games.whoAmI.reported')}
        </p>
      ) : (
        <button type="button" className="wa-report-btn" disabled={state === 'sending'} onClick={() => void send()}>
          <FlagIcon size={18} />
          {t('games.whoAmI.report')}
        </button>
      )}
      {error && (
        <p className="wa-report-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The scoring rules, folded under the table. `guesses` is how many wrong guesses put a player out (one more on one
 * phone than online); `answers` is how many answers are offered, and only four explains "could be" and "not sure".
 */
export function ScoringNote({ guesses = WHO_AM_I_GUESSES, answers = 4 }: { guesses?: number; answers?: WhoAmIAnswerCount }): React.JSX.Element {
  const t = useT();
  return (
    <details className="wa-scoring">
      <summary>{t('games.whoAmI.scoring.title')}</summary>
      <ul>
        <li>{t('games.whoAmI.scoring.own', { start: WHO_AM_I_START_POINTS, question: WHO_AM_I_QUESTION_COST, wrong: WHO_AM_I_WRONG_GUESS_COST })}</li>
        <li>{t('games.whoAmI.scoring.help', { help: WHO_AM_I_HELP_POINTS, cap: WHO_AM_I_HELP_CAP })}</li>
        {answers === 4 && (
          <>
            <li>{t('games.whoAmI.scoring.either')}</li>
            <li>{t('games.whoAmI.scoring.unsure')}</li>
          </>
        )}
        <li>{t('games.whoAmI.scoring.out', { guesses })}</li>
      </ul>
    </details>
  );
}
