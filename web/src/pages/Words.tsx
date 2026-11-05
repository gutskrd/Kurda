import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import '@fontsource-variable/vazirmatn';
import { KURDISH_NUMBER_MAX, WORD_SET_IDS, wordIn, wordSet, wordSetSvg, type AlphabetScript, type WordSetId } from '@kurda/shared';
import { useScript } from '../alphabet/script';
import { ChevronIcon } from '../components/icons';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import { formatNumber, scriptDir, scriptLang } from '../words/parts';
import { seenCounts } from '../words/seen';
import { SET_BODY, SET_NAME, SET_TITLE } from '../words/sets';

/**
 * Words to know: the colours, the numbers, the days of the week and the
 * months, each a set taught the way the alphabet is — one card a set, with
 * its Kurdish name, a picture of what is in it, and how many of its words
 * have been opened in this browser. A card opens its set (WordSet.tsx).
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

  return (
    <div className="container wd">
      <div className="page-header">
        <span className="eyebrow">{t('learn.tools.title')}</span>
        <h1 className="page-title">{t('words.title')}</h1>
        <p className="page-sub">{t('words.lead')}</p>
      </div>
      <div className="wd-sets">
        {WORD_SET_IDS.map((set) => (
          <SetCard key={set} set={set} dialect={dialect} seen={counts[set]} />
        ))}
      </div>
    </div>
  );
}

function SetCard({ set, dialect, seen }: { set: WordSetId; dialect: AlphabetScript; seen: number }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const total = wordSet(set).length;
  const title = t(SET_TITLE[set]);
  // the set's Kurdish name, in the dialect the pages teach in — or the other one for a reader whose title already is that word
  const named: AlphabetScript = (dialect === 'kmr' && locale === 'ku') || (dialect === 'ckb' && locale === 'ckb') ? (dialect === 'kmr' ? 'ckb' : 'kmr') : dialect;
  const name = wordIn(SET_NAME[set], named);
  const all = seen === total;
  const progress = all
    ? t('words.exploredAll', { total: formatNumber(total, locale) })
    : t('words.explored', { n: formatNumber(seen, locale), total: formatNumber(total, locale) });
  return (
    <Link
      to={`/app/learn/words/${set}?script=${dialect}`}
      className="wd-set"
      aria-label={t('words.tileLabel', { word: title, meaning: progress })}
      aria-describedby={`wd-set-${set}-body`}
    >
      <Teaser set={set} />
      <span className="wd-set-text">
        <span className="wd-set-title">{title}</span>
        <span className={`wd-set-name${named === 'ckb' ? ' ab-ar' : ''}`} lang={scriptLang(named)} dir={scriptDir(named)}>
          {name}
        </span>
        <span className="wd-set-body" id={`wd-set-${set}-body`}>
          {t(SET_BODY[set], { max: formatNumber(KURDISH_NUMBER_MAX, locale) })}
        </span>
        <span className={`wd-set-progress${all ? ' is-done' : ''}`} aria-hidden="true">
          <span className="ab-progress-track">
            <span style={{ width: `${Math.round((seen / total) * 100)}%` }} />
          </span>
          {progress}
        </span>
      </span>
      <ChevronIcon className="wd-set-chevron" />
    </Link>
  );
}

/**
 * A picture of what a set holds, in place of an icon, as the alphabet's tile
 * shows its letters: a paint palette, an abacus, the sun (roj, the day) and a
 * wall calendar, drawn in the shared art so the phone shows the same four.
 */
function Teaser({ set }: { set: WordSetId }): React.JSX.Element {
  const markup = useMemo(() => ({ __html: wordSetSvg({ set, size: 44 }) }), [set]);
  return <span className="wd-teaser" aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}
