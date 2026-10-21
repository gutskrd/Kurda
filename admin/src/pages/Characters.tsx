import { useEffect, useRef, useState } from 'react';
import { CHARACTER_NAMES, DEFAULT_CHARACTER, type DictionaryAudioAdminPage, type SpeakerId } from '@kurda/shared';
import { api } from '../api';
import { batchControl, chainSources, listSource, pagedSource, runBatch, type BatchControl, type BatchSource } from '../batch';
import type { Listing } from '../lessonAudio';
import { scriptOf } from '../lessonAudio';
import { Button, Checkbox, ErrorState, Note, Section, Select, Table, errorLine, useCountdown, useLoad, type Column } from '../ui';
import { SpeakerPicker } from '../ui/SpeakerPicker';
import { patchVoice, rememberedSpeaker } from '../voice';
import {
  KIND_NAMES,
  countByKind,
  dictionaryPage,
  failureLine,
  fromAlphabet,
  fromDictionary,
  fromLessons,
  needsSpeaker,
  needsTimeline,
  ofKind,
  retryAfterMs,
  timelineFromFile,
  type AlphabetRecording,
  type DictionaryFilter,
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
  /** waiting until then (Date.now() ms) because the server asked to slow down */
  holdUntil: number | null;
  /** the dictionary's list could not be read on: the job did what it had */
  problem: string | null;
}

type Work = (r: VoiceRecording, signal: AbortSignal) => Promise<void>;

type DictionaryCounts = DictionaryAudioAdminPage['counts'];

interface Loaded {
  /** lesson, story and alphabet recordings, read whole */
  listed: VoiceRecording[];
  /** the dictionary's, which are only counted here and read a page at a time by a job */
  dictionary: DictionaryCounts;
}

const KIND_OPTIONS: ReadonlyArray<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'Every kind' },
  { value: 'lesson', label: KIND_NAMES.lesson },
  { value: 'alphabet', label: KIND_NAMES.alphabet },
  { value: 'dictionary', label: KIND_NAMES.dictionary },
];

const idOf = (r: VoiceRecording): string => `${r.kind}:${r.key}`;

async function loadRecordings(): Promise<Loaded> {
  const [lessons, letters, dictionary] = await Promise.all([
    api<Listing>('/admin/lesson-audio'),
    api<{ recordings: AlphabetRecording[] }>('/admin/alphabet/audio'),
    dictionaryPage({}, null, { limit: 1 }),
  ]);
  return { listed: [...fromLessons(lessons.items), ...fromAlphabet(letters.recordings)], dictionary: dictionary.counts };
}

