import { useEffect, useRef, useState } from 'react';
import { useHashRoute } from '../nav';
import type { AdminStory } from '../stories';
import { StoryEditor } from './StoryEditor';
import { StoryList } from './StoryList';

/**
 * Stories: the texts the app's reading quizzes are about (they replaced the
 * ranked quiz). The list is #/stories, a story #/stories/<id>, a new one
 * #/stories/new — addresses of their own, so the back button leaves a story
 * for the list and a story can be bookmarked or sent to a reviewer.
 */
export function Stories(): React.JSX.Element {
  const [route, navigate] = useHashRoute('stories');
  const sub = route.split('/')[1] ?? '';
  const [flash, setFlash] = useState<string | null>(null);
  // a story just created is handed to its own page, so it is not loaded again —
  // once: opened again later, it is loaded like any other, or it would be stale
  const created = useRef<AdminStory | null>(null);
  useEffect(() => {
    if (created.current && sub !== created.current.id) created.current = null;
  }, [sub]);

  if (!sub) {
    return (
      <StoryList
        flash={flash}
        onOpen={(id) => {
          setFlash(null);
          navigate(`stories/${id}`);
        }}
        onNew={() => {
          setFlash(null);
          navigate('stories/new');
        }}
      />
    );
  }

  const id = sub === 'new' ? null : sub;
  const initial = id && created.current?.id === id ? created.current : null;
  return (
    <StoryEditor
      key={sub}
      id={id}
      initial={initial}
      onBack={() => navigate('stories')}
      onCreated={(story) => {
        created.current = story;
        // replace, so Back from the new story goes to the list, not to an empty form
        location.replace(`#/stories/${story.id}`);
      }}
      onDeleted={(title) => {
        setFlash(`Deleted “${title}”.`);
        navigate('stories');
      }}
    />
  );
}
