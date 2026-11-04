import { useMemo, useState } from 'react';
import { glossSpans, localeDir, storyCoverPath, storyParagraphs, storyTextDirection, type AppLocale, type StoryCategory } from '@kurda/shared';
import { artSrc } from '../shop/art';
import { categoryLabel, cefrLabel, draftFromForm, localeName, traditionLine, translationChecks, type AdminStory, type StoryForm, type TextFacts } from '../stories';
import { Badge, Icon } from '../ui';
import { EditorSection } from './StoryEditorFields';

/**
 * The story as the reader will show it, from the form as it is now: the
 * cover band, the title, "A2 · Elementary", the category, the minutes, the
 * narrated badge, the author and tradition line, the synopsis, then the
 * paragraphs with the glossary's words marked and a paragraph's translation
 * under it. Not a copy of the reader's code — the admin has its own look —
 * but the same order and the same decisions, so an editor sees what a learner
 * will meet before it is published.
 */
export function StoryPreview({
  form,
  facts,
  story,
  categories,
}: {
  form: StoryForm;
  facts: TextFacts;
  story: AdminStory | null;
  categories: readonly StoryCategory[] | undefined;
}): React.JSX.Element {
  const script = storyTextDirection(form.dialect);
  const draft = useMemo(() => draftFromForm(form), [form]);
  const translated = translationChecks(form).filter((c) => c.state !== 'empty');
  const [locale, setLocale] = useState<string>('');
  // the chosen translation, or English, or the first there is; none when there is none
  const shownLocale = translated.find((c) => c.locale === locale)?.locale ?? translated.find((c) => c.locale === 'en')?.locale ?? translated[0]?.locale ?? null;
  const translation = shownLocale ? storyParagraphs(draft.translations[shownLocale] ?? '') : [];
  const cover = artSrc(storyCoverPath(draft.cover));
  const minutes = draft.readingMinutes ?? facts.minutes;
  const narrated = story && story.audio.total > 0 ? (story.audio.recorded === story.audio.total ? 'full' : story.audio.recorded > 0 ? 'partial' : 'none') : 'none';
  const category = categoryLabel(categories, draft.category);
  const title = draft.title || 'Untitled story';

  return (
    <EditorSection id="preview" title="Preview" hint="How the reader opens the story, from what is typed here now.">
      <article className="st-pv" lang={script.lang} dir={script.dir}>
        <div className={`st-pv-cover${cover ? '' : ' is-kilim'}`} data-category={draft.category ?? 'none'} aria-hidden="true">
          {cover && <img src={cover} alt="" loading="lazy" />}
        </div>
        <header className="st-pv-head" dir="ltr">
          <h3 className="st-pv-title" lang={script.lang} dir={script.dir}>
            {title}
          </h3>
          <p className="st-pv-meta">
            <Badge>{cefrLabel(form.level, ' · ')}</Badge>
            {category && <span>{category}</span>}
            <span>{minutes} min</span>
            {narrated !== 'none' && (
              <span className="st-pv-narrated">
                <Icon name="mic" size={13} />
                {narrated === 'full' ? 'Narrated' : 'Partly narrated'}
              </span>
            )}
          </p>
          <p className="subtle st-pv-by">
            {draft.author ? `${draft.author} · ` : ''}
            {traditionLine(draft.tradition)}
          </p>
          {draft.summary && (
            <p className="st-pv-synopsis" lang={script.lang} dir={script.dir}>
              {draft.summary}
            </p>
          )}
          {translated.length > 0 && (
            <label className="st-pv-locale">
              <span className="subtle">Translation shown</span>
              <select value={shownLocale ?? ''} onChange={(e) => setLocale(e.target.value)}>
                {translated.map((c) => (
                  <option key={c.locale} value={c.locale}>
                    {localeName(c.locale)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>
        {facts.paragraphs.length === 0 ? (
          <p className="subtle st-pv-empty" dir="ltr">
            The text is empty: the reader would have nothing to show.
          </p>
        ) : (
          <div className="st-pv-body">
            {facts.paragraphs.map((p, i) => (
              <div key={i} className="st-pv-para">
                <p className="st-pv-text" lang={script.lang} dir={script.dir}>
                  {glossSpans(p.text, draft.glossary).reduce<{ at: number; out: React.ReactNode[] }>(
                    (acc, span, n) => {
                      acc.out.push(p.text.slice(acc.at, span.start));
                      acc.out.push(
                        <mark key={n} className="st-pv-gloss" title={span.entry.meanings.en}>
                          {p.text.slice(span.start, span.end)}
                        </mark>,
                      );
                      acc.at = span.end;
                      return acc;
                    },
                    { at: 0, out: [] },
                  ).out}
                  {p.text.slice(glossSpans(p.text, draft.glossary).at(-1)?.end ?? 0)}
                </p>
                {shownLocale && translation[i] !== undefined && (
                  <p className="st-pv-translation" lang={shownLocale} dir={localeDir(shownLocale as AppLocale)}>
                    {translation[i]}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {(draft.source || draft.attributionNote) && (
          <footer className="subtle st-pv-foot" dir="auto">
            {draft.source && <p>Source: {draft.source}</p>}
            {draft.attributionNote && <p>{draft.attributionNote}</p>}
          </footer>
        )}
      </article>
    </EditorSection>
  );
}
