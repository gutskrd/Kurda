import { useEffect, useMemo, useState } from 'react';
import {
  APP_LOCALE_CODES,
  GAME_CONTENT_KINDS,
  GAME_DIALECTS,
  GAME_LEVELS,
  LEARN_GAMES,
  checkGameContent,
  dialectDirection,
  gameOfKind,
  type AdminGameContent,
  type GameContentKind,
  type GameDialect,
  type LearnGameId,
} from '@kurda/shared';
import { go, useRoute } from '../nav';
import {
  DEFAULT_GAME_FILTER,
  GAME_DIALECT_NAME,
  GAME_NAME,
  GAME_PAGE_SIZE,
  KIND_NAME,
  REVIEW_LABEL,
  STATUS_LABEL,
  actOnGameContent,
  blankPayload,
  createGameContent,
  deleteGameContent,
  gameContentReadiness,
  getGameContent,
  importGameContent,
  isKind,
  listGameContent,
  reviewGameContent,
  saveGameContent,
  type GameContentAction,
  type GameContentFilter,
  type GameContentImport,
} from '../gameContent';
import { WordCardFields } from './GameCardFields';
import { CaseFileFields, ScenarioFields } from './SceneCaseFields';
import {
  Badge,
  Banner,
  Button,
  Field,
  FormActions,
  Icon,
  Note,
  PageHeader,
  Section,
  Table,
  Tabs,
  Time,
  UserLink,
  errorLine,
  useDebounced,
  useDialogs,
  useLoad,
  useToast,
  type Column,
  type Tone,
} from '../ui';
import { IdentityFields, QuestionTemplateFields, WordPicker } from './GameWordCards';

/**
 * Game content: the learning games' own rows — sentences, passages,
 * scenarios, case files, cards — written, imported, reviewed and published
 * the way stories are (api/src/games/content-admin.ts).
 *
 *   #/game-content              every row, filtered by game, kind, variety, level and status, and the importers
 *   #/game-content/readiness    what each game can be played with, per variety and level
 *   #/game-content/words        Who Am I? identities made by picking approved words
 *   #/game-content/new?kind=…   a new draft of a kind
 *   #/game-content/<id>         one row: its content, its review, its status
 *
 * Learners only ever meet a row that is published, and only an approved row
 * can be published. The importers copy approved Kurdish (published lessons'
 * sentences, published stories' paragraphs, published vocabulary sorted into
 * starter categories for Kurdish Impostor) into drafts, so nothing is typed
 * again; the word and forbidden-word cards are made by picking their words
 * from published vocabulary (GameCardFields.tsx). Each draft still goes
 * through review before a game may show it.
 */
export function GameContent(): React.JSX.Element {
  const route = useRoute();
  const sub = route.rest[0] ?? '';
  if (sub === 'readiness') return <GameContentHome tab="readiness" />;
  if (sub === 'words') return <GameContentHome tab="words" />;
  if (!sub) return <GameContentHome tab="rows" />;
  const kind = route.query.get('kind') ?? 'sentence';
  return <GameContentEditor key={sub} id={sub === 'new' ? null : sub} newKind={isKind(kind) ? kind : 'sentence'} />;
}

const STATUS_TONE: Record<AdminGameContent['status'], Tone> = { draft: 'warn', in_review: 'info', published: 'ok', archived: 'neutral' };
const REVIEW_TONE: Record<AdminGameContent['reviewStatus'], Tone> = { unreviewed: 'warn', approved: 'ok' };

/**
 * A row's review state as its badge says it. The starter library publishes
 * its rows with no reviewer named (api/src/games/starter-library.ts): such a
 * row is live, and nobody has read it yet, which is what its badge says —
 * not "Approved", a word that means a person looked.
 */
function reviewBadge(row: Pick<AdminGameContent, 'reviewStatus' | 'reviewedBy' | 'source'>): { tone: Tone; label: string } {
  if (row.source === 'starter' && row.reviewStatus === 'approved' && row.reviewedBy === null) return { tone: 'warn', label: 'Not read by a person yet' };
  return { tone: REVIEW_TONE[row.reviewStatus], label: REVIEW_LABEL[row.reviewStatus] };
}

