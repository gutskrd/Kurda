import { useMemo, useState } from 'react';
import { api } from '../api';
import { conversationHref } from '../conversations';
import { BUILD_KINDS, MAX_WORDS, buildCounts, buildExercises, parseWords, type BuildKind } from '../lessonBuilder';
import { isStoryUsage, neededForListening, type Listing } from '../lessonAudio';
import { recordHref, type Exercise, type LessonDetail } from '../lessons';
import { Button, Checkbox, Drawer, FormActions, Icon, Section, useLoad } from '../ui';

/** Exercises a lesson of a good length has: enough to practise, short enough to finish in a sitting. */
const GOOD_LENGTH = 8;
/** Kinds of exercise in a lesson that is not one question again and again. */
const GOOD_MIX = 3;

/**
 * Build exercises from words: the editor types the words once, Kurdish beside
 * its meaning, chooses which kinds of exercise to make, and they are added to
 * the end of the draft (lessonBuilder.ts), to be edited like any other.
 */
export function QuickBuild({
  open,
  room,
  onClose,
  onAdd,
}: {
  open: boolean;
  /** how many more exercises the lesson takes */
  room: number;
  onClose: () => void;
  onAdd: (exercises: Exercise[]) => void;
}): React.JSX.Element {
  const [text, setText] = useState('');
  const [kinds, setKinds] = useState<Set<BuildKind>>(new Set(BUILD_KINDS.map((k) => k.key)));
  const { pairs, problems } = useMemo(() => parseWords(text), [text]);
  const counts = useMemo(() => buildCounts(pairs), [pairs]);
  const built = useMemo(() => buildExercises(pairs, kinds), [pairs, kinds]);
  const fits = built.length <= room;

  const toggle = (kind: BuildKind, on: boolean): void => {
    const next = new Set(kinds);
    if (on) next.add(kind);
    else next.delete(kind);
    setKinds(next);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Build exercises from words"
      footer={
        <FormActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="plus"
            disabled={built.length === 0 || !fits}
            onClick={() => {
              onAdd(built);
              setText('');
              onClose();
            }}
          >
            {built.length === 0 ? 'Add exercises' : `Add ${built.length} ${built.length === 1 ? 'exercise' : 'exercises'}`}
          </Button>
        </FormActions>
      }
    >
      <div className="form">
        <div className="field">
          <label htmlFor="build-words">Words and phrases</label>
          <div className="field-hint" id="build-words-hint">
            One a line, the Kurdish and then what it means: <code>Silav = Hello</code>. Up to {MAX_WORDS}. Everything made can be edited afterwards.
          </div>
          <textarea
            id="build-words"
            data-autofocus
            rows={8}
            dir="auto"
            spellCheck={false}
            value={text}
            placeholder={'Silav = Hello\nSpas = Thanks\nTu çawa yî? = How are you?\nEz baş im = I am fine'}
            aria-describedby={problems.length ? 'build-words-hint build-words-problems' : 'build-words-hint'}
            onChange={(e) => setText(e.target.value)}
          />
          {problems.length > 0 && (
            <ul id="build-words-problems" className="ex-problems">
              {problems.slice(0, 4).map((p) => (
                <li key={p} className="field-error">
                  {p}
                </li>
              ))}
            </ul>
          )}
          {pairs.length > 0 && (
            <div className="field-hint">
              {pairs.length} {pairs.length === 1 ? 'word' : 'words'}: {pairs.map((p) => p.ku).join(' · ')}
            </div>
          )}
        </div>
        <fieldset className="ex-list">
          <legend>Exercises to make</legend>
          {BUILD_KINDS.map((k) => (
            <Checkbox
              key={k.key}
              label={`${k.label}${pairs.length > 0 ? ` (${counts[k.key]})` : ''}`}
              hint={k.hint}
              checked={kinds.has(k.key)}
              onChange={(on) => toggle(k.key, on)}
            />
          ))}
        </fieldset>
        {!fits && (
          <p className="field-error" role="alert">
            The lesson has room for {room} more {room === 1 ? 'exercise' : 'exercises'}: untick a kind, or use fewer words.
          </p>
        )}
      </div>
    </Drawer>
  );
}

type Check = { tone: 'ok' | 'warn' | 'bad'; text: string; link?: { href: string; label: string } };

/**
 * Is it ready? What a lesson needs before learners get it, checked as the
 * editor works: titles, a good length, a mix of kinds, and its recordings —
 * the sentences, each conversation's lines, and above all a listening item's,
 * without which it cannot be published at all.
 */
