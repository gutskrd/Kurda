/**
 * The admin's small parts: the page heading, a section card, a badge, a
 * number tile, a button that says it is busy. Each replaces a pattern that was
 * written out by hand on every page with its own inline styles, so a page
 * looked a little different from the next for no reason.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** buttons on the right (under the title on a phone) */
  actions?: ReactNode;
  /** a link up a level: the list a detail page came from */
  back?: { href: string; label: string };
  /** badges beside the title: a status, a version */
  meta?: ReactNode;
}): React.JSX.Element {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {back && (
          <a className="page-back" href={back.href}>
            <Icon name="arrowLeft" size={16} />
            {back.label}
          </a>
        )}
        <div className="page-title-row">
          {/* the shell moves focus here on every new page, so a screen reader starts at the top */}
          <h1 id="page-title" tabIndex={-1}>
            {title}
          </h1>
          {meta && <div className="page-meta">{meta}</div>}
        </div>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  flush = false,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** no padding: a table that runs edge to edge */
  flush?: boolean;
  id?: string;
}): React.JSX.Element {
  return (
    <section className={`card section${flush ? ' is-flush' : ''}${className ? ` ${className}` : ''}`} id={id}>
      {(title || actions) && (
        <div className="section-head">
          <div className="section-head-text">
            {title && <h2 className="section-heading">{title}</h2>}
            {description && <p className="section-description">{description}</p>}
          </div>
          {actions && <div className="section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info';

const TONE_CLASS: Record<Tone, string> = { neutral: '', ok: ' ok', warn: ' mid', bad: ' danger', info: ' info' };

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }): React.JSX.Element {
  return (
    <span className={`badge${TONE_CLASS[tone]}`} title={title}>
      {children}
    </span>
  );
}

/** A number and what it counts; a link when there is a page to act on it. */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  href,
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
  icon?: IconName;
}): React.JSX.Element {
  const inner = (
    <>
      <div className="stat-top">
        {icon && <Icon name={icon} className="stat-icon" />}
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
      {href && <Icon name="chevronRight" className="stat-go" />}
    </>
  );
  const cls = `card stat tone-${tone}${href ? ' is-link' : ''}`;
  return href ? (
    <a className={cls} href={href}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  /** working on it: disabled, with the label the caller gives (e.g. "Saving…") */
  busy?: boolean;
  icon?: IconName;
};

/** A button that can say it is working, and keeps its size while it does. */
export function Button({ variant = 'default', busy = false, icon, children, className, disabled, type = 'button', ...rest }: ButtonProps): React.JSX.Element {
  const cls = [variant === 'default' ? '' : variant === 'danger' ? 'danger' : variant, className].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} className={cls || undefined} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

/** A plain-text note under a form or a heading: what this does, what to watch for. */
export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }): React.JSX.Element {
  return <p className={`note tone-${tone}`}>{children}</p>;
}

/** A line across the top of a section: something to know before going on. */
export function Banner({
  tone = 'info',
  title,
  children,
  actions,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}): React.JSX.Element {
  return (
    <div className={`banner tone-${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon name={tone === 'ok' ? 'check' : tone === 'bad' || tone === 'warn' ? 'alert' : 'info'} className="banner-icon" />
      <div className="banner-text">
        {title && <strong className="banner-title">{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {actions && <div className="banner-actions">{actions}</div>}
    </div>
  );
}

/** Text only screen readers hear: a table's caption, a button's fuller name. */
export function VisuallyHidden({ children }: { children: ReactNode }): React.JSX.Element {
  return <span className="sr-only">{children}</span>;
}