function GameContentHome({ tab }: { tab: 'rows' | 'readiness' | 'words' }): React.JSX.Element {
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  const [newKind, setNewKind] = useState<GameContentKind>('sentence');

  const runImport = async (from: GameContentImport, dialect: GameDialect): Promise<void> => {
    setImporting(true);
    try {
      const res = await importGameContent(from, dialect);
      toast.success(`Imported ${res.created} new draft${res.created === 1 ? '' : 's'} from published ${from} (${GAME_DIALECT_NAME[dialect]}); ${res.skipped} were already here.`);
    } catch (err) {
      toast.error(errorLine(err, 'the import'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Game content"
        subtitle="What the learning games are made of beyond the lessons and stories. Learners only meet a row once a reviewer has approved it and it is published, in one variety."
        actions={
          <>
            <select aria-label="Kind of content to add" value={newKind} onChange={(e) => setNewKind(e.target.value as GameContentKind)}>
              {GAME_CONTENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_NAME[k]} — {GAME_NAME[gameOfKind(k)!.id]}
                </option>
              ))}
            </select>
            <Button variant="primary" icon="plus" onClick={() => go(`game-content/new?kind=${newKind}`)}>
              New
            </Button>
          </>
        }
      />
      <Tabs
        label="View"
        value={tab}
        onChange={(next) => go(next === 'readiness' ? 'game-content/readiness' : next === 'words' ? 'game-content/words' : 'game-content')}
        items={[
          { key: 'rows', label: 'Content' },
          { key: 'words', label: 'Cards from words' },
          { key: 'readiness', label: 'Readiness' },
        ]}
      />
      {tab === 'readiness' ? (
        <Readiness />
      ) : tab === 'words' ? (
        <WordPicker kind="identity" />
      ) : (
        <>
          <Section
            title="Import from approved content"
            description="Makes drafts from what is already published, without typing the Kurdish again: lessons’ sentences with their English and accepted orders, stories’ paragraphs with their glossary words to hide, conversations’ moments as scenes with real wrong replies from other conversations, and Kurdish Impostor’s word cards — published words sorted into starter categories by their meaning, whose category names wait for a native speaker. Each draft still needs review. Running an import twice adds nothing new."
          >
            <div className="row">
              {GAME_DIALECTS.map((d) => (
                <span key={d} className="row">
                  <Button icon="upload" busy={importing} onClick={() => void runImport('lessons', d)}>
                    Sentences from lessons ({GAME_DIALECT_NAME[d]})
                  </Button>
                  <Button icon="upload" busy={importing} onClick={() => void runImport('stories', d)}>
                    Passages from stories ({GAME_DIALECT_NAME[d]})
                  </Button>
                  <Button icon="upload" busy={importing} onClick={() => void runImport('conversations', d)}>
                    Scenes from conversations ({GAME_DIALECT_NAME[d]})
                  </Button>
                  <Button icon="upload" busy={importing} onClick={() => void runImport('vocabulary', d)}>
                    Starter word cards from vocabulary ({GAME_DIALECT_NAME[d]})
                  </Button>
                </span>
              ))}
            </div>
          </Section>
          <Rows />
        </>
      )}
    </div>
  );
}

