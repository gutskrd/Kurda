import { useId } from 'react';
import { dialectDirection, meaningIn, type GameDialect } from '@kurda/shared';
import { useLocale, useT } from '../i18n/I18nProvider';
import { BookmarkIcon } from './icons';
import './word-answer.css';

/**
 * What a word game teaches at its end: the word with its meaning, and the rhymes a round left unfound. Meanings come in
 * each interface language (api/src/game/word-meanings.ts), shown in the reader's own or English; a missing meaning is
 * left out rather than guessed.
 */

/** Compares spellings ignoring case, outer spaces and letter forms. */
function same(a: string, b: string): boolean {
  return a.normalize('NFC').trim().toLowerCase() === b.normalize('NFC').trim().toLowerCase();
}

/** The reader's meaning, else the English one, but never the word itself again (a card can give a word as its own meaning). */
function shownMeaning(meanings: WordMeanings | null | undefined, locale: string, word: string): string | null {
  const own = meaningIn(meanings, locale);
  if (own && !same(own, word)) return own;
  const en = meanings?.en?.trim();
  return en && !same(en, word) ? en : null;
}

/** What a word means, by interface language; empty when nobody has written it yet. */
export type WordMeanings = Partial<Record<string, string>>;

/** A rhyme the round could have found, with its meanings (`missed` in results). */
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
 * A finished Peyvok's word, large, with its meaning, and Save to vocabulary when the dictionary has it. The page does the
 * saving; once saved the button stays, pressed and still, so the line does not jump.
 */
export function WordAnswer({
  word,
  meanings,
  save,
}: {
  word: string;
  meanings: WordMeanings | null | undefined;
  save?: { saved: boolean; onSave: () => void; error?: string | null };
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
          disabled={save.saved}
          onClick={save.onSave}
        >
          <BookmarkIcon size={16} weight={save.saved ? 'fill' : 'regular'} className={save.saved ? 'saved-mark' : undefined} />
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

/** A word's meaning in one quiet line under a sentence that already names it; nothing when no meaning is written. */
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

/** The rhymes a round did not find, with their meanings, under their own heading; the server sends up to ten, meanings first. */
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
