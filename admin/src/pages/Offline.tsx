import { useEffect, useMemo, useState } from 'react';
import { MAINTENANCE_LIMITS, MAINTENANCE_MAX_LEAD_DAYS, type MaintenancePhase, type MaintenanceSettings } from '@kurda/shared';
import { api } from '../api';
import { ArtPicker } from '../shop/ArtPicker';
import { artSrc } from '../shop/art';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  ErrorState,
  FieldRow,
  FormActions,
  Loading,
  Note,
  PageHeader,
  Section,
  TextInput,
  Textarea,
  Time,
  absoluteTime,
  errorLine,
  fromLocalInput,
  toLocalInput,
  useDialogs,
  useLoad,
  useToast,
} from '../ui';

interface OfflineState {
  settings: MaintenanceSettings;
  phase: MaintenancePhase;
  pictureUrl: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

/** What the apps say when the title or message is left empty, in English (each reader gets their own language). */
export const APP_TITLE = 'Hevalo is taking a short break';
export const APP_MESSAGE = 'We’re working on Hevalo and will be back soon. Your progress, streak and coins are safe.';
/** The apps' own picture when none is chosen. */
const APP_PICTURE = '/mascot-deer.png';

interface Form {
  title: string;
  message: string;
  picture: { key: string; url: string } | null;
  later: boolean;
  startsAt: string;
  backBy: string;
  reopenAtEnd: boolean;
}

function formOf(s: OfflineState): Form {
  return {
    title: s.settings.title ?? '',
    message: s.settings.message ?? '',
    picture: s.settings.assetKey && s.pictureUrl ? { key: s.settings.assetKey, url: s.pictureUrl } : null,
    later: s.phase === 'scheduled',
    startsAt: s.phase === 'scheduled' && s.settings.startsAt ? toLocalInput(s.settings.startsAt) : '',
    // an end already past is not offered again
    backBy: s.settings.endsAt && Date.parse(s.settings.endsAt) > Date.now() ? toLocalInput(s.settings.endsAt) : '',
    reopenAtEnd: s.settings.reopenAtEnd,
  };
}

function settingsOf(f: Form, enabled: boolean, phase: MaintenancePhase): MaintenanceSettings {
  return {
    enabled,
    title: f.title.trim() || null,
    message: f.message.trim() || null,
    assetKey: f.picture?.key ?? null,
    // offline already: the server keeps the moment it went up
    startsAt: phase !== 'on' && f.later ? fromLocalInput(f.startsAt) : null,
    endsAt: fromLocalInput(f.backBy),
    reopenAtEnd: f.reopenAtEnd,
  };
}

/** What is wrong with the times, before the server is asked. */
function scheduleProblem(f: Form, phase: MaintenancePhase): string | null {
  const now = Date.now();
  const start = phase !== 'on' && f.later ? fromLocalInput(f.startsAt) : null;
  if (phase !== 'on' && f.later) {
    if (!start) return 'Choose when Hevalo goes offline.';
    if (Date.parse(start) <= now) return 'The time Hevalo goes offline has passed; choose a later one, or “Now”.';
    if (Date.parse(start) > now + MAINTENANCE_MAX_LEAD_DAYS * 86_400_000) return `It can be set at most ${MAINTENANCE_MAX_LEAD_DAYS} days ahead.`;
  }
  const back = fromLocalInput(f.backBy);
  if (back && Date.parse(back) <= Math.max(now, start ? Date.parse(start) : 0)) return 'The time Hevalo is back has to be after it goes offline.';
  return null;
}

/** The screen people get instead of the app, as the website and the phone app draw it. */
function Preview({ form }: { form: Form }): React.JSX.Element {
  const back = fromLocalInput(form.backBy);
  return (
    <figure className="off-preview" aria-label="What people see">
      <div className="off-phone">
        <span className="off-brand">Hevalo</span>
        <img className={`off-picture${form.picture ? '' : ' is-default'}`} src={form.picture?.url ?? artSrc(APP_PICTURE) ?? ''} alt="" />
        <strong className="off-title">{form.title.trim() || APP_TITLE}</strong>
        <p className="off-message">{form.message.trim() || APP_MESSAGE}</p>
        {back && <span className="off-pill">Back by {absoluteTime(new Date(back))}</span>}
        <span className="off-button">Try again</span>
        <small className="off-note">We check again every 30 seconds.</small>
      </div>
      <figcaption>The title and message in each person’s own language when left empty; shown as written when filled in.</figcaption>
    </figure>
  );
}

const PHASE: Record<MaintenancePhase, { tone: 'ok' | 'warn' | 'bad' | 'neutral'; label: string }> = {
  off: { tone: 'ok', label: 'Online' },
  scheduled: { tone: 'warn', label: 'Going offline' },
  on: { tone: 'bad', label: 'Offline' },
  ended: { tone: 'ok', label: 'Online' },
};

/**
 * Taking Hevalo offline for a while, on the website and in the phone app, and
 * what people see meanwhile: a title, a message, a picture and when it is
 * back. Staff and this console carry on as normal, so the app can be checked
 * before it opens again. Going offline needs the word typed; coming back is
 * one confirmed tap, and a time it is back can open it again by itself.
 */
export function Offline(): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const data = useLoad(() => api<OfflineState>('/admin/maintenance'), []);
  const [form, setForm] = useState<Form | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (data.data) setForm(formOf(data.data));
  }, [data.data]);

  const state = data.data;
  const dirty = useMemo(() => !!state && !!form && JSON.stringify(form) !== JSON.stringify(formOf(state)), [state, form]);

  if (data.error && !state) return <ErrorState error={data.error} what="the offline setting" onRetry={() => void data.reload()} />;
  if (!state || !form) return <Loading label="Loading the offline setting…" />;

  const phase = state.phase;
  const live = phase === 'on' || phase === 'scheduled';
  const set = (patch: Partial<Form>): void => {
    setForm({ ...form, ...patch });
    setProblem(null);
  };

  async function save(enabled: boolean, done: string): Promise<void> {
    const wrong = enabled ? scheduleProblem(form!, phase) : null;
    if (wrong) {
      setProblem(wrong);
      return;
    }
    setSaving(true);
    try {
      data.setData(await api<OfflineState>('/admin/maintenance', { method: 'PUT', body: settingsOf(form!, enabled, phase) }));
      toast.success(done);
    } catch (err) {
      setProblem(errorLine(err, 'the offline setting'));
    } finally {
      setSaving(false);
    }
  }

  async function goOffline(): Promise<void> {
    const wrong = scheduleProblem(form!, phase);
    if (wrong) return setProblem(wrong);
    const start = form!.later ? fromLocalInput(form!.startsAt) : null;
    const back = fromLocalInput(form!.backBy);
    const ok = await dialogs.confirm({
      title: start ? 'Take Hevalo offline at that time?' : 'Take Hevalo offline now?',
      body: (
        <>
          {start ? `From ${absoluteTime(new Date(start))}, everyone` : 'Everyone'} but staff sees the offline screen instead of the app, on the website and on
          phones,{' '}
          {back && form!.reopenAtEnd ? `until ${absoluteTime(new Date(back))}, when it opens again by itself.` : 'until you bring it back here.'}
        </>
      ),
      confirmLabel: start ? 'Set it' : 'Take it offline',
      tone: 'danger',
      typed: { phrase: 'offline', label: 'Type offline to go on' },
    });
    if (ok) await save(true, start ? 'Hevalo goes offline at the time set' : 'Hevalo is offline');
  }

  async function bringBack(): Promise<void> {
    const ok = await dialogs.confirm({
      title: phase === 'scheduled' ? 'Call off going offline?' : 'Bring Hevalo back online?',
      body: phase === 'scheduled' ? 'Hevalo stays open; what you wrote is kept for next time.' : 'Everyone can use the app again straight away. What you wrote is kept for next time.',
      confirmLabel: phase === 'scheduled' ? 'Call it off' : 'Bring it back',
    });
    if (ok) await save(false, phase === 'scheduled' ? 'Called off' : 'Hevalo is back online');
  }

  const since = state.settings.startsAt ? new Date(state.settings.startsAt) : null;
  const ends = state.settings.endsAt ? new Date(state.settings.endsAt) : null;

  return (
    <div>
      <PageHeader
        title="Offline mode"
        subtitle="Take Hevalo offline for a while, on the website and in the phone app, and choose what people see meanwhile. Staff and this console keep working."
        meta={<Badge tone={PHASE[phase].tone}>{PHASE[phase].label}</Badge>}
      />

      {phase === 'on' && (
        <Banner
          tone="bad"
          title="Hevalo is offline"
          actions={
            <Button variant="primary" icon="play" busy={saving} onClick={() => void bringBack()}>
              Bring Hevalo back online
            </Button>
          }
        >
          Since {since ? absoluteTime(since) : 'now'}. Everyone but staff sees the screen below.
          {ends && (state.settings.reopenAtEnd ? ` It opens again by itself at ${absoluteTime(ends)}.` : ` People are told it is back by ${absoluteTime(ends)}.`)}
        </Banner>
      )}
      {phase === 'scheduled' && (
        <Banner
          tone="warn"
          title={`Hevalo goes offline at ${since ? absoluteTime(since) : 'the time set'}`}
          actions={
            <Button busy={saving} onClick={() => void bringBack()}>
              Call it off
            </Button>
          }
        >
          Until then everyone uses the app as normal.
          {ends && state.settings.reopenAtEnd && ` It opens again by itself at ${absoluteTime(ends)}.`}
        </Banner>
      )}
      {phase === 'ended' && ends && <Note>Last time it opened again by itself at {absoluteTime(ends)}.</Note>}

      <div className="off-layout">
        <div className="off-form">
          <Section title="What people see" description="Leave the title or message empty to use the app’s own, in each person’s language.">
            <TextInput
              label="Title"
              value={form.title}
              maxLength={MAINTENANCE_LIMITS.title}
              placeholder={APP_TITLE}
              onChange={(e) => set({ title: e.target.value })}
            />
            <Textarea
              label="Message"
              hint={`${form.message.length} / ${MAINTENANCE_LIMITS.message}`}
              rows={4}
              value={form.message}
              maxLength={MAINTENANCE_LIMITS.message}
              placeholder={APP_MESSAGE}
              onChange={(e) => set({ message: e.target.value })}
            />
            <ArtPicker
              kind="background"
              generic
              optional
              label="Picture"
              currentUrl={form.picture?.url ?? null}
              onBusy={setUploading}
              onChange={(art) => art && set({ picture: { key: art.key, url: art.url } })}
            />
            {form.picture && (
              <Button variant="ghost" icon="close" onClick={() => set({ picture: null })}>
                Use the app’s own picture
              </Button>
            )}
          </Section>

          <Section title="When">
            {phase !== 'on' && (
              <fieldset className="off-when">
                <legend>Goes offline</legend>
                <label className="check">
                  <input type="radio" name="off-when" checked={!form.later} onChange={() => set({ later: false })} /> Now
                </label>
                <label className="check">
                  <input type="radio" name="off-when" checked={form.later} onChange={() => set({ later: true })} /> At a set time
                </label>
                {form.later && (
                  <TextInput label="From" type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} required />
                )}
              </fieldset>
            )}
            <FieldRow>
              <TextInput
                label="Back by"
                type="datetime-local"
                hint="Shown to people. Optional."
                value={form.backBy}
                onChange={(e) => set({ backBy: e.target.value })}
              />
            </FieldRow>
            {form.backBy && (
              <Checkbox
                label="Open again by itself at this time"
                hint="Otherwise the time is only shown, and Hevalo stays offline until you bring it back."
                checked={form.reopenAtEnd}
                onChange={(reopenAtEnd) => set({ reopenAtEnd })}
              />
            )}
          </Section>

          {problem && <Banner tone="bad">{problem}</Banner>}
          <FormActions>
            {live ? (
              <Button variant="primary" busy={saving} disabled={!dirty || uploading} onClick={() => void save(true, 'Saved; people see the new version')}>
                Save changes
              </Button>
            ) : (
              <Button variant="danger" icon="pause" busy={saving} disabled={uploading} onClick={() => void goOffline()}>
                {form.later ? 'Set Hevalo to go offline' : 'Take Hevalo offline'}
              </Button>
            )}
            {dirty && (
              <Button variant="ghost" onClick={() => setForm(formOf(state))}>
                Undo changes
              </Button>
            )}
          </FormActions>
          {state.updatedBy && (
            <Note>
              Last changed by @{state.updatedBy}, <Time value={state.updatedAt} />. Every change is in the Audit log; going offline and coming back are in the{' '}
              <a href="#/security-log">Security log</a>.
            </Note>
          )}
        </div>
        <Preview form={form} />
      </div>
    </div>
  );
}