/** The dictionary's pronunciations that match `filter`, read a page at a time as the job gets to them. */
function dictionarySource(filter: DictionaryFilter, keep: (r: VoiceRecording) => boolean, signal: AbortSignal): BatchSource<VoiceRecording> {
  return pagedSource(async (cursor) => {
    const page = await dictionaryPage(filter, cursor, { signal });
    // the server filtered them; this only makes sure nothing else is touched
    return { items: page.items.map(fromDictionary).filter(keep), nextCursor: page.nextCursor };
  });
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
 * the missing timelines — each file read through the API and decoded in this
 * browser, as the studio does for a new take, and the timeline saved with it.
 *
 * Both work through two recordings at a time, can be paused and cancelled,
 * and set a failure aside to retry rather than stop. The dictionary's
 * pronunciations are read a page at a time as a job reaches them. When the
 * server asks for a pause, the job waits as long as it said and goes on.
 * Jobs touch only the recordings the filter picks; a timeline already made is
 * replaced only when the editor asks for it.
 */
export function Characters(): React.JSX.Element {
  const list = useLoad(loadRecordings, []);
  const loaded = list.data;
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
  const dict = loaded?.dictionary;
  const toGive = loaded?.listed.filter((r) => needsSpeaker(r, speakerKinds)) ?? [];
  const dictToGive = dict && ofKind('dictionary', speakerKinds) ? dict.noSpeaker : 0;
  const toTime = loaded?.listed.filter((r) => needsTimeline(r, timelineKinds, remake)) ?? [];
  const dictToTime = dict && ofKind('dictionary', timelineKinds) ? (remake ? dict.total - dict.noSpeaker : dict.speakerNoTimeline) : 0;
  const giveCount = toGive.length + dictToGive;
  const timeCount = toTime.length + dictToTime;

  /** After one is saved: the list, or the dictionary's counts, as they are now. */
  const update = (r: VoiceRecording, change: Partial<VoiceRecording>): void =>
    list.setData((all) => {
      if (!all) return all!;
      if (r.kind !== 'dictionary') return { ...all, listed: all.listed.map((x) => (idOf(x) === idOf(r) ? { ...x, ...change } : x)) };
      const c = { ...all.dictionary };
      if (change.speaker !== undefined && r.speaker === null && change.speaker !== null) {
        c.noSpeaker -= 1;
        if (!r.hasLipsync) c.speakerNoTimeline += 1;
      }
      if (change.hasLipsync && !r.hasLipsync && r.speaker !== null) c.speakerNoTimeline -= 1;
      return { ...all, dictionary: c };
    });

  /** Start a job over what `from` gives (passed the job's signal, so a cancel stops a page being read). */
  const run = async (name: JobName, from: (signal: AbortSignal) => BatchSource<VoiceRecording>, total: number, how: Work, keep: Failure[] = []): Promise<void> => {
    const ctl = batchControl();
    const source = from(ctl.signal);
    control.current = ctl;
    work.current = how;
    setJob({ name, status: 'running', total, done: 0, saved: 0, failures: keep, holdUntil: null, problem: null });
    const mine = (): boolean => control.current === ctl;
    await runBatch(source, how, {
      control: ctl,
      concurrency: 2,
      retryAfter: retryAfterMs,
      onHold: (until) => mine() && setJob((j) => j && { ...j, holdUntil: until }),
      onSourceError: (err) =>
        mine() &&
        setJob(
          (j) =>
            j && {
              ...j,
              problem: `The dictionary’s pronunciations could not be read on, so the job stopped there. ${errorLine(err)} Start it again to carry on.`,
            },
        ),
      onOutcome: (o) => {
        if (!mine()) return;
        setJob(
          (j) =>
            j && {
              ...j,
              done: j.done + 1,
              saved: j.saved + (o.ok ? 1 : 0),
              failures: o.ok ? j.failures : [...j.failures, { recording: o.item, message: failureLine(o.error) }],
            },
        );
      },
    });
    if (mine()) setJob((j) => j && { ...j, status: ctl.cancelled ? 'cancelled' : 'done', holdUntil: null });
  };

  const giveSpeaker = (): void => {
    const speaker = who;
    const kinds = speakerKinds;
    const listed = toGive;
    const from = (signal: AbortSignal): BatchSource<VoiceRecording> =>
      ofKind('dictionary', kinds)
        ? chainSources(listSource(listed), dictionarySource({ speaker: 'none' }, (r) => needsSpeaker(r, kinds), signal))
        : listSource(listed);
    void run('speaker', from, giveCount, async (r) => {
      await patchVoice(r.kind, r.key, { speaker });
      update(r, { speaker });
    });
  };

  const makeTimelines = (): void => {
    const kinds = timelineKinds;
    const again = remake;
    const listed = toTime;
    const filter: DictionaryFilter = again ? { speaker: 'any' } : { speaker: 'any', lipsync: 'missing' };
    const from = (signal: AbortSignal): BatchSource<VoiceRecording> =>
      ofKind('dictionary', kinds)
        ? chainSources(listSource(listed), dictionarySource(filter, (r) => needsTimeline(r, kinds, again), signal))
        : listSource(listed);
    void run('timelines', from, timeCount, async (r, stop) => {
      const lipsync = await timelineFromFile(r, stop);
      await patchVoice(r.kind, r.key, { lipsync });
      update(r, { hasLipsync: true });
    });
  };

  const retry = (failures: Failure[]): void => {
    if (!job || !work.current) return;
    // as the list has them now, not as they were when they failed
    const current = new Map((loaded?.listed ?? []).map((r) => [idOf(r), r]));
    const again = new Set(failures.map((f) => idOf(f.recording)));
    const items = failures.map((f) => current.get(idOf(f.recording)) ?? f.recording);
    void run(job.name, () => listSource(items), items.length, work.current, job.failures.filter((f) => !again.has(idOf(f.recording))));
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

  if (list.error && !loaded) return <ErrorState error={list.error} onRetry={() => void list.reload()} what="the recordings" />;

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
          rows={loaded ? countByKind(loaded.listed, loaded.dictionary) : null}
          rowKey={(c) => c.kind}
          loading={list.loading && !loaded}
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
            <Button variant="primary" onClick={giveSpeaker} disabled={busy || !loaded || giveCount === 0}>
              {!loaded
                ? 'Give them a character'
                : giveCount === 0
                  ? 'Every recording here has a character'
                  : `Give ${giveCount} ${giveCount === 1 ? 'recording' : 'recordings'} to ${CHARACTER_NAMES[who]}`}
            </Button>
          </div>
        </div>
        {panel('speaker')}
      </Section>

      <Section
        title="Make mouth timelines"
        description="For recordings with a character that were made, or given one, without a timeline. Each file is read through the server and decoded in this browser, then its timeline is saved with it: keep this page open until it finishes."
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
            <Button variant="primary" onClick={makeTimelines} disabled={busy || !loaded || timeCount === 0}>
              {!loaded
                ? 'Make timelines'
                : timeCount === 0
                  ? 'Every recording here has a timeline'
                  : `Make ${timeCount} ${timeCount === 1 ? 'timeline' : 'timelines'}`}
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
  const waitLeft = useCountdown(job.holdUntil);
  const failed = job.failures.length;
  const running = job.status === 'running' || job.status === 'paused' || job.status === 'stopping';
  const waiting = job.status === 'running' && job.holdUntil !== null;
  // the counts were taken when the page loaded; the job may find a few more
  const total = Math.max(job.total, job.done);
  const saved = `${job.saved} saved${failed ? `, ${failed} failed` : ''}`;
  const status =
    job.status === 'running'
      ? waiting
        ? 'Waiting: the server asked to slow down'
        : DOING[job.name]
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
            {waiting && `carrying on in ${waitLeft} s · `}
            {job.done} of {total}
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
      <div className="progress" role="progressbar" aria-label={DOING[job.name]} aria-valuemin={0} aria-valuemax={total} aria-valuenow={job.done}>
        <div className="progress-bar" style={{ width: `${total ? (job.done / total) * 100 : 100}%` }} />
      </div>
      {job.problem && <Note tone="bad">{job.problem}</Note>}
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
