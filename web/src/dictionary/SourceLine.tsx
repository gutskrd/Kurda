import { useT } from '../i18n/I18nProvider';

const SOURCE = 'https://ku.wiktionary.org/';
const LICENCE = 'https://creativecommons.org/licenses/by-sa/4.0/';
// Names, not copy: a licence identifier and a wiki's name are the same in every language.
const SOURCE_NAME = 'Wîkîferheng';
const LICENCE_NAME = 'CC BY-SA 4.0';

/**
 * The lexicon's source and licence (Wîkîferheng, CC BY-SA 4.0), required on every screen that shows a definition.
 * The sentence is translated whole with `{source}` and `{licence}` in it, since word order differs by language, and
 * split here into two real links.
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
