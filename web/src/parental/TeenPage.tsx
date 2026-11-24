import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ADULT_AGE,
  MIN_SIGNUP_AGE,
  PARENTAL_BEDTIMES,
  PARENTAL_DAILY_LIMITS,
  PARENTAL_SWITCHES,
  isBelowMinimumAge,
  isMinor,
  weekdayName,
  type Bedtime,
  type BirthMonth,
  type ParentalControls,
  type ParentalSwitch,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { FlameIcon, ParentalIcon, RemovePersonIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { ErrorState } from '../components/states';
import { useI18n, useT, type Translate } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { ask, lastAnswer, remember } from '../lib/apiMemory';
import { failureText, useOptimistic } from '../lib/optimistic';
import { showNotice } from '../lib/notice';
import type { ApiError, ApiResult } from '../lib/types';
import { useMemoryOwner } from '../lib/useApi';
import { SettingsChoices, SettingsFrame, SettingsRow, SettingsSection, SettingsSwitch } from '../settings/SettingsList';
import {
  clockAt,
  clockTime,
  firstParent,
  loosensBedtime,
  loosensLimit,
  personName,
  teenPath,
  weekTotals,
  zonePlace,
  type PersonRef,
  type TeenDay,
  type TeenDetail,
} from './api';
import { Face, PARENTAL_HOME, PageSkeleton, type ParentalPageProps } from './ParentalSettings';
import { SWITCH_HINT, SWITCH_TITLE } from './switches';
import { bedtimeText, calendarDay, dayText, durationText, lessonsText, limitText, monthName, monthYear } from './words';

/**
 * A parent's page for one teen: their week at a glance (minutes a day as seven slim bars, with the lessons, XP and
 * streak), the daily limit, bedtime and time zone, and the six switches, each set the moment it is pressed and put back
 * if the server refuses. Only the first parent connected may loosen anything, or correct the teen's birth month once;
 * another parent finds those choices there but switched off, with the reason under them. A teen's request to stop is
 * said at the top, with the way to let them go now. Stopping is last, in red, and the teen is told.
 */

const teenPage = (teenId: string): string => `${PARENTAL_HOME}/teen/${encodeURIComponent(teenId)}`;

/** The refusal a loosening change meets when the reader is not the first parent. */
const FIRST_ONLY = 'PARENTAL_FIRST_PARENT_ONLY';

interface Teen {
  detail: TeenDetail | null;
  /** Not connected to the reader (any more), which the server says as not found. */
  gone: boolean;
  error: string | null;
  reload: () => void;
  saved: (controls: ParentalControls) => void;
  /** Takes a change the server confirmed into the details shown and remembered. */
  amend: (change: Partial<TeenDetail>) => void;
}

/**
 * One teen's details, shared by their page and its choice pages: shown at once from the tab's memory, read again
 * behind that, and kept in memory as each change is saved, so going back shows the new value at once.
 */
function useTeen(teenId: string): Teen {
  const { client } = useAuth();
  const t = useT();
  const who = useMemoryOwner();
  const path = teenPath(teenId);
  const [detail, setDetail] = useState<TeenDetail | null>(() => (who ? (lastAnswer<TeenDetail>(who, path)?.data ?? null) : null));
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let left = false;
    void (who ? ask<TeenDetail>(client, who, path) : client.get<TeenDetail>(path)).then((res) => {
      if (left) return;
      if (res.ok) {
        setDetail(res.data);
        setGone(false);
        setError(null);
      } else if (res.error.status === 404) {
        setDetail(null);
        setGone(true);
      } else setError(res.error);
    });
    return () => {
      left = true;
    };
  }, [client, who, path, nonce]);

  const amend = (change: Partial<TeenDetail>): void =>
    setDetail((d) => {
      if (!d) return d;
      const next = { ...d, ...change };
      if (who) remember(who, path, next);
      return next;
    });
  return {
    detail,
    gone,
    error: error ? describeError(error, t) : null,
    reload: () => setNonce((n) => n + 1),
    saved: (controls) => amend({ controls }),
    amend,
  };
}

/** Sends a change to the teen's controls, answering with the whole set the server now holds. */
function useSendControls(teenId: string): (patch: Partial<ParentalControls>) => Promise<ApiResult<{ controls: ParentalControls }>> {
  const { client } = useAuth();
  return (patch) => client.patch<{ controls: ParentalControls }>(`${teenPath(teenId)}/controls`, patch);
}

