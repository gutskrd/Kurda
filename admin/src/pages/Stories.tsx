import { useEffect, useRef } from 'react';
import { go, useRoute } from '../nav';
import type { AdminStory } from '../stories';
import { useToast } from '../ui';
import { StoryCategories } from './StoryCategories';
import { StoryEditor } from './StoryEditor';
import { StoryList } from './StoryList';

/**
 * Stories: the library's texts, each with its quiz questions, at #/stories, #/stories/<id>, #/stories/new and
 * #/stories/categories, so a story can be bookmarked or sent to a reviewer.
 */
export function Stories(): React.JSX.Element {
  const route = useRoute();
  const toast = useToast();
  const sub = route.rest[0] ?? '';
  // A story just created is handed to its own page, so it is not loaded again —
  // once: opened again later, it is loaded like any other, or it would be stale.
  const created = useRef<AdminStory | null>(null);
  useEffect(() => {
    if (created.current && sub !== created.current.id) created.current = null;
  }, [sub]);

  if (!sub) return <StoryList onNew={() => go('stories/new')} />;
  if (sub === 'categories') return <StoryCategories />;

  const id = sub === 'new' ? null : sub;
  const initial = id && created.current?.id === id ? created.current : null;
  return (
    <StoryEditor
      key={sub}
      id={id}
      initial={initial}
      onCreated={(story) => {
        created.current = story;
        // Replace, so Back from the new story goes to the list, not to an empty form.
        location.replace(`#/stories/${story.id}`);
      }}
      onDeleted={(title) => {
        toast.success(`Deleted “${title}”.`);
        go('stories');
      }}
    />
  );
}
