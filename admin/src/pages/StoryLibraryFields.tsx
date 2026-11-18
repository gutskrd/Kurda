import { useContext } from 'react';
import {
  QUESTION_EXPLANATION_MAX,
  STORY_ATTRIBUTION_NOTE_MAX,
  STORY_AUTHOR_MAX,
  STORY_COVERS,
  STORY_NOTES_MAX,
  STORY_NOTE_BODY_MAX,
  STORY_NOTE_KINDS,
  STORY_NOTE_TITLE_MAX,
  STORY_READING_MINUTES_MAX,
  STORY_REFLECTIONS_MAX,
  STORY_REFLECTION_MAX,
  STORY_SOURCES_MAX,
  STORY_SOURCE_MAX,
  STORY_SOURCE_NOTE_MAX,
  STORY_SOURCE_TYPES,
  STORY_SOURCE_URL_MAX,
  STORY_SUMMARY_MAX,
  STORY_TITLE_MAX,
  STORY_TRADITIONS,
  STORY_TRANSLATION_MAX,
  localeDir,
  storyCover,
  storyCoverPath,
  storyTextDirection,
  type AppLocale,
  type StoryCategory,
  type StoryProblem,
  type StoryTranslationReviewStatus,
} from '@kurda/shared';
import { artSrc } from '../shop/art';
import {
  NOTE_KIND_NAME,
  SOURCE_TYPE_NAME,
  TRADITION_HINT,
  TRADITION_NAME,
  TRANSLATION_REVIEW_NAME,
  fieldId,
  localeCoverage,
  localeProblems,
  localeReview,
  translationChecks,
  type AdminStory,
  type EditorAction,
  type LibraryTextField,
  type StoryForm,
  type TextFacts,
} from '../stories';
import { localeName } from '../format';
import { Badge, Button, Checkbox, Icon, Note, Time, type Loaded } from '../ui';
import { CATEGORIES_HREF } from './StoryList';
import { EditorSection, Field, ProblemList, ReadOnly, described, type ProblemsAt } from './StoryEditorFields';

/**
 * The editor's library sections: filing and display (category, origin, cover, reading time, featured), attribution and
 * sources, what comes after reading, and the translations, each language saved and reviewed on its own. The text,
 * glossary and questions stay in StoryEditor.tsx.
 */

/** The library's fields of the About section: category, tradition, cover, reading time, featured. */
export function LibraryFields({
  form,
  dispatch,
  at,
  facts,
  categories,
  story,
  featuring,
  onFeature,
}: {
  form: StoryForm;
  dispatch: (a: EditorAction) => void;
  at: ProblemsAt;
  facts: TextFacts;
  categories: Loaded<StoryCategory[]>;
  story: AdminStory | null;
  /** A feature request is out. */
  featuring: boolean;
  onFeature: (featured: boolean) => void;
}): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const lib = form.library;
  const known = categories.data ?? [];
  const category = lib.category ?? '';
  const unknownCategory = category !== '' && categories.data !== undefined && !known.some((c) => c.slug === category);
  const featurable = story !== null && story.status !== 'archived';

  return (
    <>
      <div className="st-grid2">
        <Field
          path="category"
          label="Category"
          problems={at('category')}
          hint={
            <>
              Where the library files it; a story needs one to be published.{' '}
              <a href={CATEGORIES_HREF}>Manage the categories</a>
            </>
          }
        >
          <select
            {...described('category', at('category'))}
            disabled={ro || (categories.loading && !categories.data)}
            value={category}
            onChange={(e) => dispatch({ type: 'lib/category', value: e.target.value === '' ? null : e.target.value })}
          >
            <option value="">{categories.error ? 'Not filed yet (the categories could not be loaded)' : 'Not filed yet'}</option>
            {known.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name.en}
              </option>
            ))}
            {/* A category deleted since the story was filed stays on the story until the editor chooses another. */}
            {unknownCategory && <option value={category}>{category} (no longer a category)</option>}
          </select>
        </Field>
        <Field
          path="readingMinutes"
          label="Reading time"
          optional
          problems={at('readingMinutes')}
          hint={`In minutes. Left empty, learners see the estimate from the word count: about ${facts.minutes} min.`}
        >
          <input
            {...described('readingMinutes', at('readingMinutes'))}
            type="number"
            inputMode="numeric"
            min={1}
            max={STORY_READING_MINUTES_MAX}
            step={1}
            readOnly={ro}
            placeholder={String(facts.minutes)}
            value={lib.readingMinutes ?? ''}
            onChange={(e) => {
              const n = e.target.value === '' ? null : Number(e.target.value);
              dispatch({ type: 'lib/minutes', value: n === null || Number.isNaN(n) ? null : n });
            }}
          />
        </Field>
      </div>

      <fieldset className="st-choice" id={fieldId('tradition')} tabIndex={-1} disabled={ro}>
        <legend>Tradition</legend>
        {STORY_TRADITIONS.map((t) => (
          <label key={t} className={`st-choice-option${lib.tradition === t ? ' is-on' : ''}`}>
            <input type="radio" name="story-tradition" value={t} checked={lib.tradition === t} onChange={() => dispatch({ type: 'lib/tradition', value: t })} />
            <span>
              <strong>{TRADITION_NAME[t]}</strong>
              <span className="subtle"> — {TRADITION_HINT[t]}</span>
            </span>
          </label>
        ))}
        <ProblemList id={`${fieldId('tradition')}-problems`} problems={at('tradition')} />
      </fieldset>

      <CoverPicker value={lib.cover} onChange={(cover) => dispatch({ type: 'lib/cover', value: cover })} problems={at} />

      <div className="st-featured">
        <Checkbox
          label="Featured in the library"
          hint={
            !story
              ? 'Save the story first. Featuring is an editor’s pick for the library’s Featured row.'
              : story.status === 'archived'
                ? 'An archived story cannot be featured.'
                : 'An editor’s pick for the library’s Featured row. A library decision, saved at once: it does not need the story to be reviewed again.'
          }
          checked={story?.featured ?? false}
          disabled={!featurable || featuring}
          onChange={onFeature}
        />
      </div>
    </>
  );
}

