import { useEffect, useRef, useState } from 'react';
import { CHARACTER_NAMES, DEFAULT_CHARACTER, type SpeakerId } from '@kurda/shared';
import { api } from '../api';
import { batchControl, runBatch, type BatchControl } from '../batch';
import type { Listing } from '../lessonAudio';
import { scriptOf } from '../lessonAudio';
import { Button, Checkbox, ErrorState, Section, Select, Table, errorLine, useLoad, type Column } from '../ui';
import { SpeakerPicker } from '../ui/SpeakerPicker';
import { patchVoice, rememberedSpeaker } from '../voice';
import {
  KIND_NAMES,
  TimelineError,
  countByKind,
  fromAlphabet,
  fromLessons,
  needsSpeaker,
  needsTimeline,
  timelineFromUrl,
  type AlphabetRecording,
  type KindCounts,
  type KindFilter,
  type VoiceRecording,
} from '../voiceBatch';

type JobName = 'speaker' | 'timelines';

interface Failure {
  recording: VoiceRecording;
  message: string;
}

interface Job {
  name: JobName;
  status: 'running' | 'paused' | 'stopping' | 'done' | 'cancelled';
  total: number;
  /** settled, saved or failed */
  done: number;
  saved: number;
  failures: Failure[];
}

type Work = (r: VoiceRecording, signal: AbortSignal) => Promise<void>;

const KIND_OPTIONS: ReadonlyArray<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'Every kind' },
  { value: 'lesson', label: KIND_NAMES.lesson },
  { value: 'alphabet', label: KIND_NAMES.alphabet },
];

const idOf = (r: VoiceRecording): string => `${r.kind}:${r.key}`;

async function loadRecordings(): Promise<VoiceRecording[]> {
  const [lessons, letters] = await Promise.all([
    api<Listing>('/admin/lesson-audio'),
    api<{ recordings: AlphabetRecording[] }>('/admin/alphabet/audio'),
  ]);
  return [...fromLessons(lessons.items), ...fromAlphabet(letters.recordings)];
}

function failureLine(err: unknown): string {
  return err instanceof TimelineError ? err.message : errorLine(err);
}

const COLUMNS: ReadonlyArray<Column<KindCounts>> = [
  { key: 'kind', header: 'Kind', cell: (c) => <strong>{KIND_NAMES[c.kind]}</strong>, card: 'title' },
  { key: 'recorded', header: 'Recorded', cell: (c) => c.recorded, align: 'end' },
  { key: 'noSpeaker', header: 'No character', cell: (c) => c.noSpeaker, align: 'end' },
  { key: 'noTimeline', header: 'No mouth timeline', cell: (c) => c.noTimeline, align: 'end' },
];

/**
 * The Characters side of the audio studio: who is shown saying the
 * recordings, and the mouth timelines they move with.
 *
 * A recording made before the characters has no speaker, so a learner sees
 * no one say it; one given a character since, without being recorded again,
 * has no timeline, so the mouth is timed from the words alone. Two jobs put
 * both right in bulk: give every recording without a character one, and make
 * the missing timelines — each file downloaded and read in this browser, as
 * the studio does for a new take, and the timeline saved with it.
 *
 * Both work through two recordings at a time, can be paused and cancelled,
 * and set a failure aside to retry rather than stop. They touch only the
 * recordings the filter picks; a timeline already made is replaced only when
 * the editor asks for it.
 */
