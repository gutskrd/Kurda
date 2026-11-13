import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import '@fontsource-variable/vazirmatn';
import {
  NEWROZ,
  RELATIVE_DAYS,
  SEASONS,
  SEASON_ORDER,
  exampleMeaningLocale,
  findWord,
  glossIn,
  isWordSetId,
  kurdishNumber,
  kurdishWeekday,
  wordGroups,
  wordIn,
  type AlphabetScript,
  type SetWord,
  type WordColour,
  type WordSetId,
} from '@kurda/shared';
import { play, useRecordings, wordSound } from '../alphabet/audio';
import { useScript } from '../alphabet/script';
import { Sound } from '../alphabet/Sound';
import { Modal } from '../components/Modal';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { DayName, Digits, MeaningText, dateIn, formatNumber, meaningOf, scriptDir, scriptLang, type Meaning } from '../words/parts';
import { useWordsSeen } from '../words/seen';
import { GROUP_TITLE, SET_TITLE, tinted } from '../words/sets';
import { WordCard } from '../words/WordCard';
import { WordPractice } from '../words/WordPractice';

/**
 * One word set — the colours, the numbers, the days or the months — taught
 * the way the alphabet is (pages/Alphabet.tsx): Kurmancî or Soranî at the
 * switch, the words as tiles drawn to fit the set, each with its sound in the
 * corner and opening into a card that says it at once, and a round of
 * questions to check yourself with. The colours are swatches with their names
 * on a label that reads on any of them; the numbers show their digits,
 * Soranî's own beside the Western ones; the days run from Saturday with the
 * number inside each name marked, and today's says so; the months carry their
 * season's tint, the calendar's first and then the Kurdish year from Newroz.
 *
 * Nothing waits on the server: the words and their synthesised clips are on
 * this site, and the recordings take the clips' place when they arrive
 * (alphabet/audio.ts). An address naming no set leads back to the sets.
 */
export function WordSet(): React.JSX.Element {
  const { set } = useParams();
  if (!isWordSetId(set)) return <Navigate to="/app/learn/words" replace />;
  // keyed, so another set starts from its own first word and its own ticks
  return <SetPage key={set} set={set} />;
}

