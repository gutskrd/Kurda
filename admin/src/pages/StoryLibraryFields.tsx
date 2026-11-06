import { useContext } from 'react';
import {
  STORY_ATTRIBUTION_NOTE_MAX,
  STORY_AUTHOR_MAX,
  STORY_COVERS,
  STORY_READING_MINUTES_MAX,
  STORY_SOURCE_MAX,
  STORY_SOURCE_URL_MAX,
  STORY_TRADITIONS,
  STORY_TRANSLATION_MAX,
  localeDir,
  storyCover,
  storyCoverPath,
  storyTextDirection,
  type AppLocale,
  type StoryCategory,
  type StoryTradition,
} from '@kurda/shared';
import { artSrc } from '../shop/art';
import {
  TRADITION_HINT,
  TRADITION_NAME,
  fieldId,
  localeName,
  translationChecks,
  type AdminStory,
  type EditorAction,
  type LibraryTextField,
  type StoryForm,
  type TextFacts,
} from '../stories';
import { Badge, Checkbox, Icon, Note, type Loaded } from '../ui';
import { CATEGORIES_HREF } from './StoryList';
import { EditorSection, Field, ProblemList, ReadOnly, described, type ProblemsAt } from './StoryEditorFields';

/**
 * How a story is filed and shown in the library (its category, where it comes
 * from, its cover, its reading time, whether it is featured), who it is
 * attributed to, and its translations: the editor's library sections. The
 * text itself, the glossary and the questions stay in StoryEditor.tsx.
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
  /** a feature request is out */
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
            {/* a category deleted since the story was filed stays on the story until the editor chooses another */}
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

/** The cover: one of the shared backgrounds, or none (the apps then draw a quiet kilim band keyed by the category). */
function CoverPicker({ value, onChange, problems }: { value: string | null; onChange: (cover: string | null) => void; problems: ProblemsAt }): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const current = storyCover(value);
  // a key the catalogue no longer has is kept and shown, so a save does not quietly drop it
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
      <div className="subtle st-hint">The picture over the story’s title in the library and the reader. Without one, the apps draw a kilim band in the category’s colours.</div>
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
      <Note>
        The editorial rules: traditional material is attributed to where it comes from; variations between tellings are acknowledged in the
        note rather than smoothed over; a legend is presented as a legend, not as history; and a story written for learners is never presented as
        folklore.
      </Note>
    </EditorSection>
  );
}

/**
 * A full translation per interface language, each with the body's paragraphs
 * beside it so the editor can align them: the reader shows a paragraph's
 * translation under it, so the counts have to match.
 */
export function TranslationsSection({
  form,
  dispatch,
  at,
  facts,
}: {
  form: StoryForm;
  dispatch: (a: EditorAction) => void;
  at: ProblemsAt;
  facts: TextFacts;
}): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const checks = translationChecks(form);
  const done = checks.filter((c) => c.state === 'ok').length;
  const script = storyTextDirection(form.dialect);
  return (
    <EditorSection
      id="translations"
      title="Translations"
      count={`(${done} of ${checks.length})`}
      hint="The whole text in an interface language, paragraph for paragraph: separate the paragraphs with an empty line, as in the text. A learner reading in that language can show each paragraph’s translation under it; English is what the others fall back to."
    >
      {checks.map((c) => {
        const path = `translations.${c.locale}`;
        const problems = at(path);
        return (
          <details key={c.locale} className="st-translation" open={c.state !== 'empty' || problems.error.length > 0}>
            <summary>
              <span className="st-translation-name">{localeName(c.locale)}</span>{' '}
              {c.state === 'empty' ? (
                <Badge>Not translated</Badge>
              ) : (
                <Badge tone={c.state === 'ok' ? 'ok' : 'bad'}>
                  paragraphs: {c.paragraphs} of {c.expected}
                </Badge>
              )}
            </summary>
            <div className="st-translation-body">
              <div className="st-field">
                <label htmlFor={fieldId(path)} className="sr-only">
                  Translation in {localeName(c.locale)}
                </label>
                <textarea
                  {...described(path, problems)}
                  readOnly={ro}
                  rows={Math.max(6, Math.min(18, c.expected * 4))}
                  lang={c.locale}
                  dir={localeDir(c.locale as AppLocale)}
                  maxLength={STORY_TRANSLATION_MAX + 200}
                  value={c.text}
                  onChange={(e) => dispatch({ type: 'translation', locale: c.locale, value: e.target.value })}
                />
                <ProblemList id={`${fieldId(path)}-problems`} problems={problems} />
              </div>
              {facts.paragraphs.length > 0 && (
                <ol className="st-translation-source" lang={script.lang} dir={script.dir} aria-label="The text, paragraph by paragraph">
                  {facts.paragraphs.map((p, i) => (
                    <li key={i}>{p.text}</li>
                  ))}
                </ol>
              )}
            </div>
          </details>
        );
      })}
    </EditorSection>
  );
}

/** The tradition a story claims, as a type the names know; anything else reads as original. */
export function traditionOf(value: string): StoryTradition {
  return (STORY_TRADITIONS as readonly string[]).includes(value) ? (value as StoryTradition) : 'original';
}
