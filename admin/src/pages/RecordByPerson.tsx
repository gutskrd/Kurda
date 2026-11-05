import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { characterSvg, LESSON_AUDIO_MAX_SECONDS, ALPHABET_CLIP_MAX_SECONDS, type SpeakerId } from '@kurda/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { scriptOf } from '../lessonAudio';
import { href, mayOpenPage } from '../navigation';
import {
  DEFAULT_FILTERS,
  counts,
  dialectName,
  isDone,
  matchesFilters,
  neighbour,
  nextTodo,
  personHref,
  placeLine,
  resumeAt,
  savePlace,
  savedPlace,
  scriptCsv,
  scriptFileName,
  scriptMarkdown,
  sectionsOf,
  tallyOf,
  uploadPath,
  uploadVoice,
  withTake,
  type Filters,
  type Line,
  type LinesPage,
  type PeopleListing,
  type Person,
  type ScriptDialect,
  type SourceFilter,
  type StatusFilter,
  type VoiceId,
  type Uploaded,
} from '../recordingPeople';
import { useTake } from '../recorder';
import { useSession } from '../session';
import { ActionMenu, Badge, Banner, Button, EmptyState, ErrorState, Icon, Loading, PageHeader, Section as Card, Select, Tabs, errorLine, useLoad, useMediaQuery, useToast, type Tone } from '../ui';
import { allowMicHowTo } from '../micCapture';
import { uploadWithVoice } from '../voice';
import './record-people.css';

/** Every line of a voice, page by page; `onPage` hears how far it has got. */
async function loadAllLines(
  voice: VoiceId,
  dialect: ScriptDialect | null,
  onPage?: (sofar: Line[], first: LinesPage) => void,
): Promise<{ lines: Line[]; first: LinesPage }> {
  const lines: Line[] = [];
  let first: LinesPage | null = null;
  let cursor: string | null = null;
  // a few pages of a few hundred lines: a guard against a cursor that never ends
  for (let page = 0; page < 200; page++) {
    const query = new URLSearchParams({ status: 'all', limit: '500' });
    if (dialect) query.set('dialect', dialect);
    if (cursor) query.set('cursor', cursor);
    const res: LinesPage = await api<LinesPage>(`/admin/recording/people/${encodeURIComponent(voice)}?${query.toString()}`);
    first ??= res;
    lines.push(...res.lines);
    onPage?.(lines, first);
    cursor = res.next;
    if (!cursor) break;
  }
  return { lines, first: first! };
}

/** Hand the browser a file to save. */
function saveFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const portraits = new Map<SpeakerId, string>();

/** A character's portrait for a card, drawn once: the same bust the speaker picker shows, larger. */
function portraitUrl(id: SpeakerId): string {
  let url = portraits.get(id);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(characterSvg(id, { crop: 'bust', width: 112 }))}`;
    portraits.set(id, url);
  }
  return url;
}

/** Who a card is about: the character's own art, a microphone for a narrator, initials for a part no character plays. */
function Avatar({ person, size = 56 }: { person: Pick<Person, 'kind' | 'speaker' | 'name'>; size?: number }): React.JSX.Element {
  if (person.speaker) return <img className="rp-avatar" src={portraitUrl(person.speaker)} alt="" width={size} height={size} />;
  return (
    <span className="rp-avatar is-plain" style={{ width: size, height: size }} aria-hidden="true">
      {person.kind === 'narrator' ? <Icon name="mic" size={Math.round(size * 0.42)} /> : person.name.slice(0, 2)}
    </span>
  );
}

/** How much of a person's script is recorded, as a ring with the share in its middle. */
function ProgressRing({ done, total, size = 64 }: { done: number; total: number; size?: number }): React.JSX.Element {
  const share = total > 0 ? done / total : 0;
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <span className="rp-ring" role="img" aria-label={`${done} of ${total} recorded`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="rp-ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={`rp-ring-fill${share >= 1 ? ' is-full' : ''}`}
          strokeDasharray={`${c * share} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="rp-ring-text">{total > 0 ? `${Math.floor(share * 100)}%` : '–'}</span>
    </span>
  );
}

function leftText(person: Pick<Person, 'todo' | 'total'>): string {
  if (person.total === 0) return 'Nothing to record yet';
  if (person.todo === 0) return `All ${person.total} lines recorded`;
  return `${person.todo} ${person.todo === 1 ? 'line' : 'lines'} left of ${person.total}`;
}

