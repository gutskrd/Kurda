import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  FOREHEAD,
  WHO_AM_I_GUESSES,
  WHO_AM_I_HELP_POINTS,
  WHO_AM_I_QUESTION_COST,
  WHO_AM_I_START_POINTS,
  WHO_AM_I_WRONG_GUESS_COST,
  deerSilhouetteSvg,
  dialectDirection,
  meaningIn,
  type GameDialect,
  type Meanings,
  type WhoAmIAsked,
  type WhoAmIQuestion,
  type WhoAmITableBoard,
  type WhoAmITile,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/**
 * Who Am I?'s stage on the website, the same for the game with friends online
 * (WhoAmI.tsx) and the one passed round a room on one phone (Couch.tsx):
 *
 * - Hevalo's silhouette with a card on his forehead. The card shows a
 *   question mark until its word may be read; then it turns over to show the
 *   word and its meaning.
 * - The table: every player as a small forehead, with what a viewer may read
 *   on it, their points and questions, and whose turn it is.
 * - The deck of questions, in Kurdish: tapping one shows what it means in the
 *   reader's language; Ask asks it, and the card's answer is stamped on it in
 *   the dialect's own yes or no (Erê / Na, بەڵێ / نەخێر).
 * - The tiles, the words a player could be: pick one, then Guess. A tile
 *   already guessed wrong is crossed out.
 * - The two answers a friend gives to somebody else's question, and the
 *   card's own verdict on it, as a card of the answer's colour.
 *
 * Nothing here decides what may be shown. A card is drawn when its word is
 * handed in and hidden when it is not, so the rules' view (`viewFor`) stays
 * the only judge of who reads what.
 *
 * Kurdish is marked with its own language and direction everywhere, so a
 * Soranî question reads right to left inside an English page. Where a button
 * holds a Kurdish word and what it means, a space stands between the two, so
 * its name is read out as two words and not run together. Under Reduce
 * Motion nothing turns over or drops; the stamp and the card simply appear.
 */