export function LessonReadiness({
  lesson,
  exercises,
  titles,
  dirty,
}: {
  lesson: LessonDetail;
  exercises: readonly Exercise[];
  titles: { ku: string; en: string };
  dirty: boolean;
}): React.JSX.Element {
  // read again after every save (its lockVersion moves), which is when the recordings asked for change
  const audio = useLoad(() => api<Listing>('/admin/lesson-audio'), [lesson.id, lesson.lockVersion]);

  const checks = useMemo((): Check[] => {
    const out: Check[] = [];
    out.push(
      titles.ku.trim() && titles.en.trim()
        ? { tone: 'ok', text: 'Titles in Kurdish and English' }
        : { tone: 'bad', text: 'A title in Kurdish and in English is needed' },
    );
    const n = exercises.length;
    out.push(
      n >= GOOD_LENGTH
        ? { tone: 'ok', text: `${n} exercises` }
        : { tone: n === 0 ? 'bad' : 'warn', text: `${n} ${n === 1 ? 'exercise' : 'exercises'}: ${GOOD_LENGTH} or more give a learner enough practice` },
    );
    const kinds = new Set(exercises.map((e) => e.type)).size;
    if (n > 0) {
      out.push(
        kinds >= GOOD_MIX
          ? { tone: 'ok', text: `${kinds} kinds of exercise` }
          : { tone: 'warn', text: `Only ${kinds} ${kinds === 1 ? 'kind' : 'kinds'} of exercise: mix in at least ${GOOD_MIX}` },
      );
    }

    const items = (audio.data?.items ?? []).filter((i) =>
      i.usedIn.some((u) => !isStoryUsage(u) && u.skillId === lesson.skillId && u.lessonPosition === lesson.position),
    );
    if (audio.data) {
      const sentences = items.filter((i) => !i.line);
      const missing = sentences.filter((i) => !i.recorded);
      if (sentences.length > 0) {
        out.push(
          missing.length === 0
            ? { tone: 'ok', text: `All ${sentences.length} sentences recorded` }
            : {
                tone: 'warn',
                text: `${sentences.length - missing.length} of ${sentences.length} sentences recorded`,
                link: { href: recordHref(lesson, true), label: 'Record the rest' },
              },
        );
      }
      const silent = missing.filter(neededForListening);
      if (silent.length > 0) {
        out.push({
          tone: 'bad',
          text: `${silent.length === 1 ? 'A listening item has' : `${silent.length} listening items have`} nothing to play: it can’t be published until recorded`,
          link: { href: recordHref(lesson, true), label: 'Record it' },
        });
      }
      const conversations = new Map<string, { recorded: number; total: number }>();
      for (const i of items) {
        if (!i.line) continue;
        const c = conversations.get(i.line.conversation) ?? { recorded: 0, total: 0 };
        c.total += 1;
        if (i.recorded) c.recorded += 1;
        conversations.set(i.line.conversation, c);
      }
      for (const [id, c] of conversations) {
        out.push(
          c.recorded === c.total
            ? { tone: 'ok', text: `Conversation recorded, all ${c.total} lines`, link: { href: conversationHref(id, lesson.id), label: 'Hear it' } }
            : {
                tone: 'warn',
                text: `Conversation: ${c.recorded} of ${c.total} lines recorded`,
                link: { href: conversationHref(id, lesson.id), label: 'Record the conversation' },
              },
        );
      }
    }
    return out;
  }, [audio.data, exercises, lesson, titles.en, titles.ku]);

  const ready = checks.every((c) => c.tone === 'ok');
  return (
    <Section
      title={ready ? 'Ready for learners' : 'Before it goes to learners'}
      description={dirty ? 'Recordings are counted for the draft as last saved.' : 'What learners need from this lesson, checked as you work.'}
    >
      <ul className="readiness">
        {checks.map((c) => (
          <li key={c.text} className={`readiness-${c.tone}`}>
            <Icon name={c.tone === 'ok' ? 'check' : c.tone === 'bad' ? 'alert' : 'info'} />
            <span>{c.text}</span>
            {c.link && (
              <a className="readiness-link" href={c.link.href}>
                {c.link.label}
              </a>
            )}
          </li>
        ))}
        {audio.loading && !audio.data && <li className="subtle">Checking the recordings…</li>}
      </ul>
    </Section>
  );
}
