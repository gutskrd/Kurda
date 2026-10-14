import { useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useApiGet } from '../lib/useApi';
import { LinkButton } from '../components/Button';
import { CheckIcon, ChevronIcon, LockIcon } from '../components/icons';
import { ErrorState } from '../components/states';
import { CourseMapSkeleton } from '../components/skeletons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { GrammarNote } from '../learn/GrammarNote';
import { courseProgress, lessonStates, type LessonState } from '../learn/map';
import type { CourseMap as Map, SkillNode, SkillState } from '../learn/types';

/** What a skill's state means to the learner, in words (the ring colour alone says nothing to many). */
const SKILL_STATE: Record<SkillState, MessageKey> = {
  locked: 'coursemap.state.locked',
  unlocked: 'coursemap.state.open',
  completed: 'coursemap.state.done',
  gold: 'coursemap.state.strong',
  decayed: 'coursemap.state.refresh',
};

const LESSON_STATE: Record<LessonState, MessageKey> = {
  done: 'coursemap.lesson.done',
  next: 'coursemap.lesson.next',
  locked: 'coursemap.lesson.locked',
};

/**
 * A skill's grammar note — its "Tips" — opened in place under the skill and
 * fetched the first time it is asked for, so a map of twenty skills does not
 * fetch twenty notes nobody opened.
 */
function SkillTips({ skill }: { skill: SkillNode }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<{ md: string } | { error: string } | null>(null);

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next && (note === null || 'error' in note)) {
      setNote(null);
      void client.get<{ grammarMd: string }>(`/skills/${encodeURIComponent(skill.skillId)}/grammar`).then((res) => {
        setNote(res.ok ? { md: res.data.grammarMd } : { error: describeError(res.error, t) });
      });
    }
  };

  return (
    <div className="cmap-tips">
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-controls={id} onClick={toggle}>
        {t('coursemap.tips')}
      </button>
      <div id={id} hidden={!open} className="cmap-tips-body" role="region" aria-label={t('coursemap.tipsFor', { skill: skill.title })}>
        {open &&
          (note === null ? (
            <p className="muted" role="status">
              {t('common.loading')}
            </p>
          ) : 'error' in note ? (
            <p className="msg msg-error">{note.error}</p>
          ) : (
            // under the skill's own h3
            <GrammarNote source={note.md} headingLevel={4} />
          ))}
      </div>
    </div>
  );
}

function Skill({ skill, courseId }: { skill: SkillNode; courseId: string }): React.JSX.Element {
  const t = useT();
  const states = lessonStates(skill);
  return (
    <li className={`cmap-skill is-${skill.state}`}>
      <div className="cmap-skill-head">
        <h3 className="cmap-skill-title">{skill.title}</h3>
        <span className={`cmap-state is-${skill.state}`}>
          {skill.state === 'locked' && <LockIcon size={14} />}
          {(skill.state === 'completed' || skill.state === 'gold') && <CheckIcon size={14} />}
          {t(SKILL_STATE[skill.state])}
        </span>
      </div>
      {skill.state === 'locked' && <p className="cmap-why">{t('coursemap.lockedWhy')}</p>}
      {skill.state === 'decayed' && (
        <p className="cmap-why">
          {t('coursemap.refreshWhy')} <Link to="/app/learn/review">{t('coursemap.refreshLink')}</Link>
        </p>
      )}
      {skill.lessons.length > 0 && (
        <ol className="cmap-lessons">
          {skill.lessons.map((lesson, i) => {
            const state = states[i]!;
            const label = (
              <>
                <span className="cmap-lesson-mark" aria-hidden="true">
                  {state === 'done' ? <CheckIcon size={14} /> : state === 'locked' ? <LockIcon size={14} /> : i + 1}
                </span>
                <span className="cmap-lesson-title">{lesson.title}</span>
                <span className="cmap-lesson-state">{t(LESSON_STATE[state])}</span>
              </>
            );
            return (
              <li key={lesson.lessonId} className={`cmap-lesson is-${state}`}>
                {state === 'locked' ? (
                  <span className="cmap-lesson-row">{label}</span>
                ) : (
                  <Link
                    className="cmap-lesson-row"
                    to={`/app/learn/lesson/${lesson.lessonId}?course=${encodeURIComponent(courseId)}`}
                    state={{ title: lesson.title }}
                  >
                    {label}
                    <ChevronIcon size={16} />
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {skill.hasGrammar && <SkillTips skill={skill} />}
    </li>
  );
}

/**
 * A course's map (/app/learn/course/:courseId): its units, each unit's skills,
 * each skill's lessons — done, next or still closed — and the skill's grammar
 * tips. Skills open in order, as they do on the phone: finishing one opens the
 * next, and a placement test can open several at once.
 */
export function CourseMap(): React.JSX.Element {
  const t = useT();
  const { courseId = '' } = useParams();
  const { data, error, loading, reload } = useApiGet<Map>(`/courses/${encodeURIComponent(courseId)}/map`);

  if (loading && !data) {
    return (
      <div className="container">
        <CourseMapSkeleton />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="container">
        <ErrorState message={error ?? t('common.somethingWentWrong')} onRetry={reload} />
      </div>
    );
  }

  const progress = courseProgress(data);
  return (
    <div className="container">
      <div className="page-header">
        <Link to="/app/learn" className="eyebrow cmap-back">
          {t('coursemap.back')}
        </Link>
        <h1 className="page-title">{data.course.title}</h1>
        <p className="page-sub">{t('coursemap.progress', { done: progress.done, total: progress.total })}</p>
        {progress.next && (
          <LinkButton
            to={`/app/learn/lesson/${progress.next.lessonId}?course=${encodeURIComponent(data.course.id)}`}
            state={{ title: progress.next.title }}
            className="cmap-continue"
          >
            {progress.done === 0 ? t('learn.start') : t('learn.continue')}
          </LinkButton>
        )}
      </div>

      {data.units.map((unit) => (
        <section className="cmap-unit" key={unit.unitId} aria-labelledby={`unit-${unit.unitId}`}>
          <h2 className="cmap-unit-title" id={`unit-${unit.unitId}`}>
            {unit.title}
          </h2>
          <ol className="cmap-skills">
            {unit.skills.map((skill) => (
              <Skill key={skill.skillId} skill={skill} courseId={data.course.id} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
