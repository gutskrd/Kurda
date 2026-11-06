import { useState } from 'react';
import {
  KURDISH_NUMBER_MAX,
  NEWROZ,
  RELATIVE_DAYS,
  SEASONS,
  dayAfter,
  exampleMeaningLocale,
  glossIn,
  kurdishNumber,
  readDigits,
  wordIn,
  type AlphabetScript,
  type AppLocale,
  type KurdishWord,
  type SetWord,
  type WordGloss,
} from '@kurda/shared';
import { isSynthesised, spokenAlphabet, useRecordings, wordSound } from '../alphabet/audio';
import { Sound } from '../alphabet/Sound';
import { CharacterStage, STAGE } from '../characters/CharacterStage';
import { useT } from '../i18n/I18nProvider';
import { DayName, Digits, MeaningText, Swatch, WordText, dateIn, formatNumber, meaningOf, scriptDir, scriptLang } from './parts';

/**
 * One word, open, as a letter opens on the alphabet page (its card): the
 * word large — a colour's swatch or a number's digits above it — its sound,
 * and the character who says it when a recording has one; what it means in
 * the reader's language; the same word in the other dialect; and one small
 * thing to do with it: a colour in a phrase, any number spelled out as it is
 * typed, a day between yesterday and tomorrow, a month's season. The words
 * before and after are at the foot, so a set can be walked through without
 * closing. Beside the grid on a wide screen, in a sheet on a phone.
 */
export function WordCard({
  word,
  dialect,
  locale,
  onStep,
}: {
  word: SetWord;
  dialect: AlphabetScript;
  locale: AppLocale;
  onStep: (by: number) => void;
}): React.JSX.Element {
  const t = useT();
  useRecordings();
  const sound = wordSound(word, dialect);
  const other: AlphabetScript = dialect === 'kmr' ? 'ckb' : 'kmr';
  const meaning = meaningOf(word, dialect, locale, t);
  const glossLocale = exampleMeaningLocale(dialect, locale);
  const kurdishMonth = word.set === 'months' && word.calendar === 'kurdish';
  // a Kurdish reader's meaning is the other dialect's word, which the row after it already gives
  const showMeaning = locale !== 'ku' && locale !== 'ckb' && word.set !== 'numbers' && !kurdishMonth;
  const clips = spokenAlphabet(sound);

  const head = (
    <h2 className="wd-card-head-word">
      <span className="sr-only">{t('words.tileLabel', { word: wordIn(word, dialect), meaning: meaning.text })}</span>
      <span className="wd-card-head-shown" aria-hidden="true">
        {word.set === 'colours' && <Swatch hex={word.hex} size={72} />}
        {word.set === 'numbers' && <Digits value={word.value} dialect={dialect} size="card" />}
        <Said word={word} dialect={dialect} size="head" />
      </span>
    </h2>
  );
  const listen = <Sound src={sound} label={t('alphabet.listen')} size="lg" />;

  return (
    <article className="ab-card wd-card" aria-live="polite">
      {clips.length === 0 ? (
        <div className="wd-card-head">
          {head}
          {listen}
        </div>
      ) : (
        <CharacterStage clips={clips} height={STAGE.card} className="ab-card-stage">
          <span className="ab-stage-letter">
            {head}
            {listen}
          </span>
        </CharacterStage>
      )}

      {showMeaning && (
        <Row label={t('words.means')}>
          <MeaningText meaning={meaning} className="wd-card-meaning" />
        </Row>
      )}
      {kurdishMonth && (
        <Row label={t('words.months.when')}>
          <span className="wd-card-meaning">{meaning.text}</span>
        </Row>
      )}

      <Row label={t(other === 'ckb' ? 'alphabet.inSorani' : 'alphabet.inKurmanci')}>
        <Said word={word} dialect={other} size="partner" />
      </Row>

      {word.set === 'colours' && (
        <Row label={t('words.inPhrase')}>
          <WordText word={word.example} dialect={dialect} className="wd-card-phrase" />
          <Gloss word={word.example} locale={locale} shown={glossLocale} />
        </Row>
      )}

      {word.set === 'numbers' && (
        <Row label={t('words.make.label')}>
          <MakeNumber dialect={dialect} locale={locale} />
        </Row>
      )}

      {word.set === 'days' && (
        <Row label={t('words.days.ifToday', { day: wordIn(word, dialect) })}>
          <ul className="wd-relatives" dir={scriptDir(dialect)}>
            {(['yesterday', 'today', 'tomorrow'] as const).map((when, i) => {
              const day = dayAfter(word, i - 1);
              const relative = RELATIVE_DAYS[when];
              return (
                <li key={when} className={`wd-relative${when === 'today' ? ' is-today' : ''}`}>
                  <span className="wd-relative-when">
                    <span className={`wd-relative-word${dialect === 'ckb' ? ' ab-ar' : ''}`} lang={scriptLang(dialect)}>
                      {wordIn(relative, dialect)}
                    </span>
                    <Gloss word={relative} locale={locale} shown={glossLocale} className="wd-relative-gloss" />
                  </span>
                  <DayName day={day} dialect={dialect} className="wd-relative-day" />
                </li>
              );
            })}
          </ul>
        </Row>
      )}

      {word.set === 'months' && (
        <Row label={t('words.months.season')}>
          <span className="wd-season">
            <i className="wd-season-dot" style={{ background: SEASONS[word.season].tint }} aria-hidden="true" />
            <span className={`wd-season-word${dialect === 'ckb' ? ' ab-ar' : ''}`} lang={scriptLang(dialect)} dir={scriptDir(dialect)}>
              {wordIn(SEASONS[word.season], dialect)}
            </span>
            <Gloss word={SEASONS[word.season]} locale={locale} shown={glossLocale} />
          </span>
        </Row>
      )}
      {word.set === 'months' && word.calendar === 'gregorian' && word.also && dialect === 'kmr' && (
        <Row label={t('words.months.also')}>
          <span className="wd-card-partner" lang="ku" dir="ltr">
            {word.also}
          </span>
        </Row>
      )}
      {(word.id === 'mar' || word.id === 'xakelewe') && <p className="ab-card-note">{t('words.months.newroz', { date: dateIn(NEWROZ, locale, t) })}</p>}

      <Stepper onStep={onStep} />
      {isSynthesised(sound) && <p className="ab-voice-note">{t('alphabet.voiceNote')}</p>}
    </article>
  );
}

