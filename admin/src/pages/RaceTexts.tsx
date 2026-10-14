import { useState } from 'react';
import { api, ApiError } from '../api';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Drawer,
  FieldRow,
  FormActions,
  Section,
  Select,
  Table,
  TextInput,
  Textarea,
  errorLine,
  useDialogs,
  useLoad,
  useToast,
  type Column,
} from '../ui';

type Language = 'kmr' | 'ckb';

/** A character nobody could type in a text, as the API reports it after a save. */
export interface Untypeable {
  char: string;
  /** "U+00E9": a character that looks like another can be told apart */
  codePoint: string;
  count: number;
}

export interface RaceText {
  id: string;
  title: string;
  body: string;
  language: Language;
  difficulty: number;
  active: boolean;
  /** absent from an older API; the screen treats that as nothing to warn about */
  untypeable?: Untypeable[];
}

type Draft = Omit<RaceText, 'id' | 'untypeable'>;

const BLANK: Draft = { title: '', body: '', language: 'kmr', difficulty: 1, active: true };

const LENGTH_LABEL: Record<number, string> = { 1: 'Short', 2: 'Medium', 3: 'Long' };
const LANGUAGE_LABEL: Record<Language, string> = { kmr: 'Kurmancî', ckb: 'Soranî' };

/** The bounds the API holds a text to, after it normalises it (race-service). */
export const MIN_CHARS = 20;
export const MAX_CHARS = 2000;

/** Roughly what a racer will see, before they see it. */
export function stats(body: string): { chars: number; words: number } {
  const trimmed = body.trim();
  return {
    chars: [...trimmed].length,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
  };
}

/** "é (U+00E9) ×2, ſ (U+017F)" — the characters, with their code points to tell look-alikes apart. */
export function untypeableList(chars: Untypeable[]): string {
  return chars.map((c) => `${c.char} (${c.codePoint})${c.count > 1 ? ` ×${c.count}` : ''}`).join(', ');
}

/**
 * The texts a typing race draws from.
 *
 * A race picks one at random from the active texts of the chosen length and
 * variety, so an edit here changes the next race. Retiring a text (Active off)
 * takes it out of play and keeps it, which is better than deleting one you may
 * want back.
 *
 * The API saves a text the way a keyboard types it and answers with the
 * characters nobody could type even so (é in a Kurmancî text, a Persian letter
 * in a Soranî one). The screen used to drop that answer; now it says so after
 * a save and marks the text in the list until it is fixed.
 */
