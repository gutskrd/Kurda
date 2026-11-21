import { useMemo } from 'react';
import { dictionaryStillSvg, dictionaryTileSvg, dictionaryTiles } from '@kurda/shared';
import { useDarkPage } from '../theme/useDarkPage';

/**
 * The dictionary's picture before anything is searched (shared/src/art/dictionary.ts): an open book with the letters
 * Kurmancî adds to the alphabet lifting off it. Each tile floats on its own beat (dictionary.css), and holds still under
 * reduced motion. It is decoration, so screen readers pass it by.
 */
export function DictionaryArt(): React.JSX.Element {
  const dark = useDarkPage();
  const markup = useMemo(() => {
    const still = dictionaryStillSvg({ size: 240, dark, idPrefix: dark ? 'dictd' : 'dictl' });
    const tiles = dictionaryTiles(dark)
      .map((t, i) => `<g class="dict-art-tile dict-art-tile-${i + 1}">${dictionaryTileSvg(t)}</g>`)
      .join('');
    return still.replace('</svg>', `${tiles}</svg>`);
  }, [dark]);
  return <div className="dict-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}
