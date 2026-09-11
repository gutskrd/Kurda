import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { APP_LOCALES } from '@kurda/shared';
import { I18nProvider, useI18n, useT } from './I18nProvider';
import { LanguagePicker } from './LanguagePicker';
import { en } from './en';
import { ku } from './ku';
import { ckb } from './ckb';
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

const CATALOGUES = { ku, ckb, nl, de, es, fr, tr, ar };

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

/**
 * `Loading` and `ErrorState` are leaf primitives on nearly every screen, and an
 * error boundary sitting above the provider renders an `ErrorState`. If reading
 * a message needed the provider, that boundary would crash for want of the very
 * context whose failure it was reporting.
 */
describe('reading a message without a provider', () => {
  function Bare(): React.JSX.Element {
    const t = useT();
    return <span data-testid="bare">{t('common.retry')} · {t('language.savedTo', { language: 'X' })}</span>;
  }

  it('falls back to English rather than throwing', () => {
    render(<Bare />);
    expect(screen.getByTestId('bare')).toHaveTextContent('Try again · MyKurda is now in X.');
  });

  it('still refuses useI18n, which cannot mean anything without one', () => {
    function NeedsContext(): React.JSX.Element {
      useI18n();
      return <span />;
    }
    // React logs the thrown error; the assertion is that it throws at all
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<NeedsContext />)).toThrow(/I18nProvider/);
    quiet.mockRestore();
  });
});

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

  /**
   * The two Kurdish catalogues are the reason this app exists, so the words in
   * them are the product rather than a translation of it. These are the ones
   * that were wrong, and the shape of the mistake in each case is easy to make
   * again: a bare noun where a negation was needed, and two different words for
   * one thing sitting next to each other in the same screen.
   */
  describe('Kurdish', () => {
    it('says nobody, not a person', () => {
      // "Kes" and "کەس" on their own are "a person" — in a list that also offers
      // "Her kes" (anyone), reading one as the other inverts what the setting does
      expect(ku['settings.visibility.nobody']).toBe('Ne kes');
      expect(ckb['settings.visibility.nobody']).toBe('هیچ کەس');
      expect(ku['settings.visibility.everyone']).toContain('Her kes');
    });

    it('turns a section off to hide it, not on', () => {
      // this said "veke" — turn it ON — for the sentence that explains how to
      // hide a section, which is the opposite of what the switch does
      expect(ku['edit.sections.help']).toContain('bigire');
      expect(ku['edit.sections.help']).not.toContain('Beşekê veke');
    });

    it('uses one word per thing', () => {
      // each of these had two words for one idea, in screens a reader sees together
      const kuText = Object.values(ku).join(String.fromCharCode(10));
      for (const [wrong, why] of [
        ['ajimêr', 'account is hesab everywhere else'],
        ['hevqafiye', 'rhyme is serwa everywhere else'],
        ['pesinand', 'like is ecibandin everywhere else'],
        ['Negirêdayî', 'offline is derhêl, the pair of serhêl'],
        ['şirove', 'the spelling is şîrove'],
      ] as const) {
        expect(kuText.includes(wrong), `ku still has "${wrong}" — ${why}`).toBe(false);
      }
    });
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

    expect(screen.getByTestId('games')).toHaveTextContent('Lîstik');
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

  /**
   * The title and the description live in `index.html`, one static file served
   * to everybody — so they stayed English on every screen, in the browser tab,
   * in the bookmark, and in whatever a search engine had cached. Found by
   * looking at the running app rather than by any test.
   */
  it('renames the tab and the description too', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    document.head.appendChild(meta);

    show();
    expect(document.title).toBe('MyKurda — Learn Kurdish');

    await userEvent.selectOptions(screen.getByRole('combobox'), 'de');
    expect(document.title).toBe('MyKurda — Kurdisch lernen');
    expect(meta.getAttribute('content')).toContain('Kurdisch zu lernen');

    meta.remove();
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

  /**
   * Kurdish is offered twice, and it has to be: Kurmancî is written in Latin
   * script and Soranî in Arabic, so a Soranî reader offered only Kurmancî is
   * being offered a script they may not read at all. They sit together at the
   * top of the list, and each says which variety it is — two rows both reading
   * "Kurdî" would be the same choice twice.
   */
  it('offers both Kurdish varieties, together, at the top', () => {
    show();
    const options = screen.getAllByRole('option') as HTMLOptionElement[];

    expect(options[0]!.value).toBe('ku');
    expect(options[1]!.value).toBe('ckb');
    expect(options[0]).toHaveTextContent('Kurmancî');
    expect(options[1]).toHaveTextContent('سۆرانی');
  });

  it('runs Soranî right to left and Kurmancî left to right', async () => {
    show();
    await userEvent.selectOptions(screen.getByRole('combobox'), 'ckb');
    expect(document.documentElement.lang).toBe('ckb');
    expect(document.documentElement.dir).toBe('rtl');

    await userEvent.selectOptions(screen.getByRole('combobox'), 'ku');
    expect(document.documentElement.lang).toBe('ku');
    expect(document.documentElement.dir).toBe('ltr');
  });

  /** They are two languages here, not one with a switch: different words. */
  it('gives the two varieties their own words', async () => {
    show();
    await userEvent.selectOptions(screen.getByRole('combobox'), 'ku');
    expect(screen.getByTestId('games')).toHaveTextContent('Lîstik');

    await userEvent.selectOptions(screen.getByRole('combobox'), 'ckb');
    expect(screen.getByTestId('games')).toHaveTextContent('یاری');
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
