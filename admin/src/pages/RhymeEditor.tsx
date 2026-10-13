import { useState } from 'react';
import { api } from '../api';
import {
  ActionMenu,
  Badge,
  Banner,
  Button,
  Drawer,
  ErrorState,
  Icon,
  Loading,
  Section,
  Table,
  Tabs,
  errorLine,
  useDebounced,
  useDialogs,
  useLoad,
  useToast,
  type Column,
} from '../ui';

type Verdict = 'perfect' | 'near' | 'none' | 'auto';
type Quality = 'perfect' | 'near' | 'none';

/** A word a round can open with, and how much it has to rhyme against. */
interface PromptWord {
  id: string;
  headword: string;
  dialect: string;
  isRhymePrompt: boolean;
  perfect: number;
  near: number;
  /** words you ruled out that the endings would have accepted */
  ruledOut: number;
  /** how many pairs you have decided by hand */
  decided: number;
}

interface PromptList {
  total: number;
  poolSize: number;
  /** nothing is curated, so rounds are drawing from the whole pool */
  usingFallback: boolean;
  words: PromptWord[];
}

/** What `POST /admin/rhyme/prompts/rebuild` reports, dry run or not. */
interface RebuildResult {
  dryRun: boolean;
  poolSize: number;
  baseWords: number;
  newlyMarked: number;
  alreadyMarked: number;
  withoutRhymes: string[];
}

interface RhymeRow {
  word: string;
  quality: Quality;
  /** what the word endings say, before any decision */
  derived: Quality;
  source: 'derived' | 'decided';
}

interface RhymeView {
  word: string;
  dialect: string;
  inDictionary: boolean;
  rhymes: RhymeRow[];
  ruledOut: RhymeRow[];
  /** what the game accepts, whether or not it fitted in `rhymes` */
  total: { perfect: number; near: number };
  /** true when `rhymes` was cut short — the counts above are the real ones */
  truncated: boolean;
}

const PAGE = 25;

const STRENGTH: Record<Quality, string> = {
  perfect: 'Perfect',
  near: 'Near',
  none: 'Not a rhyme',
};

/**
 * The rhyme game's content, end to end.
 *
 * The base words — every word a round can open with — and, for the one you
 * open, everything that rhymes with it and how strongly, where each verdict
 * came from, and the words you ruled out.
 *
 * The game derives rhymes from word endings; a decision here overrides that in
 * either direction. "Auto" is not the same as "not a rhyme" — it means no
 * opinion, use whatever the endings say.
 */
