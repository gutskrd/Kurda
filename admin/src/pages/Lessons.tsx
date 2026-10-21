import { useMemo, useState } from 'react';
import { api } from '../api';
import { go, useRoute } from '../nav';
import { STATUS_NAME, recordHref, type ContentStatus, type LessonList, type LessonRow, type SkillOption } from '../lessons';
import {
  Badge,
  Button,
  Drawer,
  Field,
  FieldRow,
  FormActions,
  Icon,
  PageHeader,
  Section,
  Table,
  Tabs,
  TextInput,
  Time,
  errorLine,
  useDebounced,
  useLoad,
  useToast,
  type Column,
  type Tone,
} from '../ui';
import { LessonEditor } from './LessonEditor';

export const STATUS_TONE: Record<ContentStatus, Tone> = { draft: 'warn', in_review: 'info', published: 'ok', archived: 'neutral' };

type StatusFilter = ContentStatus | 'current';

const FILTERS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'current', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'in_review', label: 'In review' },
  { key: 'published', label: 'Published' },
  { key: 'archived', label: 'Archived' },
];

/**
 * Lessons: every lesson of every course by its title, and the steps from
 * draft to published (KUR-100). #/lessons is the list, #/lessons/<id> one
 * lesson. The page used to open a lesson by its pasted UUID and create one
 * from a pasted skill UUID; nothing listed either.
 */
export function Lessons(): React.JSX.Element {
  const route = useRoute();
  const id = route.rest[0];
  if (id) return <LessonEditor key={id} id={id} />;
  return <LessonListPage initialStatus={route.query.get('status')} />;
}

function LessonListPage({ initialStatus }: { initialStatus: string | null }): React.JSX.Element {
  const [status, setStatus] = useState<StatusFilter>(FILTERS.some((f) => f.key === initialStatus) ? (initialStatus as StatusFilter) : 'current');
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 250);
  const [creating, setCreating] = useState(false);
  // everything at once (a few hundred rows at most): the tabs count by status, the search asks the server
  const list = useLoad(() => api<LessonList>(`/admin/content/lessons?status=all${query ? `&q=${encodeURIComponent(query)}` : ''}`), [query]);

  const all = list.data?.lessons ?? null;
  // the server sends at most 500 rows (LESSON_LIST_MAX); past that, the list and its counts
  // are the first part only, and the page says so rather than letting the rest vanish
  const cut = list.data && list.data.total > list.data.lessons.length ? list.data.total : null;
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { current: 0, draft: 0, in_review: 0, published: 0, archived: 0 };
    for (const l of all ?? []) {
      c[l.status] += 1;
      if (l.status !== 'archived') c.current += 1;
    }
    return c;
  }, [all]);
  const shown = all ? all.filter((l) => (status === 'current' ? l.status !== 'archived' : l.status === status)) : null;

  const columns: Column<LessonRow>[] = [
    {
      key: 'title',
      header: 'Lesson',
      card: 'title',
      sort: (a, b) => a.titleEn.localeCompare(b.titleEn),
      cell: (l) => (
        <>
          <a href={`#/lessons/${l.id}`} className="table-link">
            <strong>{l.titleEn}</strong>
          </a>
          <span className="cell-sub" lang="ku" dir="auto">
            {l.titleKu}
          </span>
        </>
      ),
    },
    {
      key: 'where',
      header: 'Where',
      cell: (l) => (
        <>
          {l.unit.title} › {l.skill.title}
          <span className="cell-sub">
            {l.course.title} · lesson {l.position}
          </span>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sort: (a, b) => a.status.localeCompare(b.status),
      cell: (l) => (
        <>
          <Badge tone={STATUS_TONE[l.status]}>{STATUS_NAME[l.status]}</Badge>
          {l.liveId && <span className="cell-sub">v{l.version} · an earlier version is live</span>}
        </>
      ),
    },
    { key: 'exercises', header: 'Exercises', align: 'end', sort: (a, b) => a.exerciseCount - b.exerciseCount, cell: (l) => l.exerciseCount },
    {
      key: 'published',
      header: 'Published',
      sort: (a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''),
      cell: (l) => (l.publishedAt ? <Time value={l.publishedAt} mode="date" /> : <span className="subtle">Not yet</span>),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Lessons"
        subtitle="Every lesson of every course. A lesson reaches learners once it is published; editing a published one starts a new version."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)} disabled={!list.data}>
            New lesson
          </Button>
        }
      />

      <Tabs label="Status" value={status} onChange={setStatus} items={FILTERS.map((f) => ({ key: f.key, label: f.label, count: all && !cut ? counts[f.key] : undefined }))} />

      <Section
        flush
        title={shown ? `${shown.length} ${shown.length === 1 ? 'lesson' : 'lessons'}` : 'Lessons'}
        description={
          cut && all
            ? `Showing the first ${all.length.toLocaleString()} of ${cut.toLocaleString()} lessons. Search by title, skill or unit to find the rest.`
            : undefined
        }
        actions={
          <div className="search-box">
            <Icon name="search" size={16} />
            <input type="search" aria-label="Search lessons" placeholder="Title, skill, unit or id" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      >
        <Table
          caption="Lessons"
          columns={columns}
          rows={shown}
          rowKey={(l) => l.id}
          loading={list.loading}
          error={list.error}
          onRetry={() => void list.reload()}
          what="lessons"
          // five columns and two buttons: on a tablet the titles wrapped a word to a line, so cards there
          wide="medium"
          empty={query ? 'No lesson matches that search.' : status === 'current' ? 'No lessons yet. Create the first with “New lesson”.' : `No lesson is ${STATUS_NAME[status as ContentStatus].toLowerCase()}.`}
          actions={(l) => (
            <>
              <a className="button-link" href={`#/lessons/${l.id}`} aria-label={`Open “${l.titleEn}”`}>
                Open
              </a>
              <a className="button-link" href={recordHref(l)} aria-label={`Record the sentences of “${l.titleEn}”`}>
                <Icon name="mic" />
                Record
              </a>
            </>
          )}
        />
      </Section>

      {list.data && <NewLesson open={creating} skills={list.data.skills} onClose={() => setCreating(false)} />}
    </div>
  );
}