/** The cover: a shared background, or none, when the apps give the story one of the seven kilims (`storyCoverFor`). */
function CoverPicker({ value, onChange, problems }: { value: string | null; onChange: (cover: string | null) => void; problems: ProblemsAt }): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const current = storyCover(value);
  // A key the catalogue no longer has is kept and shown, so a save does not quietly drop it.
  const unknown = value && !current ? value : null;
  const tile = (key: string | null, label: string, sub: string | undefined, picture: string | null): React.JSX.Element => {
    const on = (value ?? null) === key;
    return (
      <button
        key={key ?? 'none'}
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={label}
        className={`st-cover${on ? ' is-on' : ''}`}
        disabled={ro}
        onClick={() => {
          if (!on) onChange(key);
        }}
      >
        <span className={`st-cover-pic${picture ? '' : ' is-plain'}`} aria-hidden="true">
          {picture ? <img src={picture} alt="" loading="lazy" width={160} height={90} /> : <Icon name="none" size={18} />}
        </span>
        <span className="st-cover-name">{label}</span>
        {sub && (
          <span className="st-cover-sub" lang="ku">
            {sub}
          </span>
        )}
      </button>
    );
  };
  return (
    <div className="st-field" id={fieldId('cover')} tabIndex={-1}>
      <div className="st-label-row">
        <span className="st-legend" id="st-cover-label">
          Cover
        </span>
        <span className="subtle st-counter">{current ? current.en : unknown ? `${unknown} (not a picture the apps have)` : 'None'}</span>
      </div>
      <div className="st-covers" role="radiogroup" aria-labelledby="st-cover-label">
        {tile(null, 'None', undefined, null)}
        {unknown && tile(unknown, unknown, 'not a picture the apps have', null)}
        {STORY_COVERS.map((c) => tile(c.key, c.en, c.ku, artSrc(storyCoverPath(c.key))))}
      </div>
      <div className="subtle st-hint">The picture over the story’s title in the library and the reader. Without one, the apps lay the story on one of the seven kilims, always the same one for this story.</div>
      <ProblemList id={`${fieldId('cover')}-problems`} problems={problems('cover')} />
    </div>
  );
}

