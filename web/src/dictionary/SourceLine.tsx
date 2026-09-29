import { useT } from '../i18n/I18nProvider';

const SOURCE = 'https://ku.wiktionary.org/';
const LICENCE = 'https://creativecommons.org/licenses/by-sa/4.0/';
// names, not copy: a licence identifier and a wiki are the same in every language
const SOURCE_NAME = 'Wîkîferheng';
const LICENCE_NAME = 'CC BY-SA 4.0';

/**
 * Where the words came from, and under what.
 *
 * The bulk of the lexicon is imported from Wîkîferheng, which is CC BY-SA 4.0:
 * naming the source and linking the licence is the condition of using it, not a
 * courtesy, so this belongs on every screen that shows a definition.
 *
 * The sentence is translated whole, with `{source}` and `{licence}` still in it,
 * because word order differs in all nine languages — Turkish puts the source
 * first, Arabic reads the other way. Splitting it back apart here is what lets
 * each language keep its own shape and still have two real links in it.
 */
export function SourceLine(): React.JSX.Element {
  const t = useT();
  const parts = t('dictionary.source').split(/(\{source\}|\{licence\})/);

  return (
    <p className="dict-source">
      {parts.map((part, i) => {
        if (part === '{source}')
          return (
            <a key={i} href={SOURCE} target="_blank" rel="noreferrer noopener">
              {SOURCE_NAME}
            </a>
          );
        if (part === '{licence}')
          return (
            <a key={i} href={LICENCE} target="_blank" rel="noreferrer noopener">
              {LICENCE_NAME}
            </a>
          );
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}
