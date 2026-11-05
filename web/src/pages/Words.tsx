import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import '@fontsource-variable/vazirmatn';
import { KURDISH_NUMBER_MAX, WORD_SET_IDS, wordIn, wordSet, wordSetSvg, type AlphabetScript, type KurdishWord, type WordsCardId } from '@kurda/shared';
import { useScript } from '../alphabet/script';
import { lettersSeen } from '../alphabet/seen';
import { ChevronIcon } from '../components/icons';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import { formatNumber, scriptDir, scriptLang } from '../words/parts';
import { seenCounts } from '../words/seen';
import { LETTERS_NAME, SET_BODY, SET_NAME, SET_TITLE } from '../words/sets';

/**
 * Letters and words: the alphabet first, then the colours, the numbers, the
 * days of the week and the months, each a set taught the way the alphabet is.
 * One card each, with its Kurdish name, a picture of what is in it, and how
 * much of it has been opened in this browser; the letters' card opens the
 * alphabet (Alphabet.tsx), a set's card opens the set (WordSet.tsx).
 *
 * The letters stood on their own tile in Learn's tools beside this one; they
 * are the first of the same steps, so they sit at the top of the same list.
 *
 * Open to everyone, account or not, like the alphabet: the words and their
 * synthesised clips are files on this site, and the owner's recordings arrive
 * in the alphabet's own answer once there are any.
 */
export function Words(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  usePageMeta(t('meta.words.title'), t('meta.words.description'));
  const [dialect] = useScript(locale);
  const counts = useMemo(() => seenCounts(), []);
  const letters = useMemo(() => lettersSeen(dialect), [dialect]);

  return (
    <div className="container wd">
      <div className="page-header">
        <span className="eyebrow">{t('learn.tools.title')}</span>
        <h1 className="page-title">{t('words.title')}</h1>
        <p className="page-sub">{t('words.lead')}</p>
      </div>
      <div className="wd-sets">
        <Card
          id="letters"
          to={`/app/alphabet?script=${dialect}`}
          dialect={dialect}
          title={t('words.set.letters')}
          name={LETTERS_NAME}
          body={t('words.set.lettersBody')}
          seen={letters.seen}
          total={letters.total}
        />
        {WORD_SET_IDS.map((set) => (
          <Card
            key={set}
            id={set}
            to={`/app/learn/words/${set}?script=${dialect}`}
            dialect={dialect}
            title={t(SET_TITLE[set])}
            name={SET_NAME[set]}
            body={t(SET_BODY[set], { max: formatNumber(KURDISH_NUMBER_MAX, locale) })}
            seen={counts[set]}
            total={wordSet(set).length}
          />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  id: WordsCardId;
  to: string;
  dialect: AlphabetScript;
  title: string;
  name: KurdishWord;
  body: string;
  seen: number;
  total: number;
}

function Card({ id, to, dialect, title, name: names, body, seen, total }: CardProps): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  // the card's Kurdish name, in the dialect the pages teach in — or the other one for a reader whose title already is that word
  const named: AlphabetScript = (dialect === 'kmr' && locale === 'ku') || (dialect === 'ckb' && locale === 'ckb') ? (dialect === 'kmr' ? 'ckb' : 'kmr') : dialect;
  const name = wordIn(names, named);
  const all = total > 0 && seen >= total;
  const progress = all
    ? t('words.exploredAll', { total: formatNumber(total, locale) })
    : t('words.explored', { n: formatNumber(seen, locale), total: formatNumber(total, locale) });
  return (
    <Link
      to={to}
      className="wd-set"
      aria-label={t('words.tileLabel', { word: title, meaning: progress })}
      aria-describedby={`wd-set-${id}-body`}
    >
      <Teaser id={id} dialect={dialect} />
      <span className="wd-set-text">
        <span className="wd-set-title">{title}</span>
        <span className={`wd-set-name${named === 'ckb' ? ' ab-ar' : ''}`} lang={scriptLang(named)} dir={scriptDir(named)}>
          {name}
        </span>
        <span className="wd-set-body" id={`wd-set-${id}-body`}>
          {body}
        </span>
        <span className={`wd-set-progress${all ? ' is-done' : ''}`} aria-hidden="true">
          <span className="ab-progress-track">
            <span style={{ width: `${total > 0 ? Math.round((Math.min(seen, total) / total) * 100) : 0}%` }} />
          </span>
          {progress}
        </span>
      </span>
      <ChevronIcon className="wd-set-chevron" />
    </Link>
  );
}

/**
 * A picture of what a card holds, in place of an icon: toy blocks with the
 * first letters (in the script the pages teach in), a paint palette, an
 * abacus, the sun (roj, the day) and a wall calendar, drawn in the shared art
 * so the phone shows the same five.
 */
function Teaser({ id, dialect }: { id: WordsCardId; dialect: AlphabetScript }): React.JSX.Element {
  const markup = useMemo(() => ({ __html: wordSetSvg({ set: id, size: 44, script: dialect === 'ckb' ? 'arabic' : 'latin' }) }), [id, dialect]);
  return <span className="wd-teaser" aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}
