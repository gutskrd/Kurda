import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { APP_LOCALES } from '@kurda/shared';
import { I18nProvider, useI18n, useT } from './I18nProvider';
import { LanguagePicker } from './LanguagePicker';
import { en } from './en';
import { ku } from './ku';
import { nl } from './nl';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { tr } from './tr';
import { ar } from './ar';

afterEach(() => {
  localStorage.clear();
  document.documentElement.lang = '';
  document.documentElement.dir = '';
  vi.restoreAllMocks();
});

const CATALOGUES = { ku, nl, de, es, fr, tr, ar };

function Probe(): React.JSX.Element {
  const { locale, setLocale } = useI18n();
  const t = useT();
  return (
    <>
      <span data-testid="civak">{t('nav.civak')}</span>
      <span data-testid="games">{t('nav.games')}</span>
      <span data-testid="vars">{t('language.savedTo', { language: 'Kurdî' })}</span>
      <LanguagePicker value={locale} onChange={setLocale} />
    </>
  );
}

const show = (): void => {
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );
};

describe('the catalogues', () => {
  /**
   * English defines the key set and is what everything falls back to, so a key
   * that exists nowhere else is fine — one that exists ONLY somewhere else is a
   * typo that will never be shown.
   */
  it('use no key English does not have', () => {
    const known = new Set(Object.keys(en));
    for (const [code, catalogue] of Object.entries(CATALOGUES)) {
      for (const key of Object.keys(catalogue)) {
        expect(known.has(key), `${code} has "${key}", which English does not`).toBe(true);
      }
    }
  });

  it('translate every key, in every language', () => {
    const keys = Object.keys(en);
    for (const [code, catalogue] of Object.entries(CATALOGUES)) {
      const missing = keys.filter((k) => !(k in catalogue));
      expect(missing, `${code} is missing ${missing.length} of ${keys.length}`).toEqual([]);
    }
  });

  /**
   * A placeholder that survives translation is a sentence with `{language}`
   * printed in the middle of it. They are the one thing in these files that is
   * not free text.
   */
  it('keep the placeholders the English string uses', () => {
    const holes = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    for (const [code, catalogue] of Object.entries(CATALOGUES)) {
      for (const [key, value] of Object.entries(catalogue)) {
        expect(holes(value as string), `${code} "${key}"`).toEqual(holes(en[key as keyof typeof en]));
      }
    }
  });

  it('offer a native name for every language on the list', () => {
    for (const l of APP_LOCALES) {
      expect(l.nativeName.length, l.code).toBeGreaterThan(0);
      expect(CATALOGUES[l.code as keyof typeof CATALOGUES] ?? en, l.code).toBeDefined();
    }
  });
});

describe('choosing a language', () => {
  it('starts in English when nothing says otherwise', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
    show();
    expect(screen.getByTestId('games')).toHaveTextContent('Games');
  });

  /** `de-AT` and `de-CH` are German as far as an interface is concerned. */
  it('takes the browser up on a language it speaks, region and all', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-AT');
    show();
    expect(screen.getByTestId('games')).toHaveTextContent('Spiele');
  });

  it('ignores a browser language it does not have', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ja-JP');
    show();
    expect(screen.getByTestId('games')).toHaveTextContent('Games');
  });

  it('changes everything at once, and remembers', async () => {
    show();
    await userEvent.selectOptions(screen.getByRole('combobox'), 'ku');

    expect(screen.getByTestId('games')).toHaveTextContent('Yarî');
    expect(screen.getByTestId('vars')).toHaveTextContent('MyKurda niha bi Kurdî e.');
    expect(localStorage.getItem('mykurda_locale')).toBe('ku');
  });

  it('picks up what this device chose last', () => {
    localStorage.setItem('mykurda_locale', 'tr');
    show();
    expect(screen.getByTestId('games')).toHaveTextContent('Oyunlar');
  });

  it('ignores a stored value that is not a language it has', () => {
    localStorage.setItem('mykurda_locale', 'klingon');
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en');
    show();
    expect(screen.getByTestId('games')).toHaveTextContent('Games');
  });

  /**
   * `lang` is what a screen reader picks a voice from and `dir` is what puts
   * Arabic the right way round. Neither is cosmetic.
   */
  it('tells the document what it is showing', async () => {
    show();
    await userEvent.selectOptions(screen.getByRole('combobox'), 'ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');

    await userEvent.selectOptions(screen.getByRole('combobox'), 'fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(document.documentElement.dir).toBe('ltr');
  });

  /** A private window throws on the first read; that is not a reason to fail. */
  it('still works where storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es');

    show();
    expect(screen.getByTestId('games')).toHaveTextContent('Juegos');
    await act(async () => {
      await userEvent.selectOptions(screen.getByRole('combobox'), 'nl');
    });
    // it applies for this session even though it cannot be remembered
    expect(screen.getByTestId('games')).toHaveTextContent('Spellen');
  });

  it('names each language in its own language, and says so to a screen reader', () => {
    show();
    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    const dutch = options.find((o) => o.value === 'nl')!;
    expect(dutch).toHaveTextContent('Nederlands');
    expect(dutch.lang).toBe('nl');
    expect(options.find((o) => o.value === 'ar')).toHaveTextContent('العربية');
  });
});