export function Characters(): React.JSX.Element {
  const list = useLoad(loadRecordings, []);
  const recordings = list.data;
  const [speakerKinds, setSpeakerKinds] = useState<KindFilter>('all');
  const [who, setWho] = useState<SpeakerId>(() => rememberedSpeaker() ?? DEFAULT_CHARACTER);
  const [timelineKinds, setTimelineKinds] = useState<KindFilter>('all');
  const [remake, setRemake] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const control = useRef<BatchControl | null>(null);
  const work = useRef<Work | null>(null);

  // leaving the page stops the job: nothing is left running where no one can see it
  useEffect(() => () => control.current?.cancel(), []);

  const busy = job !== null && (job.status === 'running' || job.status === 'paused' || job.status === 'stopping');
  const toGive = recordings?.filter((r) => needsSpeaker(r, speakerKinds)) ?? [];
  const toTime = recordings?.filter((r) => needsTimeline(r, timelineKinds, remake)) ?? [];

  const update = (r: VoiceRecording, change: Partial<VoiceRecording>): void =>
    list.setData((all) => (all ?? []).map((x) => (idOf(x) === idOf(r) ? { ...x, ...change } : x)));

  const run = async (name: JobName, items: VoiceRecording[], how: Work, retrying = false): Promise<void> => {
    const ctl = batchControl();
    control.current = ctl;
    work.current = how;
    const again = new Set(items.map(idOf));
    setJob((prev) => ({
      name,
      status: 'running',
      total: items.length,
      done: 0,
      saved: 0,
      // a retry keeps the failures it is not retrying
      failures: retrying && prev?.name === name ? prev.failures.filter((f) => !again.has(idOf(f.recording))) : [],
    }));
    await runBatch(items, how, {
      control: ctl,
      concurrency: 2,
      onOutcome: (o) => {
        if (control.current !== ctl) return;
        setJob((j) =>
          j && {
            ...j,
            done: j.done + 1,
            saved: j.saved + (o.ok ? 1 : 0),
            failures: o.ok ? j.failures : [...j.failures, { recording: o.item, message: failureLine(o.error) }],
          },
        );
      },
    });
    if (control.current === ctl) setJob((j) => j && { ...j, status: ctl.cancelled ? 'cancelled' : 'done' });
  };

  const giveSpeaker = (): void => {
    const speaker = who;
    void run('speaker', toGive, async (r) => {
      await patchVoice(r.kind, r.key, { speaker });
      update(r, { speaker });
    });
  };

  const makeTimelines = (): void => {
    void run('timelines', toTime, async (r, signal) => {
      const lipsync = await timelineFromUrl(r, signal);
      await patchVoice(r.kind, r.key, { lipsync });
      update(r, { hasLipsync: true });
    });
  };

  const retry = (failures: Failure[]): void => {
    if (!job || !work.current) return;
    // as the list has them now, not as they were when they failed
    const current = new Map((recordings ?? []).map((r) => [idOf(r), r]));
    void run(job.name, failures.map((f) => current.get(idOf(f.recording)) ?? f.recording), work.current, true);
  };

  const pause = (): void => {
    control.current?.pause();
    setJob((j) => j && { ...j, status: 'paused' });
  };
  const resume = (): void => {
    control.current?.resume();
    setJob((j) => j && { ...j, status: 'running' });
  };
  const cancel = (): void => {
    control.current?.cancel();
    setJob((j) => j && { ...j, status: 'stopping' });
  };

  if (list.error && !recordings) return <ErrorState error={list.error} onRetry={() => void list.reload()} what="the recordings" />;

  const panel = (name: JobName): React.JSX.Element | null =>
    job?.name === name ? <JobPanel job={job} onPause={pause} onResume={resume} onCancel={cancel} onRetry={retry} /> : null;

  return (
    <div className="vc">
      <Section
        flush
        title="Recordings"
        description="Who is shown saying each recording, and whether the character has a mouth timeline to move with. A recording without a character shows no one; one without a timeline moves the mouth by its words alone."
      >
        <Table
          caption="Recordings by kind"
          columns={COLUMNS}
          rows={recordings ? countByKind(recordings) : null}
          rowKey={(c) => c.kind}
          loading={list.loading && !recordings}
          error={list.error}
          onRetry={() => void list.reload()}
        />
      </Section>

      <Section
        title="Give recordings a character"
        description="For recordings no one is shown saying, most of them made before there were characters. Recordings that already have a character keep it."
      >
        <div className="vc-form">
          <Select
            label="Which recordings"
            value={speakerKinds}
            onChange={(e) => setSpeakerKinds(e.target.value as KindFilter)}
            options={KIND_OPTIONS}
            disabled={busy}
          />
          <SpeakerPicker label="Character" value={who} onChange={(s) => s && setWho(s)} none={false} disabled={busy} />
          <div className="vc-go">
            <Button variant="primary" onClick={giveSpeaker} disabled={busy || !recordings || toGive.length === 0}>
              {!recordings
                ? 'Give them a character'
                : toGive.length === 0
                  ? 'Every recording here has a character'
                  : `Give ${toGive.length} ${toGive.length === 1 ? 'recording' : 'recordings'} to ${CHARACTER_NAMES[who]}`}
            </Button>
          </div>
        </div>
        {panel('speaker')}
      </Section>

      <Section
        title="Make mouth timelines"
        description="For recordings with a character that were made, or given one, without a timeline. Each file is downloaded and read in this browser, then its timeline is saved with it: keep this page open until it finishes."
      >
        <div className="vc-form">
          <Select
            label="Which recordings"
            value={timelineKinds}
            onChange={(e) => setTimelineKinds(e.target.value as KindFilter)}
            options={KIND_OPTIONS}
            disabled={busy}
          />
          <Checkbox
            label="Remake existing timelines"
            hint="Off, only recordings without a timeline get one. On, every recording with a character gets a new one, replacing what it has."
            checked={remake}
            onChange={setRemake}
            disabled={busy}
          />
          <div className="vc-go">
            <Button variant="primary" onClick={makeTimelines} disabled={busy || !recordings || toTime.length === 0}>
              {!recordings
                ? 'Make timelines'
                : toTime.length === 0
                  ? 'Every recording here has a timeline'
                  : `Make ${toTime.length} ${toTime.length === 1 ? 'timeline' : 'timelines'}`}
            </Button>
          </div>
        </div>
        {panel('timelines')}
      </Section>

    </div>
  );
}

