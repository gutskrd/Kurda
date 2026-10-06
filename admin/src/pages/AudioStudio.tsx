import { useState } from 'react';
import { AlphabetAudio } from './AlphabetAudio';
import { LessonAudio } from './LessonAudio';

type Tab = 'letters' | 'lessons';

const TAB_KEY = 'kurda_admin_audio_tab';

function savedTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'lessons' ? 'lessons' : 'letters';
  } catch {
    return 'letters';
  }
}

/**
 * The audio studio: one place to record what learners hear in a native
 * voice — the letters and example words on the alphabet page, and the Kurdish
 * in the lessons. Both sides record, trim, level and save the same way
 * (recorder.tsx); they differ only in what is on the list.
 */
export function AudioStudio(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>(savedTab);

  const choose = (next: Tab): void => {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // a blocked storage only means the tab is not remembered
    }
  };

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Audio studio</h1>
          <div className="subtle">Native recordings of what learners hear: the alphabet’s letters and words, and the Kurdish in the lessons.</div>
        </div>
      </div>

      <div className="tabs studio-tabs" role="tablist" aria-label="Record">
        {(
          [
            ['letters', 'Letters'],
            ['lessons', 'Lessons'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => choose(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'letters' ? <AlphabetAudio /> : <LessonAudio />}
    </div>
  );
}