export function RaceTexts(): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const texts = useLoad(() => api<{ texts: RaceText[] }>('/admin/race/texts').then((r) => r.texts), []);
  const [editing, setEditing] = useState<RaceText | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(t: RaceText): Promise<void> {
    const yes = await dialogs.confirm({
      title: `Delete “${t.title}”?`,
      body: 'It is gone for good. Turning Active off instead takes it out of races and keeps it for later.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!yes) return;
    setBusy(t.id);
    try {
      await api(`/admin/race/texts/${t.id}`, { method: 'DELETE' });
      toast.success(`Deleted “${t.title}”.`);
      await texts.reload();
    } catch (err) {
      toast.error(errorLine(err, 'race texts'));
    } finally {
      setBusy(null);
    }
  }

  const list = texts.data ?? [];
  const active = list.filter((t) => t.active).length;
  // a length with nothing active in a variety cannot be raced in it, and that is worth seeing
  const coverage = (['kmr', 'ckb'] as const).flatMap((language) =>
    [1, 2, 3].map((difficulty) => ({
      language,
      difficulty,
      count: list.filter((t) => t.active && t.language === language && t.difficulty === difficulty).length,
    })),
  );

  const columns: Column<RaceText>[] = [
    {
      key: 'title',
      header: 'Text',
      card: 'title',
      sort: (a, b) => a.title.localeCompare(b.title),
      cell: (t) => (
        <>
          <strong>{t.title}</strong>
          {!t.active && (
            <>
              {' '}
              <Badge>Retired</Badge>
            </>
          )}
          {t.untypeable && t.untypeable.length > 0 && (
            <>
              {' '}
              <Badge tone="warn" title={untypeableList(t.untypeable)}>
                {t.untypeable.length === 1 ? '1 character can’t be typed' : `${t.untypeable.length} characters can’t be typed`}
              </Badge>
            </>
          )}
          <span className="cell-sub" lang={t.language === 'ckb' ? 'ckb' : 'ku'} dir="auto">
            {t.body.length > 90 ? `${t.body.slice(0, 90)}…` : t.body}
          </span>
        </>
      ),
    },
    {
      key: 'length',
      header: 'Length',
      sort: (a, b) => a.difficulty - b.difficulty,
      cell: (t) => LENGTH_LABEL[t.difficulty] ?? t.difficulty,
    },
    { key: 'language', header: 'Variety', sort: (a, b) => a.language.localeCompare(b.language), cell: (t) => LANGUAGE_LABEL[t.language] ?? t.language },
    {
      key: 'size',
      header: 'Size',
      align: 'end',
      sort: (a, b) => stats(a.body).chars - stats(b.body).chars,
      cell: (t) => {
        const s = stats(t.body);
        return (
          <span className="subtle">
            {s.words} words · {s.chars} characters
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <Section
        title="What can be raced"
        description="A race picks one active text at random from the variety and length the player chose. Where there are none, the game says no texts are available."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            New text
          </Button>
        }
      >
        <div className="badges">
          {coverage.map((c) => (
            <Badge key={`${c.language}-${c.difficulty}`} tone={c.count === 0 ? 'bad' : 'ok'}>
              {LANGUAGE_LABEL[c.language]}, {LENGTH_LABEL[c.difficulty]?.toLowerCase()}: {c.count}
            </Badge>
          ))}
        </div>
      </Section>

      <Section flush title={texts.data ? `Race texts · ${active} active of ${list.length}` : 'Race texts'}>
        <Table
          caption="Race texts"
          columns={columns}
          rows={texts.data ?? null}
          rowKey={(t) => t.id}
          loading={texts.loading}
          error={texts.error}
          onRetry={() => void texts.reload()}
          what="race texts"
          empty="No race texts yet. Add one to make the game playable."
          actions={(t) => (
            <>
              <Button onClick={() => setEditing(t)}>Edit</Button>
              <Button variant="danger" onClick={() => void remove(t)} disabled={busy === t.id}>
                Delete
              </Button>
            </>
          )}
        />
      </Section>

      <TextForm
        key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.id}
        text={editing}
        onClose={() => setEditing(null)}
        onSaved={async (saved, isNew) => {
          setEditing(null);
          const bad = saved.untypeable ?? [];
          if (bad.length) {
            toast.info(
              `Saved “${saved.title}”, but nobody can type ${bad.length === 1 ? 'one character' : `${bad.length} characters`} in it on a ${LANGUAGE_LABEL[saved.language]} keyboard: ${untypeableList(bad)}.`,
            );
          } else toast.success(isNew ? `Added “${saved.title}”.` : `Saved “${saved.title}”.`);
          await texts.reload();
        }}
      />
    </div>
  );
}

function TextForm({
  text,
  onClose,
  onSaved,
}: {
  text: RaceText | 'new' | null;
  onClose: () => void;
  onSaved: (saved: RaceText, isNew: boolean) => Promise<void>;
}): React.JSX.Element {
  const existing = text !== null && text !== 'new' ? text : null;
  const [form, setForm] = useState<Draft>(() =>
    existing ? { title: existing.title, body: existing.body, language: existing.language, difficulty: existing.difficulty, active: existing.active } : BLANK,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // the API's answer when the text's script says another variety: the code it says
  const [suggested, setSuggested] = useState<Language | null>(null);
  const s = stats(form.body);
  const outOfBounds = s.chars > 0 && (s.chars < MIN_CHARS || s.chars > MAX_CHARS);

  function set<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'language' || key === 'body') setSuggested(null);
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    // the same bounds the API enforces, said before the request is sent
    if (s.chars < MIN_CHARS || s.chars > MAX_CHARS) {
      setProblem(`A race text has to be between ${MIN_CHARS} and ${MAX_CHARS} characters.`);
      return;
    }
    setBusy(true);
    setProblem(null);
    setSuggested(null);
    try {
      const body = { ...form, title: form.title.trim(), body: form.body.trim() };
      const saved = existing
        ? await api<RaceText>(`/admin/race/texts/${existing.id}`, { method: 'PUT', body })
        : await api<RaceText>('/admin/race/texts', { method: 'POST', body });
      await onSaved(saved, !existing);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TEXT_LANGUAGE_MISMATCH') {
        const language = (err.details as { language?: unknown } | undefined)?.language;
        if (language === 'kmr' || language === 'ckb') setSuggested(language);
      }
      setProblem(errorLine(err, 'race texts'));
    } finally {
      setBusy(false);
    }
  }

  const stored = existing?.untypeable ?? [];

  return (
    <Drawer
      open={text !== null}
      onClose={onClose}
      title={existing ? `Edit “${existing.title}”` : 'New race text'}
      footer={
        <FormActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="race-text" busy={busy} disabled={!form.title.trim()}>
            {busy ? 'Saving…' : 'Save text'}
          </Button>
        </FormActions>
      }
    >
      <form id="race-text" className="form" onSubmit={(e) => void submit(e)} noValidate>
        <p className="note">This is exactly what a player types, character for character — punctuation and accents included.</p>

        {stored.length > 0 && (
          <Banner tone="warn" title="Some of it can’t be typed">
            On a {LANGUAGE_LABEL[existing!.language]} keyboard nobody can type {untypeableList(stored)}. Replace those characters, or check the
            variety is right.
          </Banner>
        )}

        <TextInput
          label="Title"
          hint="For you; racers do not see it mid-race."
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Helbesta welat"
          required
          maxLength={120}
          data-autofocus
        />
        <Textarea
          label="Text"
          hint={`${s.words} words · ${s.chars} characters${outOfBounds ? ` — it has to be ${MIN_CHARS}–${MAX_CHARS}` : ''}`}
          rows={7}
          className="code-area"
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          placeholder="Ez ji welatê xwe hez dikim…"
          lang={form.language === 'ckb' ? 'ckb' : 'ku'}
          dir={form.language === 'ckb' ? 'rtl' : 'ltr'}
          required
          aria-invalid={outOfBounds || undefined}
        />
        <FieldRow>
          <Select
            label="Length"
            value={String(form.difficulty)}
            onChange={(e) => set('difficulty', Number(e.target.value))}
            options={[1, 2, 3].map((d) => ({ value: String(d), label: LENGTH_LABEL[d]! }))}
          />
          <Select
            label="Variety"
            hint="Who is handed it: Kurmancî racers or Soranî ones."
            value={form.language}
            onChange={(e) => set('language', e.target.value as Language)}
            options={(Object.keys(LANGUAGE_LABEL) as Language[]).map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))}
          />
        </FieldRow>
        <Checkbox label="Active" hint="In play. Turn it off to retire the text and keep it." checked={form.active} onChange={(v) => set('active', v)} />

        {problem && (
          <div className="field-error" role="alert">
            {problem}
            {suggested && (
              <div className="form-actions">
                <Button onClick={() => set('language', suggested)}>Make it {LANGUAGE_LABEL[suggested]}</Button>
              </div>
            )}
          </div>
        )}
      </form>
    </Drawer>
  );
}