function Rows(): React.JSX.Element {
  const [filter, setFilterState] = useState<GameContentFilter>(DEFAULT_GAME_FILTER);
  const [page, setPage] = useState(0);
  const query = useDebounced(filter.query, 300);
  const effective = useMemo(() => ({ ...filter, query }), [filter, query]);
  const list = useLoad(() => listGameContent(effective, page), [effective, page]);
  const setFilter = (next: Partial<GameContentFilter>): void => {
    setFilterState((f) => ({ ...f, ...next }));
    setPage(0);
  };
  const total = list.data?.total ?? 0;
  const kinds = filter.game === 'all' ? GAME_CONTENT_KINDS : (LEARN_GAMES.find((g) => g.id === filter.game)?.contentKinds ?? []);

  const columns: Column<AdminGameContent>[] = [
    {
      key: 'headline',
      header: 'Content',
      card: 'title',
      cell: (r) => {
        const script = dialectDirection(r.dialect);
        return (
          <a href={`#/game-content/${r.id}`} lang={script.lang} dir={script.dir}>
            {r.headline || 'Untitled'}
          </a>
        );
      },
    },
    { key: 'kind', header: 'Kind', cell: (r) => KIND_NAME[r.kind] },
    { key: 'game', header: 'Game', cell: (r) => (r.game ? (GAME_NAME[r.game as LearnGameId] ?? r.game) : '—') },
    { key: 'dialect', header: 'Variety', cell: (r) => GAME_DIALECT_NAME[r.dialect] },
    { key: 'level', header: 'Level', cell: (r) => r.level, sort: (a, b) => a.level - b.level },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span className="badges">
          <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
          <Badge tone={reviewBadge(r).tone}>{reviewBadge(r).label}</Badge>
          {r.source === 'starter' && <Badge tone="warn">Starter</Badge>}
          {r.issues.length > 0 && <Badge tone="bad">{r.issues.length} to fix</Badge>}
        </span>
      ),
    },
    { key: 'updated', header: 'Changed', cell: (r) => <Time value={r.updatedAt} /> },
  ];

  return (
    <Section flush title={list.data ? `${total.toLocaleString()} row${total === 1 ? '' : 's'}` : 'Rows'}>
      <div className="table-tools">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input type="search" aria-label="Search the content" placeholder="Search the content" value={filter.query} onChange={(e) => setFilter({ query: e.target.value })} />
        </div>
        <select aria-label="Game" value={filter.game} onChange={(e) => setFilter({ game: e.target.value as GameContentFilter['game'], kind: 'all' })}>
          <option value="all">Every game</option>
          {LEARN_GAMES.filter((g) => g.contentKinds.length > 0).map((g) => (
            <option key={g.id} value={g.id}>
              {GAME_NAME[g.id]}
            </option>
          ))}
        </select>
        <select aria-label="Kind" value={filter.kind} onChange={(e) => setFilter({ kind: e.target.value as GameContentFilter['kind'] })}>
          <option value="all">Every kind</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {KIND_NAME[k]}
            </option>
          ))}
        </select>
        <select aria-label="Variety" value={filter.dialect} onChange={(e) => setFilter({ dialect: e.target.value as GameContentFilter['dialect'] })}>
          <option value="all">Both varieties</option>
          {GAME_DIALECTS.map((d) => (
            <option key={d} value={d}>
              {GAME_DIALECT_NAME[d]}
            </option>
          ))}
        </select>
        <select aria-label="Level" value={String(filter.level)} onChange={(e) => setFilter({ level: e.target.value === 'all' ? 'all' : Number(e.target.value) })}>
          <option value="all">Every level</option>
          {GAME_LEVELS.map((l) => (
            <option key={l} value={l}>
              Level {l}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={filter.status} onChange={(e) => setFilter({ status: e.target.value as GameContentFilter['status'] })}>
          <option value="all">Any status</option>
          {(Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select aria-label="Review" value={filter.review} onChange={(e) => setFilter({ review: e.target.value as GameContentFilter['review'] })}>
          <option value="all">Reviewed or not</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="approved">Approved</option>
        </select>
      </div>
      <Table
        caption="Game content"
        columns={columns}
        rows={list.data?.rows ?? null}
        rowKey={(r) => r.id}
        loading={list.loading}
        error={list.error}
        onRetry={() => void list.reload()}
        empty="No content matches. Import drafts from published lessons and stories, or add a row with “New”."
        paging={{ page, pageCount: Math.max(1, Math.ceil(total / GAME_PAGE_SIZE)), onPage: setPage, total, pageSize: GAME_PAGE_SIZE }}
        what="game content"
      />
    </Section>
  );
}

/** Each game, per variety: the approved content at each level against its minimum, and the difficulties it can be played at. */
function Readiness(): React.JSX.Element {
  const ready = useLoad(gameContentReadiness, []);
  if (ready.error) return <Banner tone="bad">{errorLine(ready.error, 'the readiness view')}</Banner>;
  if (!ready.data) return <p className="subtle">Counting…</p>;
  const counts = ready.data.counts;
  return (
    <>
      {ready.data.availability.map((a) => (
        <Section key={a.dialect} title={GAME_DIALECT_NAME[a.dialect]} description="Approved content a game can show, by level. A game is offered to learners at a difficulty once its levels hold its minimum.">
          <table className="gc-ready">
            <thead>
              <tr>
                <th scope="col">Game</th>
                {GAME_LEVELS.map((l) => (
                  <th key={l} scope="col">
                    Level {l}
                  </th>
                ))}
                <th scope="col">Needs</th>
                <th scope="col">Offered at</th>
                <th scope="col">Waiting for review</th>
              </tr>
            </thead>
            <tbody>
              {a.games.map((g) => {
                const kinds = LEARN_GAMES.find((x) => x.id === g.id)?.contentKinds ?? [];
                const waiting = counts.filter((c) => c.dialect === a.dialect && kinds.includes(c.kind) && c.status !== 'published' && c.status !== 'archived').reduce((s, c) => s + c.n, 0);
                return (
                  <tr key={g.id}>
                    <th scope="row">{GAME_NAME[g.id as LearnGameId] ?? g.id}</th>
                    {GAME_LEVELS.map((l) => (
                      <td key={l}>{g.levelled ? g.levels[l] : l === 1 ? g.levels[1] : ''}</td>
                    ))}
                    <td>{g.minimum}</td>
                    <td>{g.available ? <Badge tone="ok">{g.difficulties.join(', ')}</Badge> : <Badge tone="bad">Not yet</Badge>}</td>
                    <td>{waiting}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      ))}
    </>
  );
}

// ---------- one row ----------

/** The meanings of a field, English first: the one every other language falls back to. */
function MeaningsFields({ value, onChange, label, readOnly }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; label: string; readOnly: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(Object.keys(value).some((k) => k !== 'en' && value[k]));
  const set = (locale: string, text: string): void => {
    const next = { ...value };
    if (text === '' && locale !== 'en') delete next[locale];
    else next[locale] = text;
    onChange(next);
  };
  return (
    <div className="gc-meanings">
      <Field label={`${label} (English)`} required>
        <input value={value.en ?? ''} onChange={(e) => set('en', e.target.value)} readOnly={readOnly} />
      </Field>
      <button type="button" className="link" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide the other languages' : 'Other languages'}
      </button>
      {open &&
        APP_LOCALE_CODES.filter((c) => c !== 'en').map((c) => (
          <Field key={c} label={`${label} (${c})`}>
            <input value={value[c] ?? ''} onChange={(e) => set(c, e.target.value)} readOnly={readOnly} dir="auto" lang={c} />
          </Field>
        ))}
    </div>
  );
}

/** A sentence for the tiles: its Kurdish, its meaning, its other orders, what its words mean. */
function SentenceFields({ payload, onChange, dialect, readOnly }: { payload: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void; dialect: GameDialect; readOnly: boolean }): React.JSX.Element {
  const script = dialectDirection(dialect);
  const orders = (payload.orders as string[] | undefined) ?? [];
  const glosses = (payload.glosses as Array<{ word: string; meanings: Record<string, string> }> | undefined) ?? [];
  return (
    <>
      <Field label="The sentence" hint="3 to 10 words, as learners will build it." required>
        <input value={String(payload.ku ?? '')} onChange={(e) => onChange({ ...payload, ku: e.target.value })} lang={script.lang} dir={script.dir} readOnly={readOnly} />
      </Field>
      <MeaningsFields label="What it means" value={(payload.meanings as Record<string, string>) ?? { en: '' }} onChange={(m) => onChange({ ...payload, meanings: m })} readOnly={readOnly} />
      <Field label="Other orders it is right in" hint="The same words in another order a native speaker accepts. Leave empty when there is only one.">
        <div className="gc-list">
          {orders.map((o, i) => (
            <span key={i} className="row">
              <input
                aria-label={`Order ${i + 2}`}
                value={o}
                lang={script.lang}
                dir={script.dir}
                readOnly={readOnly}
                onChange={(e) => onChange({ ...payload, orders: orders.map((x, j) => (j === i ? e.target.value : x)) })}
              />
              {!readOnly && (
                <Button variant="ghost" icon="trash" aria-label={`Remove order ${i + 2}`} onClick={() => onChange({ ...payload, orders: orders.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              )}
            </span>
          ))}
          {!readOnly && (
            <Button icon="plus" onClick={() => onChange({ ...payload, orders: [...orders, ''] })}>
              Add an order
            </Button>
          )}
        </div>
      </Field>
      <Field label="What its words mean" hint="Shown under each word after a round. Words without one show a dash.">
        <div className="gc-list">
          {glosses.map((g, i) => (
            <span key={i} className="row">
              <input
                aria-label={`Word ${i + 1}`}
                value={g.word}
                lang={script.lang}
                dir={script.dir}
                readOnly={readOnly}
                onChange={(e) => onChange({ ...payload, glosses: glosses.map((x, j) => (j === i ? { ...x, word: e.target.value } : x)) })}
              />
              <input
                aria-label={`Meaning of word ${i + 1}`}
                value={g.meanings.en ?? ''}
                readOnly={readOnly}
                onChange={(e) => onChange({ ...payload, glosses: glosses.map((x, j) => (j === i ? { ...x, meanings: { ...x.meanings, en: e.target.value } } : x)) })}
              />
              {!readOnly && (
                <Button variant="ghost" icon="trash" aria-label={`Remove word ${i + 1}`} onClick={() => onChange({ ...payload, glosses: glosses.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              )}
            </span>
          ))}
          {!readOnly && (
            <Button icon="plus" onClick={() => onChange({ ...payload, glosses: [...glosses, { word: '', meanings: { en: '' } }] })}>
              Add a word’s meaning
            </Button>
          )}
        </div>
      </Field>
    </>
  );
}

/** A passage for The Memory Thief: its text and the words that vanish from it. */
function PassageFields({ payload, onChange, dialect, readOnly }: { payload: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void; dialect: GameDialect; readOnly: boolean }): React.JSX.Element {
  const script = dialectDirection(dialect);
  const hidden = (payload.hidden as Array<{ term: string; meanings: Record<string, string> }> | undefined) ?? [];
  return (
    <>
      <Field label="Title">
        <input value={String(payload.title ?? '')} onChange={(e) => onChange({ ...payload, title: e.target.value || undefined })} lang={script.lang} dir={script.dir} readOnly={readOnly} />
      </Field>
      <Field label="The passage" required>
        <textarea rows={6} value={String(payload.text ?? '')} onChange={(e) => onChange({ ...payload, text: e.target.value })} lang={script.lang} dir={script.dir} readOnly={readOnly} />
      </Field>
      <Field label="Words that vanish" hint="Two to six, each written as it is in the passage, with what it means.">
        <div className="gc-list">
          {hidden.map((h, i) => (
            <span key={i} className="row">
              <input
                aria-label={`Vanishing word ${i + 1}`}
                value={h.term}
                lang={script.lang}
                dir={script.dir}
                readOnly={readOnly}
                onChange={(e) => onChange({ ...payload, hidden: hidden.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)) })}
              />
              <input
                aria-label={`Meaning of vanishing word ${i + 1}`}
                value={h.meanings.en ?? ''}
                readOnly={readOnly}
                onChange={(e) => onChange({ ...payload, hidden: hidden.map((x, j) => (j === i ? { ...x, meanings: { ...x.meanings, en: e.target.value } } : x)) })}
              />
              {!readOnly && (
                <Button variant="ghost" icon="trash" aria-label={`Remove vanishing word ${i + 1}`} onClick={() => onChange({ ...payload, hidden: hidden.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              )}
            </span>
          ))}
          {!readOnly && hidden.length < 6 && (
            <Button icon="plus" onClick={() => onChange({ ...payload, hidden: [...hidden, { term: '', meanings: { en: '' } }] })}>
              Add a word
            </Button>
          )}
        </div>
      </Field>
    </>
  );
}

/**
 * Any other kind, as its fields in JSON: the kind's blank to start from,
 * checked against its schema as it is typed, every issue with the field it is
 * about. The Kurdish inside it still has to be in the row's script.
 */
function JsonFields({ payload, onChange, readOnly }: { payload: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void; readOnly: boolean }): React.JSX.Element {
  const [text, setText] = useState(() => JSON.stringify(payload, null, 2));
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <Field label="Content" hint="Each field of this kind, as JSON. The checks below run as you type." error={broken ?? undefined}>
      <textarea
        className="gc-json"
        rows={18}
        spellCheck={false}
        dir="auto"
        value={text}
        readOnly={readOnly}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value) as unknown;
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('an object');
            setBroken(null);
            onChange(parsed as Record<string, unknown>);
          } catch {
            setBroken('This is not valid JSON yet.');
          }
        }}
      />
    </Field>
  );
}

/**
 * Whether a reviewer has read the row: approval is what publishing waits
 * for, and a change to the content after it takes it away again — the
 * stories' review section (StoryReviewSections.tsx), for game content.
 */
function ReviewPanel({ row, busy, pending, onReview }: { row: AdminGameContent | null; busy: boolean; pending: boolean; onReview: (approved: boolean, note: string | null) => void }): React.JSX.Element {
  const [note, setNote] = useState(row?.reviewNote ?? '');
  const approved = row?.reviewStatus === 'approved';
  return (
    <Section title="Review">
      <Banner tone="info">
        Publishing needs a reviewer’s approval, and the approval is of the content as it is: a change to the Kurdish, the meanings or the level after it needs
        approving again. Read every Kurdish word as a learner will meet it.
      </Banner>
      {!row ? (
        <p className="subtle">Save the draft first.</p>
      ) : (
        <>
          <div className="st-review-state">
            <Badge tone={reviewBadge(row).tone}>{reviewBadge(row).label}</Badge>
            {row.reviewedAt && row.reviewedBy === null && approved && row.source === 'starter' ? (
              <span className="subtle">
                Published with the starter library <Time value={row.reviewedAt} />. Approve it once you have read it, or withdraw it.
              </span>
            ) : null}
            {row.reviewedAt && !(row.reviewedBy === null && approved && row.source === 'starter') && (
              <span className="subtle">
                {approved ? 'Approved' : 'Approval withdrawn'}{' '}
                {row.reviewedBy && (
                  <>
                    by <UserLink user={{ id: row.reviewedBy.id, username: row.reviewedBy.username }} />{' '}
                  </>
                )}
                <Time value={row.reviewedAt} />
              </span>
            )}
          </div>
          {row.reviewNote && <blockquote className="st-review-note">{row.reviewNote}</blockquote>}
          {approved && pending && <p className="field-error">The unsaved changes alter what was approved: once saved, it needs approving again before it is published.</p>}
          {row.status === 'archived' ? (
            <p className="subtle">Archived content is not reviewed.</p>
          ) : (
            <>
              <Field label="Note for the record" hint="What was checked, or what still needs a native speaker.">
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} />
              </Field>
              <div className="row st-review-actions">
                {/* a starter row nobody has read can be approved as it stands: that puts a reader's name on it, and it stays live */}
                {approved && row.reviewedBy !== null ? (
                  row.status === 'published' ? (
                    <span className="subtle">Unpublish it first to withdraw its approval.</span>
                  ) : (
                    <Button onClick={() => onReview(false, note || null)} disabled={busy}>
                      Withdraw approval
                    </Button>
                  )
                ) : (
                  <Button variant="primary" icon="check" onClick={() => onReview(true, note || null)} disabled={busy || pending || row.issues.length > 0}>
                    Approve
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Section>
  );
}

function GameContentEditor({ id, newKind }: { id: string | null; newKind: GameContentKind }): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const loaded = useLoad(() => (id ? getGameContent(id) : Promise.resolve(null)), [id]);
  const [row, setRow] = useState<AdminGameContent | null>(null);
  const [kind, setKind] = useState<GameContentKind>(newKind);
  const [dialect, setDialect] = useState<GameDialect>('kmr');
  const [level, setLevel] = useState(1);
  const [payload, setPayload] = useState<Record<string, unknown>>(() => blankPayload(newKind));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // what was loaded becomes what is edited, and again after every save
  const take = (r: AdminGameContent): void => {
    setRow(r);
    setKind(r.kind);
    setDialect(r.dialect);
    setLevel(r.level);
    setPayload(r.payload as unknown as Record<string, unknown>);
  };
  useEffect(() => {
    if (loaded.data) take(loaded.data);
  }, [loaded.data]);

  const checked = useMemo(() => checkGameContent(kind, dialect, payload), [kind, dialect, payload]);
  const pending = !!row && (level !== row.level || JSON.stringify(payload) !== JSON.stringify(row.payload));
  const editable = !row || row.status === 'draft' || row.status === 'in_review';
  const game = gameOfKind(kind);

  const run = async (what: string, fn: () => Promise<AdminGameContent | void>, done?: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const out = await fn();
      if (out) take(out);
      if (done) toast.success(done);
    } catch (err) {
      setError(errorLine(err, what));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      'the save',
      async () => {
        if (!row) {
          const created = await createGameContent({ kind, dialect, level, payload });
          location.replace(`#/game-content/${created.id}`);
          return created;
        }
        return saveGameContent(row.id, { level, payload, lockVersion: row.lockVersion });
      },
      'Saved.',
    );

  const act = (action: GameContentAction, done: string) => (row ? run(`the ${action}`, () => actOnGameContent(row.id, action, row.lockVersion), done) : undefined);

  const remove = async (): Promise<void> => {
    if (!row) return;
    const yes = await dialogs.confirm({ title: 'Delete this content?', body: 'It is kept in the audit log, and can be restored by hand from there.', confirmLabel: 'Delete', tone: 'danger' });
    if (!yes) return;
    await run('the delete', async () => {
      await deleteGameContent(row.id, row.lockVersion);
      go('game-content');
    });
  };

  if (id && loaded.error) return <Banner tone="bad">{errorLine(loaded.error, 'this content')}</Banner>;
  if (id && !row) return <p className="subtle">Loading…</p>;

  return (
    <div>
      <PageHeader
        title={row ? row.headline || KIND_NAME[row.kind] : `New ${KIND_NAME[kind].toLowerCase()}`}
        subtitle={game ? `${KIND_NAME[kind]} for ${GAME_NAME[game.id]}` : KIND_NAME[kind]}
        back={{ href: '#/game-content', label: 'Game content' }}
        meta={
          row ? (
            <span className="badges">
              <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
              <Badge tone={reviewBadge(row).tone}>{reviewBadge(row).label}</Badge>
              <Badge>{GAME_DIALECT_NAME[row.dialect]}</Badge>
            </span>
          ) : null
        }
      />
      {row?.origin && <Note>Imported from {row.origin.split(':')[0]} {row.origin.split(':').slice(1).join(':')} — the Kurdish was copied from approved content, not typed.</Note>}
      {row?.source === 'starter' && <Banner tone="warn">A starter draft written for the app: it waits for a native speaker before anything else.</Banner>}
      {!editable && <Banner tone="info">{row?.status === 'published' ? 'Published: unpublish it to edit it.' : 'Archived: it cannot be edited.'}</Banner>}

      <Section title="Where it goes">
        <div className="row">
          <Field label="Kind">
            <select value={kind} disabled={!!row} onChange={(e) => {
              const k = e.target.value as GameContentKind;
              setKind(k);
              setPayload(blankPayload(k));
            }}>
              {GAME_CONTENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_NAME[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Variety" hint="Every row is in one variety; its Kurdish must be in that variety’s script.">
            <select value={dialect} disabled={!!row} onChange={(e) => setDialect(e.target.value as GameDialect)}>
              {GAME_DIALECTS.map((d) => (
                <option key={d} value={d}>
                  {GAME_DIALECT_NAME[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Level" hint="1 is the first. Beginner plays levels 1–2, intermediate 3, advanced 4–5.">
            <select value={level} disabled={!editable} onChange={(e) => setLevel(Number(e.target.value))}>
              {GAME_LEVELS.map((l) => (
                <option key={l} value={l}>
                  Level {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Content">
        {!row && kind === 'identity' ? (
          // a card of a picked word: its Kurdish is copied from approved content, never typed in a blank
          <WordPicker kind={kind} dialect={dialect} />
        ) : kind === 'identity' ? (
          <IdentityFields payload={payload} onChange={setPayload} dialect={dialect} readOnly={!editable} />
        ) : kind === 'question_template' ? (
          <QuestionTemplateFields payload={payload} onChange={setPayload} dialect={dialect} readOnly={!editable} />
        ) : kind === 'sentence' ? (
          <SentenceFields payload={payload} onChange={setPayload} dialect={dialect} readOnly={!editable} />
        ) : kind === 'passage' ? (
          <PassageFields payload={payload} onChange={setPayload} dialect={dialect} readOnly={!editable} />
        ) : kind === 'scenario' ? (
          <ScenarioFields payload={payload} onChange={setPayload} dialect={dialect} readOnly={!editable} />
        ) : kind === 'case_file' ? (
          <CaseFileFields payload={payload} onChange={setPayload} dialect={dialect} readOnly={!editable} />
        ) : kind === 'word_card' ? (
          <WordCardFields payload={payload} onChange={setPayload} dialect={dialect} readOnly={!editable} Meanings={MeaningsFields} />
        ) : (
          <JsonFields key={`${kind}:${row?.lockVersion ?? 'new'}`} payload={payload} onChange={setPayload} readOnly={!editable} />
        )}
        {!row && kind === 'identity' ? null : !checked.ok ? (
          <Banner tone="warn" title={`${checked.issues.length} to fix before it can be saved`}>
            <ul className="gc-issues">
              {checked.issues.map((i, n) => (
                <li key={n}>
                  <code>{i.path || '(the content)'}</code> {i.message}
                </li>
              ))}
            </ul>
          </Banner>
        ) : (
          <Note tone="ok">Ready to save.</Note>
        )}
        {error && <p className="field-error">{error}</p>}
        <FormActions>
          {row && row.status !== 'published' && (
            <Button variant="danger" icon="trash" onClick={() => void remove()} disabled={busy}>
              Delete
            </Button>
          )}
          {row?.status === 'draft' && (
            <Button onClick={() => void act('submit', 'Submitted for review.')} disabled={busy || pending}>
              Submit for review
            </Button>
          )}
          {row && (row.status === 'draft' || row.status === 'in_review') && (
            <Button onClick={() => void act('publish', 'Published: learners can meet it now.')} disabled={busy || pending || row.reviewStatus !== 'approved'}>
              Publish
            </Button>
          )}
          {row?.status === 'published' && (
            <Button onClick={() => void act('unpublish', 'Unpublished.')} disabled={busy}>
              Unpublish
            </Button>
          )}
          {row && row.status !== 'archived' && (
            <Button onClick={() => void act('archive', 'Archived.')} disabled={busy}>
              Archive
            </Button>
          )}
          {editable && !(!row && kind === 'identity') && (
            <Button variant="primary" onClick={() => void save()} disabled={busy || !checked.ok || (!!row && !pending)}>
              {row ? 'Save' : 'Save draft'}
            </Button>
          )}
        </FormActions>
      </Section>

      <ReviewPanel
        key={row?.lockVersion ?? 'new'}
        row={row}
        busy={busy}
        pending={pending}
        onReview={(approved, note) =>
          void (row && run('the review', () => reviewGameContent(row.id, approved, note, row.lockVersion), approved ? 'Approved.' : 'Approval withdrawn.'))
        }
      />
    </div>
  );
}
