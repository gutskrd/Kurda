import { useEffect, useMemo, useState } from 'react';
import { dialectDirection, type GameDialect, type WordCategoryContent } from '@kurda/shared';
import { listWordCategories, searchVocabulary, type VocabularyPick } from '../gameContent';
import { Button, Field, Note, errorLine, useDebounced, useLoad } from '../ui';

/**
 * The card editors of the party games, for the Game content page
 * (GameContent.tsx): a Kurdish Impostor word card and a Don't Say the Word!
 * card are made by picking their words from published vocabulary — what
 * published lessons and stories already teach, with its meaning — so no
 * Kurdish is typed again. What an editor writes is the English (and other
 * languages') meaning, the category a word card is filed under, and which
 * picked words a taboo card forbids. The row still goes through review before
 * a game may show it.
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
 * A Kurdish Impostor word card: the word (picked), what it means, the category
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

/**
 * A Don't Say the Word! card: the word to describe (picked), what it means,
 * the three to five words that may not be said (picked), and any forms of
 * them that are refused too.
 */
export function TabooCardFields({
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
  const target = String(payload.target ?? '');
  const forbidden = ((payload.forbidden as string[] | undefined) ?? []).filter((f) => f !== '');
  const forms = (payload.forms as string[] | undefined) ?? [];
  const [picking, setPicking] = useState<'forbidden' | 'forms' | null>(null);
  useEffect(() => {
    if (readOnly) setPicking(null);
  }, [readOnly]);
  const onCard = [target, ...forbidden, ...forms];
  return (
    <>
      <Field label="The word to describe" hint="Picked from published vocabulary." required>
        {target ? <PickedWord word={target} dialect={dialect} readOnly={readOnly} label="the word" onRemove={() => onChange({ ...payload, target: '' })} /> : <p className="subtle">No word picked yet.</p>}
      </Field>
      {!readOnly && !target && <VocabularyPicker dialect={dialect} label="Pick the word to describe" exclude={onCard} onPick={(w) => onChange({ ...payload, target: w.ku, meanings: meaningsOf(w) })} />}
      <Meanings label="What it means" value={(payload.meanings as Record<string, string>) ?? { en: '' }} onChange={(m) => onChange({ ...payload, meanings: m })} readOnly={readOnly} />
      <Field label="Words that may not be said" hint="Three to five: the words a describer would reach for first. Each is picked from published vocabulary." required>
        <div className="gc-list">
          {forbidden.map((f, i) => (
            <PickedWord key={`${f}:${i}`} word={f} dialect={dialect} readOnly={readOnly} label="the forbidden word" onRemove={() => onChange({ ...payload, forbidden: forbidden.filter((_, j) => j !== i) })} />
          ))}
          {forbidden.length === 0 && <p className="subtle">None picked yet.</p>}
        </div>
      </Field>
      {!readOnly && (
        <div className="row">
          <Button icon="plus" disabled={forbidden.length >= 5} onClick={() => setPicking('forbidden')}>
            Add a forbidden word
          </Button>
          <Button icon="plus" disabled={forms.length >= 16} onClick={() => setPicking('forms')}>
            Add another form
          </Button>
          {picking && (
            <Button variant="ghost" onClick={() => setPicking(null)}>
              Done picking
            </Button>
          )}
        </div>
      )}
      {picking === 'forbidden' && (
        <VocabularyPicker
          dialect={dialect}
          label="Pick a forbidden word"
          exclude={onCard}
          onPick={(w) => {
            onChange({ ...payload, forbidden: [...forbidden, w.ku].slice(0, 5) });
            if (forbidden.length + 1 >= 5) setPicking(null);
          }}
        />
      )}
      <Field label="Other forms that are refused too" hint="Optional: a plural or another form of the word or of a forbidden word. Common endings are caught already.">
        <div className="gc-list">
          {forms.map((f, i) => (
            <PickedWord key={`${f}:${i}`} word={f} dialect={dialect} readOnly={readOnly} label="the form" onRemove={() => onChange({ ...payload, forms: forms.filter((_, j) => j !== i) })} />
          ))}
        </div>
      </Field>
      {picking === 'forms' && <VocabularyPicker dialect={dialect} label="Pick another form" exclude={onCard} onPick={(w) => onChange({ ...payload, forms: [...forms, w.ku] })} />}
    </>
  );
}
