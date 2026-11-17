import { useId } from 'react';
import { dialectDirection, meaningIn, type GameDialect } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import { BookmarkIcon } from './icons';
import './word-answer.css';

/**
 * What a word game teaches at its end: the word it was about, with what it
 * means, and the rhymes a round left unfound.
 *
 * The server sends a word's meanings in every interface language a word card
 * gives (api/src/game/word-meanings.ts) and the reader is shown their own,
 * falling back to English, as the riddles and proverbs do. A meaning nobody has
 * written is simply left out: the word is still the answer, and a guessed
 * translation would teach the wrong thing.
 */

/** A spelling compared for sameness only: case, outer spaces and the shape of its letters set aside. */
function same(a: string, b: string): boolean {
  return a.normalize('NFC').trim().toLowerCase() === b.normalize('NFC').trim().toLowerCase();
}

/**
 * What to show under `word`: the reader's own meaning, else the English one,
 * and never the word itself again. A Kurmancî reader of a Kurmancî word would
 * otherwise read "zevî" under "zevî" wherever a card gives the word as its own
 * meaning; English, or nothing, says more than that.
 */
function shownMeaning(meanings: WordMeanings | null | undefined, locale: string, word: string): string | null {
  const own = meaningIn(meanings, locale);
  if (own && !same(own, word)) return own;
  const en = meanings?.en?.trim();
  return en && !same(en, word) ? en : null;
}

/** What a word means, by interface language; empty when nobody has written it yet. */
export type WordMeanings = Partial<Record<string, string>>;

/** A rhyme the round could have found, with its meanings (`missed` on a round or a match's results). */
export interface RhymeHint {
  word: string;
  meanings: WordMeanings;
}

/** The two varieties as the word games name them, in the letters each is written in. */
export type WordGameDialect = 'kurmanci' | 'sorani';

function letters(dialect: WordGameDialect): GameDialect {
  return dialect === 'sorani' ? 'ckb' : 'kmr';
}

/**
 * The answer of a finished Peyvok: the word, large, with its meaning under
 * it, and Save to vocabulary when the dictionary has the word to save it as.
 * Saving is the page's to do (it knows the game); this only says how it
 * stands. The button stays a button once the word is saved, pressed and
 * still, so the line does not jump and a screen reader hears it is on.
 */
export function WordAnswer({
  word,
  meanings,
  save,
}: {
  word: string;
  meanings: WordMeanings | null | undefined;
  save?: { saved: boolean; busy: boolean; onSave: () => void; error?: string | null };
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const meaning = shownMeaning(meanings, locale, word);
  return (
    <div className="wg-answer">
      <p className="wg-answer-word" lang="ku" dir="ltr">
        {word}
      </p>
      {meaning && (
        <p className="wg-answer-meaning" dir="auto">
          {meaning}
        </p>
      )}
      {save && (
        <button
          type="button"
          className={`btn btn-ghost btn-sm wg-answer-save${save.saved ? ' is-on' : ''}`}
          aria-pressed={save.saved}
          aria-busy={save.busy || undefined}
          disabled={save.saved || save.busy}
          onClick={save.onSave}
        >
          <BookmarkIcon size={16} weight={save.saved ? 'fill' : 'regular'} />
          <span>{save.saved ? t('dictionary.savedWord') : t('dictionary.saveWord')}</span>
        </button>
      )}
      {save?.error && (
        <p className="wg-answer-error" role="status">
          {save.error}
        </p>
      )}
    </div>
  );
}

/**
 * What a word means, said in one quiet line under a sentence that already
 * names the word (a battle's "The word was …"). Nothing at all when nobody has
 * written a meaning for it.
 */
export function WordMeaningLine({ word, meanings }: { word: string; meanings: WordMeanings | null | undefined }): React.JSX.Element | null {
  const locale = useLocale();
  const meaning = shownMeaning(meanings, locale, word);
  if (!meaning) return null;
  return (
    <p className="wg-meaning-line" dir="auto">
      {meaning}
    </p>
  );
}

/**
 * The rhymes a round did not find, each with its meaning, under a heading of
 * its own: finding rhymes is half of the game, and seeing the ones that got
 * away, with what they mean, is how the next round goes better. Up to ten
 * come from the server, those with a meaning first; none, and there is no
 * list at all.
 */
export function MissedRhymes({
  hints,
  dialect,
}: {
  hints: readonly RhymeHint[] | null | undefined;
  dialect: WordGameDialect;
}): React.JSX.Element | null {
  const t = useT();
  const locale = useLocale();
  const titleId = useId();
  if (!hints || hints.length === 0) return null;
  const { lang, dir } = dialectDirection(letters(dialect));
  return (
    <section className="wg-missed" aria-labelledby={titleId}>
      <h2 id={titleId} className="wg-missed-title">
        {t('games.rhyme.missed')}
      </h2>
      <ul className="wg-missed-list">
        {hints.map((h) => {
          const meaning = shownMeaning(h.meanings, locale, h.word);
          return (
            <li key={h.word} className="wg-missed-item">
              <span className="wg-missed-word" lang={lang} dir={dir}>
                {h.word}
              </span>
              {meaning && (
                <span className="wg-missed-meaning" dir="auto">
                  {meaning}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