const TEXT_FIELDS: ReadonlyArray<{ field: LibraryTextField; label: string; max: number; hint: string; type?: string }> = [
  { field: 'author', label: 'Author', max: STORY_AUTHOR_MAX, hint: 'Who wrote or retold it, as the reader is told: a name, or “Folk tale, retold for learners”.' },
  { field: 'source', label: 'Source', max: STORY_SOURCE_MAX, hint: 'The collection, teller, region or publication it comes from. A traditional or adapted story should name one.' },
  { field: 'sourceUrl', label: 'Source address', max: STORY_SOURCE_URL_MAX, hint: 'A web address for the source, starting with https://.', type: 'url' },
];

/** Author, source and the attribution note, with the editorial rules beside them. */
export function AttributionSection({ form, dispatch, at }: { form: StoryForm; dispatch: (a: EditorAction) => void; at: ProblemsAt }): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const lib = form.library;
  return (
    <EditorSection id="attribution" title="Attribution">
      <div className="st-grid2">
        {TEXT_FIELDS.map(({ field, label, max, hint, type }) => (
          <Field key={field} path={field} label={label} optional problems={at(field)} hint={hint} counter={{ n: (lib[field] ?? '').trim().length, max }}>
            <input
              {...described(field, at(field))}
              type={type ?? 'text'}
              readOnly={ro}
              lang={field === 'sourceUrl' ? 'en' : undefined}
              dir={field === 'sourceUrl' ? 'ltr' : 'auto'}
              spellCheck={field === 'sourceUrl' ? false : undefined}
              value={lib[field] ?? ''}
              onChange={(e) => dispatch({ type: 'lib/text', field, value: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <Field
        path="attributionNote"
        label="Attribution note"
        optional
        problems={at('attributionNote')}
        hint="Shown under the story: how the oral versions differ, a licence remark, “a legend, not verified history”."
        counter={{ n: (lib.attributionNote ?? '').trim().length, max: STORY_ATTRIBUTION_NOTE_MAX }}
      >
        <textarea
          {...described('attributionNote', at('attributionNote'))}
          readOnly={ro}
          rows={3}
          dir="auto"
          value={lib.attributionNote ?? ''}
          onChange={(e) => dispatch({ type: 'lib/text', field: 'attributionNote', value: e.target.value })}
        />
      </Field>
      <SourcesList form={form} dispatch={dispatch} at={at} />
      <Note>
        The editorial rules: traditional material is attributed to where it comes from; variations between tellings are acknowledged in the
        note rather than smoothed over; a legend is presented as a legend, not as history; and a story written for learners is never presented as
        folklore.
      </Note>
    </EditorSection>
  );
}

/** The sources a telling draws on, each with what kind of source it is; the reader lists them under the story. */
function SourcesList({ form, dispatch, at }: { form: StoryForm; dispatch: (a: EditorAction) => void; at: ProblemsAt }): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const sources = form.library.sources ?? [];
  return (
    <div className="st-field st-sources" id={fieldId('sources')} tabIndex={-1}>
      <div className="st-label-row">
        <span className="st-legend">Sources</span>
        <span className="subtle st-counter">
          {sources.length} / {STORY_SOURCES_MAX}
        </span>
      </div>
      <div className="subtle st-hint">Where a legend’s telling comes from, one per source: a chronicle, a collected legend, a teller, an epic, an adaptation.</div>
      <ProblemList id={`${fieldId('sources')}-problems`} problems={at('sources')} />
      {sources.map((src, i) => {
        const base = `sources[${i}]`;
        return (
          <div key={i} className="st-source" id={fieldId(base)} tabIndex={-1}>
            <div className="st-grid2">
              <Field path={`${base}.title`} label={`Source ${i + 1}`} problems={at(`${base}.title`)} counter={{ n: src.title.trim().length, max: STORY_SOURCE_MAX }}>
                <input
                  {...described(`${base}.title`, at(`${base}.title`))}
                  readOnly={ro}
                  dir="auto"
                  value={src.title}
                  onChange={(e) => dispatch({ type: 'source/set', index: i, field: 'title', value: e.target.value })}
                />
              </Field>
              <Field path={`${base}.type`} label="Kind" problems={at(`${base}.type`)}>
                <select
                  {...described(`${base}.type`, at(`${base}.type`))}
                  disabled={ro}
                  value={src.type}
                  onChange={(e) => dispatch({ type: 'source/set', index: i, field: 'type', value: e.target.value })}
                >
                  {STORY_SOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SOURCE_TYPE_NAME[t]}
                    </option>
                  ))}
                  {!(STORY_SOURCE_TYPES as readonly string[]).includes(src.type) && <option value={src.type}>{src.type || 'Not chosen'}</option>}
                </select>
              </Field>
              <Field path={`${base}.author`} label="Author or teller" optional problems={at(`${base}.author`)}>
                <input
                  {...described(`${base}.author`, at(`${base}.author`))}
                  readOnly={ro}
                  dir="auto"
                  maxLength={STORY_AUTHOR_MAX + 40}
                  value={src.author ?? ''}
                  onChange={(e) => dispatch({ type: 'source/set', index: i, field: 'author', value: e.target.value })}
                />
              </Field>
              <Field path={`${base}.url`} label="Address" optional problems={at(`${base}.url`)} hint="Starting with https://.">
                <input
                  {...described(`${base}.url`, at(`${base}.url`))}
                  type="url"
                  readOnly={ro}
                  lang="en"
                  dir="ltr"
                  spellCheck={false}
                  value={src.url ?? ''}
                  onChange={(e) => dispatch({ type: 'source/set', index: i, field: 'url', value: e.target.value })}
                />
              </Field>
            </div>
            <Field path={`${base}.note`} label="Note" optional problems={at(`${base}.note`)} counter={{ n: (src.note ?? '').trim().length, max: STORY_SOURCE_NOTE_MAX }}>
              <input
                {...described(`${base}.note`, at(`${base}.note`))}
                readOnly={ro}
                dir="auto"
                value={src.note ?? ''}
                onChange={(e) => dispatch({ type: 'source/set', index: i, field: 'note', value: e.target.value })}
              />
            </Field>
            <button type="button" className="ghost st-remove" disabled={ro} aria-label={`Remove source ${i + 1}`} onClick={() => dispatch({ type: 'source/remove', index: i })}>
              Remove
            </button>
          </div>
        );
      })}
      {!ro && sources.length < STORY_SOURCES_MAX && (
        <button type="button" className="st-add" onClick={() => dispatch({ type: 'source/add' })}>
          Add a source
        </button>
      )}
    </div>
  );
}

/**
 * What the reader is offered after the story: unscored questions to think about, and notes on history and legend,
 * tellings or customs, in the story's variety (their translations are under Translations).
 */
export function AfterReadingSection({ form, dispatch, at }: { form: StoryForm; dispatch: (a: EditorAction) => void; at: ProblemsAt }): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const script = storyTextDirection(form.dialect);
  const reflections = form.library.reflections ?? [];
  const notes = form.library.notes ?? [];
  return (
    <EditorSection
      id="after"
      title="After reading"
      hint="Open questions to think about, with no right answer, and notes beside the story. A legend has a few of each; a short story may have none."
    >
      <div className="st-field" id={fieldId('reflections')} tabIndex={-1}>
        <div className="st-label-row">
          <span className="st-legend">To think about</span>
          <span className="subtle st-counter">
            {reflections.length} / {STORY_REFLECTIONS_MAX}
          </span>
        </div>
        <ProblemList id={`${fieldId('reflections')}-problems`} problems={at('reflections')} />
        {reflections.map((r, i) => {
          const path = `reflections[${i}].text`;
          return (
            <div key={i} className="st-reflection">
              <Field path={path} label={`Question ${i + 1}`} problems={at(path)} counter={{ n: r.text.trim().length, max: STORY_REFLECTION_MAX }}>
                <textarea
                  {...described(path, at(path))}
                  readOnly={ro}
                  rows={2}
                  lang={script.lang}
                  dir={script.dir}
                  value={r.text}
                  onChange={(e) => dispatch({ type: 'reflection/set', index: i, value: e.target.value })}
                />
              </Field>
              <button type="button" className="ghost st-remove" disabled={ro} aria-label={`Remove question to think about ${i + 1}`} onClick={() => dispatch({ type: 'reflection/remove', index: i })}>
                Remove
              </button>
            </div>
          );
        })}
        {!ro && reflections.length < STORY_REFLECTIONS_MAX && (
          <button type="button" className="st-add" onClick={() => dispatch({ type: 'reflection/add' })}>
            Add a question to think about
          </button>
        )}
      </div>

      <div className="st-field" id={fieldId('notes')} tabIndex={-1}>
        <div className="st-label-row">
          <span className="st-legend">Notes</span>
          <span className="subtle st-counter">
            {notes.length} / {STORY_NOTES_MAX}
          </span>
        </div>
        <ProblemList id={`${fieldId('notes')}-problems`} problems={at('notes')} />
        {notes.map((n, i) => {
          const base = `notes[${i}]`;
          return (
            <div key={i} className="st-note" id={fieldId(base)} tabIndex={-1}>
              <div className="st-grid2">
                <Field path={`${base}.kind`} label={`Note ${i + 1} is about`} problems={at(`${base}.kind`)}>
                  <select
                    {...described(`${base}.kind`, at(`${base}.kind`))}
                    disabled={ro}
                    value={n.kind}
                    onChange={(e) => dispatch({ type: 'note/set', index: i, field: 'kind', value: e.target.value })}
                  >
                    {STORY_NOTE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {NOTE_KIND_NAME[k]}
                      </option>
                    ))}
                    {!(STORY_NOTE_KINDS as readonly string[]).includes(n.kind) && <option value={n.kind}>{n.kind || 'Not chosen'}</option>}
                  </select>
                </Field>
                <Field path={`${base}.title`} label="Title" problems={at(`${base}.title`)} counter={{ n: n.title.trim().length, max: STORY_NOTE_TITLE_MAX }}>
                  <input
                    {...described(`${base}.title`, at(`${base}.title`))}
                    readOnly={ro}
                    lang={script.lang}
                    dir={script.dir}
                    value={n.title}
                    onChange={(e) => dispatch({ type: 'note/set', index: i, field: 'title', value: e.target.value })}
                  />
                </Field>
              </div>
              <Field path={`${base}.body`} label="Text" problems={at(`${base}.body`)} counter={{ n: n.body.trim().length, max: STORY_NOTE_BODY_MAX }}>
                <textarea
                  {...described(`${base}.body`, at(`${base}.body`))}
                  readOnly={ro}
                  rows={4}
                  lang={script.lang}
                  dir={script.dir}
                  value={n.body}
                  onChange={(e) => dispatch({ type: 'note/set', index: i, field: 'body', value: e.target.value })}
                />
              </Field>
              <button type="button" className="ghost st-remove" disabled={ro} aria-label={`Remove note ${i + 1}`} onClick={() => dispatch({ type: 'note/remove', index: i })}>
                Remove
              </button>
            </div>
          );
        })}
        {!ro && notes.length < STORY_NOTES_MAX && (
          <button type="button" className="st-add" onClick={() => dispatch({ type: 'note/add' })}>
            Add a note
          </button>
        )}
      </div>
    </EditorSection>
  );
}