/** The first parent's name from a refusal's details, which may carry a name or a person. */
function refusedBy(error: ApiError): string | null {
  const parent = (error.details as { parent?: unknown } | undefined)?.parent;
  if (typeof parent === 'string' && parent.trim()) return parent.trim();
  if (parent && typeof parent === 'object' && typeof (parent as PersonRef).username === 'string') return personName(parent as PersonRef);
  return null;
}

/** The quiet line under choices a parent may not loosen, naming the one who may. */
function firstOnlyLine(t: Translate, detail: TeenDetail): string {
  const first = firstParent(detail.parents);
  return first ? t('parental.firstOnly', { name: personName(first) }) : t('error.code.parentalFirstParentOnly');
}

/** The frame every teen page shares: the way back, the teen's name as the title, and the wait, the failure or the end. */
function TeenFrame({
  teen,
  title,
  back,
  heading,
  focus,
  children,
}: {
  teen: Teen;
  title?: string;
  back: { to: string; label: string };
  heading: 'h1' | 'h2';
  focus: boolean;
  children: (detail: TeenDetail) => React.ReactNode;
}): React.JSX.Element {
  const t = useT();
  const { detail, gone, error, reload } = teen;
  let body: React.ReactNode;
  if (detail) body = children(detail);
  else if (gone)
    body = (
      <>
        <p className="settings-page-intro">{t('parental.teenGone')}</p>
        <Link to={PARENTAL_HOME} className="btn btn-secondary">
          {t('parental.title')}
        </Link>
      </>
    );
  else if (error) body = <ErrorState message={error} onRetry={reload} />;
  else body = <PageSkeleton />;
  return (
    <SettingsFrame title={title ?? (detail ? personName(detail.teen) : t('parental.title'))} heading={heading} back={back} focus={focus}>
      <div className="settings-page-body">{body}</div>
    </SettingsFrame>
  );
}

export function TeenPage({ teenId, overview, heading, focus }: ParentalPageProps & { teenId: string }): React.JSX.Element {
  const t = useT();
  const teen = useTeen(teenId);
  return (
    <TeenFrame teen={teen} back={{ to: PARENTAL_HOME, label: t('parental.title') }} heading={heading} focus={focus}>
      {(detail) => <TeenBody detail={detail} teen={teen} teenId={teenId} onStopped={overview.reload} />}
    </TeenFrame>
  );
}