/** A word as the page writes it: a day with the number inside it marked, Soranî with its Latin letters under it. */
function Said({ word, dialect, size }: { word: SetWord; dialect: AlphabetScript; size: 'head' | 'partner' }): React.JSX.Element {
  const cls = `wd-said wd-said--${size}`;
  if (word.set !== 'days') return <WordText word={word} dialect={dialect} className={cls} />;
  return (
    <span className={`wd-word ${cls}`}>
      <DayName day={word} dialect={dialect} className="wd-word-text" />
      {dialect === 'ckb' && (
        <span className="wd-latin" lang="ku" dir="ltr">
          {word.ckbLatin}
        </span>
      )}
    </span>
  );
}

/** A gloss in the reader's language — or, for a reader of one dialect, the word in the other, in that script. */
function Gloss({ word, locale, shown, className }: { word: KurdishWord & { meaning: WordGloss }; locale: AppLocale; shown: AppLocale; className?: string }): React.JSX.Element {
  const other = shown !== locale;
  const cls = [className ?? 'wd-gloss', other && shown === 'ckb' ? 'ab-ar' : ''].filter(Boolean).join(' ');
  return (
    <span className={cls} lang={other ? shown : undefined} dir={other ? (shown === 'ckb' ? 'rtl' : 'ltr') : undefined}>
      {glossIn(word, shown)}
    </span>
  );
}

/**
 * Any number typed, spelled out at once in the dialect on the page — the
 * thirty words of the set put to work. Digits from any keyboard are read:
 * Western, Arabic or Persian.
 */
function MakeNumber({ dialect, locale }: { dialect: AlphabetScript; locale: AppLocale }): React.JSX.Element {
  const t = useT();
  const [text, setText] = useState('');
  const n = readDigits(text);
  const spelled: KurdishWord | null =
    n === null || n > KURDISH_NUMBER_MAX
      ? null
      : { kmr: kurdishNumber(n, 'kmr'), ckb: kurdishNumber(n, 'ckb'), ckbLatin: kurdishNumber(n, 'ckb', { latin: true }) };
  return (
    <div className="wd-make">
      <input
        className="wd-make-input"
        type="text"
        inputMode="numeric"
        maxLength={4}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9٠-٩۰-۹]/g, '').slice(0, 4))}
        aria-label={t('words.make.label')}
        aria-describedby="wd-make-hint"
      />
      <p className="wd-make-hint" id="wd-make-hint">
        {t('words.make.hint', { max: formatNumber(KURDISH_NUMBER_MAX, locale) })}
      </p>
      <p className="wd-make-out" aria-live="polite">
        {spelled && <WordText word={spelled} dialect={dialect} className="wd-made" />}
      </p>
    </div>
  );
}

/** A part of the card under its little grey word, with a line above it. */
function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="ab-card-row">
      <span className="ab-card-label">{label}</span>
      {children}
    </div>
  );
}

/** The word before and the word after, at either end of the foot. */
function Stepper({ onStep }: { onStep: (by: number) => void }): React.JSX.Element {
  const t = useT();
  return (
    <div className="ab-step" dir="ltr">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onStep(-1)} aria-label={t('words.prev')}>
        ←
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onStep(1)} aria-label={t('words.next')}>
        →
      </button>
    </div>
  );
}
