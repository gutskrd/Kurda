import { useMemo, useState } from 'react';
import { dialectDirection, type GameDialect, type WordCategoryContent } from '@kurda/shared';
import { listWordCategories, searchVocabulary, type VocabularyPick } from '../gameContent';
import { Button, Field, Note, errorLine, useDebounced, useLoad } from '../ui';

/**
 * The card editor of Impostor, for the Game content page
 * (GameContent.tsx): a word card is made by picking its word from published
 * vocabulary — what published lessons and stories already teach, with its
 * meaning — so no Kurdish is typed again. What an editor writes is the
 * English (and other languages') meaning and the category the card is filed
 * under. The row still goes through review before a game may show it.
 */

type Payload = Record<string, unknown>;

/** Search published vocabulary of the row's variety and pick a word. */
export function VocabularyPicker({
  dialect,
  label,
  onPick,
  disabled = false,
  exclude = [],
}: {
  dialect: GameDialect;
  label: string;
  onPick: (word: VocabularyPick) => void;
  disabled?: boolean;
  /** words already on the card, not offered again */
  exclude?: readonly string[];
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const q = useDebounced(query, 300);
  const found = useLoad(() => searchVocabulary(dialect, q), [dialect, q]);
  const script = dialectDirection(dialect);
  const words = (found.data?.words ?? []).filter((w) => !exclude.includes(w.ku));
  return (
    <div className="gc-picker">
      <Field label={label} hint="Search by the Kurdish or by what it means. Only published lessons’ and stories’ words are here.">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} disabled={disabled} placeholder="Search the vocabulary" />
      </Field>
      {found.error ? (
        <p className="field-error">{errorLine(found.error, 'the vocabulary')}</p>
      ) : found.data && words.length === 0 ? (
        <p className="subtle">No published word matches.</p>
      ) : (
        <ul className="gc-picks" aria-label={`${label}: words found`}>
          {words.map((w) => (
            <li key={w.key}>
              <button type="button" className="gc-pick" disabled={disabled} onClick={() => onPick(w)}>
                <span lang={script.lang} dir={script.dir}>
                  {w.ku}
                </span>
                <span className="subtle"> — {w.meanings.en ?? Object.values(w.meanings)[0] ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A picked word shown as it will be stored, with a way to take it off. */
function PickedWord({ word, dialect, onRemove, readOnly, label }: { word: string; dialect: GameDialect; onRemove?: () => void; readOnly: boolean; label: string }): React.JSX.Element {
  const script = dialectDirection(dialect);
  return (
    <span className="gc-picked">
      <span lang={script.lang} dir={script.dir}>
        {word}
      </span>
      {!readOnly && onRemove && (
        <Button variant="ghost" icon="trash" aria-label={`Remove ${label} ${word}`} onClick={onRemove}>
          Remove
        </Button>
      )}
    </span>
  );
}

/** The English (and other) meaning beside a picked word, which the editor may refine. */
function meaningsOf(pick: VocabularyPick): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(pick.meanings)) if (typeof v === 'string' && v.trim()) out[k] = v;
  out.en ??= '';
  return out;
}

/**
 * A Impostor word card: the word (picked), what it means, the category
 * it is filed under — whose name is the impostor's hint — and any forms of the
 * word a clue may not say either (picked too; the game already hears the
 * common endings).
 */
export function WordCardFields({
  payload,
  onChange,
  dialect,
  readOnly,
  Meanings,
}: {
  payload: Payload;
  onChange: (p: Payload) => void;
  dialect: GameDialect;
  readOnly: boolean;
  Meanings: (p: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; label: string; readOnly: boolean }) => React.JSX.Element;
}): React.JSX.Element {
  const categories = useLoad(() => listWordCategories(dialect), [dialect]);
  const word = String(payload.word ?? '');
  const forms = (payload.forms as string[] | undefined) ?? [];
  const hint = (payload.hint as { ku: string; meanings: Record<string, string> } | undefined) ?? { ku: '', meanings: { en: '' } };
  const options = useMemo(() => (categories.data?.rows ?? []).map((r) => r.payload as WordCategoryContent), [categories.data]);
  const script = dialectDirection(dialect);
  return (
    <>
      <Field label="The word" hint="Picked from published vocabulary, so its Kurdish is already approved." required>
        {word ? <PickedWord word={word} dialect={dialect} readOnly={readOnly} label="the word" onRemove={() => onChange({ ...payload, word: '' })} /> : <p className="subtle">No word picked yet.</p>}
      </Field>
      {!readOnly && !word && <VocabularyPicker dialect={dialect} label="Pick the word" onPick={(w) => onChange({ ...payload, word: w.ku, meanings: meaningsOf(w) })} />}
      <Meanings label="What it means" value={(payload.meanings as Record<string, string>) ?? { en: '' }} onChange={(m) => onChange({ ...payload, meanings: m })} readOnly={readOnly} />
      <Field label="Category" hint="Its name is what the impostor is shown instead of the word. A new category is a Word category row of its own.">
        {categories.error ? (
          <p className="field-error">{errorLine(categories.error, 'the categories')}</p>
        ) : options.length === 0 && categories.data ? (
          <Note>No category in this variety yet: add a Word category, or import the starter word cards, which bring theirs.</Note>
        ) : (
          <select
            aria-label="Category"
            value={String(payload.category ?? '')}
            disabled={readOnly}
            onChange={(e) => {
              const c = options.find((o) => o.slug === e.target.value);
              onChange({ ...payload, category: e.target.value, hint: c ? { ku: c.ku, meanings: c.meanings } : hint });
            }}
          >
            <option value="">Choose a category</option>
            {options.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.ku} — {c.meanings.en}
              </option>
            ))}
          </select>
        )}
      </Field>
      {hint.ku && (
        <p className="subtle">
          The impostor is shown:{' '}
          <span lang={script.lang} dir={script.dir}>
            {hint.ku}
          </span>{' '}
          ({hint.meanings.en})
        </p>
      )}
      <Field label="Other forms a clue may not say" hint="Optional: a plural or another form a learner would hear as the word. Common endings are caught already.">
        <div className="gc-list">
          {forms.map((f, i) => (
            <PickedWord key={`${f}:${i}`} word={f} dialect={dialect} readOnly={readOnly} label="the form" onRemove={() => onChange({ ...payload, forms: forms.filter((_, j) => j !== i) })} />
          ))}
        </div>
      </Field>
      {!readOnly && forms.length < 12 && (
        <VocabularyPicker dialect={dialect} label="Add a form" exclude={[word, ...forms]} onPick={(w) => onChange({ ...payload, forms: [...forms, w.ku] })} />
      )}
    </>
  );
}