function SetPage({ set }: { set: WordSetId }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  usePageMeta(`${t(SET_TITLE[set])} · ${t('meta.words.title')}`, t('meta.words.description'));
  const [dialect, setDialect] = useScript(locale);
  const wide = useMediaQuery('(min-width: 960px)');
  useRecordings();

  const groups = useMemo(() => wordGroups(set), [set]);
  const order = useMemo(() => groups.flatMap((g) => g.words.map((w) => w.id)), [groups]);

  // on a wide screen there is always a word open beside the grid; on a phone, one opens when tapped
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    setPicked(null);
    setSheet(false);
  }, [dialect]);
  const current = findWord(set, picked ?? order[0]!)!;

  const [seen, markSeen] = useWordsSeen(set, dialect);
  // hearing it the moment it is tapped is the point of tapping: the word and its sound, together
  const open = (id: string): void => {
    setPicked(id);
    markSeen(id);
    const word = findWord(set, id);
    const src = word ? wordSound(word, dialect) : null;
    if (src) play(src);
  };
  const pick = (id: string): void => {
    open(id);
    if (!wide) setSheet(true);
  };
  const step = (by: number): void => {
    const i = order.indexOf(current.id);
    open(order[(i + by + order.length) % order.length]!);
  };

  const today = set === 'days' ? kurdishWeekday(new Date()) : null;
  const explored = order.filter((id) => seen.has(id)).length;
  const summary =
    set === 'numbers'
      ? t('words.numbers.summary', { n: formatNumber(21, locale), example: kurdishNumber(21, dialect) })
      : t(set === 'colours' ? 'words.colours.summary' : set === 'days' ? 'words.days.summary' : 'words.months.summary');

  const card = <WordCard word={current} dialect={dialect} locale={locale} onStep={step} />;

  return (
    <div className="container ab wd">
      <div className="page-header">
        <Link className="eyebrow wd-back" to={`/app/learn/words?script=${dialect}`}>
          {t('words.title')}
        </Link>
        <h1 className="page-title">{t(SET_TITLE[set])}</h1>
        <p className="page-sub">{t('words.lead')}</p>
      </div>

      <div className="toolbar" role="tablist" aria-label={t('alphabet.script.label')}>
        {(['kmr', 'ckb'] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={dialect === s} className={`chip${dialect === s ? ' active' : ''}`} onClick={() => setDialect(s)}>
            {t(s === 'kmr' ? 'games.race.kurmanci' : 'games.race.sorani')}
          </button>
        ))}
      </div>

      <div className="ab-layout">
        <div className="ab-main">
          <p className="ab-summary">{summary}</p>
          <div className={`ab-progress${explored === order.length ? ' is-done' : ''}`}>
            <div className="ab-progress-track" aria-hidden="true">
              <span style={{ '--p': order.length > 0 ? explored / order.length : 0 } as React.CSSProperties} />
            </div>
            <span className="ab-progress-text" aria-live="polite">
              {explored === order.length
                ? t('words.exploredAll', { total: formatNumber(order.length, locale) })
                : t('words.explored', { n: formatNumber(explored, locale), total: formatNumber(order.length, locale) })}
            </span>
          </div>

          {set === 'months' && <SeasonLegend dialect={dialect} />}

          {groups.map((g) => {
            const title = GROUP_TITLE[g.id];
            return (
              <section key={g.id} className="wd-group" aria-labelledby={title ? `wd-${g.id}` : undefined}>
                {title && (
                  <h2 className="ab-group-title" id={`wd-${g.id}`}>
                    {t(title)} <span className="ab-count">{formatNumber(g.words.length, locale)}</span>
                  </h2>
                )}
                {g.id === 'kurdish' && <p className="ab-group-body">{t('words.group.kurdishBody', { date: dateIn(NEWROZ, locale, t) })}</p>}
                <div className={`wd-grid wd-grid--${set}`} dir={scriptDir(dialect)}>
                  {g.words.map((word) => (
                    <WordTile
                      key={word.id}
                      word={word}
                      dialect={dialect}
                      on={current.id === word.id}
                      seen={seen.has(word.id)}
                      today={word.set === 'days' && word.order === today}
                      onPick={() => pick(word.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          <WordPractice key={`${set}:${dialect}`} set={set} dialect={dialect} locale={locale} onOpen={pick} />
        </div>

        {wide && <aside className="ab-aside">{card}</aside>}
      </div>

      {!wide && (
        <Modal open={sheet} onClose={() => setSheet(false)} label={t(SET_TITLE[set])}>
          {card}
        </Modal>
      )}
    </div>
  );
}

/**
 * One word in the grid, drawn to fit its set: a button that opens the word
 * (and says it), read out as the word and then what it means — "sor, red" —
 * with the word's own play button in the corner, so it can be heard without
 * being opened. No play button where there is no sound yet. A tick once it
 * has been opened.
 */
function WordTile({
  word,
  dialect,
  on,
  seen,
  today,
  onPick,
}: {
  word: SetWord;
  dialect: AlphabetScript;
  on: boolean;
  seen: boolean;
  today: boolean;
  onPick: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const meaning = meaningOf(word, dialect, locale, t);
  const said = wordIn(word, dialect);
  const labelled = t('words.tileLabel', { word: said, meaning: meaning.text });
  const label = today ? t('words.tileLabel', { word: labelled, meaning: glossIn(RELATIVE_DAYS.today, locale) }) : labelled;
  const arabic = dialect === 'ckb';
  const state = `${on ? ' is-on' : ''}${seen ? ' is-seen' : ''}`;
  const listen = <Sound src={wordSound(word, dialect)} label={t('words.listen', { word: said })} size="sm" />;

  if (word.set === 'colours') return <ColourTile word={word} dialect={dialect} on={on} seen={seen} label={label} listen={listen} onPick={onPick} />;

  const style = word.set === 'months' ? ({ '--tint': tinted(SEASONS[word.season].tint) } as React.CSSProperties) : undefined;
  return (
    <div className={`wd-tile wd-tile--${word.set}${state}`} style={style}>
      <button type="button" className="wd-tile-open" aria-pressed={on} aria-label={label} onClick={onPick}>
        {word.set === 'numbers' && (
          <>
            <Digits value={word.value} dialect={dialect} size="tile" />
            <span className={`wd-tile-word${arabic ? ' ab-ar' : ''}`} lang={scriptLang(dialect)} dir={scriptDir(dialect)}>
              {said}
            </span>
          </>
        )}
        {word.set === 'days' && (
          <>
            {today && (
              <span className={`wd-today${arabic ? ' ab-ar' : ''}`} lang={scriptLang(dialect)}>
                {wordIn(RELATIVE_DAYS.today, dialect)}
              </span>
            )}
            <DayName day={word} dialect={dialect} className="wd-day-name" />
            <TileMeaning meaning={meaning} />
          </>
        )}
        {word.set === 'months' && (
          <>
            <span className="wd-month-number">{formatNumber(word.number, locale)}</span>
            <span className={`wd-month-name${arabic ? ' ab-ar' : ''}`} lang={scriptLang(dialect)} dir={scriptDir(dialect)}>
              {said}
            </span>
            <TileMeaning meaning={word.calendar === 'kurdish' ? { text: dateIn(word.from, locale, t), script: null } : meaning} />
          </>
        )}
      </button>
      {listen}
    </div>
  );
}

/** A colour's tile: filled with it, the name on a label of its own, so it reads the same on white, on yellow and on black. */
function ColourTile({
  word,
  dialect,
  on,
  seen,
  label,
  listen,
  onPick,
}: {
  word: WordColour;
  dialect: AlphabetScript;
  on: boolean;
  seen: boolean;
  label: string;
  listen: React.ReactNode;
  onPick: () => void;
}): React.JSX.Element {
  const arabic = dialect === 'ckb';
  return (
    <div className={`wd-tile wd-tile--colours${on ? ' is-on' : ''}`} style={{ '--swatch': word.hex } as React.CSSProperties}>
      <button type="button" className="wd-tile-open" aria-pressed={on} aria-label={label} onClick={onPick}>
        <span className={`wd-chip${seen ? ' is-seen' : ''}`}>
          <span className={arabic ? 'ab-ar' : undefined} lang={scriptLang(dialect)} dir={scriptDir(dialect)}>
            {wordIn(word, dialect)}
          </span>
        </span>
      </button>
      {listen}
    </div>
  );
}

function TileMeaning({ meaning }: { meaning: Meaning }): React.JSX.Element {
  return <MeaningText meaning={meaning} className="wd-tile-meaning" />;
}

/** Which tint is which season: each with its Kurdish name and what it means. */
function SeasonLegend({ dialect }: { dialect: AlphabetScript }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const shown = exampleMeaningLocale(dialect, locale);
  return (
    <ul className="wd-legend">
      {SEASON_ORDER.map((id) => {
        const season = SEASONS[id];
        const gloss = glossIn(season, shown);
        return (
          <li
            key={id}
            className="wd-legend-item"
            style={{ background: tinted(season.tint) }}
            aria-label={t('words.tileLabel', { word: wordIn(season, dialect), meaning: gloss })}
          >
            <i className="wd-legend-dot" style={{ background: season.tint }} aria-hidden="true" />
            <span className={`wd-legend-word${dialect === 'ckb' ? ' ab-ar' : ''}`} lang={scriptLang(dialect)} dir={scriptDir(dialect)} aria-hidden="true">
              {wordIn(season, dialect)}
            </span>
            <span className="wd-legend-gloss" aria-hidden="true">
              {gloss}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
