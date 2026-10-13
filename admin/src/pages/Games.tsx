import { useState } from 'react';
import { api } from '../api';
import {
  Badge,
  Button,
  ErrorState,
  FormActions,
  Icon,
  Loading,
  PageHeader,
  Section,
  Select,
  Stat,
  Table,
  Tabs,
  Textarea,
  errorLine,
  useDebounced,
  useDialogs,
  useLoad,
  useToast,
  type Column,
} from '../ui';
import { DictionaryImport } from './DictionaryImport';
import { RaceTexts } from './RaceTexts';
import { RhymeEditor } from './RhymeEditor';

interface Word {
  id: string;
  headword: string;
  normalized: string;
  dialect: string;
  length: number;
  /** used as a rhyme-round prompt */
  isRhymePrompt: boolean;
  /** in the pool a game chooses from, rather than only in the dictionary */
  inGames: boolean;
}
interface Stats {
  /** words a game can choose from */
  total: number;
  /** every headword, imports included — what a guess is checked against */
  dictionary: number;
  /** how many words are curated as rhyme prompts */
  rhymePrompts: number;
  byLength: { length: number; words: number }[];
  difficulties: { difficulty: string; lengths: number[]; words: number }[];
}

const PAGE = 50;

export type GamesSection = 'words' | 'wordle' | 'rhyme' | 'race';

const TITLES: Record<GamesSection, { title: string; subtitle: string }> = {
  words: {
    title: 'Words & dictionary',
    subtitle: 'The word pool Wordle and Rhyme choose from, and the dictionary behind it that every guess is checked against.',
  },
  wordle: { title: 'Wordle', subtitle: 'How many words each difficulty can choose from. A difficulty with none falls back to an easier one.' },
  rhyme: { title: 'Rhyme', subtitle: 'The words a rhyme round can open with, and what rhymes with each — how strongly, and where that came from.' },
  race: { title: 'Race texts', subtitle: 'The texts a typing race draws from. An edit changes the next race.' },
};

/**
 * Game content, a page per game (#/words, #/wordle, #/rhyme, #/race) where it
 * used to be one page with tabs that had no addresses of their own.
 *
 * Two sets of words, not one. The **pool** is what a game chooses from —
 * Wordle's targets, Rhyme's prompts — and it is small and hand-picked, because
 * a bad target is an unplayable round. The **dictionary** behind it is what a
 * guess is checked against, and should be as large as it can be, because a
 * missing word is a right answer refused. Promoting a word from the dictionary
 * into the pool is the one edit the dictionary view offers.
 */
export function Games({ section }: { section: GamesSection }): React.JSX.Element {
  const t = TITLES[section];
  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      {section === 'words' && <WordsPage />}
      {section === 'wordle' && <Coverage />}
      {section === 'rhyme' && <RhymeEditor />}
      {section === 'race' && <RaceTexts />}
    </div>
  );
}

