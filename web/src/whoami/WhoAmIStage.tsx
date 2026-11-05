import { useMemo, useState } from 'react';
import {
  FOREHEAD,
  deerSilhouetteSvg,
  dialectDirection,
  meaningIn,
  type GameDialect,
  type Meanings,
  type WhoAmIAsked,
  type WhoAmIQuestion,
  type WhoAmITile,
} from '@kurda/shared';
import { Button } from '../components/Button';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/**
 * Who Am I?'s stage on the website, the same for a round alone and for the
 * race: Hevalo's silhouette with the hidden word's card on his forehead, the
 * deck of questions, and the tiles to guess from.
 *
 * - The card shows a question mark and what kind of thing it is until the
 *   word is known; then it turns over to show the word and its meaning.
 * - A question is a card in the deck, in Kurdish: tapping it shows what it
 *   means in the reader's language; Ask asks it, and the card's answer is
 *   stamped on it in the dialect's own yes or no (Erê / Na, بەڵێ / نەخێر).
 * - The tiles are the words it could be: pick one, then Guess. A tile already
 *   guessed wrong is crossed out.
 *
 * Kurdish is marked with its own language and direction everywhere, so a
 * Soranî question reads right to left inside an English page. Under Reduce
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

/** The dialect's own yes or no, from the catalogue: the card answers in the Kurdish being played. */
export function yesNo(dialect: GameDialect, answer: boolean, t: Translate): string {
  if (dialect === 'ckb') return t(answer ? 'games.whoAmI.yesCkb' : 'games.whoAmI.noCkb');
  return t(answer ? 'games.whoAmI.yesKmr' : 'games.whoAmI.noKmr');
}

export function categoryName(category: string, t: Translate): string | null {
  const key = CATEGORY_KEY[category];
  return key ? t(key) : null;
}

/** Hevalo as a silhouette, the card on his forehead: a question mark until the word is known. */
export function ForeheadCard({
  dialect,
  category,
  identity,
}: {
  dialect: GameDialect;
  category: string;
  identity: { word: string; meanings: Meanings } | null;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const svg = useMemo(() => deerSilhouetteSvg('currentColor', 240, t('games.whoAmI.card')), [t]);
  const script = dialectDirection(dialect);
  const kind = categoryName(category, t);
  return (
    <figure className="wa-stage">
      <div className="wa-silhouette" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      <div
        className={`wa-card${identity ? ' is-turned' : ''}`}
        style={{ left: `${FOREHEAD.x * 100}%`, top: `${FOREHEAD.y * 100}%`, width: `${FOREHEAD.width * 100}%` }}
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
            <span className="wa-card-mark" aria-label={t('games.whoAmI.card')}>
              ?
            </span>
            {kind && <span className="wa-card-kind">{kind}</span>}
          </>
        )}
      </div>
    </figure>
  );
}

/** The deck of questions: tap one to see what it means, Ask to ask it; asked ones carry the card's answer, stamped. */
export function QuestionDeck({
  dialect,
  questions,
  asked,
  disabled,
  onAsk,
}: {
  dialect: GameDialect;
  questions: readonly WhoAmIQuestion[];
  asked: readonly WhoAmIAsked[];
  disabled: boolean;
  onAsk: (question: string) => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const script = dialectDirection(dialect);
  const [open, setOpen] = useState<string | null>(null);
  const answers = new Map(asked.map((a) => [a.question, a.answer]));
  // the questions asked first, in the order they were asked; the rest after
  const order = [...asked.map((a) => questions.find((q) => q.id === a.question)).filter((q): q is WhoAmIQuestion => !!q), ...questions.filter((q) => !answers.has(q.id))];
  return (
    <section className="wa-deck" aria-labelledby="wa-deck-title">
      <h2 id="wa-deck-title" className="wa-title">
        {t('games.whoAmI.questions')}
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
                {shown && <span className="wa-q-meaning">{meaningIn(q.meanings, locale) ?? q.meanings.en}</span>}
              </button>
              {answer !== undefined ? (
                <span className={`wa-stamp${answer ? ' is-yes' : ' is-no'}`} lang={script.lang} dir={script.dir}>
                  {yesNo(dialect, answer, t)}
                </span>
              ) : (
                <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onAsk(q.id)}>
                  {t('games.whoAmI.ask')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The words it could be: pick one, then Guess; a tile already guessed wrong is crossed out. */
export function GuessTiles({
  dialect,
  tiles,
  crossed,
  right,
  disabled,
  onGuess,
}: {
  dialect: GameDialect;
  tiles: readonly WhoAmITile[];
  crossed: readonly string[];
  /** the right tile, once it is known */
  right: string | null;
  disabled: boolean;
  onGuess: (tile: string) => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const script = dialectDirection(dialect);
  const [picked, setPicked] = useState<string | null>(null);
  const can = picked !== null && !crossed.includes(picked) && !disabled;
  return (
    <section className="wa-guess" aria-labelledby="wa-guess-title">
      <h2 id="wa-guess-title" className="wa-title">
        {t('games.whoAmI.guessTitle')}
      </h2>
      <div className="wa-tiles" role="radiogroup" aria-labelledby="wa-guess-title">
        {tiles.map((tile) => {
          const out = crossed.includes(tile.id);
          const isRight = right === tile.id;
          return (
            <button
              key={tile.id}
              type="button"
              role="radio"
              aria-checked={picked === tile.id}
              className={`wa-tile${picked === tile.id ? ' is-picked' : ''}${out ? ' is-crossed' : ''}${isRight ? ' is-right' : ''}`}
              disabled={disabled || out}
              onClick={() => setPicked(tile.id)}
              aria-label={out ? `${tile.word}, ${t('games.whoAmI.notThis')}` : undefined}
            >
              <span className="wa-tile-word" lang={script.lang} dir={script.dir}>
                {tile.word}
              </span>
              {tile.meanings && <span className="wa-tile-meaning">{meaningIn(tile.meanings, locale) ?? tile.meanings.en}</span>}
            </button>
          );
        })}
      </div>
      {!disabled && (
        <Button
          onClick={() => {
            if (can && picked) onGuess(picked);
          }}
          disabled={!can}
        >
          {t('games.whoAmI.guess')}
        </Button>
      )}
    </section>
  );
}
