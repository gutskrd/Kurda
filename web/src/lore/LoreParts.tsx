/**
 * Parts shared by the riddle and proverb screens: the shelf switch, the variety choice, translated text under the
 * Kurdish, the source list, the challenge button and the guest note.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { GAME_DIALECTS, type AppLocale, type GameDialect, type LoreSource } from '@kurda/shared';
import { CheckIcon, LinkIcon, ShareIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { dialectName } from '../learn/map';
import { STORIES_LIBRARY } from '../stories/api';
import { PROVERBS, RIDDLES } from './api';
import './lore.css';

type Shelf = 'stories' | 'riddles' | 'proverbs';

const SHELVES: ReadonlyArray<{ shelf: Shelf; to: string; name: MessageKey; meaning: MessageKey }> = [
  { shelf: 'stories', to: STORIES_LIBRARY, name: 'lore.shelf.stories.name', meaning: 'lore.shelf.stories.meaning' },
  { shelf: 'riddles', to: RIDDLES, name: 'lore.shelf.riddles.name', meaning: 'lore.shelf.riddles.meaning' },
  { shelf: 'proverbs', to: PROVERBS, name: 'lore.shelf.proverbs.name', meaning: 'lore.shelf.proverbs.meaning' },
];

/**
 * The Stories section's three shelves (stories, riddles, proverbs) under Learn's switch, each named in Kurdish with
 * its meaning where it differs. They are links that replace the address, so Back leaves the section.
 */
export function ShelfSwitch({ here }: { here: Shelf }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const nameLang = locale === 'ckb' ? 'ckb' : 'ku';
  return (
    <nav className="lore-shelves" aria-label={t('lore.shelf.label')}>
      {SHELVES.map((s) => {
        const name = t(s.name);
        const meaning = t(s.meaning);
        const on = s.shelf === here;
        return (
          <Link key={s.shelf} to={s.to} replace className={`lore-shelf${on ? ' is-on' : ''}`} aria-current={on ? 'page' : undefined}>
            <span className="lore-shelf-name" lang={nameLang}>
              {name}
            </span>
            {meaning !== name && <span className="lore-shelf-meaning">{meaning}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Kurmancî or Soranî as two radios in the app's segmented control. */
export function VarietySwitch({ value, onChange }: { value: GameDialect; onChange: (next: GameDialect) => void }): React.JSX.Element {
  const t = useT();
  // One radio group per switch on the page.
  const name = `lore-variety${useId()}`;
  return (
    <fieldset className="seg lore-variety">
      <legend className="sr-only">{t('lore.variety')}</legend>
      {GAME_DIALECTS.map((d) => (
        <label key={d} className={`seg-btn lore-variety-option${value === d ? ' is-active' : ''}`}>
          <input type="radio" name={name} value={d} checked={value === d} onChange={() => onChange(d)} />
          <span className="seg-btn-label">{dialectName(d)}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Text in the reader's language (or its English fallback), marked with its language and finding its own direction. */
export function Translated({ locale, className, children }: { locale: AppLocale; className?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <p className={className ? `lore-translated ${className}` : 'lore-translated'} lang={locale} dir="auto">
      {children}
    </p>
  );
}

/** Where a riddle or proverb was found: each source, its author, a link where there is one, and what it contributes. */
export function SourceList({ sources }: { sources: readonly LoreSource[] }): React.JSX.Element | null {
  const t = useT();
  if (sources.length === 0) return null;
  return (
    <div className="lore-sources">
      <h3 className="lore-sources-title">{t('lore.sources')}</h3>
      <ul className="lore-source-list">
        {sources.map((s, i) => (
          <li key={i} className="lore-source">
            <span className="lore-source-title" dir="auto">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </span>
            {s.author && (
              <span className="lore-source-author" dir="auto">
                {s.author}
              </span>
            )}
            {s.note && (
              <span className="lore-source-note" dir="auto">
                {s.note}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Challenges a friend with the riddle's address and question, never a hint or answer, through the share sheet or by
 * copying the link; the line beside the button says which happened.
 */
export function ChallengeButton({ question, path }: { question: string; path: string }): React.JSX.Element {
  const t = useT();
  const [said, setSaid] = useState<string>('');
  const [canShare, setCanShare] = useState(false);
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Some desktop browsers have `share` but refuse this data, so support is checked once on mount.
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    return () => {
      if (clear.current) clearTimeout(clear.current);
    };
  }, []);

  async function challenge(): Promise<void> {
    const url = new URL(path, window.location.origin).toString();
    const text = t('lore.challenge.text', { question });
    if (canShare) {
      try {
        await navigator.share({ title: t('lore.challenge.title'), text, url });
        return;
      } catch {
        // Dismissed or refused: copying the link still works.
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setSaid(t('lore.challenge.copied'));
    } catch {
      setSaid(t('lore.challenge.failed'));
    }
    if (clear.current) clearTimeout(clear.current);
    clear.current = setTimeout(() => setSaid(''), 4000);
  }

  return (
    <span className="lore-challenge">
      <button type="button" className="btn btn-secondary" onClick={() => void challenge()}>
        {canShare ? <ShareIcon size={18} /> : <LinkIcon size={18} />}
        {t('lore.challenge.button')}
      </button>
      <span className="lore-challenge-said" role="status">
        {said && <CheckIcon size={14} />}
        {said}
      </span>
    </span>
  );
}

/** What an account would keep, said once and quietly, with a sign-up link. */
export function GuestNote({ message }: { message: MessageKey }): React.JSX.Element {
  const t = useT();
  const location = useLocation();
  return (
    <p className="story-guest-line lore-guest">
      {t(message)}{' '}
      <Link to="/login" state={{ from: `${location.pathname}${location.search}` }}>
        {t('nav.login')}
      </Link>
    </p>
  );
}