function WordsPage(): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const [inPool, setInPool] = useState(true);
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [length, setLength] = useState('');
  const [promptsOnly, setPromptsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  // a newer search wins: an answer to "hev" arriving after "heval" is dropped
  const words = useLoad(() => {
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE), inGames: String(inPool) });
    if (query) params.set('q', query);
    if (length) params.set('length', length);
    if (promptsOnly) params.set('prompts', 'true');
    return api<{ total: number; words: Word[] }>(`/admin/dictionary?${params}`);
  }, [query, length, page, promptsOnly, inPool]);
  const stats = useLoad(() => api<Stats>('/admin/dictionary/stats'), []);

  const refresh = async (): Promise<void> => {
    await Promise.all([words.reload(), stats.reload()]);
  };

  async function patch(w: Word, body: Partial<Pick<Word, 'inGames' | 'isRhymePrompt'>>, said: string): Promise<void> {
    setBusy(w.id);
    try {
      await api(`/admin/dictionary/${w.id}`, { method: 'PATCH', body });
      toast.success(said);
      await refresh();
    } catch (err) {
      toast.error(errorLine(err, 'game words'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(w: Word): Promise<void> {
    const yes = await dialogs.confirm({
      title: `Delete “${w.headword}”?`,
      body: 'It stops appearing in Wordle and Rhyme, guesses of it are no longer accepted, and its rhyme decisions are dropped. To keep it as a guess but stop asking it, take it out of the games instead.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!yes) return;
    setBusy(w.id);
    try {
      await api(`/admin/dictionary/${w.id}`, { method: 'DELETE' });
      toast.success(`Deleted “${w.headword}”.`);
      await refresh();
    } catch (err) {
      toast.error(errorLine(err, 'game words'));
    } finally {
      setBusy(null);
    }
  }

  const reset = (): void => setPage(0);
  const total = words.data?.total ?? 0;
  const columns: Column<Word>[] = [
    {
      key: 'word',
      header: 'Word',
      card: 'title',
      cell: (w) => (
        <>
          <strong dir="auto">{w.headword}</strong>
          <span className="cell-sub">
            {w.length} letters · {w.dialect === 'sorani' ? 'Soranî' : 'Kurmancî'}
          </span>
        </>
      ),
    },
    {
      key: 'games',
      header: 'In the games',
      cell: (w) => (
        <label className="inline-check">
          <input
            type="checkbox"
            checked={w.inGames}
            disabled={busy === w.id}
            onChange={(e) =>
              void patch(w, { inGames: e.target.checked }, e.target.checked ? `“${w.headword}” is in the games now.` : `“${w.headword}” is out of the games; guesses of it still count.`)
            }
          />
          <span>{w.inGames ? 'Yes' : 'No'}</span>
        </label>
      ),
    },
    {
      key: 'prompt',
      header: 'Opens rhyme rounds',
      cell: (w) => (
        <label className="inline-check" title={w.inGames ? undefined : 'Only a word in the games can open a round'}>
          <input
            type="checkbox"
            checked={w.isRhymePrompt}
            // a word outside the pool cannot be a prompt, so the control says
            // so rather than accepting a click the server would undo
            disabled={busy === w.id || !w.inGames}
            onChange={(e) => void patch(w, { isRhymePrompt: e.target.checked }, e.target.checked ? `Rounds can open with “${w.headword}”.` : `Rounds no longer open with “${w.headword}”.`)}
          />
          <span>{w.isRhymePrompt ? 'Yes' : 'No'}</span>
        </label>
      ),
    },
  ];

  return (
    <>
      <div className="stats">
        <Stat icon="grid" label="In the games" value={stats.data ? stats.data.total.toLocaleString() : '…'} hint="What Wordle and Rhyme choose from" />
        <Stat icon="book" label="In the dictionary" value={stats.data ? stats.data.dictionary.toLocaleString() : '…'} hint="What a guess is checked against" />
        <Stat icon="rhyme" label="Rhyme base words" value={stats.data ? stats.data.rhymePrompts.toLocaleString() : '…'} href="#/rhyme" />
      </div>

      <AddWords onAdded={refresh} />

      <Section
        flush
        title={inPool ? `Words in the games (${total.toLocaleString()})` : `Dictionary only (${total.toLocaleString()})`}
        actions={
          <>
            <Tabs
              label="Which words"
              value={inPool ? 'pool' : 'dictionary'}
              onChange={(v) => {
                setInPool(v === 'pool');
                reset();
              }}
              items={[
                { key: 'pool', label: 'In the games' },
                { key: 'dictionary', label: 'Dictionary only' },
              ]}
            />
          </>
        }
      >
        <div className="table-tools">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              type="search"
              aria-label="Search words"
              placeholder="Search words"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                reset();
              }}
            />
          </div>
          <select
            aria-label="Length"
            value={length}
            onChange={(e) => {
              setLength(e.target.value);
              reset();
            }}
          >
            <option value="">Any length</option>
            {[3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>
                {n} letters
              </option>
            ))}
          </select>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={promptsOnly}
              onChange={(e) => {
                setPromptsOnly(e.target.checked);
                reset();
              }}
            />
            <span>Only rhyme base words</span>
          </label>
        </div>
        <Table
          caption="Words"
          columns={columns}
          rows={words.data?.words ?? null}
          rowKey={(w) => w.id}
          loading={words.loading}
          error={words.error}
          onRetry={() => void words.reload()}
          what="game words"
          empty={query ? 'No word matches that search.' : 'No words here yet.'}
          paging={{ page, pageCount: Math.max(1, Math.ceil(total / PAGE)), onPage: setPage, total, pageSize: PAGE }}
          actions={(w) => (
            <Button variant="danger" onClick={() => void remove(w)} disabled={busy === w.id} aria-label={`Delete “${w.headword}”`}>
              Delete
            </Button>
          )}
        />
      </Section>

      <DictionaryImport />
    </>
  );
}

/** Wordle picks its target by letter length, so a thin difficulty is worth seeing. */
function Coverage(): React.JSX.Element {
  const stats = useLoad(() => api<Stats>('/admin/dictionary/stats'), []);
  if (stats.error != null) return <ErrorState error={stats.error} onRetry={() => void stats.reload()} what="game words" />;
  if (!stats.data) return <Loading rows={4} />;
  const s = stats.data;
  const columns: Column<Stats['difficulties'][number]>[] = [
    { key: 'difficulty', header: 'Difficulty', card: 'title', cell: (d) => <strong>{d.difficulty.charAt(0).toUpperCase() + d.difficulty.slice(1)}</strong> },
    { key: 'lengths', header: 'Word length', cell: (d) => `${d.lengths.join(', ')} letters` },
    {
      key: 'words',
      header: 'Words to choose from',
      cell: (d) => <Badge tone={d.words === 0 ? 'bad' : d.words < 10 ? 'warn' : 'ok'}>{d.words === 0 ? 'None — falls back' : d.words.toLocaleString()}</Badge>,
    },
  ];
  return (
    <>
      {/*
        Both numbers, because they answer different questions and only one of
        them is about whether the game is playable. Counting the dictionary here
        is how you end up believing there are hundreds of thousands of words to
        play with when the pool is a few dozen.
      */}
      <div className="stats">
        <Stat label="Words Wordle can ask" value={s.total.toLocaleString()} href="#/words" />
        <Stat label="Words a guess is checked against" value={s.dictionary.toLocaleString()} />
      </div>
      <Section flush title="By difficulty" description="If every difficulty is empty, the game says no words are available.">
        <Table caption="Wordle coverage by difficulty" columns={columns} rows={s.difficulties} rowKey={(d) => d.difficulty} />
      </Section>
    </>
  );
}

/** Bulk word entry — one per line or comma separated. */
function AddWords({ onAdded }: { onAdded: () => Promise<void> }): React.JSX.Element {
  const toast = useToast();
  const [text, setText] = useState('');
  const [dialect, setDialect] = useState('kurmanji');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: string[]; skipped: string[]; invalid: string[] } | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const words = text
      .split(/[\n,;]+/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (words.length === 0) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await api<{ added: string[]; skipped: string[]; invalid: string[] }>('/admin/dictionary', { method: 'POST', body: { words, dialect } });
      setResult(res);
      setText('');
      toast.success(`Added ${res.added.length} ${res.added.length === 1 ? 'word' : 'words'}.`);
      await onAdded();
    } catch (err) {
      toast.error(errorLine(err, 'game words'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Add words to the games"
      description="One per line, or separated by commas. A word added here can be a Wordle answer and guess, open a rhyme round, and count as a rhyme. Words already in the games are skipped, so pasting a list twice is safe."
    >
      <form className="form" onSubmit={(e) => void submit(e)}>
        <Textarea label="Words" rows={4} dir="auto" placeholder={'heval\nwelat\nziman'} value={text} onChange={(e) => setText(e.target.value)} />
        <FormActions>
          <Select
            label="Variety"
            fieldClassName="is-inline"
            value={dialect}
            onChange={(e) => setDialect(e.target.value)}
            options={[
              { value: 'kurmanji', label: 'Kurmancî' },
              { value: 'sorani', label: 'Soranî' },
            ]}
          />
          <Button variant="primary" type="submit" busy={busy} disabled={text.trim() === ''} icon="plus">
            {busy ? 'Adding…' : 'Add words'}
          </Button>
        </FormActions>
        {result && (
          <p className="note" role="status">
            Added {result.added.length}.{result.skipped.length > 0 && ` Already there: ${result.skipped.length}.`}
            {result.invalid.length > 0 && ` Not words, so left out: ${result.invalid.join(', ')}.`}
          </p>
        )}
      </form>
    </Section>
  );
}
