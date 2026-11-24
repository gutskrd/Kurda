import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { MAX_PARENTS_PER_TEEN, MAX_TEENS_PER_PARENT, PARENTAL_SWITCHES, type SupervisionState } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { Button, LinkButton } from '../components/Button';
import { ParentalIcon, PlusIcon, RemovePersonIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { ErrorState } from '../components/states';
import { useI18n, useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import type { ApiState } from '../lib/useApi';
import { SettingsChoices, SettingsFrame, SettingsRow, SettingsSection } from '../settings/SettingsList';
import { settingsPath, SETTINGS_HOME } from '../settings/catalogue';
import { PARENTAL_PATH, firstParent, personName, roleOf, type ParentLink, type ParentalOverview, type PersonRef } from './api';
import { ConnectParent } from './ConnectParent';
import { AddTeen } from './AddTeen';
import { BedtimeChoice, LimitChoice, TeenPage } from './TeenPage';
import { SWITCH_HINT, SWITCH_TITLE } from './switches';
import { useSupervision } from './Supervision';
import { bedtimeText, calendarDay, dayText, durationText, limitText } from './words';

/**
 * Settings → Parental controls, for whichever side of it this account is on (`GET /me/parental`): a teen connects a
 * parent with the code the parent made and sees what was set; a parent adds teens, sees each one's week and sets their
 * limits. Neither side ever sees what the other says or to whom. Its pages sit under /app/settings/parental.
 */

export const PARENTAL_HOME = settingsPath('parental');

/** What every parental page is handed by Settings. */
export interface ParentalPageProps {
  overview: ApiState<ParentalOverview> & { reload: () => void };
  heading: 'h1' | 'h2';
  /** A phone, where the home list is not beside the page and the page's root goes back to it. */
  single: boolean;
  focus: boolean;
}

export function ParentalSettings({ rest, ...props }: ParentalPageProps & { rest: string }): React.JSX.Element {
  const [first, id, leaf, extra] = rest.split('/').filter(Boolean);
  if (!first) return <ParentalHome {...props} />;
  if (first === 'connect' && !id) return <ConnectParent {...props} />;
  if (first === 'add' && !id) return <AddTeen {...props} />;
  if (first === 'teen' && id && !extra) {
    if (!leaf) return <TeenPage key={id} teenId={id} {...props} />;
    if (leaf === 'limit') return <LimitChoice key={id} teenId={id} {...props} />;
    if (leaf === 'bedtime') return <BedtimeChoice key={id} teenId={id} {...props} />;
  }
  return <Navigate to={PARENTAL_HOME} replace />;
}

/** The parental page's own frame, with the way back to the Settings home on a phone. */
function HomeFrame({ heading, single, focus, children }: Pick<ParentalPageProps, 'heading' | 'single' | 'focus'> & { children: React.ReactNode }): React.JSX.Element {
  const t = useT();
  return (
    <SettingsFrame
      title={t('parental.title')}
      heading={heading}
      back={single ? { to: SETTINGS_HOME, label: t('standing.backToSettings') } : undefined}
      focus={focus}
      className="settings-page-parental"
    >
      <div className="settings-page-body">{children}</div>
    </SettingsFrame>
  );
}

function ParentalHome({ overview, ...frame }: ParentalPageProps): React.JSX.Element {
  const t = useT();
  const [params] = useSearchParams();
  const { data, loading, error, reload } = overview;
  const role = roleOf(data);
  // A link with a parent's code in it (`?code=`) opens the code entry with it filled in.
  const code = params.get('code');
  if (code && role === 'teen') return <Navigate to={`${PARENTAL_HOME}/connect?code=${encodeURIComponent(code)}`} replace />;

  let body: React.ReactNode;
  if (!data && loading) body = <PageSkeleton />;
  else if (!role) body = <ErrorState message={error ?? t('settings.unavailable')} onRetry={reload} />;
  else if (role === 'none') body = <NoSide reason={data!.reason} />;
  else if (role === 'teen') body = (data!.parents?.length ?? 0) > 0 ? <TeenSide overview={data!} reload={reload} /> : <TeenIntro />;
  else body = <ParentSide overview={data!} />;
  return <HomeFrame {...frame}>{body}</HomeFrame>;
}

export function PageSkeleton(): React.JSX.Element {
  const t = useT();
  return (
    <SkeletonRegion label={t('settings.loading')}>
      <div className="settings-page-skeleton">
        {['72%', '54%', '64%', '48%'].map((w) => (
          <Skeleton key={w} line w={w} />
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** The parental glyph in its soft circle, above a title and a paragraph: the start of either side. */
export function ParentalLead({ title, body }: { title: string; body: string }): React.JSX.Element {
  return (
    <div className="parental-lead">
      <span className="parental-lead-glyph" aria-hidden="true">
        <ParentalIcon size={36} />
      </span>
      <h2 className="parental-lead-title">{title}</h2>
      <p className="parental-lead-body">{body}</p>
    </div>
  );
}

/** Why this account has no side of parental controls, in one line, and the one thing that would change it. */
function NoSide({ reason }: { reason?: ParentalOverview['reason'] }): React.JSX.Element {
  const t = useT();
  const { refreshUser } = useAuth();
  switch (reason) {
    case 'birth_month':
      return (
        <>
          <p className="settings-page-intro">{t('parental.none.birthMonth')}</p>
          <Button onClick={() => void refreshUser()}>{t('letters.refusal.birthMonthAction')}</Button>
        </>
      );
    case 'email':
      return (
        <>
          <p className="settings-page-intro">{t('parental.none.email')}</p>
          <LinkButton to="/verify-email">{t('auth.verify.title')}</LinkButton>
        </>
      );
    case 'guest':
      return (
        <>
          <p className="settings-page-intro">{t('parental.none.guest')}</p>
          <LinkButton to="/register">{t('auth.register.title')}</LinkButton>
        </>
      );
    default:
      return <p className="settings-page-intro">{t('parental.none.standing')}</p>;
  }
}

/** A teen with no parent yet: what a parent could do and see, and the way to connect one. */
function TeenIntro(): React.JSX.Element {
  const t = useT();
  return (
    <>
      <ParentalLead title={t('parental.teen.title')} body={t('parental.teen.body')} />
      <LinkButton to={`${PARENTAL_HOME}/connect`} className="parental-lead-go">
        {t('parental.connect')}
      </LinkButton>
    </>
  );
}

/** A face and a name as a row's picture. */
export function Face({ person }: { person: Pick<PersonRef, 'avatarUrl'> }): React.JSX.Element {
  return (
    <span className="parental-face">
      <Avatar url={person.avatarUrl} glyphSize={20} />
    </span>
  );
}

/**
 * A connected teen's own view: their parents, then everything the parents set, read-only, and the plain promise of what
 * a parent can and cannot see. Disconnecting tells the parent.
 */
function TeenSide({ overview, reload }: { overview: ParentalOverview; reload: () => void }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const live = useSupervision().state;
  const parents = overview.parents ?? [];
  const first = firstParent(parents);
  // A beat's answer is newer than the page's.
  const state: SupervisionState | null = live ?? overview.supervision ?? null;
  const [leaving, setLeaving] = useState(false);

  return (
    <>
      <SettingsSection title={t('parental.parents.title')}>
        {parents.map((p) => {
          const since = t('parental.since', { date: calendarDay(t, p.since, locale) });
          // With two, the first is marked: only they can turn something back on or loosen it.
          const marked = parents.length > 1 && first?.userId === p.userId;
          return (
            <SettingsRow
              key={p.userId}
              className="parental-person"
              icon={<Face person={p} />}
              title={personName(p)}
              subtitle={marked ? `${t('parental.firstParent')} · ${since}` : since}
            />
          );
        })}
        {parents.length < MAX_PARENTS_PER_TEEN && (
          <SettingsRow className="parental-person" icon={<PlusIcon size={22} />} title={t('parental.addParent')} to={`${PARENTAL_HOME}/connect`} />
        )}
      </SettingsSection>
      {state && <SetByParents state={state} />}
      <p className="settings-page-note parental-privacy">{t('parental.privacy.teen')}</p>
      <ul className="settings-rows settings-apart">
        <SettingsRow icon={<RemovePersonIcon size={22} />} title={t('parental.disconnect')} destructive onClick={() => setLeaving(true)} />
      </ul>
      <DisconnectSheet open={leaving} parents={parents} onClose={() => setLeaving(false)} onDone={reload} />
    </>
  );
}

/** What the teen's parents set, as rows to read: the limit and today's share of it, the bedtime, and each switch. */
function SetByParents({ state }: { state: SupervisionState }): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { controls, minutesToday } = state;
  const limit = controls.dailyLimitMinutes;
  const share = limit ? Math.min(1, minutesToday / limit) : 0;
  return (
    <SettingsSection title={t('parental.setBy')}>
      <SettingsRow title={t('parental.limit.title')} value={limitText(t, limit)} />
      <li className="settings-block parental-today">
        <span className="parental-today-head">
          <span>{t('parental.today')}</span>
          <span className="parental-today-value">
            {limit ? t('parental.todayOf', { used: Math.min(minutesToday, limit), limit }) : durationText(t, minutesToday)}
          </span>
        </span>
        {limit ? (
          <span className="parental-meter" role="progressbar" aria-label={t('parental.today')} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(minutesToday, limit)}>
            <span className="parental-meter-fill" style={{ transform: `scaleX(${share})` }} />
          </span>
        ) : null}
      </li>
      <SettingsRow title={t('parental.bedtime.title')} value={bedtimeText(t, controls.bedtime, locale)} />
      {PARENTAL_SWITCHES.map((s) => (
        <SettingsRow key={s} title={t(SWITCH_TITLE[s])} subtitle={t(SWITCH_HINT[s])} value={t(controls[s] ? 'settings.on' : 'settings.off')} />
      ))}
    </SettingsSection>
  );
}

/** Disconnecting a parent, who is told: which one, when there are two, and a second step. */
function DisconnectSheet({ open, parents, onClose, onDone }: { open: boolean; parents: ParentLink[]; onClose: () => void; onDone: () => void }): React.JSX.Element {
  const t = useT();
  const { client, refreshUser } = useAuth();
  const { adopt } = useSupervision();
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = parents.find((p) => p.userId === chosen) ?? (parents.length === 1 ? parents[0] : undefined);

  async function disconnect(): Promise<void> {
    if (!who) return;
    setBusy(true);
    setError(null);
    const res = await client.delete(`${PARENTAL_PATH}/parents/${encodeURIComponent(who.userId)}`);
    setBusy(false);
    // A link already gone counts as disconnected.
    if (!res.ok && res.error.status !== 404) {
      setError(describeError(res.error, t));
      return;
    }
    // The last parent gone ends the supervision, and the account says so when read again.
    if (parents.length === 1) adopt(null);
    void refreshUser();
    onClose();
    onDone();
  }

  return (
    <Sheet open={open} onClose={() => !busy && onClose()} label={t('parental.disconnect')}>
      <div className="parental-sheet">
        <h2 className="report-heading">{t('parental.disconnect')}</h2>
        {parents.length > 1 && (
          <SettingsChoices
            name="parental-disconnect"
            label={t('parental.disconnect')}
            value={chosen}
            options={parents.map((p) => ({ value: p.userId, title: personName(p) }))}
            onChange={setChosen}
          />
        )}
        {who && <p className="report-intro">{t('parental.disconnect.body', { name: personName(who) })}</p>}
        {error && (
          <div className="msg msg-error" role="alert">
            {error}
          </div>
        )}
        <div className="report-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <button type="button" className="btn btn-danger" disabled={!who || busy} onClick={() => void disconnect()}>
            {busy ? t('parental.disconnecting') : t('parental.disconnect.confirm')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** A parent's view: their teens with today's learning, and the way to add one more. */
function ParentSide({ overview }: { overview: ParentalOverview }): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const teens = overview.teens ?? [];
  const full = teens.length >= MAX_TEENS_PER_PARENT;
  if (teens.length === 0) {
    return (
      <>
        <ParentalLead title={t('parental.parent.title')} body={t('parental.parent.body')} />
        <Button className="parental-lead-go" onClick={() => navigate(`${PARENTAL_HOME}/add`)}>
          {t('parental.addTeen')}
        </Button>
      </>
    );
  }
  return (
    <>
      <SettingsSection title={t('parental.teens.title')}>
        {teens.map(({ teen, today }) => (
          <SettingsRow
            key={teen.userId}
            className="parental-person"
            icon={<Face person={teen} />}
            title={personName(teen)}
            subtitle={t('parental.todayIs', { what: dayText(t, today.minutes, today.lessons) })}
            to={`${PARENTAL_HOME}/teen/${encodeURIComponent(teen.userId)}`}
          />
        ))}
        {!full && <SettingsRow className="parental-person" icon={<PlusIcon size={22} />} title={t('parental.addTeen')} to={`${PARENTAL_HOME}/add`} />}
      </SettingsSection>
      {full && <p className="settings-page-note">{t('parental.teensFull', { count: MAX_TEENS_PER_PARENT })}</p>}
      <p className="settings-page-note parental-privacy">{t('parental.privacy.parent')}</p>
    </>
  );
}
