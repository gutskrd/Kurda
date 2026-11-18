import { forwardRef, useEffect, useState } from 'react';
import {
  storySentences,
  storyTextDirection,
  type AppLocale,
  type StoryDetail,
  type StoryDialect,
  type StoryGamePlayer,
  type StoryGameView,
  type StoryQuestionTranslation,
} from '@kurda/shared';
import type { ApiResult } from '../lib/types';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { rememberEnglish, rememberExtraTime } from './prefs';

export type Act = (path: string, body?: unknown) => Promise<ApiResult<StoryGameView>>;
export type Announce = (text: string) => void;
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** A player as this viewer may name them: the server's name when given (yourself, a friend, an open game), else "Player 3". */
export function playerName(p: Pick<StoryGamePlayer, 'seat' | 'name' | 'isMe'>, t: Translate): string {
  if (p.isMe) return t('games.you');
  return p.name ?? t('stories.game.playerN', { seat: p.seat });
}

/**
 * Where a game is in its questions: a small ring and "2 of 5". The heading is still named "Question 2 of 5" for screen
 * readers, and `ref` goes to it so a new question can take focus.
 */
export const QuestionCounter = forwardRef<HTMLHeadingElement, { index: number; total: number; id: string }>(function QuestionCounter({ index, total, id }, ref) {
  const t = useT();
  const r = 9;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, index / total) : 0;
  return (
    <h2 id={id} ref={ref} tabIndex={-1} className="sg-q-title" aria-label={t('stories.status.question', { index, total })}>
      <svg className="sg-q-ring" width="24" height="24" viewBox="-12 -12 24 24" aria-hidden="true" focusable="false">
        <circle className="sg-q-ring-track" r={r} />
        <circle className="sg-q-ring-fill" r={r} strokeDasharray={`${c * share} ${c}`} />
      </svg>
      <span aria-hidden="true">{t('stories.check.counter', { index, total })}</span>
    </h2>
  );
});

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

/** Said before and during reading: the text will not be there for the questions. */
export function FromMemoryNote({ view }: { view: StoryGameView }): React.JSX.Element | null {
  const t = useT();
  if (view.settings.textDuring !== 'hidden') return null;
  return <p className="sg-note">{t('stories.game.fromMemory')}</p>;
}

/** Double time on timed questions for this player only, remembered on the device and told to nobody else. */
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

/** Whether a keypress belongs to a field or dialog rather than the game's shortcuts. */
export function typingElsewhere(e: KeyboardEvent): boolean {
  const el = e.target;
  // A key sent to the window itself is in no element.
  if (el instanceof Element && el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return true;
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/**
 * The option number (1–9) a key gives, or null. Digit keys are read by `code`, so Arabic-script and AZERTY layouts work,
 * and Eastern Arabic and Persian digits typed another way count too.
 */
export function optionNumber(e: Pick<KeyboardEvent, 'key' | 'code'>): number | null {
  const place = /^(?:Digit|Numpad)([1-9])$/.exec(e.code ?? '');
  if (place) return Number(place[1]);
  if (/^[1-9]$/.test(e.key)) return Number(e.key);
  for (const digits of ['٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹']) {
    const at = digits.indexOf(e.key);
    if (e.key.length === 1 && at > 0) return at;
  }
  return null;
}

/** A question's words in a language the reader reads: prompt, options in the game's order, and the explanation once revealed. */
export interface QuestionHelp {
  lang: AppLocale;
  prompt: string | null;
  options: readonly string[] | null;
  explanation: string | null;
}

/**
 * A question in the reader's language where translated and the story is not already in it; else English, from its
 * translation or its original English; else nothing. Translated options follow the game's order.
 */
export function questionHelp(
  q: { promptEn: string | null; explanationEn?: string | null; translations?: Partial<Record<AppLocale, StoryQuestionTranslation>> },
  locale: AppLocale,
  dialect: StoryDialect,
): QuestionHelp | null {
  const own = locale === (dialect === 'sorani' ? 'ckb' : 'ku');
  const theirs = own ? undefined : q.translations?.[locale];
  const tr = theirs ?? q.translations?.en;
  if (tr) {
    return { lang: theirs ? locale : 'en', prompt: tr.prompt, options: tr.options.length > 0 ? tr.options : null, explanation: tr.explanation ?? (theirs ? null : (q.explanationEn ?? null)) };
  }
  if (q.promptEn || q.explanationEn) return { lang: 'en', prompt: q.promptEn, options: null, explanation: q.explanationEn ?? null };
  return null;
}

/**
 * "Show in English" / "Hide English", or "Show the translation" / "Hide the translation" for help in the reader's own
 * language; the words say what a press does, so no pressed style is needed. One remembered choice for questions and
 * answers.
 */
export function EnglishToggle({ on, onChange, english = true }: { on: boolean; onChange: (on: boolean) => void; english?: boolean }): React.JSX.Element {
  const t = useT();
  return (
    <button
      type="button"
      className="link-btn sg-english"
      onClick={() => {
        onChange(!on);
        rememberEnglish(!on);
      }}
    >
      {english ? (on ? t('stories.game.hideEnglish') : t('stories.game.showEnglish')) : on ? t('stories.game.hideTranslation') : t('stories.game.showTranslation')}
    </button>
  );
}

/** The text direction of help in an interface language. */
export function helpDir(lang: string): 'rtl' | 'ltr' {
  return lang === 'ar' || lang === 'ckb' ? 'rtl' : 'ltr';
}

/** Re-renders on a schedule only while something is waiting to change. */
export function useTick(on: boolean, every = 1_000): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setN((n) => n + 1), every);
    return () => clearInterval(timer);
  }, [on, every]);
}