function TeenBody({ detail, teen, teenId, onStopped }: { detail: TeenDetail; teen: Teen; teenId: string; onStopped: () => void }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { user } = useAuth();
  const [stopping, setStopping] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  // A loosening the server refused, said under the switches with the name it gave.
  const [refused, setRefused] = useState<string | null>(null);
  const name = personName(detail.teen);
  const canLoosen = detail.canLoosen !== false;
  const first = firstParent(detail.parents);
  const firstName = first ? personName(first) : name;
  const zone = detail.timeZone;

  return (
    <>
      {detail.leaveEndsAt && (
        <div className="parental-note parental-leaving" role="note">
          <ParentalIcon size={20} className="parental-note-icon" />
          <div className="parental-note-text">
            <p>{t('parental.leave.asked', { name, date: calendarDay(t, detail.leaveEndsAt, locale) })}</p>
            <Button variant="secondary" size="sm" onClick={() => setStopping(true)}>
              {t('parental.leave.letGo', { name })}
            </Button>
          </div>
        </div>
      )}

      <div className="parental-teen-head">
        <span className="parental-teen-face">
          <Avatar url={detail.teen.avatarUrl} glyphSize={30} />
        </span>
        <span className="parental-teen-who">
          <span className="parental-teen-handle" dir="ltr">
            @{detail.teen.username}
          </span>
          <span className="parental-teen-since">{t('parental.since', { date: calendarDay(t, detail.since, locale) })}</span>
        </span>
      </div>

      <WeekCard week={detail.week} streak={detail.streak} limit={detail.controls.dailyLimitMinutes} />

      <SettingsSection title={t('parental.time.title')}>
        <SettingsRow title={t('parental.limit.title')} value={limitText(t, detail.controls.dailyLimitMinutes)} to={`${teenPage(teenId)}/limit`} />
        <SettingsRow title={t('parental.bedtime.title')} value={bedtimeText(t, detail.controls.bedtime, locale)} to={`${teenPage(teenId)}/bedtime`} />
        {zone && <SettingsRow title={t('parental.timeZone')} value={<ZoneValue zone={zone} />} />}
      </SettingsSection>

      <SettingsSection title={t('settings.safety.title')}>
        {PARENTAL_SWITCHES.map((s) => (
          <li key={s}>
            <ControlSwitch
              teenId={teenId}
              control={s}
              controls={detail.controls}
              canLoosen={canLoosen}
              onSaved={(c) => {
                setRefused(null);
                teen.saved(c);
              }}
              onRefused={(by) => setRefused(t('parental.firstOnly', { name: by ?? firstName }))}
            />
          </li>
        ))}
      </SettingsSection>
      {(refused || !canLoosen) && (
        <p className="settings-page-note parental-first-only" role="status">
          {refused ?? firstOnlyLine(t, detail)}
        </p>
      )}

      <SettingsSection title={t('parental.parentsLabel')}>
        {detail.parents.map((p) => (
          <SettingsRow
            key={p.userId}
            className="parental-person"
            icon={<Face person={p} />}
            title={p.userId === user?.id ? t('parental.you') : personName(p)}
            subtitle={first?.userId === p.userId && detail.parents.length > 1 ? t('parental.firstParent') : undefined}
          />
        ))}
      </SettingsSection>

      {detail.birthMonth && (
        <SettingsSection>
          <SettingsRow
            title={t('parental.birth.title')}
            subtitle={detail.birthCorrectable ? undefined : canLoosen ? t('parental.birth.done') : t('parental.birth.firstOnly', { name: firstName })}
            value={monthYear(t, detail.birthMonth, locale)}
            onClick={detail.birthCorrectable ? () => setCorrecting(true) : undefined}
            opens={detail.birthCorrectable}
          />
        </SettingsSection>
      )}

      <p className="settings-page-note parental-privacy">{t('parental.privacy.parentOf', { name })}</p>

      <ul className="settings-rows settings-apart">
        <SettingsRow icon={<RemovePersonIcon size={22} />} title={t('parental.stop')} destructive onClick={() => setStopping(true)} />
      </ul>
      <StopSheet open={stopping} teenId={teenId} name={name} onClose={() => setStopping(false)} onStopped={onStopped} />
      {detail.birthMonth && <BirthSheet open={correcting} teenId={teenId} detail={detail} teen={teen} onClose={() => setCorrecting(false)} />}
    </>
  );
}

/** A time zone as its place and the time there now ("Berlin · 21:14"), the time kept current while the page is open. */
function ZoneValue({ zone }: { zone: string }): React.JSX.Element {
  const { locale } = useI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span>
      {zonePlace(zone)} · {clockAt(now.toISOString(), zone, locale)}
    </span>
  );
}

/**
 * One switch, set at once and put back if the server refuses: a loosening refused for not being the first parent is
 * said under the switches, anything else in a notice. A parent who may not loosen finds an off switch disabled.
 */
function ControlSwitch({
  teenId,
  control,
  controls,
  canLoosen,
  onSaved,
  onRefused,
}: {
  teenId: string;
  control: ParentalSwitch;
  controls: ParentalControls;
  canLoosen: boolean;
  onSaved: (c: ParentalControls) => void;
  onRefused: (firstParentName: string | null) => void;
}): React.JSX.Element {
  const t = useT();
  const send = useSendControls(teenId);
  const [on, want] = useOptimistic<boolean, { controls: ParentalControls }>(controls[control], (next) => send({ [control]: next }), {
    fromAnswer: (data, sent) => data?.controls?.[control] ?? sent,
    onSaved: (data, sent) => onSaved(data?.controls ?? { ...controls, [control]: sent }),
    onFailed: (error) => (error.code === FIRST_ONLY ? onRefused(refusedBy(error)) : showNotice(failureText(error, t))),
  });
  return <SettingsSwitch title={t(SWITCH_TITLE[control])} subtitle={t(SWITCH_HINT[control])} checked={on} disabled={!canLoosen && !on} onChange={want} />;
}

