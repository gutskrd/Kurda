import { useEffect, useState } from 'react';
import {
  storySentences,
  storyTextDirection,
  type StoryDetail,
  type StoryGamePlayer,
  type StoryGameView,
} from '@kurda/shared';
import type { ApiResult } from '../lib/types';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { rememberExtraTime } from './prefs';

export type Act = (path: string, body?: unknown) => Promise<ApiResult<StoryGameView>>;
export type Announce = (text: string) => void;
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * A player as this viewer may name them (the identity rule): their name when
 * the server gave it — yourself, a friend, anyone in an open game — and
 * "Player 3" otherwise, never a guess.
 */
export function playerName(p: Pick<StoryGamePlayer, 'seat' | 'name' | 'isMe'>, t: Translate): string {
  if (p.isMe) return t('games.you');
  return p.name ?? t('stories.game.playerN', { seat: p.seat });
}

/** "Question 2 of 5 · 60 seconds each · The story stays visible", for the lobby and the reading. */
export function SettingsLine({ view }: { view: StoryGameView }): React.JSX.Element {
  const t = useT();
  const s = view.settings;
  return (
    <p className="sg-settings">
      <span>{t('stories.setup.questionCount', { count: s.questionCount })}</span>
      <span>{s.timerSeconds === 0 ? t('stories.setup.timerOff') : t('stories.game.timerEach', { seconds: s.timerSeconds })}</span>
      <span>{s.textDuring === 'visible' ? t('stories.game.textVisible') : t('stories.setup.textHidden')}</span>
      {view.mode !== 'solo' && (
        <span>{s.access === 'open' ? t('stories.setup.accessOpen') : t('stories.setup.accessFriends')}</span>
      )}
    </p>
  );
}

/** Said before anyone starts reading, and while they read: the text will not be there for the questions. */
export function FromMemoryNote({ view }: { view: StoryGameView }): React.JSX.Element | null {
  const t = useT();
  if (view.settings.textDuring !== 'hidden') return null;
  return <p className="sg-note">{t('stories.game.fromMemory')}</p>;
}

/**
 * Double time on timed questions, for this player only: remembered on the
 * device, and nobody else is told who uses it.
 */
export function ExtraTimeToggle({ view, act }: { view: StoryGameView; act: Act }): React.JSX.Element | null {
  const t = useT();
  const [busy, setBusy] = useState(false);
  if (view.settings.timerSeconds === 0) return null;
  return (
    <label className="sg-switch">
      <input
        type="checkbox"
        role="switch"
        checked={view.extraTime}
        disabled={busy}
        onChange={(e) => {
          const on = e.target.checked;
          rememberExtraTime(on);
          setBusy(true);
          void act('/extra-time', { on }).finally(() => setBusy(false));
        }}
      />
      <span className="sg-switch-track" aria-hidden />
      <span className="sg-switch-text">
        <span>{t('stories.game.extraTime')}</span>
        <span className="sg-switch-hint">{t('stories.game.extraTimeHint')}</span>
      </span>
    </label>
  );
}

/** Where an answer comes from, quoted: its sentence when the editor set one, else its paragraph. */
export function evidenceText(story: StoryDetail | null, paragraph: number | null, sentence: number | null): string | null {
  if (!story || paragraph === null) return null;
  const p = story.paragraphs[paragraph];
  if (!p) return null;
  if (sentence !== null) {
    const s = storySentences(p)[sentence];
    if (s) return s;
  }
  return p;
}

export function Evidence({ story, paragraph, sentence }: { story: StoryDetail | null; paragraph: number | null; sentence: number | null }): React.JSX.Element | null {
  const t = useT();
  const text = evidenceText(story, paragraph, sentence);
  if (!text || !story) return null;
  const { lang, dir } = storyTextDirection(story.dialect);
  return (
    <figure className="sg-evidence">
      <figcaption>{t('stories.game.fromTheStory')}</figcaption>
      <blockquote lang={lang} dir={dir}>
        {text}
      </blockquote>
    </figure>
  );
}

/** Whether a keypress belongs to a field or a dialog rather than to the game's shortcuts. */
export function typingElsewhere(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  if (el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return true;
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/** Re-render on a schedule only while something is waiting to change. */
export function useTick(on: boolean, every = 1_000): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setN((n) => n + 1), every);
    return () => clearInterval(timer);
  }, [on, every]);
}
