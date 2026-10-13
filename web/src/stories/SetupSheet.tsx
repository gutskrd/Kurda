import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_QUESTION_COUNT,
  DEFAULT_TIMER,
  QUESTION_COUNTS_BY_LENGTH,
  STORY_LENGTHS,
  STORY_LEVELS,
  TIMER_PRESETS,
  isAllowedQuestionCount,
  lengthMinutes,
  storyTextDirection,
  type GameAccess,
  type QuestionCount,
  type StoryDialect,
  type StoryGameMode,
  type StoryGameView,
  type StoryLength,
  type StoryLevel,
  type StoryListItem,
  type TextDuring,
  type TimerSeconds,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { ChipRadio } from '../play/ChipRadio';
import { createGame, gamePath, storyError } from './api';
import { rememberSolo, rememberedExtraTime, rememberedSolo, soloCountFor } from './prefs';

export const MODE_KEY: Record<StoryGameMode, MessageKey> = {
  solo: 'stories.mode.solo',
  duo: 'stories.mode.duo',
  group: 'stories.mode.group',
};

export const LENGTH_KEY: Record<StoryLength, MessageKey> = {
  short: 'stories.length.short',
  medium: 'stories.length.medium',
  long: 'stories.length.long',
};

/** The story a game is set up on, when one is already chosen (the reader, a lobby). */
export type ChosenStory = Pick<StoryListItem, 'id' | 'title' | 'dialect' | 'length' | 'level'>;

/** "~2–3 min": a length's reading time in a variety, as the chips and labels show it. */
export function minutesLabel(dialect: StoryDialect, length: StoryLength, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  const { min, max } = lengthMinutes(dialect, length);
  return min === max ? t('stories.minutes', { count: min }) : t('stories.minutesRange', { min, max });
}

/**
 * Setting up a quiz: presets only, each a radio group (contract §A1).
 *
 * Opened on a story (from the reader, or a lobby's "Change settings") the
 * story and its length are fixed and shown; opened from the hub, the host
 * picks a length — only lengths, and levels, that have a published story in
 * the variety are offered, from the list the hub already has — and then
 * "Surprise me" or a story. Question counts a length does not allow are not
 * offered at all. "Who can join → Anyone 18+" is offered only to someone the
 * server says may host an open game.
 *
 * Creating goes straight to the game. Solo settings are remembered on the
 * device, for the next "Quiz yourself".
 */