export function RhymeEditor(): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const [dialect, setDialect] = useState<'kurmanci' | 'sorani'>('kurmanci');
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState('');

  const list = useLoad(() => {
    const params = new URLSearchParams({ dialect, limit: String(PAGE), offset: String(page * PAGE) });
    if (query) params.set('q', query);
    return api<PromptList>(`/admin/rhyme/prompts?${params}`);
  }, [dialect, page, query]);

  async function run(key: string, task: () => Promise<string | null>): Promise<void> {
    setBusy(key);
    try {
      const said = await task();
      if (said) toast.success(said);
      await list.reload();
    } catch (err) {
      toast.error(errorLine(err, 'rhyme words'));
    } finally {
      setBusy(null);
    }
  }

  const addBaseWord = (e: React.FormEvent): void => {
    e.preventDefault();
    const word = adding.trim();
    if (!word) return;
    void run('add', async () => {
      await api('/admin/dictionary', { method: 'POST', body: { words: [word], isRhymePrompt: true, dialect: dialect === 'sorani' ? 'sorani' : 'kurmanji' } });
      setAdding('');
      return `“${word}” opens rounds now.`;
    });
  };

  /**
   * Put every playable word back in the game.
   *
   * The one action that undoes the cliff below: it marks every pool word that
   * has something to rhyme against, so the base words become the whole playable
   * pool again and marking one more word afterwards adds to it rather than
   * replacing it. The dry run produces the numbers the question shows, so they
   * are the real outcome rather than an estimate.
   */
  const useEveryPlayableWord = (): void =>
    void run('rebuild', async () => {
      const preview = await api<RebuildResult>('/admin/rhyme/prompts/rebuild', { method: 'POST', body: { dialect, dryRun: true } });
      const left = preview.withoutRhymes.length;
      const yes = await dialogs.confirm({
        title: 'Open rounds with every word that has a rhyme?',
        body: `Base words: ${preview.alreadyMarked} → ${preview.baseWords} of the ${preview.poolSize} in the games.${
          left > 0
            ? `\n\n${left} ${left === 1 ? 'word is' : 'words are'} left out because nothing rhymes with ${left === 1 ? 'it' : 'them'}: ${preview.withoutRhymes.slice(0, 8).join(', ')}${left > 8 ? '…' : ''}`
            : ''
        }\n\nNothing is deleted, and any of them can be taken out again.`,
        confirmLabel: 'Use them all',
      });
      if (!yes) return null;
      const done = await api<RebuildResult>('/admin/rhyme/prompts/rebuild', { method: 'POST', body: { dialect } });
      return `${done.baseWords} base words: rounds can open with any of them.`;
    });

  const rename = (w: PromptWord): void =>
    void (async () => {
      const next = await dialogs.prompt({ title: `Rename “${w.headword}”`, label: 'The word, spelled right', initial: w.headword, confirmLabel: 'Rename' });
      if (!next || next === w.headword) return;
      await run(w.id, async () => {
        await api(`/admin/dictionary/${w.id}`, { method: 'PATCH', body: { headword: next } });
        if (open === w.headword) setOpen(next);
        return `Renamed to “${next}”.`;
      });
    })();

  const stopUsing = (w: PromptWord): void =>
    void run(w.id, async () => {
      await api(`/admin/dictionary/${w.id}`, { method: 'PATCH', body: { isRhymePrompt: false } });
      if (open === w.headword) setOpen(null);
      return `Rounds no longer open with “${w.headword}”. It stays in the games.`;
    });

  const removeFromPool = (w: PromptWord): void =>
    void (async () => {
      const yes = await dialogs.confirm({
        title: `Delete “${w.headword}” from the games?`,
        body: 'It stops appearing in Wordle and Rhyme, guesses of it are no longer accepted, and every rhyme decision about it is dropped.\n\nTo stop it opening rounds but keep the word, use “Stop using” instead.',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!yes) return;
      await run(w.id, async () => {
        await api(`/admin/dictionary/${w.id}`, { method: 'DELETE' });
        if (open === w.headword) setOpen(null);
        return `Deleted “${w.headword}”.`;
      });
    })();

  const l = list.data;
  const columns: Column<PromptWord>[] = [
    {
      key: 'word',
      header: 'Word',
      card: 'title',
      cell: (w) => (
        <>
          <button type="button" className="link" onClick={() => setOpen(w.headword)} dir="auto">
            <strong>{w.headword}</strong>
          </button>
          {!w.isRhymePrompt && (
            <Badge tone="warn" title="Rounds open with it only while no word is marked">
              Not marked
            </Badge>
          )}
        </>
      ),
    },
    {
      key: 'rhymes',
      header: 'Rhymes',
      cell: (w) =>
        w.perfect + w.near === 0 ? (
          <Badge tone="bad" title="A round on this word cannot be played">
            None
          </Badge>
        ) : (
          <span className="badges">
            <Badge tone="ok">{w.perfect} perfect</Badge>
            <Badge>{w.near} near</Badge>
          </span>
        ),
    },
    { key: 'decided', header: 'Your decisions', cell: (w) => (w.decided === 0 ? <span className="subtle">None</span> : `${w.decided} decided${w.ruledOut > 0 ? `, ${w.ruledOut} ruled out` : ''}`) },
  ];

  return (
    <>
      <Tabs
        label="Variety"
        value={dialect}
        onChange={(d) => {
          setDialect(d);
          setOpen(null);
          setPage(0);
        }}
        items={[
          { key: 'kurmanci', label: 'Kurmancî' },
          { key: 'sorani', label: 'Soranî' },
        ]}
      />

      {l?.usingFallback && (
        <Banner
          tone="warn"
          title="No base words chosen yet"
          actions={
            <Button onClick={useEveryPlayableWord} busy={busy === 'rebuild'}>
              Use every word that has a rhyme
            </Button>
          }
        >
          While nothing is marked, a round can open with any of the {l.poolSize} words in the games — including ones with nothing to rhyme
          against, which makes the round unplayable. The list below is therefore the whole pool.{' '}
          {/*
            Marking one word does not narrow this a little: it narrows it to
            that word. Saying so here is the whole warning — the banner
            disappears the instant it stops being true, which is exactly when it
            becomes worth reading.
          */}
          <strong>The moment you mark one word, rounds open with that word only, until you mark more.</strong>
        </Banner>
      )}

      {/*
        A curated set that is smaller than the pool is a restriction, and the
        header alone ("2 of 159 pool words") reads like progress rather than
        like a limit. This says what the game will actually do, and stays until
        it is no longer surprising.
      */}
      {l && !l.usingFallback && l.total < l.poolSize && (
        <Banner
          tone="info"
          title={`Rounds open with ${l.total} of ${l.poolSize} words`}
          actions={
            <Button onClick={useEveryPlayableWord} busy={busy === 'rebuild'}>
              Use every word that has a rhyme
            </Button>
          }
        >
          The other {l.poolSize - l.total} are still in the games — guesses of them count and Wordle still asks them — but no round starts on one.
        </Banner>
      )}

      <Section title="Add a base word" description="The word joins the games and starts opening rhyme rounds. A word already in the games is promoted, not added twice.">
        <form className="inline-form" onSubmit={addBaseWord}>
          <input aria-label="Base word" dir="auto" placeholder="berxwedan" value={adding} onChange={(e) => setAdding(e.target.value)} />
          <Button variant="primary" type="submit" icon="plus" busy={busy === 'add'} disabled={!adding.trim()}>
            Add
          </Button>
        </form>
      </Section>

      <Section
        flush
        title={l ? `Base words (${l.total} of ${l.poolSize} in the games)` : 'Base words'}
        actions={
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              type="search"
              aria-label="Search base words"
              placeholder="Search base words"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>
        }
      >
        <Table
          caption="Base words"
          columns={columns}
          rows={l?.words ?? null}
          rowKey={(w) => w.id}
          loading={list.loading}
          error={list.error}
          onRetry={() => void list.reload()}
          what="rhyme words"
          empty={query ? 'No base word matches.' : 'No base words.'}
          paging={{ page, pageCount: Math.max(1, Math.ceil((l?.total ?? 0) / PAGE)), onPage: setPage, total: l?.total, pageSize: PAGE }}
          actions={(w) => (
            <>
              <Button onClick={() => setOpen(w.headword)}>Rhymes</Button>
              <ActionMenu
                label={`More for “${w.headword}”`}
                items={[
                  { label: 'Rename', onSelect: () => rename(w), disabled: busy === w.id },
                  ...(w.isRhymePrompt ? [{ label: 'Stop using', onSelect: () => stopUsing(w), disabled: busy === w.id }] : []),
                  { label: 'Delete from the games', onSelect: () => removeFromPool(w), tone: 'danger' as const, disabled: busy === w.id },
                ]}
              />
            </>
          )}
        />
      </Section>

      {open && (
        <Drawer open onClose={() => setOpen(null)} title={`Rhymes for “${open}”`} className="drawer-wide">
          <RhymePanel word={open} dialect={dialect} onChanged={() => void list.reload()} />
        </Drawer>
      )}
    </>
  );
}