const DOING: Record<JobName, string> = { speaker: 'Giving recordings a character', timelines: 'Making timelines' };

function JobPanel({
  job,
  onPause,
  onResume,
  onCancel,
  onRetry,
}: {
  job: Job;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: (failures: Failure[]) => void;
}): React.JSX.Element {
  const failed = job.failures.length;
  const running = job.status === 'running' || job.status === 'paused' || job.status === 'stopping';
  const saved = `${job.saved} saved${failed ? `, ${failed} failed` : ''}`;
  const status =
    job.status === 'running'
      ? DOING[job.name]
      : job.status === 'paused'
        ? 'Paused'
        : job.status === 'stopping'
          ? 'Cancelling…'
          : job.status === 'cancelled'
            ? `Cancelled: ${saved}`
            : `Finished: ${saved}`;
  return (
    <div className="vc-job">
      <div className="vc-job-head">
        <div className="vc-job-text">
          <strong role="status">{status}</strong>
          <span className="subtle">
            {job.done} of {job.total}
          </span>
        </div>
        {running && (
          <div className="vc-job-actions">
            {job.status === 'paused' ? (
              <Button icon="play" onClick={onResume}>
                Resume
              </Button>
            ) : (
              <Button icon="pause" onClick={onPause} disabled={job.status === 'stopping'}>
                Pause
              </Button>
            )}
            <Button variant="danger" icon="close" onClick={onCancel} disabled={job.status === 'stopping'}>
              Cancel
            </Button>
          </div>
        )}
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label={DOING[job.name]}
        aria-valuemin={0}
        aria-valuemax={job.total}
        aria-valuenow={job.done}
      >
        <div className="progress-bar" style={{ width: `${job.total ? (job.done / job.total) * 100 : 100}%` }} />
      </div>
      {failed > 0 && (
        <div className="vc-fails">
          <div className="vc-fails-head">
            <strong>
              {failed} {failed === 1 ? 'recording' : 'recordings'} failed
            </strong>
            <Button icon="refresh" onClick={() => onRetry(job.failures)} disabled={running}>
              Retry all
            </Button>
          </div>
          <ul className="vc-fail-list">
            {job.failures.map((f) => {
              const script = scriptOf(f.recording.text);
              return (
                <li key={idOf(f.recording)} className="vc-fail">
                  <div className="vc-fail-text">
                    <span className="vc-fail-what" lang={script.lang} dir={script.dir}>
                      {f.recording.text}
                    </span>
                    <span className="subtle"> · {KIND_NAMES[f.recording.kind]}</span>
                    <div className="field-error">{f.message}</div>
                  </div>
                  <Button onClick={() => onRetry([f])} disabled={running} aria-label={`Retry “${f.recording.text}”`}>
                    Retry
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
