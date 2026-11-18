import { useEffect } from 'react';
import { isSpeakerId } from '@kurda/shared';
import { useRoute } from '../nav';
import type { Filter } from '../lessonAudio';
import { PageHeader, Tabs } from '../ui';
import { AlphabetAudio, type Filter as LetterFilter } from './AlphabetAudio';
import { Characters } from './Characters';
import { ConversationAudio } from './ConversationAudio';
import { DictionaryVoices } from './DictionaryVoices';
import { LessonAudio } from './LessonAudio';

type Side = 'letters' | 'lessons' | 'conversations' | 'stories' | 'dictionary' | 'characters';

const SIDES: ReadonlyArray<{ key: Side; tab: string; title: string; subtitle: string }> = [
  {
    key: 'letters',
    tab: 'Alphabet and words',
    title: 'Record the alphabet and words',
    subtitle:
      'Every letter and example word on the alphabet page, and the colours, numbers, days and months, in a native voice. Until a sound is recorded, it plays in the synthesised voice, or not at all where there is none.',
  },
  {
    key: 'lessons',
    tab: 'Lesson sentences',
    title: 'Record lesson sentences',
    subtitle: 'The Kurdish words and sentences the lessons use, drafts included, so a lesson can be recorded before it goes live.',
  },
  {
    key: 'conversations',
    tab: 'Conversations',
    title: 'Record conversations',
    subtitle:
      'The conversations in the lessons, each part recorded by its own person, wherever they are. Choose your part, hear the line before yours, and say it; send the others a link to theirs.',
  },
  {
    key: 'stories',
    tab: 'Story sentences',
    title: 'Record story sentences',
    subtitle: 'Every sentence of every story, as the reader cuts it. A story with all its sentences recorded can be listened to from start to end.',
  },
  {
    key: 'dictionary',
    tab: 'Dictionary',
    title: 'Dictionary pronunciations',
    subtitle: 'The recordings that come with the dictionary’s words. Choose who says each one, and hear the character say it.',
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
    return v === 'lessons' || v === 'conversations' || v === 'stories' || v === 'dictionary' || v === 'characters' ? v : 'letters';
  } catch {
    return 'letters';
  }
}

/**
 * The audio studio, where the Kurdish is recorded in a native voice: letters and words, lesson sentences and story
 * sentences, each side at its own address (#/audio/letters, #/audio/lessons, #/audio/stories) and recording the same
 * way (recorder.tsx). `?show=missing`, `?lesson=`, `?story=`, `?course=` and `?voice=` open on a part of a side
 * (lessonAudio.ts). Two more sides set who is shown saying recordings: #/audio/dictionary (DictionaryVoices.tsx) and
 * #/audio/characters (Characters.tsx).
 */
export function AudioStudio(): React.JSX.Element {
  const route = useRoute();
  const requested = route.rest[0];
  const side = SIDES.find((s) => s.key === requested);

  // #/audio alone opens the side used last, but only while the address is still this page's: the effect also fires on
  // the way out, before the page unmounts, and redirecting then would trap every link out.
  const page = route.page;
  useEffect(() => {
    if (!side && page === 'audio') location.replace(`#/audio/${savedSide()}`);
  }, [side, page]);

  useEffect(() => {
    if (!side) return;
    try {
      localStorage.setItem(TAB_KEY, side.key);
    } catch {
      // A blocked storage only means the side is not remembered.
    }
  }, [side]);

  if (!side) return <div />;

  // One conversation has a page of its own, with its own header: #/audio/conversations/<id>.
  const conversation = side.key === 'conversations' ? (route.rest[1] ?? null) : null;
  if (conversation) return <ConversationAudio id={conversation} lessonId={route.query.get('lesson')} part={route.query.get('part')} />;

  const show = route.query.get('show');
  const focus = side.key === 'stories' ? route.query.get('story') : side.key === 'lessons' ? route.query.get('lesson') : null;
  const storyFocus = focus && side.key === 'stories' ? `${focus}:0` : focus;
  const course = side.key === 'lessons' ? route.query.get('course') : null;
  const asked = route.query.get('voice');
  const voice = side.key === 'lessons' && isSpeakerId(asked) ? asked : null;

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
      ) : side.key === 'conversations' ? (
        <ConversationAudio id={null} lessonId={null} part={null} />
      ) : side.key === 'dictionary' ? (
        <DictionaryVoices key="dictionary" />
      ) : side.key === 'letters' ? (
        <AlphabetAudio key="letters" initialFilter={show === 'missing' || show === 'recorded' || show === 'all' ? (show as LetterFilter) : undefined} />
      ) : (
        <LessonAudio
          key={`${side.key}:${storyFocus ?? ''}:${show ?? ''}:${course ?? ''}:${voice ?? ''}`}
          scope={side.key}
          focus={storyFocus}
          course={course}
          voice={voice}
          initialFilter={show === 'missing' || show === 'recorded' || show === 'all' || show === 'unused' ? (show as Filter) : undefined}
        />
      )}
    </div>
  );
}