/** What the Translations section needs to save or review one language on its own. */
export interface LocaleActions {
  /** The languages whose translation has unsaved edits. */
  changed: readonly string[];
  /** The languages the story has a saved translation in, of any part. */
  saved: readonly string[];
  /** Why no language can be saved on its own right now, or null when one can. */
  blocked: string | null;
  /** The language a request is out for. */
  busy: string | null;
  /** The problems the editor finds as it is typed, to hold a save of a language with its own. */
  blocking: readonly StoryProblem[];
  onSave: (locale: string) => void;
  onReview: (locale: string, status: StoryTranslationReviewStatus) => void;
}

/**
 * Everything of the story per interface language: the text paragraph by paragraph beside the Kurdish (the reader shows
 * each translation under its paragraph, so the counts must match), the title and summary, questions, reflections and
 * notes. Each language is saved on its own, keeping a published story online and approved, and reviewed by a native
 * speaker.
 */
export function TranslationsSection({
  form,
  dispatch,
  at,
  facts,
  story,
  readOnly,
  locales,
}: {
  form: StoryForm;
  dispatch: (a: EditorAction) => void;
  at: ProblemsAt;
  facts: TextFacts;
  story: AdminStory | null;
  /** The translations can be edited while the rest of a published story cannot: only an archived story or a request out stops them. */
  readOnly: boolean;
  locales: LocaleActions;
}): React.JSX.Element {
  const checks = translationChecks(form);
  const done = checks.filter((c) => c.state === 'ok').length;
  const script = storyTextDirection(form.dialect);
  return (
    <ReadOnly.Provider value={readOnly}>
      <EditorSection
        id="translations"
        title="Translations"
        count={`(${done} of ${checks.length})`}
        hint="The whole story in an interface language: the text paragraph for paragraph (separate the paragraphs with an empty line, as in the text, and start a translated heading with “## ” too), its title, its questions and what is offered after reading. A learner reading in that language sees it beside the Kurdish; English is what the others fall back to. Each language is saved on its own, a published story’s too, and stays marked as needing review until a native speaker has read it."
      >
        {checks.map((c) => {
          const path = `translations.${c.locale}`;
          const problems = at(path);
          const review = story?.translationReview?.[c.locale];
          return (
            <details key={c.locale} className="st-translation" id={`story-locale-${c.locale}`} open={c.state !== 'empty' || problems.error.length > 0}>
              <summary>
                <span className="st-translation-name">{localeName(c.locale)}</span>{' '}
                {c.state === 'empty' ? (
                  <Badge>Not translated</Badge>
                ) : (
                  <Badge tone={c.state === 'ok' ? 'ok' : 'bad'}>
                    paragraphs: {c.paragraphs} of {c.expected}
                  </Badge>
                )}
                {review && (
                  <>
                    {' '}
                    <Badge tone={review.status === 'reviewed' ? 'ok' : 'warn'}>{TRANSLATION_REVIEW_NAME[review.status]}</Badge>
                  </>
                )}
              </summary>
              <div className="st-translation-body">
                <div className="st-field">
                  <label htmlFor={fieldId(path)} className="sr-only">
                    Translation in {localeName(c.locale)}
                  </label>
                  <TranslationTextarea locale={c.locale} path={path} problems={problems} rows={Math.max(6, Math.min(18, c.expected * 4))} value={c.text} dispatch={dispatch} />
                  <ProblemList id={`${fieldId(path)}-problems`} problems={problems} />
                </div>
                {facts.paragraphs.length > 0 && (
                  <ol className="st-translation-source" lang={script.lang} dir={script.dir} aria-label="The text, paragraph by paragraph">
                    {facts.paragraphs.map((p, i) => (
                      <li key={i} className={p.heading !== null ? 'is-heading' : undefined}>
                        {p.text}
                      </li>
                    ))}
                  </ol>
                )}
                <LocaleParts locale={c.locale} form={form} dispatch={dispatch} at={at} />
                <LocaleFooter locale={c.locale} story={story} locales={locales} />
              </div>
            </details>
          );
        })}
      </EditorSection>
    </ReadOnly.Provider>
  );
}

