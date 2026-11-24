import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowIcon, CheckIcon, ChevronIcon, CloseIcon, SearchIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';

/**
 * The parts Settings is built from: rows in named groups, each with an icon, a title and its current value at the
 * end, opening its page on a tap; and the frame of a page, its title with the way back above it. What cannot be undone
 * comes last, in red.
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

interface SettingsRowProps {
  /** Left out for a row of plain words, such as one in a sheet. */
  icon?: React.ReactNode;
  title: string;
  /** A line under the title saying what the row does, when its name does not. */
  subtitle?: React.ReactNode;
  /** Its current value, at the row's end. */
  value?: React.ReactNode;
  /** A page in the app. */
  to?: string;
  /** An address outside the app, such as an email address. */
  href?: string;
  onClick?: () => void;
  /** Shows the way in on a row pressed to open something, such as a sheet. */
  opens?: boolean;
  /** A button of its own under the row's words; the row itself is then not pressed. */
  action?: React.ReactNode;
  /** Red, for what cannot be undone. */
  destructive?: boolean;
  /** The page open beside the list on a wide screen. */
  current?: boolean;
  /** Something about it wants a look, such as a limit on the account: its value is drawn heavier. */
  attention?: boolean;
  /** Its own look on top of a row's, such as a category on the home list. */
  className?: string;
}

/** One row: a link to its page, an address, or a button that does it there and then. */
export function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  to,
  href,
  onClick,
  opens = false,
  action,
  destructive = false,
  current = false,
  attention = false,
  className: extra,
}: SettingsRowProps): React.JSX.Element {
  const held = action !== undefined && action !== null;
  const className = `settings-row${destructive ? ' is-danger' : ''}${attention ? ' is-attention' : ''}${held ? ' is-held' : ''}${extra ? ` ${extra}` : ''}`;
  const body = (
    <>
      {icon !== undefined && <span className="settings-row-icon">{icon}</span>}
      <span className="settings-row-text">
        <span className="settings-row-title">{title}</span>
        {subtitle && <span className="settings-row-sub">{subtitle}</span>}
        {action}
      </span>
      {value !== undefined && value !== null && <span className="settings-row-value">{value}</span>}
      {(to || href || opens) && <ChevronIcon size={18} className="settings-row-go" />}
    </>
  );
  return (
    <li>
      {held ? (
        <div className={className}>{body}</div>
      ) : to ? (
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

interface SettingsChoice<T extends string> {
  value: T;
  title: string;
  /** What choosing it means, shown before it is chosen. */
  subtitle?: string;
  disabled?: boolean;
  /** The title's language, when it is not the page's. */
  lang?: string;
}

/**
 * One of a few choices as rows with a tick on the chosen one. Each is a real radio button, so arrow keys and screen
 * readers work, and the line under each title says what choosing it means.
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

/**
 * A page of Settings: its title, with the way back above it where the list is not beside it, then what it holds. Opened
 * from the list rather than landed on, the reader is taken to its title, as a new screen would.
 */
export function SettingsFrame({
  title,
  heading,
  back,
  focus = false,
  className,
  children,
}: {
  title: React.ReactNode;
  heading: 'h1' | 'h2';
  /** Where back leads and the name of that place. */
  back?: { to: string; label: string };
  focus?: boolean;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const Heading = heading;
  const ref = useRef<HTMLHeadingElement>(null);
  // Only on opening: a frame is drawn afresh for each page, so this runs once per page.
  const focusOnOpen = useRef(focus);
  useEffect(() => {
    if (focusOnOpen.current) ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className={`settings-page${className ? ` ${className}` : ''}`} aria-labelledby="settings-page-title">
      <div className="settings-page-head">
        {back && (
          <Link to={back.to} className="standing-back settings-back reach-line">
            <ArrowIcon size={16} className="standing-back-icon" /> {back.label}
          </Link>
        )}
        <Heading className={heading === 'h1' ? 'page-title' : 'settings-pane-title'} id="settings-page-title" ref={ref} tabIndex={-1}>
          {title}
        </Heading>
      </div>
      {children}
    </section>
  );
}

/** The field that searches every setting, opened from the search button at the top of the list. */
export function SettingsSearch({
  value,
  onChange,
  onEscape,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Escape closes the search rather than clearing the field, as the button beside it does. */
  onEscape?: () => void;
}): React.JSX.Element {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="settings-search" role="search">
      <SearchIcon size={18} className="settings-search-icon" />
      <input
        ref={input}
        type="search"
        className="settings-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || !onEscape) return;
          e.preventDefault();
          e.stopPropagation();
          onEscape();
        }}
        placeholder={t('settings.search')}
        aria-label={t('settings.search')}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button
          type="button"
          className="settings-search-clear"
          onClick={() => {
            onChange('');
            input.current?.focus();
          }}
          aria-label={t('search.clear')}
        >
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );
}

/** Text as the search compares it: lower case without accents, so "e" finds "ê" and "Ç" finds "c". */
export function searchable(text: string): string {
  return text.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
}