export function SetupSheet({
  open,
  onClose,
  dialect,
  initialMode,
  story,
  catalogue,
  initialLength,
  skipReading = false,
  lobby,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dialect: StoryDialect;
  initialMode: StoryGameMode;
  story?: ChosenStory | null;
  /** the hub's published stories of this variety, when no story is chosen */
  catalogue?: readonly StoryListItem[];
  initialLength?: StoryLength | null;
  /** the reader opened it: the story has just been read */
  skipReading?: boolean;
  /** a lobby's own settings, to change rather than create */
  lobby?: StoryGameView;
  onSaved?: (view: StoryGameView) => void;
}): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const navigate = useNavigate();
  const solo = rememberedSolo();
  const fixed: ChosenStory | null =
    story ??
    (lobby
      ? { id: lobby.settings.storyId, title: lobby.settings.storyTitle, dialect: lobby.settings.dialect, length: lobby.settings.length, level: lobby.settings.level }
      : null);

  // lengths and levels with something to play (hub)
  const available = useMemo(() => {
    const list = catalogue ?? [];
    return STORY_LENGTHS.filter((l) => list.some((s) => s.length === l));
  }, [catalogue]);

  const [mode, setMode] = useState<StoryGameMode>(lobby?.mode ?? initialMode);
  const [length, setLength] = useState<StoryLength>(
    fixed?.length ?? (initialLength && available.includes(initialLength) ? initialLength : (available[0] ?? 'short')),
  );
  const [level, setLevel] = useState<StoryLevel | 'any'>('any');
  const [pick, setPick] = useState<string>('surprise');
  const [count, setCount] = useState<QuestionCount>(
    lobby?.settings.questionCount ?? (initialMode === 'solo' ? soloCountFor(fixed?.length ?? length, solo.questionCount) : DEFAULT_QUESTION_COUNT[fixed?.length ?? length]),
  );
  const [timer, setTimer] = useState<TimerSeconds>(lobby?.settings.timerSeconds ?? (initialMode === 'solo' ? solo.timerSeconds : DEFAULT_TIMER[initialMode]));
  const [timerTouched, setTimerTouched] = useState(Boolean(lobby));
  const [text, setText] = useState<TextDuring>(lobby?.settings.textDuring ?? (initialMode === 'solo' ? solo.textDuring : 'visible'));
  const [access, setAccess] = useState<GameAccess>(lobby?.settings.access ?? 'friends');
  const [canHostOpen, setCanHostOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // whether "Anyone 18+" may be offered is the server's to say
  useEffect(() => {
    if (!open) return;
    let live = true;
    void client.get<{ canHostOpen: boolean }>('/story-games/options').then((r) => {
      if (live && r.ok) setCanHostOpen(r.data.canHostOpen === true);
    });
    return () => {
      live = false;
    };
  }, [open, client]);

  // a length change keeps the count only where the new length offers it
  useEffect(() => {
    setCount((c) => (isAllowedQuestionCount(length, c) ? c : DEFAULT_QUESTION_COUNT[length]));
    setPick('surprise');
    setLevel('any');
  }, [length]);

  // the timer follows the mode until the host sets one
  useEffect(() => {
    if (!timerTouched) setTimer(mode === 'solo' ? solo.timerSeconds : DEFAULT_TIMER[mode]);
  }, [mode]); // the mode alone: a touched timer stays as set

  const inLength = useMemo(() => (catalogue ?? []).filter((s) => s.length === length), [catalogue, length]);
  const levels = useMemo(() => STORY_LEVELS.filter((lv) => inLength.some((s) => s.level === lv)), [inLength]);
  const choices = inLength.filter((s) => level === 'any' || s.level === level);
  const { lang, dir } = storyTextDirection(fixed?.dialect ?? dialect);
  const shared = mode !== 'solo';

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    if (lobby) {
      const res = await client.patch<StoryGameView>(`/story-games/${lobby.id}/settings`, {
        questionCount: count,
        timerSeconds: timer,
        textDuring: text,
        access,
      });
      setBusy(false);
      if (!res.ok) return setError(storyError(res.error, t));
      onSaved?.(res.data);
      onClose();
      return;
    }
    const chosen = fixed?.id ?? (pick !== 'surprise' ? pick : undefined);
    const res = await createGame(client, {
      mode,
      ...(chosen ? { storyId: chosen } : { dialect, length, ...(level !== 'any' ? { level } : {}) }),
      questionCount: count,
      timerSeconds: timer,
      textDuring: text,
      access: shared ? access : 'friends',
      // a story just read is not read again before its questions
      skipReading: mode === 'solo' && skipReading && Boolean(fixed),
      extraTime: rememberedExtraTime(),
    });
    setBusy(false);
    if (!res.ok) return setError(storyError(res.error, t));
    if (mode === 'solo') rememberSolo({ questionCount: count, timerSeconds: timer, textDuring: text });
    onClose();
    navigate(gamePath(res.data.id));
  }

  const title = lobby ? t('stories.setup.editTitle') : t('stories.setup.title');
  return (
    <Modal open={open} onClose={onClose} label={title}>
      <form
        className="story-setup"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void submit();
        }}
      >
        <h2 className="story-setup-title">{title}</h2>

        {!lobby && (
          <ChipRadio
            label={t('stories.setup.mode')}
            value={mode}
            onChange={setMode}
            options={(['solo', 'duo', 'group'] as const).map((m) => ({ value: m, label: t(MODE_KEY[m]) }))}
          />
        )}

        {fixed ? (
          <div className="story-setup-fixed">
            <span className="chip-radio-legend">{t('stories.setup.story')}</span>
            <p className="story-setup-story">
              <span lang={lang} dir={dir}>
                {fixed.title}
              </span>
              <span className="muted">
                {t(LENGTH_KEY[fixed.length])} · {minutesLabel(fixed.dialect, fixed.length, t)}
              </span>
            </p>
          </div>
        ) : (
          <>
            <ChipRadio
              label={t('stories.length')}
              value={length}
              onChange={setLength}
              options={available.map((l) => ({ value: l, label: t(LENGTH_KEY[l]), hint: minutesLabel(dialect, l, t) }))}
            />
            {levels.length > 1 && (
              <ChipRadio
                label={t('stories.level')}
                value={level}
                onChange={setLevel}
                options={[
                  { value: 'any' as const, label: t('stories.level.all') },
                  ...levels.map((lv) => ({ value: lv, label: t('stories.level.n', { level: lv }) })),
                ]}
              />
            )}
            <fieldset className="chip-radio story-setup-pick" role="radiogroup">
              <legend className="chip-radio-legend">{t('stories.setup.story')}</legend>
              <div className="story-setup-list">
                <label className={`story-setup-choice${pick === 'surprise' ? ' is-on' : ''}`}>
                  <input type="radio" name="story-pick" checked={pick === 'surprise'} onChange={() => setPick('surprise')} />
                  <span>{t('stories.setup.surprise')}</span>
                </label>
                {choices.map((s) => (
                  <label key={s.id} className={`story-setup-choice${pick === s.id ? ' is-on' : ''}`}>
                    <input type="radio" name="story-pick" checked={pick === s.id} onChange={() => setPick(s.id)} />
                    <span lang={lang} dir={dir}>
                      {s.title}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <ChipRadio
          label={t('stories.setup.questions')}
          value={count}
          onChange={setCount}
          options={QUESTION_COUNTS_BY_LENGTH[fixed?.length ?? length].map((n) => ({
            value: n,
            label: t('stories.setup.questionCount', { count: n }),
          }))}
        />
        <ChipRadio
          label={t('stories.setup.timer')}
          value={timer}
          onChange={(v) => {
            setTimerTouched(true);
            setTimer(v);
          }}
          options={TIMER_PRESETS.map((s) => ({
            value: s,
            label: s === 0 ? t('stories.setup.timerOff') : t('stories.setup.timerSeconds', { seconds: s }),
          }))}
        />
        <ChipRadio
          label={t('stories.setup.text')}
          value={text}
          onChange={setText}
          options={[
            { value: 'visible' as const, label: t('stories.setup.textVisible') },
            { value: 'hidden' as const, label: t('stories.setup.textHidden') },
          ]}
        />
        {text === 'hidden' && <p className="story-setup-note">{t('stories.setup.textHiddenHint')}</p>}

        {shared && (
          <ChipRadio
            label={t('stories.setup.access')}
            value={access}
            onChange={setAccess}
            options={[
              { value: 'friends' as const, label: t('stories.setup.accessFriends') },
              ...(canHostOpen || access === 'open' ? [{ value: 'open' as const, label: t('stories.setup.accessOpen') }] : []),
            ]}
          />
        )}

        {error && (
          <p className="msg msg-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block disabled={busy || (!fixed && available.length === 0)}>
          {lobby ? t('stories.setup.save') : mode === 'solo' ? t('stories.setup.start') : t('stories.setup.create')}
        </Button>
      </form>
    </Modal>
  );
}