/** Download a person's whole script, every line in order, as Markdown or a spreadsheet. */
function useScriptDownload(): (person: Pick<Person, 'id' | 'name'>, kind: 'md' | 'csv', lines?: readonly Line[]) => Promise<void> {
  const toast = useToast();
  return useCallback(
    async (person, kind, lines) => {
      try {
        const all = lines ?? (await loadAllLines(person.id, null)).lines;
        if (kind === 'md') saveFile(scriptFileName(person.id, 'md'), scriptMarkdown(person, all), 'text/markdown;charset=utf-8');
        else saveFile(scriptFileName(person.id, 'csv'), scriptCsv(all), 'text/csv;charset=utf-8');
      } catch (err) {
        toast.error(errorLine(err, 'recordings'));
      }
    },
    [toast],
  );
}

function ScriptMenu({ person, lines }: { person: Pick<Person, 'id' | 'name'>; lines?: readonly Line[] }): React.JSX.Element | null {
  const download = useScriptDownload();
  return (
    <ActionMenu
      label={`Download ${person.name}’s script`}
      buttonText="Download script"
      items={[
        { label: 'To read and rehearse (Markdown)', onSelect: () => void download(person, 'md', lines) },
        { label: 'As a spreadsheet (CSV)', onSelect: () => void download(person, 'csv', lines) },
      ]}
    />
  );
}

/**
 * Record by person (#/record, #/record/<voice>): everyone who lends the
 * course a voice — the voice plan's characters, any conversation part no
 * character plays, a narrator for each variety — each with what is left for
 * them, and, on choosing one, their lines one after another in course order:
 * the line big, what it means, the line before it to act from, and a
 * recorder that keeps a take and moves on to the next line still to record.
 *
 * A take goes to the upload route the studio's own side for that line uses,
 * under the same key and with the same lip-sync timeline, so it is the
 * recording every lesson, story and game that says the line plays
 * (recordingPeople.ts). Someone linked to a voice lands here on their own
 * lines (navigation.ts); a voice actor sees only theirs, which the server
 * decides, not this page.
 */
export function RecordByPerson({ voice }: { voice: string | null }): React.JSX.Element {
  return voice ? <PersonScript key={voice} voice={voice} /> : <People />;
}

function People(): React.JSX.Element {
  const loaded = useLoad(() => api<PeopleListing>('/admin/recording/people'), []);
  const data = loaded.data;
  const mine = data ? data.people.filter((p) => data.mine.includes(p.id)) : [];
  const others = data ? data.people.filter((p) => !data.mine.includes(p.id)) : [];
  const left = data ? data.people.reduce((n, p) => n + p.todo, 0) : 0;

  return (
    <div>
      <PageHeader
        title="Record by person"
        subtitle="Everything each voice of the course has to say, in course order. Choose a person to record their lines one after another, on a phone or a laptop. A take made here is the recording every lesson, story and game that says the line plays."
        actions={
          <Button icon="refresh" onClick={() => void loaded.reload()} busy={loaded.loading && !!data}>
            Refresh
          </Button>
        }
      />
      {loaded.error != null && !data ? (
        <ErrorState error={loaded.error} onRetry={() => void loaded.reload()} what="recordings" />
      ) : !data ? (
        <Loading rows={4} label="Reading every line of the course…" />
      ) : data.people.length === 0 ? (
        <EmptyState title="No voice is linked to your account yet" icon="mic">
          Whoever runs Hevalo links your account to the voice you record, on your page in Users. Once they have, your lines are here.
        </EmptyState>
      ) : (
        <>
          {!data.ownVoicesOnly && (
            <p className="rp-total subtle">{left === 0 ? 'Every line of every voice is recorded.' : `${left} lines still to record across every voice.`}</p>
          )}
          {mine.length > 0 && (
            <PeopleGrid title={data.ownVoicesOnly ? undefined : mine.length === 1 ? 'Your voice' : 'Your voices'} people={mine} mineToo />
          )}
          {others.length > 0 && <PeopleGrid title={mine.length > 0 ? 'Everyone else' : undefined} people={others} />}
        </>
      )}
    </div>
  );
}