/** A new draft in a skill: chosen by name, at the skill's next free position. */
function NewLesson({ open, skills, onClose }: { open: boolean; skills: SkillOption[]; onClose: () => void }): React.JSX.Element {
  const toast = useToast();
  const [skillId, setSkillId] = useState('');
  const skill = skills.find((s) => s.id === skillId);
  const [position, setPosition] = useState('');
  const [titleKu, setTitleKu] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const byCourse = useMemo(() => {
    const m = new Map<string, SkillOption[]>();
    for (const s of skills) m.set(s.courseTitle, [...(m.get(s.courseTitle) ?? []), s]);
    return [...m.entries()];
  }, [skills]);

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!skill) {
      setProblem('Choose the skill the lesson belongs to.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const { lessonId } = await api<{ lessonId: string }>('/admin/content/lessons', {
        method: 'POST',
        body: { skillId: skill.id, position: Number(position || skill.nextPosition), titleKu: titleKu.trim(), titleEn: titleEn.trim() },
      });
      toast.success(`Created “${titleEn.trim()}” as a draft.`);
      onClose();
      go(`lessons/${lessonId}`);
    } catch (err) {
      setProblem(errorLine(err, 'lessons'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New lesson"
      footer={
        <FormActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-lesson" busy={busy}>
            {busy ? 'Creating…' : 'Create draft'}
          </Button>
        </FormActions>
      }
    >
      <form id="new-lesson" className="form" onSubmit={(e) => void create(e)}>
        <Field label="Skill" hint="The lesson is added at the end of this skill." required>
          <select
            value={skillId}
            data-autofocus
            onChange={(e) => {
              setSkillId(e.target.value);
              setPosition('');
            }}
          >
            <option value="">Choose a skill…</option>
            {byCourse.map(([course, list]) => (
              <optgroup key={course} label={course}>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.unitTitle} › {s.titleEn}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <FieldRow>
          <TextInput label="Title in Kurdish" value={titleKu} onChange={(e) => setTitleKu(e.target.value)} required maxLength={200} dir="auto" />
          <TextInput label="Title in English" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} required maxLength={200} />
        </FieldRow>
        <TextInput
          label="Position in the skill"
          hint={skill ? `The next free one is ${skill.nextPosition}.` : 'Choose a skill first.'}
          inputMode="numeric"
          value={position || (skill ? String(skill.nextPosition) : '')}
          onChange={(e) => setPosition(e.target.value.replace(/\D/g, ''))}
          disabled={!skill}
        />
        {problem && (
          <p className="field-error" role="alert">
            {problem}
          </p>
        )}
      </form>
    </Drawer>
  );
}
