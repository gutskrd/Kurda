import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CheckIcon, CloseIcon, FeedFilterIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { keepInView } from '../reports/keepInView';
import { SECTIONS, type FeedSection } from './postKinds';

/** One way to narrow the wall: everything, a half of it, or one kind within a half. */
export interface FeedFilterValue {
  section: FeedSection;
  kind: string | null;
}

type T = ReturnType<typeof useT>;

/** "All writing", "All pictures": a half chosen whole, as it reads in the list. */
const ALL_OF: Partial<Record<FeedSection, MessageKey>> = { gotin: 'civak.filter.allWriting', dimen: 'civak.filter.allPictures' };

/** What the wall is narrowed to, in words — "Pictures · Meme" — or null while it shows everything. */
export function filterLabel(t: T, value: FeedFilterValue): string | null {
  if (value.section === 'all') return null;
  const section = SECTIONS.find((s) => s.key === value.section);
  if (!section) return null;
  const kind = value.kind ? section.kinds.find((k) => k.key === value.kind) : null;
  return kind ? `${t(section.labelKey)} · ${t(kind.labelKey)}` : t(section.labelKey);
}

/**
 * The wall's filter: a funnel beside the Post button, and a short list under
 * it — Everything, then each half with its kinds — the one shown now ticked.
 *
 * It used to be two rows of toggles above the posts, which made the first thing
 * on the wall a choice to make. Now the wall opens on the posts, and the choice
 * is there when it is wanted. While the wall is narrowed a chip says to what;
 * pressing it opens the list again, and its ✕ shows everything.
 *
 * The list is a menu of radio items (the menu-button pattern): the arrow keys
 * move between them, Enter or Space chooses and closes, Escape closes and goes
 * back to the button. On a phone it rises from the bottom edge as a sheet.
 */
export function FeedFilter({ value, onChange }: { value: FeedFilterValue; onChange: (next: FeedFilterValue) => void }): React.JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // what opened the list, so the keyboard goes back there when it closes
  const opener = useRef<HTMLElement | null>(null);
  const refocus = useRef(false);
  const menuId = useId();
  const label = filterLabel(t, value);

  const toggle = (from: HTMLElement | null): void => {
    opener.current = from;
    setOpen((o) => !o);
  };
  const close = (back: boolean): void => {
    refocus.current = back;
    setOpen(false);
  };
  const choose = (next: FeedFilterValue): void => {
    close(true);
    onChange(next);
  };
  const clear = (): void => {
    // the chip goes with the filter, so the funnel is where the keyboard lands
    opener.current = null;
    refocus.current = true;
    onChange({ section: 'all', kind: null });
  };

  // after the render that closed the list or cleared the filter: the chip may be gone by then
  useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    (opener.current?.isConnected ? opener.current : buttonRef.current)?.focus();
  });

  // as a popover beside a narrow window's edge the list is nudged back inside; as a sheet it is already
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (open && menu && getComputedStyle(menu).position !== 'fixed') keepInView(menu);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
    (menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? items?.[0])?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      refocus.current = true;
      setOpen(false);
    };
    // a press anywhere else closes it, the scrim behind the sheet included; the two buttons toggle it themselves
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target) || chipRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Tab') {
      // Tab leaves the list for whatever comes next, and the list closes behind it
      close(false);
      return;
    }
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to: Partial<Record<string, number>> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 };
    const next = to[e.key];
    if (next === undefined || items.length === 0) return;
    e.preventDefault();
    items[(next + items.length) % items.length]?.focus();
  };

  const is = (section: FeedSection, kind: string | null): boolean => value.section === section && value.kind === kind;
  const buttonLabel = label ? t('civak.filter.buttonOn', { what: label }) : t('civak.filter.button');

  return (
    <>
      {label && (
        <span className="ffilter-chip">
          <button
            ref={chipRef}
            type="button"
            className="ffilter-chip-main"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            title={t('civak.filter.button')}
            onClick={() => toggle(chipRef.current)}
          >
            <FeedFilterIcon size={16} weight="fill" />
            <span className="ffilter-chip-text">{label}</span>
          </button>
          <button type="button" className="ffilter-chip-clear" aria-label={t('civak.filter.clear')} title={t('civak.filter.clear')} onClick={clear}>
            <CloseIcon size={14} weight="bold" />
          </button>
        </span>
      )}

      <span className={`ffilter${open ? ' is-open' : ''}`}>
        <button
          ref={buttonRef}
          type="button"
          className={`ffilter-btn${label ? ' is-on' : ''}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={buttonLabel}
          title={buttonLabel}
          onClick={() => toggle(buttonRef.current)}
        >
          <FeedFilterIcon size={20} weight={label ? 'fill' : 'regular'} />
        </button>

        {open && (
          <>
            {/* behind the sheet on a phone; nothing on a wider screen, where the list is a popover */}
            <span className="ffilter-scrim" aria-hidden="true" />
            <div className="ffilter-menu" role="menu" id={menuId} aria-label={t('civak.filter.title')} ref={menuRef} onKeyDown={onMenuKey}>
              <span className="ffilter-grip" aria-hidden="true" />
              <span className="ffilter-title" aria-hidden="true">
                {t('civak.filter.title')}
              </span>
              <Choice label={t('civak.filter.everything')} on={is('all', null)} onChoose={() => choose({ section: 'all', kind: null })} />
              {SECTIONS.filter((s) => s.key !== 'all').map((s) => (
                <div key={s.key} className="ffilter-group" role="group" aria-labelledby={`${menuId}-${s.key}`}>
                  <span id={`${menuId}-${s.key}`} className="ffilter-heading" role="presentation">
                    {t(s.labelKey)}
                  </span>
                  <Choice label={t(ALL_OF[s.key] ?? s.labelKey)} on={is(s.key, null)} onChoose={() => choose({ section: s.key, kind: null })} />
                  {s.kinds.map((k) => (
                    <Choice key={k.key} label={t(k.labelKey)} on={is(s.key, k.key)} onChoose={() => choose({ section: s.key, kind: k.key })} />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </span>
    </>
  );
}

function Choice({ label, on, onChoose }: { label: string; on: boolean; onChoose: () => void }): React.JSX.Element {
  return (
    <button type="button" role="menuitemradio" aria-checked={on} tabIndex={-1} className={`ffilter-item${on ? ' is-on' : ''}`} onClick={onChoose}>
      <span>{label}</span>
      {on && <CheckIcon size={18} />}
    </button>
  );
}
