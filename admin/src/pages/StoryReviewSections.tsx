import { useContext, useEffect, useState } from 'react';
import { STORY_DIALECTS, storyTextDirection, type StoryDialect } from '@kurda/shared';
import { DIALECT_NAME, REVIEW_NAME, STATUS_NAME, type AdminStory, type AdminStorySummary, type EditorAction, type StoryForm } from '../stories';
import { searchStories } from '../storiesApi';
import { Badge, Banner, Button, Icon, Time, UserLink, useDebounced, useLoad } from '../ui';
import { EditorSection, ReadOnly } from './StoryEditorFields';
import { STATUS_TONE } from './StoryList';

/**
 * The editor's sections about a story's standing rather than its words: the
 * other tellings it is one story with (Versions), and whether a reviewer has
 * read it (Review). Publishing waits on the review; the versions are what the
 * reader is offered under "Read it in Soranî".
 */

/**
 * Which story this is another telling of. Linking and unlinking are saved
 * with the story (the API joins or leaves the group in the save), so a change
 * here shows as pending until the next save, and can be taken back before it.
 */
export function VersionsSection({ story, form, dispatch }: { story: AdminStory | null; form: StoryForm; dispatch: (a: EditorAction) => void }): React.JSX.Element {
  const ro = useContext(ReadOnly);
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  // the other variety first: the usual other version is the same story told in the other script
  const other: StoryDialect = STORY_DIALECTS.find((d) => d !== form.dialect) ?? form.dialect;
  const [dialect, setDialect] = useState<StoryDialect | 'all'>(other);
  const results = useLoad(() => (query ? searchStories(query, dialect) : Promise.resolve<AdminStorySummary[]>([])), [query, dialect]);
  // the editor moved to a story of the other variety: offer that variety's opposite
  useEffect(() => {
    setDialect(other);
  }, [other]);

  const versions = story?.versions ?? [];
  const pending = form.sameStoryAs;
  const excluded = new Set([story?.id, ...versions.map((v) => v.id)]);
  const candidates = (results.data ?? []).filter((s) => !excluded.has(s.id));
  const chosen = pending ? candidates.find((s) => s.id === pending) : undefined;

  return (
    <EditorSection
      id="versions"
      title="Versions"
      hint="The same story told in the other variety, or in another language later: linked stories are offered to each other’s readers. Linking is saved with the story."
    >
      {versions.length > 0 ? (
        <ul className="st-versions">
          {versions.map((v) => {
            const script = storyTextDirection(v.dialect);
            return (
              <li key={v.id} className="st-version">
                <a href={`#/stories/${v.id}`} lang={script.lang} dir={script.dir}>
                  {v.title || 'Untitled'}
                </a>
                <span className="badges">
                  <Badge>{DIALECT_NAME[v.dialect]}</Badge>
                  <Badge tone={STATUS_TONE[v.status]}>{STATUS_NAME[v.status]}</Badge>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="subtle">{story ? 'Not linked to another telling.' : 'A new story can be linked to one that exists already.'}</p>
      )}

      {pending === null && (
        <Banner tone="warn" actions={<Button onClick={() => dispatch({ type: 'link', sameStoryAs: undefined })}>Keep the link</Button>}>
          Leaves the group when the story is saved: it will no longer be offered as another version of these.
        </Banner>
      )}
      {pending && (
        <Banner
          tone="info"
          actions={<Button onClick={() => dispatch({ type: 'link', sameStoryAs: undefined })}>Undo</Button>}
        >
          Linked to “{chosen?.title ?? 'the chosen story'}” when the story is saved.
        </Banner>
      )}

      {!ro && (
        <div className="st-link">
          {versions.length > 0 && pending === undefined && (
            <Button variant="ghost" onClick={() => dispatch({ type: 'link', sameStoryAs: null })}>
              Unlink from these
            </Button>
          )}
          <div className="st-link-search">
            <div className="search-box">
              <Icon name="search" size={16} />
              <input
                type="search"
                aria-label="Find a story to link as another version"
                placeholder="Find a story by its title"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select aria-label="Variety of the other version" value={dialect} onChange={(e) => setDialect(e.target.value as StoryDialect | 'all')}>
              {STORY_DIALECTS.map((d) => (
                <option key={d} value={d}>
                  {DIALECT_NAME[d]}
                </option>
              ))}
              <option value="all">Both varieties</option>
            </select>
          </div>
          {query && results.data && (
            <ul className="st-link-results">
              {candidates.length === 0 && <li className="subtle">No other story matches “{query}”.</li>}
              {candidates.map((s) => {
                const script = storyTextDirection(s.dialect);
                return (
                  <li key={s.id} className="st-version">
                    <span lang={script.lang} dir={script.dir}>
                      {s.title || 'Untitled'}
                    </span>
                    <span className="badges">
                      <Badge>{DIALECT_NAME[s.dialect]}</Badge>
                      <Badge tone={STATUS_TONE[s.status]}>{STATUS_NAME[s.status]}</Badge>
                    </span>
                    <Button onClick={() => dispatch({ type: 'link', sameStoryAs: s.id })} disabled={pending === s.id}>
                      {pending === s.id ? 'Chosen' : 'Link'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {results.error != null && <p className="field-error">The search did not answer. Try again.</p>}
        </div>
      )}
    </EditorSection>
  );
}

/**
 * Whether a reviewer has read the story: approval is what publishing waits
 * for, and a change to the text, glossary, questions or translations after it
 * takes it away again. Withdrawing approval from a published story is refused
 * by the API (unpublish first), so the button is not offered then.
 */
export function ReviewSection({
  story,
  busy,
  contentPending,
  onReview,
}: {
  story: AdminStory | null;
  busy: boolean;
  /** unsaved edits touch what a reviewer read: saving will need approval again */
  contentPending: boolean;
  onReview: (approved: boolean) => void;
}): React.JSX.Element {
  const approved = story?.reviewStatus === 'approved';
  const archived = story?.status === 'archived';
  const published = story?.status === 'published';
  return (
    <EditorSection id="review" title="Review">
      <Banner tone="info">
        Publishing needs a reviewer’s approval, and the approval is of the words as they are: a change to the text, glossary, questions or
        translations after it needs approving again. Where the story is filed and who it is attributed to can change freely.
      </Banner>
      {!story ? (
        <p className="subtle">Save the story first. A story is approved once someone has read every paragraph and every question.</p>
      ) : (
        <>
          <div className="st-review-state">
            <Badge tone={approved ? 'ok' : 'warn'}>{REVIEW_NAME[story.reviewStatus]}</Badge>
            {story.reviewedAt && (
              <span className="subtle">
                {approved ? 'Approved' : 'Approval withdrawn'}{' '}
                {story.reviewedBy && (
                  <>
                    by <UserLink user={{ id: story.reviewedBy.id, username: story.reviewedBy.username }} />{' '}
                  </>
                )}
                <Time value={story.reviewedAt} />
              </span>
            )}
          </div>
          {story.reviewNote && <blockquote className="st-review-note">{story.reviewNote}</blockquote>}
          {approved && contentPending && (
            <p className="st-reason field-error">The unsaved edits change what was approved: once saved, the story needs approving again before it is published.</p>
          )}
          {archived ? (
            <p className="subtle">An archived story is not reviewed.</p>
          ) : (
            <div className="row st-review-actions">
              {approved ? (
                published ? (
                  <span className="subtle">Unpublish the story first to withdraw its approval.</span>
                ) : (
                  <Button onClick={() => onReview(false)} disabled={busy}>
                    Withdraw approval
                  </Button>
                )
              ) : (
                <Button variant="primary" icon="check" onClick={() => onReview(true)} disabled={busy}>
                  Approve
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </EditorSection>
  );
}