const CATEGORY_KEY: Record<string, MessageKey> = {
  animal: 'games.whoAmI.cat.animal',
  object: 'games.whoAmI.cat.object',
  profession: 'games.whoAmI.cat.profession',
  food: 'games.whoAmI.cat.food',
  place: 'games.whoAmI.cat.place',
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

/** The dialect's own yes or no, from the catalogue: the card answers in the Kurdish being played. */
export function yesNo(dialect: GameDialect, answer: boolean, t: Translate): string {
  if (dialect === 'ckb') return t(answer ? 'games.whoAmI.yesCkb' : 'games.whoAmI.noCkb');
  return t(answer ? 'games.whoAmI.yesKmr' : 'games.whoAmI.noKmr');
}

/** Yes or no in the reader's language, for under the Kurdish; none when the reader's language is that Kurdish. */
function gloss(dialect: GameDialect, answer: boolean, t: Translate): string | null {
  const own = t(answer ? 'games.whoAmI.yes' : 'games.whoAmI.no');
  return own.toLocaleLowerCase() === yesNo(dialect, answer, t).toLocaleLowerCase() ? null : own;
}

export function categoryName(category: string | null, t: Translate): string | null {
  const key = category === null ? undefined : CATEGORY_KEY[category];
  return key ? t(key) : null;
}

/**
 * The silhouette as the decoration it is here: without a title or an id of
 * its own, since the words beside it say whose card it wears and a table
 * draws it once for every player.
 */
function plainDeer(width: number): string {
  return deerSilhouetteSvg('currentColor', width, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/, '')
    .replace(/ aria-labelledby="[^"]*"/, '')
    .replace(' role="img"', '');
}

/**
 * A sentence in the reader's language with one Kurdish word in it ("You are
 * {word}!"). The sentence keeps its own word order, and the word is marked as
 * the Kurdish it is, so it is read and laid out as Kurdish wherever it falls.
 */
export function WithWord({ text, word, dialect }: { text: string; word: string; dialect: GameDialect }): React.JSX.Element {
  const script = dialectDirection(dialect);
  const [before, ...after] = text.split('{word}');
  return (
    <>
      {before}
      <span className="wa-word" lang={script.lang} dir={script.dir}>
        {word}
      </span>
      {after.join('')}
    </>
  );
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

/**
 * The table: every player as a small forehead with their card on it, their
 * points and how many questions they have asked, a mark for a card that is
 * done or a player who has gone, and whose turn it is.
 */
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

/** The card's answer as a stamp, in the dialect's own yes or no. */
export function Stamp({ dialect, answer }: { dialect: GameDialect; answer: boolean }): React.JSX.Element {
  const t = useT();
  const script = dialectDirection(dialect);
  return (
    <span className={`wa-stamp${answer ? ' is-yes' : ' is-no'}`} lang={script.lang} dir={script.dir}>
      {yesNo(dialect, answer, t)}
    </span>
  );
}

/**
 * One question on its own, in Kurdish: tapping it shows what it means in the
 * reader's language. `hint` says so under it, where the question is the thing
 * on the screen; on the verdict's card it is left out.
 */
export function QuestionCard({
  dialect,
  question,
  large = false,
  hint = true,
}: {
  dialect: GameDialect;
  question: WhoAmIQuestion;
  large?: boolean;
  hint?: boolean;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const script = dialectDirection(dialect);
  const [open, setOpen] = useState(false);
  return (
    <div className={`wa-asked${large ? ' is-large' : ''}`}>
      <button type="button" className="wa-asked-text" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span lang={script.lang} dir={script.dir}>
          {question.ku}
        </span>
        {open && (
          <>
            {' '}
            <span className="wa-q-meaning">{meaningIn(question.meanings, locale) ?? question.meanings.en}</span>
          </>
        )}
      </button>
      {hint && !open && <p className="muted wa-hint">{t('games.whoAmI.tapToSee')}</p>}
    </div>
  );
}

/** The deck of questions: tap one to see what it means, Ask to ask it; asked ones carry the card's answer, stamped. */
export function QuestionDeck({
  dialect,
  questions,
  asked,
  canAsk,
  disabled,
  onAsk,
}: {
  dialect: GameDialect;
  questions: readonly WhoAmIQuestion[];
  asked: readonly WhoAmIAsked[];
  /** a question may be asked now; when not, the deck is the player's notes, to read */
  canAsk: boolean;
  disabled: boolean;
  onAsk: (question: string) => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const title = useId();
  const script = dialectDirection(dialect);
  const [open, setOpen] = useState<string | null>(null);
  const answers = new Map(asked.map((a) => [a.question, a.answer]));
  // the questions asked first, in the order they were asked; the rest after
  const order = [...asked.map((a) => questions.find((q) => q.id === a.question)).filter((q): q is WhoAmIQuestion => !!q), ...questions.filter((q) => !answers.has(q.id))];
  return (
    <section className="wa-deck" aria-labelledby={title}>
      <h2 id={title} className="wa-title">
        {t(canAsk ? 'games.whoAmI.questions' : 'games.whoAmI.yourQuestions')}
      </h2>
      <p className="muted wa-hint">{t('games.whoAmI.tapToSee')}</p>
      <ul className="wa-questions">
        {order.map((q) => {
          const answer = answers.get(q.id);
          const shown = open === q.id;
          return (
            <li key={q.id} className={`wa-q${answer !== undefined ? ' is-asked' : ''}`}>
              <button type="button" className="wa-q-text" aria-expanded={shown} onClick={() => setOpen(shown ? null : q.id)}>
                <span lang={script.lang} dir={script.dir}>
                  {q.ku}
                </span>
                {shown && (
                  <>
                    {' '}
                    <span className="wa-q-meaning">{meaningIn(q.meanings, locale) ?? q.meanings.en}</span>
                  </>
                )}
              </button>
              {answer !== undefined ? (
                <Stamp dialect={dialect} answer={answer} />
              ) : canAsk ? (
                <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onAsk(q.id)}>
                  {t('games.whoAmI.ask')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The words a player could be: pick one, then Guess; a tile already guessed wrong is crossed out. */
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
  /** what else the turn offers beside Guess (passing it on) */
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
        {t('games.whoAmI.guessTitle')}
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

/** The two answers to a question about somebody else's card: the dialect's yes and no, a thumb wide. */
export function AnswerPanel({ dialect, label, disabled, onAnswer }: { dialect: GameDialect; label: string; disabled: boolean; onAnswer: (yes: boolean) => void }): React.JSX.Element {
  const t = useT();
  const script = dialectDirection(dialect);
  return (
    <div className="wa-answer" role="group" aria-label={label}>
      {[true, false].map((yes) => {
        const own = gloss(dialect, yes, t);
        return (
          <button key={String(yes)} type="button" className={`wa-answer-btn${yes ? ' is-yes' : ' is-no'}`} disabled={disabled} onClick={() => onAnswer(yes)}>
            <span className="wa-answer-ku" lang={script.lang} dir={script.dir}>
              {yesNo(dialect, yes, t)}
            </span>
            {own && (
              <>
                {' '}
                <span className="wa-answer-gloss">{own}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * What the card itself said to a question: who asked what, the card's yes or
 * no, and under it whatever the page adds (how each friend answered, whether
 * the room was right). A card of the answer's own colour, so the truth is
 * never mistaken for one more opinion at the table.
 */
export function VerdictCard({
  dialect,
  by,
  question,
  truth,
  children,
}: {
  dialect: GameDialect;
  /** who asked, as a line ("Rojda asked:") */
  by: string;
  question: WhoAmIQuestion;
  truth: boolean;
  children?: ReactNode;
}): React.JSX.Element {
  const t = useT();
  const title = useId();
  const own = gloss(dialect, truth, t);
  return (
    <section className={`wa-verdict${truth ? ' is-yes' : ' is-no'}`} aria-labelledby={title}>
      <p className="wa-verdict-by">{by}</p>
      <QuestionCard key={question.id} dialect={dialect} question={question} hint={false} />
      <h2 id={title} className="wa-verdict-says">
        <span>{t('games.whoAmI.cardSays')}</span> <Stamp dialect={dialect} answer={truth} />
        {own && (
          <>
            {' '}
            <span className="wa-verdict-gloss">{own}</span>
          </>
        )}
      </h2>
      {children}
    </section>
  );
}

/** How the game scores, folded away under the table: read once, and there when somebody asks. */
export function ScoringNote(): React.JSX.Element {
  const t = useT();
  return (
    <details className="wa-scoring">
      <summary>{t('games.whoAmI.scoring.title')}</summary>
      <ul>
        <li>{t('games.whoAmI.scoring.own', { start: WHO_AM_I_START_POINTS, question: WHO_AM_I_QUESTION_COST, wrong: WHO_AM_I_WRONG_GUESS_COST })}</li>
        <li>{t('games.whoAmI.scoring.help', { help: WHO_AM_I_HELP_POINTS })}</li>
        <li>{t('games.whoAmI.scoring.out', { guesses: WHO_AM_I_GUESSES })}</li>
      </ul>
    </details>
  );
}
