import { useState } from 'react';
import {
  APP_LOCALE_CODES,
  GAME_DIALECTS,
  LORE_COUNTS,
  LORE_TRADITIONS,
  PROVERB_THEMES,
  RIDDLE_CATEGORIES,
  RIDDLE_DIFFICULTIES,
  RIDDLE_PAID_GUESSES,
  checkLoreTranslation,
  dialectDirection,
  localeDir,
  originalLocale,
  type AdminContentTranslation,
  type AdminGameContent,
  type AppLocale,
  type GameDialect,
  type LoreKind,
  type ProverbTheme,
  type TranslationReview,
} from '@kurda/shared';
import {
  GAME_DIALECT_NAME,
  RIDDLE_CATEGORY_LABEL,
  RIDDLE_DIFFICULTY_LABEL,
  THEME_LABEL,
  TRADITION_LABEL,
  TRANSLATION_REVIEW_LABEL,
  blankTranslation,
  reviewTranslation,
  saveTranslation,
} from '../gameContent';
import { localeName } from '../format';
import { Badge, Banner, Button, Field, FormActions, Note, Section, Tabs, Time, UserLink, errorLine, useToast, type Tone } from '../ui';

/**
 * The editors of the Stories' riddles and proverbs, on the Game content page
 * (GameContent.tsx), and the panel their translations are written and
 * reviewed in, one language at a time.
 *
 * A riddle's question and its answer are kept apart on screen, in sections of
 * their own: what a learner reads first, and what they must ask for. Every
 * Kurdish field is marked up in the row's variety; a proverb's variant in its
 * own. Anything traditional names its sources, and a note for the reviewers
 * stays in the panel: the learner routes never send it.
 *
 * Translations are not part of the row's approval. Each language is saved on
 * its own ("Save this language") and reviewed on its own ("Mark reviewed",
 * "Needs review"), on a row in any state but archived — so a published
 * riddle's German is corrected without unpublishing it, and without its
 * Kurdish needing approval again.
 */

type Payload = Record<string, unknown>;

/** A field's value, or the field left out when it is emptied: an optional field is never stored blank. */
const optional = (v: string): string | undefined => (v.trim() === '' ? undefined : v);

