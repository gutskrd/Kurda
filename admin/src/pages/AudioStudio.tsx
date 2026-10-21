import { useEffect } from 'react';
import { useRoute } from '../nav';
import type { Filter } from '../lessonAudio';
import { PageHeader, Tabs } from '../ui';
import { AlphabetAudio, type Filter as LetterFilter } from './AlphabetAudio';
import { Characters } from './Characters';
import { LessonAudio } from './LessonAudio';

type Side = 'letters' | 'lessons' | 'stories' | 'characters';

const SIDES: ReadonlyArray<{ key: Side; tab: string; title: string; subtitle: string }> = [
  {
    key: 'letters',
    tab: 'Alphabet',
    title: 'Record the alphabet',
    subtitle: 'Every letter and example word on the alphabet page, in a native voice. Until a sound is recorded, it plays in the synthesised voice.',
  },
  {
    key: 'lessons',
    tab: 'Lesson sentences',
    title: 'Record lesson sentences',
    subtitle: 'The Kurdish words and sentences the lessons use, drafts included, so a lesson can be recorded before it goes live.',
  },
  {
    key: 'stories',
    tab: 'Story sentences',
    title: 'Record story sentences',
    subtitle: 'Every sentence of every story, as the reader cuts it. A story with all its sentences recorded can be listened to from start to end.',
  },
  {
    key: 'characters',
    tab: 'Characters',
    title: 'Characters',
    subtitle: 'Who learners see saying each recording, and the mouth timelines they move with. Give older recordings a character, and make the timelines they are missing.',
  },
];

const TAB_KEY = 'kurda_admin_audio_tab';

function savedSide(): Side {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return v === 'lessons' || v === 'stories' || v === 'characters' ? v : 'letters';
  } catch {
    return 'letters';
  }
}

/**
 * The audio studio: one place to record the Kurdish in a native voice — the
 * alphabet's letters and words, the lessons' sentences, the stories'
 * sentences — each side at an address of its own (#/audio/letters,
 * #/audio/lessons, #/audio/stories) and a link of its own in the nav, because
 * the owner could not find where to record. `?show=missing` opens on what is
 * still missing (the dashboard's links); `?lesson=` and `?story=` on one
 * lesson or story (the Record links in their lists). All sides record, trim,
 * level and save the same way (recorder.tsx). A fourth side,
 * #/audio/characters, is for who is shown saying the recordings
 * (Characters.tsx).
 */
export function AudioStudio(): React.JSX.Element {
  const route = useRoute();
  const requested = route.rest[0];
  const side = SIDES.find((s) => s.key === requested);

  // #/audio alone: the side used last
  useEffect(() => {
    if (!side) location.replace(`#/audio/${savedSide()}`);
  }, [side]);

  useEffect(() => {
    if (!side) return;
    try {
      localStorage.setItem(TAB_KEY, side.key);
    } catch {
      // a blocked storage only means the side is not remembered
    }
  }, [side]);

  if (!side) return <div />;

  const show = route.query.get('show');
  const focus = side.key === 'stories' ? route.query.get('story') : side.key === 'lessons' ? route.query.get('lesson') : null;
  const storyFocus = focus && side.key === 'stories' ? `${focus}:0` : focus;

  return (
    <div>
      <PageHeader title={side.title} subtitle={side.subtitle} />
      <Tabs
        className="studio-tabs"
        label="What to record"
        value={side.key}
        items={SIDES.map((s) => ({ key: s.key, label: s.tab, href: `#/audio/${s.key}` }))}
      />
      {side.key === 'characters' ? (
        <Characters key="characters" />
      ) : side.key === 'letters' ? (
        <AlphabetAudio key="letters" initialFilter={show === 'missing' || show === 'recorded' || show === 'all' ? (show as LetterFilter) : undefined} />
      ) : (
        <LessonAudio
          key={`${side.key}:${storyFocus ?? ''}:${show ?? ''}`}
          scope={side.key}
          focus={storyFocus}
          initialFilter={show === 'missing' || show === 'recorded' || show === 'all' || show === 'unused' ? (show as Filter) : undefined}
        />
      )}
    </div>
  );
}