/** The week as seven slim bars of minutes, today's in ink, with the totals in a line and the streak beside. */
function WeekCard({ week, streak, limit }: { week: TeenDay[]; streak: number; limit: number | null }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const totals = weekTotals(week);
  // The bars are measured against the busiest day, or the limit when that is higher, so a quiet week looks quiet.
  const top = Math.max(30, limit ?? 0, ...week.map((d) => d.minutes));
  const weekday = (day: string, width: 'narrow' | 'long'): string => weekdayName(new Date(`${day}T12:00:00Z`).getUTCDay(), locale, width);
  return (
    <section className="parental-week" aria-labelledby="parental-week-title">
      <div className="parental-week-head">
        <h2 className="parental-week-title" id="parental-week-title">
          {t('parental.week.title')}
        </h2>
        <span className="parental-week-streak">
          <FlameIcon size={18} />
          {t('learn.today.streak', { count: streak })}
        </span>
      </div>
      <ol className="parental-bars">
        {week.map((d, i) => {
          const today = i === week.length - 1;
          return (
            <li key={d.day} className={`parental-bar${today ? ' is-today' : ''}`}>
              <span className="sr-only">{t('parental.week.day', { day: weekday(d.day, 'long'), what: dayText(t, d.minutes, d.lessons) })}</span>
              <span className="parental-bar-track" aria-hidden="true">
                <span className="parental-bar-fill" style={{ '--bar': `${Math.min(1, d.minutes / top)}` } as React.CSSProperties} />
              </span>
              <span className="parental-bar-day" aria-hidden="true">
                {weekday(d.day, 'narrow')}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="parental-week-sum">
        {[durationText(t, totals.minutes), lessonsText(t, totals.lessons), t('parental.xp', { count: totals.xp })].join(' · ')}
      </p>
    </section>
  );
}

/**
 * Stopping supervision, which lifts every limit and tells the teen: a second, plainly worded step. A link already gone
 * (the teen ended it, or turned 18) counts as stopped.
 */
function StopSheet({ open, teenId, name, onClose, onStopped }: { open: boolean; teenId: string; name: string; onClose: () => void; onStopped: () => void }): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { client } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stop(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await client.delete(teenPath(teenId));
    setBusy(false);
    if (!res.ok && res.error.status !== 404) {
      setError(describeError(res.error, t));
      return;
    }
    onClose();
    onStopped();
    navigate(PARENTAL_HOME, { replace: true });
  }

  return (
    <Sheet open={open} onClose={() => !busy && onClose()} label={t('parental.stop.title', { name })}>
      <div className="parental-sheet">
        <h2 className="report-heading">{t('parental.stop.title', { name })}</h2>
        <p className="report-intro">{t('parental.stop.body', { name })}</p>
        {error && (
          <div className="msg msg-error" role="alert">
            {error}
          </div>
        )}
        <div className="report-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void stop()}>
            {busy ? t('parental.stopping') : t('parental.stop')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** The years a corrected birth month may fall in: those that can leave the teen 13 to 17, newest first. */
function teenYears(now: Date): number[] {
  const year = now.getUTCFullYear();
  const years: number[] = [];
  for (let y = year - MIN_SIGNUP_AGE; y >= year - ADULT_AGE; y--) years.push(y);
  return years;
}

/** Why a corrected birth month cannot be taken, in plain words; null when it can. */
function outOfRange(t: Translate, reason: unknown, name: string): string | null {
  if (reason === 'under13') return t('parental.birth.under13');
  if (reason === 'adult') return t('parental.birth.adult', { name });
  return null;
}

/**
 * The first parent's one correction of a teen's birth month: a month and a year that keep the teen 13 to 17, refused
 * in plain words otherwise. A date under 13 would close the account and one over 17 would end supervision, so neither
 * is a parent's to set here.
 */
function BirthSheet({
  open,
  teenId,
  detail,
  teen,
  onClose,
}: {
  open: boolean;
  teenId: string;
  detail: TeenDetail;
  teen: Teen;
  onClose: () => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { client } = useAuth();
  const name = personName(detail.teen);
  const years = teenYears(new Date());
  const was = detail.birthMonth!;
  // The year on record, unless it is one no correction could keep.
  const recordedYear = (): string => (teenYears(new Date()).includes(was.year) ? String(was.year) : '');
  const [month, setMonth] = useState(String(was.month));
  const [year, setYear] = useState(recordedYear);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each opening starts from the month on record.
  useEffect(() => {
    if (!open) return;
    setMonth(String(was.month));
    setYear(recordedYear());
    setError(null);
  }, [open, was.month, was.year]);
  const birth: BirthMonth | null = month && year ? { year: Number(year), month: Number(month) } : null;
  const changed = birth !== null && (birth.year !== was.year || birth.month !== was.month);

  async function save(): Promise<void> {
    if (!birth) return;
    // The same lines the server draws, said before asking it.
    const early = outOfRange(t, isBelowMinimumAge(birth) ? 'under13' : isMinor(birth) ? null : 'adult', name);
    if (early) return setError(early);
    setBusy(true);
    setError(null);
    const body = { birthYear: birth.year, birthMonth: birth.month };
    const res = await client.put<Pick<TeenDetail, 'birthMonth' | 'birthCorrectable'>>(`${teenPath(teenId)}/birth-month`, body);
    setBusy(false);
    if (res.ok) {
      teen.amend({ birthMonth: res.data?.birthMonth ?? birth, birthCorrectable: res.data?.birthCorrectable ?? false });
      onClose();
      return;
    }
    const { code } = res.error;
    if (code === 'PARENTAL_BIRTH_OUT_OF_RANGE') {
      const reason = (res.error.details as { reason?: unknown } | undefined)?.reason;
      return setError(outOfRange(t, reason, name) ?? describeError(res.error, t));
    }
    if (code === FIRST_ONLY || code === 'PARENTAL_BIRTH_ALREADY_CORRECTED') {
      // Nobody else may correct it now, so the row goes back to read-only behind the sheet.
      teen.amend({ birthCorrectable: false });
      const by = code === FIRST_ONLY ? refusedBy(res.error) : null;
      return setError(by ? t('parental.birth.firstOnly', { name: by }) : describeError(res.error, t));
    }
    setError(describeError(res.error, t));
  }

  const pick = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    set(e.target.value);
    setError(null);
  };

  return (
    <Sheet open={open} onClose={() => !busy && onClose()} label={t('parental.birth.title')}>
      <div className="parental-sheet">
        <h2 className="report-heading">{t('parental.birth.title')}</h2>
        <p className="report-intro">{t('parental.birth.help', { name })}</p>
        <fieldset className="field birth-month parental-birth" disabled={busy}>
          <legend className="sr-only">{t('parental.birth.title')}</legend>
          <div className="birth-month-row">
            <label className="sr-only" htmlFor="parental-birth-month">
              {t('age.month')}
            </label>
            <select id="parental-birth-month" className="input" value={month} onChange={pick(setMonth)}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={String(i + 1)}>
                  {monthName(t, i + 1, locale)}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="parental-birth-year">
              {t('age.year')}
            </label>
            <select id="parental-birth-year" className="input" value={year} onChange={pick(setYear)}>
              {!year && (
                <option value="" disabled>
                  {t('age.year')}
                </option>
              )}
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
        {error && (
          <div className="msg msg-error" role="alert">
            {error}
          </div>
        )}
        <div className="report-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!changed || busy} onClick={() => void save()}>
            {busy ? t('age.prompt.saving') : t('age.prompt.save')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

const NO_LIMIT = 'none';

/** The daily limit's page: no limit, or one of the shared choices, saved as it is chosen. */
export function LimitChoice({ teenId, heading, focus }: ParentalPageProps & { teenId: string }): React.JSX.Element {
  const t = useT();
  const teen = useTeen(teenId);
  const back = { to: teenPage(teenId), label: teen.detail ? personName(teen.detail.teen) : t('parental.title') };
  const minutes = (v: string): number | null => (v === NO_LIMIT ? null : Number(v));
  return (
    <TeenFrame teen={teen} title={t('parental.limit.title')} back={back} heading={heading} focus={focus}>
      {(detail) => (
        <ChoicePage
          teenId={teenId}
          detail={detail}
          onSaved={teen.saved}
          name="parental-limit"
          label={t('parental.limit.title')}
          help={t('parental.limit.help', { name: personName(detail.teen) })}
          value={detail.controls.dailyLimitMinutes == null ? NO_LIMIT : String(detail.controls.dailyLimitMinutes)}
          options={[NO_LIMIT, ...PARENTAL_DAILY_LIMITS.map(String)].map((v) => ({ value: v, title: limitText(t, minutes(v)) }))}
          loosens={(v) => loosensLimit(detail.controls.dailyLimitMinutes, minutes(v))}
          patch={(v) => ({ dailyLimitMinutes: minutes(v) })}
          read={(c) => (c.dailyLimitMinutes == null ? NO_LIMIT : String(c.dailyLimitMinutes))}
        />
      )}
    </TeenFrame>
  );
}

const bedtimeKey = (b: Bedtime | null): string => (b ? `${b.from}-${b.to}` : NO_LIMIT);
const bedtimeOf = (key: string): Bedtime | null => PARENTAL_BEDTIMES.find((b) => bedtimeKey(b) === key) ?? null;

/** The bedtime's page: none, or one of the shared evenings, each ending at seven. */
export function BedtimeChoice({ teenId, heading, focus }: ParentalPageProps & { teenId: string }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const teen = useTeen(teenId);
  const back = { to: teenPage(teenId), label: teen.detail ? personName(teen.detail.teen) : t('parental.title') };
  return (
    <TeenFrame teen={teen} title={t('parental.bedtime.title')} back={back} heading={heading} focus={focus}>
      {(detail) => (
        <ChoicePage
          teenId={teenId}
          detail={detail}
          onSaved={teen.saved}
          name="parental-bedtime"
          label={t('parental.bedtime.title')}
          help={t('parental.bedtime.help', { name: personName(detail.teen), time: clockTime(PARENTAL_BEDTIMES[0]!.to, locale) })}
          value={bedtimeKey(detail.controls.bedtime)}
          options={[null, ...PARENTAL_BEDTIMES].map((b) => ({ value: bedtimeKey(b), title: bedtimeText(t, b, locale) }))}
          loosens={(v) => loosensBedtime(detail.controls.bedtime, bedtimeOf(v))}
          patch={(v) => ({ bedtime: bedtimeOf(v) })}
          read={(c) => bedtimeKey(c.bedtime)}
        />
      )}
    </TeenFrame>
  );
}

/**
 * A choice saved as it is made, moving at once and back again if the server refuses. A parent who may not loosen finds
 * the looser choices there but switched off, with the reason under them.
 */
function ChoicePage({
  teenId,
  detail,
  onSaved,
  name,
  label,
  help,
  value,
  options,
  loosens,
  patch,
  read,
}: {
  teenId: string;
  detail: TeenDetail;
  onSaved: (c: ParentalControls) => void;
  name: string;
  label: string;
  help: string;
  value: string;
  options: Array<{ value: string; title: string }>;
  loosens: (value: string) => boolean;
  patch: (value: string) => Partial<ParentalControls>;
  read: (c: ParentalControls) => string;
}): React.JSX.Element {
  const t = useT();
  const send = useSendControls(teenId);
  const canLoosen = detail.canLoosen !== false;
  const [refused, setRefused] = useState<string | null>(null);
  const [chosen, want] = useOptimistic<string, { controls: ParentalControls }>(value, (next) => send(patch(next)), {
    fromAnswer: (data, sent) => (data?.controls ? read(data.controls) : sent),
    onSaved: (data, sent) => {
      setRefused(null);
      onSaved(data?.controls ?? { ...detail.controls, ...patch(sent) });
    },
    onFailed: (error) => {
      if (error.code !== FIRST_ONLY) return showNotice(failureText(error, t));
      const by = refusedBy(error);
      setRefused(by ? t('parental.firstOnly', { name: by }) : firstOnlyLine(t, detail));
    },
  });
  return (
    <>
      <p className="settings-page-intro">{help}</p>
      <SettingsChoices name={name} label={label} value={chosen} options={options.map((o) => ({ ...o, disabled: !canLoosen && loosens(o.value) }))} onChange={want} />
      {(refused || !canLoosen) && (
        <p className="settings-page-note parental-first-only" role="status">
          {refused ?? firstOnlyLine(t, detail)}
        </p>
      )}
    </>
  );
}
