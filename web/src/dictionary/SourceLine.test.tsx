import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../i18n/I18nProvider';
import { en } from '../i18n/en';
import { ku } from '../i18n/ku';
import { ckb } from '../i18n/ckb';
import { nl } from '../i18n/nl';
import { de } from '../i18n/de';
import { es } from '../i18n/es';
import { fr } from '../i18n/fr';
import { tr } from '../i18n/tr';
import { ar } from '../i18n/ar';
import { SourceLine } from './SourceLine';

const CATALOGUES = { en, ku, ckb, nl, de, es, fr, tr, ar };

describe('SourceLine', () => {
  it('names the source and the licence, and links both', () => {
    render(
      <I18nProvider>
        <SourceLine />
      </I18nProvider>,
    );
    expect(screen.getByRole('link', { name: 'Wîkîferheng' })).toHaveAttribute(
      'href',
      'https://ku.wiktionary.org/',
    );
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    );
  });

  /**
   * The condition of using Wîkîferheng, not a preference. A translation that
   * drops a placeholder would render a sentence with a hole in it where the
   * attribution used to be, in one language only — which is exactly the kind of
   * thing nobody notices until the licence is already being breached.
   */
  it.each(Object.entries(CATALOGUES))('keeps both attributions in %s', (_locale, catalogue) => {
    const sentence = catalogue['dictionary.source'] ?? en['dictionary.source'];
    expect(sentence).toContain('{source}');
    expect(sentence).toContain('{licence}');
  });
});