/** Everything that rhymes with one base word, and how strongly. */
function RhymePanel({ word, dialect, onChanged }: { word: string; dialect: string; onChanged: () => void }): React.JSX.Element {
  const toast = useToast();
  const view = useLoad(() => api<RhymeView>(`/admin/dictionary/rhymes?${new URLSearchParams({ word, dialect })}`), [word, dialect]);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [quality, setQuality] = useState<Verdict>('perfect');

  async function decide(rhyme: string, q: Verdict, addToPool = false): Promise<void> {
    setBusy(rhyme);
    try {
      await api('/admin/dictionary/rhymes', {
        method: 'PUT',
        body: { word, rhyme, quality: q, addToPool, dialect: dialect === 'sorani' ? 'sorani' : 'kurmanji' },
      });
      await view.reload();
      onChanged(); // the base-word list shows counts, so it moves too
    } catch (err) {
      toast.error(errorLine(err, 'rhyme words'));
    } finally {
      setBusy(null);
    }
  }

  if (view.error != null) return <ErrorState error={view.error} onRetry={() => void view.reload()} what="rhyme words" />;
  const v = view.data;
  const known = new Set((v?.rhymes ?? []).map((r) => r.word.toLowerCase()));
  const already = known.has(adding.trim().toLowerCase());

  return (
    <div className="rhyme-panel">
      {v && (
        <p className="note">
          {v.total.perfect + v.total.near} accepted{v.truncated && ` (showing ${v.rhymes.length})`}
          {v.ruledOut.length > 0 && ` · ${v.ruledOut.length} ruled out`}
          {!v.inDictionary && ' · not in the games'}
        </p>
      )}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const w = adding.trim();
          if (!w || already) return;
          void decide(w, quality, true).then(() => setAdding(''));
        }}
      >
        <input aria-label="A word that rhymes" dir="auto" placeholder="Add a rhyme" value={adding} onChange={(e) => setAdding(e.target.value)} />
        <select aria-label="How strongly" value={quality} onChange={(e) => setQuality(e.target.value as Verdict)}>
          <option value="perfect">Perfect</option>
          <option value="near">Near</option>
        </select>
        <Button variant="primary" type="submit" disabled={!adding.trim() || already} icon="plus">
          Add
        </Button>
      </form>
      {already && <p className="note">Already a rhyme for this word.</p>}

      {!v ? (
        <Loading rows={4} />
      ) : v.rhymes.length === 0 ? (
        <Banner tone="warn">Nothing rhymes with this word yet — a round on it could not be played. Add a rhyme above.</Banner>
      ) : (
        <ul className="rhyme-list">
          {v.rhymes.map((r) => (
            <li key={r.word}>
              <div>
                <strong dir="auto">{r.word}</strong>
                <span className="cell-sub">{r.source === 'decided' ? `Your decision (the endings say ${STRENGTH[r.derived].toLowerCase()})` : 'From the word endings'}</span>
              </div>
              <QualitySelect word={r.word} value={r.source === 'decided' ? r.quality : 'auto'} derived={r.derived} disabled={busy === r.word} onChange={(q) => void decide(r.word, q)} />
            </li>
          ))}
        </ul>
      )}

      {v && v.ruledOut.length > 0 && (
        <>
          <h3 className="drawer-sub">Ruled out</h3>
          <p className="note">The endings accept these; you decided they do not rhyme, so the game refuses them.</p>
          <ul className="rhyme-list">
            {v.ruledOut.map((r) => (
              <li key={r.word}>
                <div>
                  <strong dir="auto">{r.word}</strong>
                  <span className="cell-sub">The endings say {STRENGTH[r.derived].toLowerCase()}</span>
                </div>
                <QualitySelect word={r.word} value="none" derived={r.derived} disabled={busy === r.word} onChange={(q) => void decide(r.word, q)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Auto / perfect / near / not a rhyme, with what "auto" currently resolves to. */
function QualitySelect({
  word,
  value,
  derived,
  disabled,
  onChange,
}: {
  word: string;
  value: Verdict;
  derived: Quality;
  disabled: boolean;
  onChange: (next: Verdict) => void;
}): React.JSX.Element {
  return (
    <select aria-label={`How “${word}” rhymes`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Verdict)}>
      <option value="auto">Auto — {STRENGTH[derived].toLowerCase()}</option>
      <option value="perfect">Perfect</option>
      <option value="near">Near</option>
      <option value="none">Not a rhyme</option>
    </select>
  );
}