function TranslationTextarea({
  locale,
  path,
  problems,
  rows,
  value,
  dispatch,
}: {
  locale: string;
  path: string;
  problems: ReturnType<ProblemsAt>;
  rows: number;
  value: string;
  dispatch: (a: EditorAction) => void;
}): React.JSX.Element {
  const ro = useContext(ReadOnly);
  return (
    <textarea
      {...described(path, problems)}
      readOnly={ro}
      rows={rows}
      lang={locale}
      dir={localeDir(locale as AppLocale)}
      maxLength={STORY_TRANSLATION_MAX + 200}
      value={value}
      onChange={(e) => dispatch({ type: 'translation', locale, value: e.target.value })}
    />
  );
}

/** One language's title and summary, questions, reflections and notes, each beside the Kurdish it translates. */
function LocaleParts({ locale, form, dispatch, at }: { locale: string; form: StoryForm; dispatch: (a: EditorAction) => void; at: ProblemsAt }): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const script = storyTextDirection(form.dialect);
  const dir = localeDir(locale as AppLocale);
  const meta = form.library.metaTranslations?.[locale] ?? {};
  const original = (text: string): React.JSX.Element => (
    <div className="subtle st-tr-original" lang={script.lang} dir={script.dir}>
      {text || '—'}
    </div>
  );
  const metaPath = (field: 'title' | 'summary') => `metaTranslations.${locale}.${field}`;
  const cover = localeCoverage(form, locale);
  const tally = [
    `title ${cover.title ? '✓' : '—'}`,
    cover.questions.total > 0 ? `questions ${cover.questions.done} of ${cover.questions.total}` : null,
    cover.reflections.total > 0 ? `to think about ${cover.reflections.done} of ${cover.reflections.total}` : null,
    cover.notes.total > 0 ? `notes ${cover.notes.done} of ${cover.notes.total}` : null,
  ].filter((t) => t !== null);
  return (
    <div className="st-tr-parts">
      <div className="subtle st-tr-tally">In {localeName(locale)}: {tally.join(' · ')}</div>
      <div className="st-grid2">
        <Field path={metaPath('title')} label="Title" optional problems={at(metaPath('title'))} counter={{ n: (meta.title ?? '').trim().length, max: STORY_TITLE_MAX }}>
          <input
            {...described(metaPath('title'), at(metaPath('title')))}
            readOnly={ro}
            lang={locale}
            dir={dir}
            value={meta.title ?? ''}
            onChange={(e) => dispatch({ type: 'tr/meta', locale, field: 'title', value: e.target.value })}
          />
          {original(form.title)}
        </Field>
        <Field path={metaPath('summary')} label="Summary" optional problems={at(metaPath('summary'))} counter={{ n: (meta.summary ?? '').trim().length, max: STORY_SUMMARY_MAX }}>
          <input
            {...described(metaPath('summary'), at(metaPath('summary')))}
            readOnly={ro}
            lang={locale}
            dir={dir}
            value={meta.summary ?? ''}
            onChange={(e) => dispatch({ type: 'tr/meta', locale, field: 'summary', value: e.target.value })}
          />
          {original(form.summary)}
        </Field>
      </div>

      {form.questions.length > 0 && (
        <fieldset className="st-tr-group">
          <legend>Questions</legend>
          {form.questions.map((q, i) => {
            const base = `questions[${i}].translations.${locale}`;
            const t = q.translations[locale];
            return (
              <div key={q.key} className="st-tr-question" id={fieldId(base)} tabIndex={-1}>
                <Field path={`${base}.prompt`} label={`Question ${i + 1}`} problems={at(`${base}.prompt`)}>
                  <input
                    {...described(`${base}.prompt`, at(`${base}.prompt`))}
                    readOnly={ro}
                    lang={locale}
                    dir={dir}
                    value={t?.prompt ?? ''}
                    onChange={(e) => dispatch({ type: 'tr/question', locale, index: i, field: 'prompt', value: e.target.value })}
                  />
                  {original(q.prompt)}
                </Field>
                <div className="st-tr-options" id={fieldId(`${base}.options`)} tabIndex={-1}>
                  {q.options.map((option, o) => {
                    const path = `${base}.options[${o}]`;
                    return (
                      <div key={o} className="st-tr-option">
                        <input
                          {...described(path, at(path))}
                          aria-label={`Question ${i + 1}, option ${o + 1}${o === q.correctIndex ? ' (the right one)' : ''}`}
                          readOnly={ro}
                          lang={locale}
                          dir={dir}
                          value={t?.options[o] ?? ''}
                          onChange={(e) => dispatch({ type: 'tr/option', locale, index: i, option: o, value: e.target.value })}
                        />
                        <span className="subtle st-tr-original" lang={script.lang} dir={script.dir}>
                          {o === q.correctIndex ? '✓ ' : ''}
                          {option || '—'}
                        </span>
                        <ProblemList id={`${fieldId(path)}-problems`} problems={at(path)} />
                      </div>
                    );
                  })}
                  <ProblemList id={`${fieldId(`${base}.options`)}-problems`} problems={at(`${base}.options`)} />
                </div>
                <Field
                  path={`${base}.explanation`}
                  label="Explanation"
                  optional
                  problems={at(`${base}.explanation`)}
                  counter={{ n: (t?.explanation ?? '').trim().length, max: QUESTION_EXPLANATION_MAX, soft: 120 }}
                >
                  <input
                    {...described(`${base}.explanation`, at(`${base}.explanation`))}
                    readOnly={ro}
                    lang={locale}
                    dir={dir}
                    value={t?.explanation ?? ''}
                    onChange={(e) => dispatch({ type: 'tr/question', locale, index: i, field: 'explanation', value: e.target.value })}
                  />
                  {original(q.explanation)}
                </Field>
              </div>
            );
          })}
        </fieldset>
      )}

      {(form.library.reflections ?? []).length > 0 && (
        <fieldset className="st-tr-group">
          <legend>To think about</legend>
          {(form.library.reflections ?? []).map((r, i) => {
            const path = `reflections[${i}].translations.${locale}`;
            return (
              <Field key={i} path={path} label={`Question ${i + 1}`} problems={at(path)} counter={{ n: (r.translations?.[locale] ?? '').trim().length, max: STORY_REFLECTION_MAX }}>
                <input
                  {...described(path, at(path))}
                  readOnly={ro}
                  lang={locale}
                  dir={dir}
                  value={r.translations?.[locale] ?? ''}
                  onChange={(e) => dispatch({ type: 'tr/reflection', locale, index: i, value: e.target.value })}
                />
                {original(r.text)}
              </Field>
            );
          })}
        </fieldset>
      )}

      {(form.library.notes ?? []).length > 0 && (
        <fieldset className="st-tr-group">
          <legend>Notes</legend>
          {(form.library.notes ?? []).map((n, i) => {
            const base = `notes[${i}].translations.${locale}`;
            const t = n.translations?.[locale];
            return (
              <div key={i} className="st-tr-note" id={fieldId(base)} tabIndex={-1}>
                <Field path={`${base}.title`} label={`Note ${i + 1}: title`} problems={at(`${base}.title`)}>
                  <input
                    {...described(`${base}.title`, at(`${base}.title`))}
                    readOnly={ro}
                    lang={locale}
                    dir={dir}
                    value={t?.title ?? ''}
                    onChange={(e) => dispatch({ type: 'tr/note', locale, index: i, field: 'title', value: e.target.value })}
                  />
                  {original(n.title)}
                </Field>
                <Field path={`${base}.body`} label={`Note ${i + 1}: text`} problems={at(`${base}.body`)} counter={{ n: (t?.body ?? '').trim().length, max: STORY_NOTE_BODY_MAX }}>
                  <textarea
                    {...described(`${base}.body`, at(`${base}.body`))}
                    readOnly={ro}
                    rows={3}
                    lang={locale}
                    dir={dir}
                    value={t?.body ?? ''}
                    onChange={(e) => dispatch({ type: 'tr/note', locale, index: i, field: 'body', value: e.target.value })}
                  />
                  {original(n.body)}
                </Field>
              </div>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}

/** One language's review, and the buttons that save it or mark it reviewed on its own. */
function LocaleFooter({ locale, story, locales }: { locale: string; story: AdminStory | null; locales: LocaleActions }): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const name = localeName(locale);
  const review = localeReview(story, locale);
  const changed = locales.changed.includes(locale);
  const own = localeProblems(locales.blocking, locale).length;
  const busy = locales.busy === locale;
  const saveWhy = locales.blocked ?? (own > 0 ? `Fix the ${own === 1 ? 'problem' : `${own} problems`} marked “Must fix” in the ${name} translation first.` : null);
  const canSave = !ro && changed && saveWhy === null;
  const canReview = !ro && story !== null && locales.saved.includes(locale) && !changed && locales.blocked === null;
  return (
    <div className="st-tr-footer">
      <div className="st-tr-review">
        {locales.saved.includes(locale) ? (
          <>
            <Badge tone={review.status === 'reviewed' ? 'ok' : 'warn'}>{TRANSLATION_REVIEW_NAME[review.status]}</Badge>
            {review.at && (
              <span className="subtle">
                {review.status === 'reviewed' ? 'Marked reviewed' : 'Marked as needing review'} <Time value={review.at} />
              </span>
            )}
            {review.note && <blockquote className="st-review-note">{review.note}</blockquote>}
          </>
        ) : (
          <span className="subtle">No {name} translation is saved yet.</span>
        )}
      </div>
      <div className="row st-tr-actions">
        <Button variant="primary" busy={busy} disabled={!canSave || locales.busy !== null} onClick={() => locales.onSave(locale)}>
          Save this language
        </Button>
        {review.status === 'reviewed' ? (
          <Button disabled={!canReview || locales.busy !== null} onClick={() => locales.onReview(locale, 'unreviewed')}>
            Needs review
          </Button>
        ) : (
          <Button icon="check" disabled={!canReview || locales.busy !== null} onClick={() => locales.onReview(locale, 'reviewed')}>
            Mark reviewed
          </Button>
        )}
      </div>
      {changed && saveWhy && <div className="subtle st-reason">{saveWhy}</div>}
      {changed && !saveWhy && (
        <div className="subtle st-reason">
          Unsaved changes in {name}.{story?.status === 'published' ? ' Saving keeps the story online and approved.' : ' Saving it alone keeps the approval.'}
        </div>
      )}
    </div>
  );
}
