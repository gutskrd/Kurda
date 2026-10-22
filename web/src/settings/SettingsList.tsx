import { useId } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon, ChevronIcon, CloseIcon, SearchIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';

/**
 * The pieces Settings is made of: a list of rows in named groups, as a phone's
 * own settings are, rather than a stack of boxes each with its controls open.
 *
 * A row says what is behind it in a word and an icon, and what it is set to
 * now at its end, so most of the page can be read without opening anything;
 * one tap opens its page. The groups are few and named for what they are
 * about, a band between them, so the eye finds the group first and then the
 * row. What cannot be undone is last, and red.
 */

/** A group of rows under a short heading; the last group has none. */
export function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }): React.JSX.Element {
  const id = useId();
  return (
    <section className="settings-section" aria-labelledby={title ? id : undefined}>
      {title && (
        <h2 className="settings-section-title" id={id}>
          {title}
        </h2>
      )}
      <ul className="settings-rows">{children}</ul>
    </section>
  );
}

export interface SettingsRowProps {
  icon: React.ReactNode;
  title: string;
  /** a line under the title: what the row does, when its name alone does not say */
  subtitle?: React.ReactNode;
  /** what it is set to now, at the row's end */
  value?: React.ReactNode;
  /** a page in the app */
  to?: string;
  /** somewhere outside it (an email address) */
  href?: string;
  onClick?: () => void;
  /** red, for what cannot be undone */
  destructive?: boolean;
  /** the page open beside the list on a wide screen */
  current?: boolean;
}

/** One row: a link to its page, an address, or a button that does it there and then. */
export function SettingsRow({ icon, title, subtitle, value, to, href, onClick, destructive = false, current = false }: SettingsRowProps): React.JSX.Element {
  const className = `settings-row${destructive ? ' is-danger' : ''}`;
  const body = (
    <>
      <span className="settings-row-icon">{icon}</span>
      <span className="settings-row-text">
        <span className="settings-row-title">{title}</span>
        {subtitle && <span className="settings-row-sub">{subtitle}</span>}
      </span>
      {value !== undefined && value !== null && <span className="settings-row-value">{value}</span>}
      {(to || href) && <ChevronIcon size={18} className="settings-row-go" />}
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className={className} aria-current={current ? 'page' : undefined}>
          {body}
        </Link>
      ) : href ? (
        <a href={href} className={className}>
          {body}
        </a>
      ) : (
        <button type="button" className={className} onClick={onClick}>
          {body}
        </button>
      )}
    </li>
  );
}

export interface SettingsChoice<T extends string> {
  value: T;
  title: string;
  /** what choosing it means, read before it is chosen */
  subtitle?: string;
  disabled?: boolean;
  /** the language the title is written in, when it is not the page's */
  lang?: string;
}

/**
 * One of a few, as a list of rows with a tick on the chosen one. Each is a
 * real radio button, so the arrow keys move between them and a screen reader
 * says "1 of 4, selected"; the line under each title says what choosing it
 * means, so the consequence is in view before the choice is made.
 */
export function SettingsChoices<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  name: string;
  value: T | null;
  options: readonly SettingsChoice<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const id = useId();
  return (
    <fieldset className="settings-choices">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => {
        const on = value === o.value;
        const off = disabled || o.disabled === true;
        return (
          <label key={o.value} className={`settings-row settings-choice${on ? ' is-on' : ''}${off ? ' is-off' : ''}`}>
            <input
              type="radio"
              className="settings-choice-input"
              name={name}
              value={o.value}
              checked={on}
              disabled={off}
              onChange={() => onChange(o.value)}
              aria-labelledby={`${id}-${o.value}`}
              aria-describedby={o.subtitle ? `${id}-${o.value}-sub` : undefined}
            />
            <span className="settings-row-text">
              <span className="settings-row-title" id={`${id}-${o.value}`} lang={o.lang}>
                {o.title}
              </span>
              {o.subtitle && (
                <span className="settings-row-sub" id={`${id}-${o.value}-sub`}>
                  {o.subtitle}
                </span>
              )}
            </span>
            <span className="settings-choice-mark">{on && <CheckIcon size={20} />}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** An on/off row: the title, a line on what it does, and a switch at its end. */
export function SettingsSwitch({
  title,
  subtitle,
  checked,
  disabled = false,
  onChange,
}: {
  title: string;
  subtitle?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  const id = useId();
  return (
    <label className={`settings-row settings-switch${disabled ? ' is-off' : ''}`}>
      <span className="settings-row-text">
        <span className="settings-row-title" id={id}>
          {title}
        </span>
        {subtitle && (
          <span className="settings-row-sub" id={`${id}-sub`}>
            {subtitle}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        className="settings-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-labelledby={id}
        aria-describedby={subtitle ? `${id}-sub` : undefined}
      />
    </label>
  );
}

/** The field at the top that narrows the list to the rows that match. */
export function SettingsSearch({ value, onChange }: { value: string; onChange: (next: string) => void }): React.JSX.Element {
  const t = useT();
  return (
    <div className="settings-search" role="search">
      <SearchIcon size={18} className="settings-search-icon" />
      <input
        type="search"
        className="settings-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('settings.search')}
        aria-label={t('settings.search')}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button type="button" className="settings-search-clear" onClick={() => onChange('')} aria-label={t('search.clear')}>
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );
}

/**
 * Text as a search compares it: lower case and without accents, so "e"
 * finds "ê" and "Ç" finds "c" — what someone types quickly on any keyboard.
 */
export function searchable(text: string): string {
  return text.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
}