function PeopleGrid({ title, people, mineToo = false }: { title?: string; people: readonly Person[]; mineToo?: boolean }): React.JSX.Element {
  return (
    <section className="rp-group" aria-label={title ?? 'Voices'}>
      {title && <h2 className="rp-group-title">{title}</h2>}
      <ul className="rp-people">
        {people.map((p) => (
          <li key={p.id} className={`card rp-person${mineToo ? ' is-mine' : ''}`}>
            <div className="rp-person-head">
              <Avatar person={p} />
              <div className="rp-person-name">
                <h3>
                  <a href={personHref(p.id)}>{p.name}</a>
                </h3>
                <div className="rp-person-tags">
                  {p.dialects.length > 0
                    ? p.dialects.map((d) => (
                        <Badge key={d.dialect} tone="neutral">
                          {dialectName(d.dialect)}
                          {p.dialects.length > 1 ? ` · ${d.todo} left` : ''}
                        </Badge>
                      ))
                    : p.dialect && <Badge>{dialectName(p.dialect)}</Badge>}
                </div>
              </div>
              <ProgressRing done={p.done} total={p.total} />
            </div>
            {p.about && <p className="rp-about subtle">{p.about}</p>}
            <p className="rp-left">
              <strong>{leftText(p)}</strong>
            </p>
            {p.linked.length > 0 && <p className="rp-linked subtle">Recorded by {p.linked.map((a) => `@${a.username}`).join(', ')}</p>}
            <div className="rp-person-actions">
              <a className="button-link primary" href={personHref(p.id)} aria-label={`Record ${p.name}’s lines`}>
                <Icon name="mic" />
                {p.todo > 0 && p.done > 0 ? 'Carry on' : p.todo > 0 ? 'Start recording' : 'Listen back'}
              </a>
              {p.total > 0 && <ScriptMenu person={p} />}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STATUS_LABEL: Record<StatusFilter, string> = { todo: 'To do', done: 'Done', all: 'All' };
const SOURCE_OPTIONS: ReadonlyArray<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Drafts' },
];
const STATUS_TONE: Record<string, Tone> = { published: 'ok', in_review: 'info', draft: 'warn' };
const STATUS_NAME: Record<string, string> = { published: 'Published', in_review: 'In review', draft: 'Draft' };

/** One person's lines, the list beside the line being recorded (below it on a phone). */
function PersonScript({ voice }: { voice: string }): React.JSX.Element {
  const { me } = useAuth();
  const toast = useToast();
  const wide = useMediaQuery('(min-width: 1000px)', true);
  const [found, setFound] = useState<Person | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState<{ sofar: number; total: number | null; done: boolean }>({ sofar: 0, total: null, done: false });
  const [error, setError] = useState<unknown>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [dialect, setDialect] = useState<ScriptDialect | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [view, setView] = useState<'record' | 'list'>('record');
  const [finished, setFinished] = useState(false);
  const attempt = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++attempt.current;
    setError(null);
    setLoading({ sofar: 0, total: null, done: false });
    try {
      const { lines: all, first } = await loadAllLines(voice, null, (sofar, page) => {
        if (ticket !== attempt.current) return;
        setFound(page.person);
        setLoading({ sofar: sofar.length, total: page.person.total, done: false });
      });
      if (ticket !== attempt.current) return;
      setLines(all);
      setFound(first.person);
      setLoading({ sofar: all.length, total: all.length, done: true });
      // where they left off, in this browser; else the first line still to record
      setCurrent((was) => was ?? resumeAt(all, savedPlace(voice))?.id ?? null);
    } catch (err) {
      if (ticket === attempt.current) setError(err);
    }
  }, [voice]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map(lines.map((l, i) => [l.id, { line: l, number: i + 1 }])), [lines]);
  const inDialect = useMemo(() => (dialect ? lines.filter((l) => l.dialect === dialect) : lines), [lines, dialect]);
  // the line on screen stays listed when the filter would hide it — it was just recorded, say
  const shown = useMemo(() => inDialect.filter((l) => matchesFilters(l, filters) || l.id === current), [inDialect, filters, current]);
  const n = counts(inDialect, filters);
  const line = current ? (byId.get(current)?.line ?? null) : null;
  // counted from the lines on screen, so each take kept here shows at once
  const person = useMemo(() => (found ? { ...found, ...tallyOf(lines) } : null), [found, lines]);
  const sections = useMemo(() => sectionsOf(inDialect), [inDialect]);

  useEffect(() => {
    if (current) savePlace(voice, current);
  }, [voice, current]);

  const select = (id: string | null): void => {
    setCurrent(id);
    setFinished(false);
    if (!wide) setView('record');
  };
  const move = (step: number): void => {
    const next = neighbour(shown, current, step);
    if (next) select(next.id);
  };
  const skipToTodo = (): void => {
    const next = nextTodo(shown, current);
    if (next) select(next.id);
  };

  const keep = async (wav: Uint8Array): Promise<void> => {
    if (!line || !person) return;
    const saved = await uploadWithVoice<Uploaded>(uploadPath(line), wav, uploadVoice(line, person));
    const after = withTake(lines, line.id, saved, me?.username ?? null);
    setLines(after);
    // on to the next line still to record, in the order on screen
    const listed = after.filter((l) => (!dialect || l.dialect === dialect) && (matchesFilters(l, filters) || l.id === line.id));
    const next = nextTodo(listed, line.id);
    if (next) setCurrent(next.id);
    else {
      setFinished(true);
      toast.success('That was the last one: everything here is recorded.');
    }
  };

  // a click leaves no button focused, so Space and Enter go to the recorder and not to the last button pressed
  const unfocus = (e: MouseEvent): void => {
    const button = (e.target as HTMLElement).closest('button');
    if (button && e.detail > 0) button.blur();
  };

  if (error != null && lines.length === 0) {
    return (
      <div>
        <PageHeader back={{ href: href('record'), label: 'Everyone' }} title="Record by person" />
        <ErrorState error={error} onRetry={() => void load()} what="recordings" />
      </div>
    );
  }
  if (!person || !loading.done) {
    return (
      <div>
        <PageHeader back={{ href: href('record'), label: 'Everyone' }} title={person?.name ?? 'Record by person'} />
        <Loading rows={4} label={loading.total ? `Reading ${person?.name ?? 'their'} lines… ${loading.sofar} of ${loading.total}` : 'Reading every line…'} />
      </div>
    );
  }

  const filterBar = (
    <div className="rp-filters" role="group" aria-label="Which lines">
      <Tabs
        label="Show"
        value={filters.status}
        onChange={(status) => setFilters((f) => ({ ...f, status }))}
        items={(['todo', 'done', 'all'] as const).map((k) => ({ key: k, label: STATUS_LABEL[k], count: n[k] }))}
      />
      <div className="rp-selects">
        <Select
          label="Where"
          value={filters.section ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, section: e.target.value || null }))}
          options={[{ value: '', label: 'Everywhere' }, ...sections.map((s) => ({ value: s.id, label: `${s.label}${s.todo > 0 ? ` (${s.todo} left)` : ' (done)'}` }))]}
        />
        <Select label="Source" value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value as SourceFilter }))} options={SOURCE_OPTIONS} />
        {person.dialects.length > 1 && (
          <Select
            label="Variety"
            value={dialect ?? ''}
            onChange={(e) => setDialect((e.target.value || null) as ScriptDialect | null)}
            options={[{ value: '', label: 'Both' }, ...person.dialects.map((d) => ({ value: d.dialect, label: dialectName(d.dialect) }))]}
          />
        )}
      </div>
    </div>
  );

  const list = (
    <LineList
      lines={shown}
      numberOf={(id) => byId.get(id)?.number ?? 0}
      current={current}
      onSelect={select}
      empty={
        n.all === 0
          ? 'Nothing here: try another place or source.'
          : filters.status === 'todo'
            ? 'Everything here is recorded.'
            : 'Nothing here yet: nothing is recorded where you are looking.'
      }
    />
  );

  return (
    <div className="rp-page" onClick={unfocus}>
      <PageHeader
        back={{ href: href('record'), label: 'Everyone' }}
        title={
          <span className="rp-title">
            <Avatar person={person} size={40} />
            {person.name}
          </span>
        }
        subtitle={leftText(person)}
        meta={<ProgressRing done={person.done} total={person.total} size={44} />}
        actions={wide ? <ScriptMenu person={person} lines={lines} /> : undefined}
      />
      {/* on a phone the filters and the script live with the list, so the line to say is the first thing on screen */}
      {wide && filterBar}
      {!wide && (
        <Tabs
          className="rp-view"
          label="View"
          value={view}
          onChange={setView}
          items={[
            { key: 'record', label: 'Record' },
            { key: 'list', label: 'All lines', count: shown.length },
          ]}
        />
      )}
      <div className={`rp-flow${wide ? ' is-wide' : ''}`}>
        {(wide || view === 'list') && (
          <div className="rp-list-pane">
            {!wide && filterBar}
            {list}
            {!wide && (
              <div className="rp-list-foot">
                <ScriptMenu person={person} lines={lines} />
              </div>
            )}
          </div>
        )}
        {(wide || view === 'record') && (
          <div className="rp-stage-pane">
            {finished && (
              <Banner tone="ok" title="Everything here is recorded.">
                Every line in this view has a take. Choose another place, or listen back through them.
              </Banner>
            )}
            {line ? (
              <TakeStage
                key={line.id}
                line={line}
                number={byId.get(line.id)?.number ?? 0}
                of={lines.length}
                person={person}
                onKeep={keep}
                onPrev={() => move(-1)}
                onNext={() => move(1)}
                onSkip={n.todo > 0 ? skipToTodo : undefined}
                canPrev={shown.findIndex((l) => l.id === line.id) > 0}
                canNext={shown.findIndex((l) => l.id === line.id) < shown.length - 1}
              />
            ) : (
              <EmptyState title="Nothing to record here" icon="check">
                {person.total === 0 ? 'No line of the course is for this voice yet.' : 'Choose a line in the list.'}
              </EmptyState>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LineList({
  lines,
  numberOf,
  current,
  onSelect,
  empty,
}: {
  lines: readonly Line[];
  numberOf: (id: string) => number;
  current: string | null;
  onSelect: (id: string) => void;
  empty: string;
}): React.JSX.Element {
  const rows = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (current) rows.current.get(current)?.scrollIntoView({ block: 'nearest' });
  }, [current]);
  if (lines.length === 0) return <p className="subtle rp-empty">{empty}</p>;
  const groups: Array<{ id: string; label: string; lines: Line[] }> = [];
  for (const l of lines) {
    const last = groups[groups.length - 1];
    if (last && last.id === l.section.id) last.lines.push(l);
    else groups.push({ id: l.section.id, label: l.section.label, lines: [l] });
  }
  return (
    <nav className="card rp-list" aria-label="Lines">
      {groups.map((g, gi) => (
        <div key={`${g.id}:${gi}`} className="rp-list-group">
          <h3 className="rp-list-head">{g.label}</h3>
          <ol>
            {g.lines.map((l) => {
              const script = scriptOf(l.text);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) rows.current.set(l.id, el);
                      else rows.current.delete(l.id);
                    }}
                    className={`rp-row${l.id === current ? ' is-current' : ''}${isDone(l) ? ' is-done' : ''}`}
                    aria-current={l.id === current ? 'true' : undefined}
                    onClick={() => onSelect(l.id)}
                  >
                    <span className="rp-row-n">{numberOf(l.id)}</span>
                    <span className={`aa-dot${isDone(l) ? ' is-done' : ''}`} aria-hidden="true" />
                    <span className="rp-row-text" lang={script.lang} dir={script.dir}>
                      {l.text}
                    </span>
                    <span className="sr-only">{isDone(l) ? ', recorded' : ', still to record'}</span>
                    {!l.live && <span className="rp-row-draft">draft</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </nav>
  );
}

/** Where a place is edited, for someone whose role opens that page. */
function PlaceLink({ place }: { place: Line['places'][number] }): React.JSX.Element | null {
  const session = useSession();
  if (!place.ref || !mayOpenPage(place.ref.page, session)) return null;
  return (
    <a className="rp-place-link" href={href(place.ref.page, place.ref.id)} aria-label={`Open: ${place.label}`}>
      <Icon name="external" size={14} />
    </a>
  );
}

function takeLine(take: NonNullable<Line['take']>): string {
  const when = new Date(take.updatedAt).toLocaleDateString();
  return [take.by ? `@${take.by}` : null, take.durationMs ? `${(take.durationMs / 1000).toFixed(1)} s` : null, when].filter(Boolean).join(' · ');
}

/**
 * The line being recorded, and its recorder: Record (Space), Stop (Space),
 * hear it back at once, then Keep (Enter) or Redo (Space); L plays it again,
 * and the arrows move to the line before or after. None of the keys while
 * someone is typing, choosing in a list, or has a button of their own in
 * focus (Tab there, and Space presses that button, as it should).
 */
function TakeStage({
  line,
  number,
  of,
  person,
  onKeep,
  onPrev,
  onNext,
  onSkip,
  canPrev,
  canNext,
}: {
  line: Line;
  number: number;
  of: number;
  person: Person;
  onKeep: (wav: Uint8Array) => Promise<void>;
  onPrev: () => void;
  onNext: () => void;
  onSkip?: () => void;
  canPrev: boolean;
  canNext: boolean;
}): React.JSX.Element {
  const maxSeconds = line.store === 'alphabet' ? ALPHABET_CLIP_MAX_SECONDS : LESSON_AUDIO_MAX_SECONDS;
  const take = useTake(maxSeconds, line.store === 'alphabet' ? 'one letter or one word' : 'one sentence');
  const { phase } = take;
  const saved = useRef<HTMLAudioElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const script = scriptOf(line.text);
  // a meaning of nothing but spaces is no meaning: the row is left out rather than drawn as a label beside a blank
  const meaning = line.meaning?.trim() || null;
  const status = line.places.some((p) => p.status === 'published') ? 'published' : line.places.some((p) => p.status === 'in_review') ? 'in_review' : 'draft';
  const judging = phase.name === 'ready' || phase.name === 'saving';

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (target.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      if ((e.key === ' ' || e.key === 'Enter') && target.closest('button, a, summary, [role="tab"]')) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (phase.name === 'recording') void take.stop();
        else if (phase.name === 'idle' || phase.name === 'ready') void take.record();
      } else if (e.key === 'Enter' && phase.name === 'ready') {
        e.preventDefault();
        void take.save(onKeep);
      } else if (e.key === 'l' || e.key === 'L') {
        if (judging) take.listen();
        else if (phase.name === 'idle') void saved.current?.play().catch(() => undefined);
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && phase.name === 'idle' && canNext) {
        e.preventDefault();
        onNext();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && phase.name === 'idle' && canPrev) {
        e.preventDefault();
        onPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <article className="card rp-stage" aria-labelledby="rp-say">
      <header className="rp-stage-head">
        <span className="rp-count">
          Line {number} of {of}
        </span>
        <Badge tone={STATUS_TONE[status]}>{STATUS_NAME[status]}</Badge>
        {line.take ? <Badge tone="ok">Recorded</Badge> : <Badge>To record</Badge>}
      </header>
      <p className="rp-place">
        {placeLine(line.places[0]!)}
        <PlaceLink place={line.places[0]!} />
      </p>

      {line.before && (
        <blockquote className="rp-before">
          <span className="rp-before-who">{line.before.name ? `${line.before.name} says` : 'Just before'}</span>
          <span lang={scriptOf(line.before.text).lang} dir={scriptOf(line.before.text).dir}>
            {line.before.text}
          </span>
          {line.before.meaning && <span className="rp-before-means">{line.before.meaning}</span>}
        </blockquote>
      )}
      {line.cue && <p className="rp-cue">{line.cue}</p>}

      <div className="rp-say-block">
        {line.conversation?.name && person.kind !== 'character' && <span className="rp-as">as {line.conversation.name}</span>}
        <p id="rp-say" className="rp-say" lang={script.lang} dir={script.dir}>
          {line.text}
        </p>
        {meaning && (
          <p className="rp-means">
            <span className="rp-label">Means</span>
            {/* in quotation marks: the "I" that "ez" means read as a rule beside the label without them */}
            <q lang="en">{meaning}</q>
          </p>
        )}
        {line.hint && <p className="rp-hint">How: {line.hint}</p>}
      </div>

      {line.take && phase.name === 'idle' && (
        <div className="rp-saved">
          <audio ref={saved} controls src={line.take.url} preload="none" />
          <span className="subtle">Recorded {takeLine(line.take)}</span>
        </div>
      )}

      {take.blocked && phase.name === 'idle' && !take.problem && (
        <p className="rec-hint" role="note">
          The microphone is turned off for this site. {allowMicHowTo(take.platform)}
        </p>
      )}
      {phase.name === 'starting' && <div className="subtle aa-live">Starting the microphone…</div>}
      {phase.name === 'recording' && (
        <div className="aa-live rp-live" role="status">
          <span className="aa-rec-dot" aria-hidden="true" />
          <span>Recording… {take.seconds.toFixed(1)} s</span>
          <div className="aa-meter" aria-hidden="true">
            <div style={{ width: `${Math.min(100, take.level * 140)}%` }} />
          </div>
        </div>
      )}
      {phase.name === 'working' && (
        <div className="subtle aa-live" role="status">
          Trimming and levelling…
        </div>
      )}
      {judging && (
        <div className="aa-preview">
          <div className="aa-say-label">Listen back · {phase.clip.seconds.toFixed(1)} s</div>
          <audio ref={take.preview} controls src={phase.clip.url} playsInline />
        </div>
      )}
      {take.problem && (
        <div className="field-error aa-problem" role="alert">
          {take.problem}
        </div>
      )}

      <div className="rp-controls">
        {phase.name === 'recording' ? (
          <button type="button" className="primary rp-big" onClick={() => void take.stop()}>
            <Icon name="stop" />
            Stop
          </button>
        ) : judging ? (
          <>
            <button type="button" className="primary rp-big" onClick={() => void take.save(onKeep)} disabled={phase.name === 'saving'}>
              <Icon name="check" />
              {phase.name === 'saving' ? 'Keeping it…' : line.take ? 'Keep, replacing the old take' : 'Keep'}
            </button>
            <div className="rp-pair">
              <button type="button" onClick={() => take.listen()} disabled={phase.name === 'saving'}>
                <Icon name="play" />
                Listen
              </button>
              <button type="button" onClick={() => void take.record()} disabled={phase.name === 'saving'}>
                <Icon name="redo" />
                Redo
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="primary rp-big" onClick={() => void take.record()} disabled={take.busy}>
            <Icon name="mic" />
            {line.take ? 'Record it again' : 'Record'}
          </button>
        )}
      </div>

      <div className="rp-nav">
        <button type="button" className="ghost" onClick={onPrev} disabled={!canPrev || phase.name !== 'idle'}>
          <Icon name="arrowLeft" />
          Previous
        </button>
        {onSkip && line.take && (
          <button type="button" className="ghost" onClick={onSkip} disabled={phase.name !== 'idle'}>
            Next to record
          </button>
        )}
        <button type="button" className="ghost" onClick={onNext} disabled={!canNext || phase.name !== 'idle'}>
          Next
          <Icon name="arrowRight" />
        </button>
      </div>

      <p className="aa-keys">
        <kbd>Space</kbd> record / stop · <kbd>Enter</kbd> keep · <kbd>L</kbd> listen · <kbd>←</kbd>
        <kbd>→</kbd> previous / next
      </p>

      {line.places.length > 1 && (
        <details className="rp-places">
          <summary>Said in {line.places.length} places: one take serves them all</summary>
          <ul>
            {line.places.map((p, i) => (
              <li key={`${p.label}:${i}`}>
                {placeLine(p)}
                <PlaceLink place={p} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {phase.name === 'idle' && (
        <p className="rp-file">
          <button type="button" className="link" onClick={() => file.current?.click()}>
            <Icon name="upload" size={14} />
            Upload a recording instead
          </button>
          <input
            ref={file}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void take.takeFile(f);
            }}
          />
        </p>
      )}
    </article>
  );
}

/** The dashboard's way in, for someone who records but opens none of the studio: their voices and what is left. */
export function YourRecording(): React.JSX.Element {
  const loaded = useLoad(() => api<PeopleListing>('/admin/recording/people'), []);
  const people: Person[] = loaded.data ? loaded.data.people.filter((p) => loaded.data!.mine.includes(p.id) || loaded.data!.ownVoicesOnly) : [];
  let body: ReactNode;
  if (loaded.error != null) body = <span className="field-error">Could not count your lines.</span>;
  else if (!loaded.data) body = <Loading rows={1} />;
  else if (people.length === 0) body = <p className="subtle">No voice is linked to your account yet.</p>;
  else
    body = (
      <ul className="dash-rec-list">
        {people.map((p) => (
          <li key={p.id} className="dash-rec">
            <div className="dash-rec-text">
              <span className="dash-rec-label">{p.name}</span>
              <span className="subtle">{leftText(p)}</span>
            </div>
            <a className="button-link" href={personHref(p.id)} aria-label={`Record ${p.name}’s lines`}>
              Record
              <Icon name="chevronRight" size={16} />
            </a>
          </li>
        ))}
      </ul>
    );
  return (
    <Card title="Your recording" description="The lines of the voices you record, in course order.">
      {body}
    </Card>
  );
}
