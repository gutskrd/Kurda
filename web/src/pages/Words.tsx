import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { KURDISH_NUMBER_MAX, WORD_SET_IDS, wordIn, wordSet, wordSetSvg, type AlphabetScript, type KurdishWord, type WordsCardId } from '@kurda/shared';
import { useScript } from '../alphabet/script';
import { lettersSeen } from '../alphabet/seen';
import { ChevronIcon } from '../components/icons';
import { useLocale, usePageMeta, useT } from '../i18n/I18nProvider';
import { useGrowsInto } from '../lib/viewTransition';
import { formatNumber, scriptDir, scriptLang } from '../words/parts';
import { seenCounts } from '../words/seen';
import { LETTERS_NAME, SET_BODY, SET_NAME, SET_TITLE } from '../words/sets';

/**
 * Letters and words: the alphabet first, then colours, numbers, days and months, each a set taught like the alphabet.
 * One card each with its Kurdish name, a picture and how much has been opened in this browser. Open to everyone: the
 * words and synthesised clips ship with the site.
 */
export function Words(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  usePageMeta(t('meta.words.title'), t('meta.words.description'));
  const [dialect] = useScript(locale);
  const counts = useMemo(() => seenCounts(), []);
  const letters = useMemo(() => lettersSeen(dialect), [dialect]);
  // Where the tool's card on Learn lands, and what goes back to it.
  const head = useGrowsInto('learn:words', { shape: 'card' });

  return (
    <div className="container wd">
      <div className="page-header" ref={head}>
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
  // The card's Kurdish name in the taught dialect, or the other one for a reader whose title already is that word.
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
            <span style={{ '--p': total > 0 ? Math.min(seen, total) / total : 0 } as React.CSSProperties} />
          </span>
          {progress}
        </span>
      </span>
      <ChevronIcon className="wd-set-chevron" />
    </Link>
  );
}

/** A picture of what a card holds (toy blocks, a palette, an abacus, the sun, a calendar), in the shared art so the phone shows the same. */
function Teaser({ id, dialect }: { id: WordsCardId; dialect: AlphabetScript }): React.JSX.Element {
  const markup = useMemo(() => ({ __html: wordSetSvg({ set: id, size: 44, script: dialect === 'ckb' ? 'arabic' : 'latin' }) }), [id, dialect]);
  return <span className="wd-teaser" aria-hidden="true" dangerouslySetInnerHTML={markup} />;
}