/** A list of short texts — hints, accepted forms — with room for between `min` and `max`. */
function TextList({
  label,
  hint,
  items,
  onChange,
  min,
  max,
  addLabel,
  itemLabel,
  lang,
  dir,
  readOnly,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  min: number;
  max: number;
  addLabel: string;
  itemLabel: (i: number) => string;
  lang: string;
  dir: 'ltr' | 'rtl';
  readOnly: boolean;
}): React.JSX.Element {
  return (
    <Field label={label} hint={hint}>
      <div className="gc-list">
        {items.map((value, i) => (
          <span key={i} className="row">
            <input aria-label={itemLabel(i)} value={value} lang={lang} dir={dir} readOnly={readOnly} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            {!readOnly && items.length > min && (
              <Button variant="ghost" icon="trash" aria-label={`Remove ${itemLabel(i).toLowerCase()}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                Remove
              </Button>
            )}
          </span>
        ))}
        {!readOnly && items.length < max && (
          <Button icon="plus" onClick={() => onChange([...items, ''])}>
            {addLabel}
          </Button>
        )}
      </div>
    </Field>
  );
}

interface SourceValue {
  title?: string;
  author?: string;
  url?: string;
  note?: string;
}

/** Where a riddle or a proverb was found: each source's title, author, address and what it gives. */
function SourcesFields({ sources, onChange, readOnly }: { sources: SourceValue[]; onChange: (s: SourceValue[]) => void; readOnly: boolean }): React.JSX.Element {
  const set = (i: number, patch: Partial<SourceValue>) => onChange(sources.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <fieldset className="gc-fieldset">
      <legend>Sources</legend>
      <p className="subtle">Where it was found: a book, an article, a collection. A traditional or regional one names at least one; a newly written one may name none.</p>
      {sources.map((s, i) => (
        <div key={i} className="gc-card">
          <Field label={`Source ${i + 1}: title`} required>
            <input value={s.title ?? ''} readOnly={readOnly} onChange={(e) => set(i, { title: e.target.value })} />
          </Field>
          <Field label="Author or organisation">
            <input value={s.author ?? ''} readOnly={readOnly} onChange={(e) => set(i, { author: optional(e.target.value) })} />
          </Field>
          <Field label="Address" hint="https:// only.">
            <input type="url" value={s.url ?? ''} readOnly={readOnly} onChange={(e) => set(i, { url: optional(e.target.value) })} />
          </Field>
          <Field label="What it gives" hint="The wording as told in it, the page, the region.">
            <input value={s.note ?? ''} readOnly={readOnly} onChange={(e) => set(i, { note: optional(e.target.value) })} />
          </Field>
          {!readOnly && (
            <Button variant="ghost" icon="trash" aria-label={`Remove source ${i + 1}`} onClick={() => onChange(sources.filter((_, j) => j !== i))}>
              Remove
            </Button>
          )}
        </div>
      ))}
      {!readOnly && sources.length < LORE_COUNTS.sources.max && (
        <Button icon="plus" onClick={() => onChange([...sources, { title: '' }])}>
          Add a source
        </Button>
      )}
    </fieldset>
  );
}

/** Its slug, and where it comes from: the tradition, a local form of it with its region, or newly written. */
function OriginFields({ payload, onChange, readOnly, what }: { payload: Payload; onChange: (p: Payload) => void; readOnly: boolean; what: string }): React.JSX.Element {
  return (
    <>
      <Field label="Slug" hint={`Names the ${what} in the app’s addresses: 2–40 lower-case letters, digits and dashes, starting with the variety (kmr-…, ckb-…).`} required>
        <input value={String(payload.slug ?? '')} readOnly={readOnly} onChange={(e) => onChange({ ...payload, slug: e.target.value })} />
      </Field>
      <Field label="Tradition" hint="Never present a newly written one as traditional.">
        <select value={String(payload.tradition ?? 'new')} disabled={readOnly} onChange={(e) => onChange({ ...payload, tradition: e.target.value })}>
          {LORE_TRADITIONS.map((t) => (
            <option key={t} value={t}>
              {TRADITION_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Region" hint="Where a regional form is said: Botan, Behdînan, Mukriyan…">
        <input value={String(payload.region ?? '')} readOnly={readOnly} onChange={(e) => onChange({ ...payload, region: optional(e.target.value) })} />
      </Field>
    </>
  );
}

function ReviewerNotes({ payload, onChange, readOnly }: { payload: Payload; onChange: (p: Payload) => void; readOnly: boolean }): React.JSX.Element {
  return (
    <Field label="Notes for the reviewers" hint="What a native speaker should check. Kept here; learners never see it.">
      <textarea rows={3} value={String(payload.notes ?? '')} readOnly={readOnly} onChange={(e) => onChange({ ...payload, notes: optional(e.target.value) })} />
    </Field>
  );
}

/** A riddle: where it comes from, its question and hints, and — in a section of its own — its answer. */
export function RiddleFields({ payload, onChange, dialect, readOnly }: { payload: Payload; onChange: (p: Payload) => void; dialect: GameDialect; readOnly: boolean }): React.JSX.Element {
  const script = dialectDirection(dialect);
  const list = (key: string): string[] => (payload[key] as string[] | undefined) ?? [];
  return (
    <>
      <fieldset className="gc-fieldset">
        <legend>About the riddle</legend>
        <div className="row">
          <Field label="Difficulty" hint="Its level follows from it.">
            <select value={String(payload.difficulty ?? 'easy')} disabled={readOnly} onChange={(e) => onChange({ ...payload, difficulty: e.target.value })}>
              {RIDDLE_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {RIDDLE_DIFFICULTY_LABEL[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select value={String(payload.category ?? 'nature')} disabled={readOnly} onChange={(e) => onChange({ ...payload, category: e.target.value })}>
              {RIDDLE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {RIDDLE_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <OriginFields payload={payload} onChange={onChange} readOnly={readOnly} what="riddle" />
      </fieldset>

      <fieldset className="gc-fieldset">
        <legend>The question</legend>
        <p className="subtle">What a learner reads first. The hints come one at a time, when asked for: the second nearer the answer than the first, neither giving it away.</p>
        <Field label="Question" required>
          <textarea rows={3} value={String(payload.question ?? '')} lang={script.lang} dir={script.dir} readOnly={readOnly} onChange={(e) => onChange({ ...payload, question: e.target.value })} />
        </Field>
        <TextList
          label="Hints"
          items={list('hints')}
          onChange={(hints) => onChange({ ...payload, hints })}
          min={LORE_COUNTS.hints.min}
          max={LORE_COUNTS.hints.max}
          addLabel="Add a second hint"
          itemLabel={(i) => `Hint ${i + 1}`}
          lang={script.lang}
          dir={script.dir}
          readOnly={readOnly}
        />
      </fieldset>

      <fieldset className="gc-fieldset gc-answer">
        <legend>The answer</legend>
        <p className="subtle">Never sent with the question: a learner gets it by guessing it or by asking for it.</p>
        <Field label="Answer" required>
          <input value={String(payload.answer ?? '')} lang={script.lang} dir={script.dir} readOnly={readOnly} onChange={(e) => onChange({ ...payload, answer: e.target.value })} />
        </Field>
        <TextList
          label="Accepted forms"
          hint={`What else a learner may type and be right: with and without an ending, synonyms, both spellings. Case, the marks on letters, a word like “ew” before it, the copula after it and one ending on it are forgiven anyway. A solve pays only within ${RIDDLE_PAID_GUESSES} guesses.`}
          items={list('accepted')}
          onChange={(accepted) => onChange({ ...payload, accepted })}
          min={LORE_COUNTS.accepted.min}
          max={LORE_COUNTS.accepted.max}
          addLabel="Add a form"
          itemLabel={(i) => `Accepted form ${i + 1}`}
          lang={script.lang}
          dir={script.dir}
          readOnly={readOnly}
        />
        <Field label="Why it is right" hint="Short and satisfying; for wordplay, show the play." required>
          <textarea rows={3} value={String(payload.explanation ?? '')} lang={script.lang} dir={script.dir} readOnly={readOnly} onChange={(e) => onChange({ ...payload, explanation: e.target.value })} />
        </Field>
      </fieldset>

      <SourcesFields sources={(payload.sources as SourceValue[] | undefined) ?? []} onChange={(sources) => onChange({ ...payload, sources })} readOnly={readOnly} />
      <ReviewerNotes payload={payload} onChange={onChange} readOnly={readOnly} />
    </>
  );
}

interface VariantValue {
  text?: string;
  dialect?: GameDialect;
  region?: string;
  note?: string;
}

/** A proverb: where it comes from, its themes, the saying, a scene it is said in, and its other wordings. */
export function ProverbFields({ payload, onChange, dialect, readOnly }: { payload: Payload; onChange: (p: Payload) => void; dialect: GameDialect; readOnly: boolean }): React.JSX.Element {
  const script = dialectDirection(dialect);
  const themes = (payload.themes as ProverbTheme[] | undefined) ?? [];
  const variants = (payload.variants as VariantValue[] | undefined) ?? [];
  const setVariant = (i: number, patch: Partial<VariantValue>) => onChange({ ...payload, variants: variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  return (
    <>
      <fieldset className="gc-fieldset">
        <legend>About the proverb</legend>
        <OriginFields payload={payload} onChange={onChange} readOnly={readOnly} what="proverb" />
        <fieldset className="gc-proof">
          <legend>Themes (one to three)</legend>
          {PROVERB_THEMES.map((t) => {
            const on = themes.includes(t);
            return (
              <label key={t}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={readOnly || (!on && themes.length >= LORE_COUNTS.themes.max)}
                  onChange={() => onChange({ ...payload, themes: on ? themes.filter((x) => x !== t) : [...themes, t] })}
                />{' '}
                {THEME_LABEL[t]}
              </label>
            );
          })}
        </fieldset>
      </fieldset>

      <fieldset className="gc-fieldset">
        <legend>The proverb</legend>
        <Field label="The saying" hint="As it is said, in the row’s variety." required>
          <textarea rows={2} value={String(payload.text ?? '')} lang={script.lang} dir={script.dir} readOnly={readOnly} onChange={(e) => onChange({ ...payload, text: e.target.value })} />
        </Field>
        <Field label="A little scene with it" hint="An everyday moment where someone says it, in the row’s variety, with the proverb said in it." required>
          <textarea rows={4} value={String(payload.exampleKu ?? '')} lang={script.lang} dir={script.dir} readOnly={readOnly} onChange={(e) => onChange({ ...payload, exampleKu: e.target.value })} />
        </Field>
      </fieldset>

      <fieldset className="gc-fieldset">
        <legend>Other wordings</legend>
        <p className="subtle">Another region’s form, or the other variety’s counterpart, each in its own variety’s script.</p>
        {variants.map((v, i) => {
          const own = dialectDirection(v.dialect ?? dialect);
          return (
            <div key={i} className="gc-card">
              <Field label={`Wording ${i + 1}`} required>
                <input value={v.text ?? ''} lang={own.lang} dir={own.dir} readOnly={readOnly} onChange={(e) => setVariant(i, { text: e.target.value })} />
              </Field>
              <div className="row">
                <Field label="Variety">
                  <select value={v.dialect ?? dialect} disabled={readOnly} onChange={(e) => setVariant(i, { dialect: e.target.value as GameDialect })}>
                    {GAME_DIALECTS.map((d) => (
                      <option key={d} value={d}>
                        {GAME_DIALECT_NAME[d]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Region">
                  <input value={v.region ?? ''} readOnly={readOnly} onChange={(e) => setVariant(i, { region: optional(e.target.value) })} />
                </Field>
              </div>
              <Field label="Note">
                <input value={v.note ?? ''} readOnly={readOnly} onChange={(e) => setVariant(i, { note: optional(e.target.value) })} />
              </Field>
              {!readOnly && (
                <Button variant="ghost" icon="trash" aria-label={`Remove wording ${i + 1}`} onClick={() => onChange({ ...payload, variants: variants.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              )}
            </div>
          );
        })}
        {!readOnly && variants.length < LORE_COUNTS.variants.max && (
          <Button icon="plus" onClick={() => onChange({ ...payload, variants: [...variants, { text: '', dialect }] })}>
            Add a wording
          </Button>
        )}
      </fieldset>

      <SourcesFields sources={(payload.sources as SourceValue[] | undefined) ?? []} onChange={(sources) => onChange({ ...payload, sources })} readOnly={readOnly} />
      <ReviewerNotes payload={payload} onChange={onChange} readOnly={readOnly} />
    </>
  );
}

// ---------- Translations ----------

const REVIEW_TONE: Record<TranslationReview, Tone> = { unreviewed: 'warn', reviewed: 'ok' };

/** One translated field: its label, the Kurdish it renders beside it, and the text. */
function TranslatedField({
  label,
  original,
  value,
  onChange,
  locale,
  readOnly,
  required,
  multiline,
  hint,
}: {
  label: string;
  original?: { text: string; dialect: GameDialect };
  value: string;
  onChange: (v: string) => void;
  locale: AppLocale;
  readOnly: boolean;
  required?: boolean;
  multiline?: boolean;
  hint?: string;
}): React.JSX.Element {
  const script = original ? dialectDirection(original.dialect) : null;
  const props = { value, lang: locale, dir: localeDir(locale), readOnly, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return (
    <>
      {original && script && (
        <p className="gc-original" lang={script.lang} dir={script.dir}>
          {original.text}
        </p>
      )}
      <Field label={label} required={required} hint={hint}>
        {multiline ? <textarea rows={3} {...props} /> : <input {...props} />}
      </Field>
    </>
  );
}

/** One language of a row: its fields, its review, and saving it alone. */
function TranslationForm({
  row,
  locale,
  saved,
  busy,
  onSave,
  onReview,
}: {
  row: AdminGameContent;
  locale: AppLocale;
  saved: AdminContentTranslation | undefined;
  busy: boolean;
  onSave: (payload: Payload) => void;
  onReview: (status: TranslationReview, note: string | null) => void;
}): React.JSX.Element {
  const kind = row.kind as LoreKind;
  const kurdish = row.payload as unknown as Payload;
  const hints = kind === 'riddle' ? ((kurdish.hints as string[] | undefined) ?? []).length : undefined;
  const [draft, setDraft] = useState<Payload>(() => (saved?.payload as unknown as Payload) ?? blankTranslation(kind, hints));
  const [note, setNote] = useState(saved?.reviewNote ?? '');
  const readOnly = row.status === 'archived';
  const checked = checkLoreTranslation(kind, { dialect: row.dialect, hints }, locale, draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved?.payload ?? null);
  const set = (key: string, v: string, keep = true) => {
    const next = { ...draft };
    if (!keep && v.trim() === '') delete next[key];
    else next[key] = v;
    setDraft(next);
  };
  const ku = (key: string): { text: string; dialect: GameDialect } => ({ text: String(kurdish[key] ?? ''), dialect: row.dialect });

  return (
    <div className="gc-translation" role="group" aria-label={`${localeName(locale)} translation`}>
      <div className="st-review-state">
        {saved ? <Badge tone={REVIEW_TONE[saved.reviewStatus]}>{TRANSLATION_REVIEW_LABEL[saved.reviewStatus]}</Badge> : <Badge tone="bad">Not translated yet</Badge>}
        {saved && (
          <span className="subtle">
            Changed <Time value={saved.updatedAt} />
            {saved.reviewStatus === 'reviewed' && saved.reviewedAt && (
              <>
                {' '}
                · reviewed{' '}
                {saved.reviewedBy && (
                  <>
                    by <UserLink user={saved.reviewedBy} />{' '}
                  </>
                )}
                <Time value={saved.reviewedAt} />
              </>
            )}
          </span>
        )}
      </div>
      {saved?.reviewNote && <blockquote className="st-review-note">{saved.reviewNote}</blockquote>}

      {kind === 'riddle' ? (
        <>
          <fieldset className="gc-fieldset">
            <legend>The question</legend>
            <TranslatedField label="Question" original={ku('question')} value={String(draft.question ?? '')} onChange={(v) => set('question', v)} locale={locale} readOnly={readOnly} required multiline />
            {((draft.hints as string[] | undefined) ?? []).map((h, i) => (
              <TranslatedField
                key={i}
                label={`Hint ${i + 1}`}
                original={{ text: String(((kurdish.hints as string[] | undefined) ?? [])[i] ?? '—'), dialect: row.dialect }}
                value={h}
                onChange={(v) => setDraft({ ...draft, hints: ((draft.hints as string[]) ?? []).map((x, j) => (j === i ? v : x)) })}
                locale={locale}
                readOnly={readOnly}
                required
              />
            ))}
            {hints !== undefined && ((draft.hints as string[] | undefined) ?? []).length !== hints && !readOnly && (
              <Button onClick={() => setDraft({ ...draft, hints: Array.from({ length: hints }, (_, i) => ((draft.hints as string[] | undefined) ?? [])[i] ?? '') })}>
                Match the riddle’s {hints} hint{hints === 1 ? '' : 's'}
              </Button>
            )}
          </fieldset>
          <fieldset className="gc-fieldset gc-answer">
            <legend>The answer</legend>
            <TranslatedField label="Answer" original={ku('answer')} value={String(draft.answer ?? '')} onChange={(v) => set('answer', v)} locale={locale} readOnly={readOnly} required />
            <TranslatedField
              label="Why it is right"
              hint="Where the wordplay cannot be translated, say what the Kurdish plays on."
              original={ku('explanation')}
              value={String(draft.explanation ?? '')}
              onChange={(v) => set('explanation', v)}
              locale={locale}
              readOnly={readOnly}
              required
              multiline
            />
          </fieldset>
        </>
      ) : (
        <fieldset className="gc-fieldset">
          <legend>The proverb</legend>
          <TranslatedField label="A natural rendering" hint="Keep its rhythm and image where you can." original={ku('text')} value={String(draft.translation ?? '')} onChange={(v) => set('translation', v)} locale={locale} readOnly={readOnly} required />
          <TranslatedField label="Word for word" hint="Only where it differs from the rendering and helps." value={String(draft.literal ?? '')} onChange={(v) => set('literal', v, false)} locale={locale} readOnly={readOnly} />
          <TranslatedField label="What it means" hint="One sentence." value={String(draft.meaning ?? '')} onChange={(v) => set('meaning', v)} locale={locale} readOnly={readOnly} required />
          <TranslatedField label="Explanation" hint="The image, why it means that, when people say it." value={String(draft.explanation ?? '')} onChange={(v) => set('explanation', v)} locale={locale} readOnly={readOnly} required multiline />
          <TranslatedField label="A little scene" original={ku('exampleKu')} value={String(draft.example ?? '')} onChange={(v) => set('example', v)} locale={locale} readOnly={readOnly} required multiline />
          <TranslatedField label="The same in this language" hint="A real proverb of this language with the same sense, only if one exists." value={String(draft.equivalent ?? '')} onChange={(v) => set('equivalent', v, false)} locale={locale} readOnly={readOnly} />
          <TranslatedField label="Background" hint="Cultural or historical context, where there is some." value={String(draft.context ?? '')} onChange={(v) => set('context', v, false)} locale={locale} readOnly={readOnly} multiline />
        </fieldset>
      )}

      {!checked.ok && (changed || saved) && (
        <Banner tone="warn" title={`${checked.issues.length} to fix before this language can be saved`}>
          <ul className="gc-issues">
            {checked.issues.map((i, n) => (
              <li key={n}>
                <code>{i.path || '(the translation)'}</code> {i.message}
              </li>
            ))}
          </ul>
        </Banner>
      )}
      {readOnly ? (
        <p className="subtle">Archived content is not translated.</p>
      ) : (
        <>
          <Field label="Review note" hint="What was checked in this language, or what still needs a fluent reader.">
            <textarea rows={2} value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <FormActions>
            {saved?.reviewStatus === 'reviewed' ? (
              <Button onClick={() => onReview('unreviewed', note || null)} disabled={busy}>
                Needs review
              </Button>
            ) : (
              saved && (
                <Button icon="check" onClick={() => onReview('reviewed', note || null)} disabled={busy || changed || saved.issues.length > 0}>
                  Mark reviewed
                </Button>
              )
            )}
            <Button variant="primary" onClick={() => onSave(draft)} disabled={busy || !changed || !checked.ok}>
              Save this language
            </Button>
          </FormActions>
          {changed && saved?.reviewStatus === 'reviewed' && <p className="field-error">Saving a change marks this language as needing review again.</p>}
        </>
      )}
    </div>
  );
}

/**
 * A riddle's or a proverb's translations, a tab per app language: the row's
 * own language is the original, edited above; every other one is saved and
 * reviewed here on its own, whatever the row's state.
 */
export function TranslationsPanel({ row, onSaved }: { row: AdminGameContent; onSaved: (row: AdminGameContent) => void }): React.JSX.Element {
  const toast = useToast();
  const own = originalLocale(row.dialect);
  const [locale, setLocale] = useState<AppLocale>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const translations = row.translations ?? {};
  const others = APP_LOCALE_CODES.filter((c) => c !== own);
  const reviewed = others.filter((c) => translations[c]?.reviewStatus === 'reviewed').length;
  const missing = others.filter((c) => !translations[c]).length;

  const run = async (what: string, fn: () => Promise<AdminGameContent>, done: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await fn());
      toast.success(done);
    } catch (err) {
      setError(errorLine(err, what));
    } finally {
      setBusy(false);
    }
  };

  const saved = translations[locale];
  return (
    <Section
      title="Translations"
      description={`Every language but ${localeName(own)}, the one it is written in. Each is saved and reviewed on its own: correcting one keeps the ${row.kind === 'riddle' ? 'riddle' : 'proverb'} ${row.status === 'published' ? 'published' : 'where it is'} and its Kurdish approved, and marks only that language as needing review.`}
    >
      <Note>
        {reviewed} of {others.length} languages reviewed{missing > 0 ? `, ${missing} not translated yet` : ''}.
      </Note>
      <Tabs
        label="Language"
        value={locale}
        onChange={(next) => {
          setLocale(next);
          setError(null);
        }}
        items={APP_LOCALE_CODES.map((c) => ({
          key: c,
          label: c === own ? `${localeName(c)} (original)` : `${localeName(c)}${translations[c] ? (translations[c]!.reviewStatus === 'reviewed' ? ' · reviewed' : ' · to review') : ' · missing'}`,
        }))}
      />
      {locale === own ? (
        <p className="subtle">This is the language the {row.kind === 'riddle' ? 'riddle' : 'proverb'} is written in: it is edited above, and reviewed with the row.</p>
      ) : (
        <TranslationForm
          key={`${locale}:${saved?.updatedAt ?? 'new'}:${saved?.reviewStatus ?? ''}`}
          row={row}
          locale={locale}
          saved={saved}
          busy={busy}
          onSave={(payload) => void run(`the ${localeName(locale)} translation`, () => saveTranslation(row.id, locale, payload), `${localeName(locale)} saved.`)}
          onReview={(status, note) =>
            void run(
              `the ${localeName(locale)} review`,
              () => reviewTranslation(row.id, locale, status, note),
              status === 'reviewed' ? `${localeName(locale)} marked reviewed.` : `${localeName(locale)} marked as needing review.`,
            )
          }
        />
      )}
      {error && <p className="field-error">{error}</p>}
    </Section>
  );
}
