import { useId } from 'react';
import { EXERCISE_TYPES, TYPE_HINT, TYPE_NAME, blankPayload, type Exercise, type ExerciseType, type Issue, type Payload } from '../lessons';
import { toPreview } from '../preview';
import { Checkbox, Field, Icon } from '../ui';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str) : []);

/** The problem at one path, for a field's error line. */
function problem(issues: readonly Issue[], path: string): string | undefined {
  return issues.find((i) => i.path === path)?.message;
}

/**
 * One exercise as a form: the fields its type has, each labelled and checked
 * as the server would check it, in place of the raw JSON the page used to ask
 * for. A list (answers, options, pairs) grows and shrinks within the limits
 * the server accepts.
 */
export function ExerciseCard({
  index,
  count,
  exercise,
  issues,
  readOnly,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  exercise: Exercise;
  /** problems in this exercise, paths inside its payload ('prompt', 'options.1') */
  issues: readonly Issue[];
  readOnly: boolean;
  onChange: (next: Exercise) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const id = useId();
  const p = exercise.payload;
  const set = (patch: Payload): void => onChange({ ...exercise, payload: { ...p, ...patch } });
  const at = (path: string): string => `ex-${index}-${path.replace(/\./g, '-')}`;
  const field = (name: string, label: string, opts: { hint?: string; multiline?: boolean; required?: boolean; max?: number; placeholder?: string } = {}) => (
    <Field label={label} hint={opts.hint} error={problem(issues, name)} required={opts.required}>
      {opts.multiline ? (
        <textarea
          id={at(name)}
          rows={2}
          dir="auto"
          value={str(p[name])}
          maxLength={opts.max}
          placeholder={opts.placeholder}
          readOnly={readOnly}
          onChange={(e) => set({ [name]: e.target.value })}
        />
      ) : (
        <input
          id={at(name)}
          dir="auto"
          value={str(p[name])}
          maxLength={opts.max}
          placeholder={opts.placeholder}
          readOnly={readOnly}
          onChange={(e) => set({ [name]: e.target.value })}
        />
      )}
    </Field>
  );

  const general = issues.filter((i) => !i.path || i.path === 'pairs' || i.path === 'options' || i.path === 'accepted' || i.path === 'correctIndex');

  return (
    <article className="card ex-card" aria-labelledby={`${id}-title`}>
      <header className="ex-head">
        <h3 id={`${id}-title`} className="ex-title">
          <span className="ex-n">{index + 1}</span>
          {TYPE_NAME[exercise.type]}
        </h3>
        {!readOnly && (
          <div className="ex-tools">
            <button type="button" className="icon-button ghost" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move exercise ${index + 1} up`}>
              <Icon name="chevronUp" />
            </button>
            <button type="button" className="icon-button ghost" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move exercise ${index + 1} down`}>
              <Icon name="chevronDown" />
            </button>
            <button type="button" className="icon-button ghost is-danger" onClick={onRemove} aria-label={`Remove exercise ${index + 1}`}>
              <Icon name="trash" />
            </button>
          </div>
        )}
      </header>

      <div className="ex-body">
        {!readOnly && (
          <Field label="Kind of exercise" hint={TYPE_HINT[exercise.type]}>
            <select
              id={at('type')}
              value={exercise.type}
              onChange={(e) => {
                const type = e.target.value as ExerciseType;
                onChange({ ...exercise, type, payload: blankPayload(type, p) });
              }}
            >
              {EXERCISE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_NAME[t]}
                </option>
              ))}
            </select>
          </Field>
        )}

        {exercise.type === 'multiple_choice' && (
          <>
            {field('prompt', 'Question', { multiline: true, required: true, max: 500 })}
            <fieldset className="ex-list" aria-describedby={problem(issues, 'correctIndex') ? `${id}-right` : undefined}>
              <legend>Answers — choose the right one</legend>
              {strings(p.options).map((opt, i) => (
                <div key={i} className="ex-list-row">
                  <input
                    type="radio"
                    name={`${id}-right`}
                    checked={p.correctIndex === i}
                    disabled={readOnly}
                    aria-label={`Answer ${i + 1} is the right one`}
                    onChange={() => set({ correctIndex: i })}
                  />
                  <input
                    id={at(`options.${i}`)}
                    dir="auto"
                    value={opt}
                    maxLength={200}
                    readOnly={readOnly}
                    aria-label={`Answer ${i + 1}`}
                    aria-invalid={problem(issues, `options.${i}`) ? true : undefined}
                    onChange={(e) => set({ options: strings(p.options).map((o, j) => (j === i ? e.target.value : o)) })}
                  />
                  {!readOnly && strings(p.options).length > 2 && (
                    <button
                      type="button"
                      className="icon-button ghost"
                      aria-label={`Remove answer ${i + 1}`}
                      onClick={() => {
                        const options = strings(p.options).filter((_, j) => j !== i);
                        const right = typeof p.correctIndex === 'number' ? p.correctIndex : 0;
                        set({ options, correctIndex: right === i ? 0 : right > i ? right - 1 : right });
                      }}
                    >
                      <Icon name="close" />
                    </button>
                  )}
                </div>
              ))}
              {strings(p.options)
                .map((_, i) => problem(issues, `options.${i}`))
                .filter(Boolean)
                .slice(0, 1)
                .map((m) => (
                  <div key={m} className="field-error">
                    {m}
                  </div>
                ))}
              {!readOnly && strings(p.options).length < 6 && (
                <button type="button" className="ghost ex-add" onClick={() => set({ options: [...strings(p.options), ''] })}>
                  <Icon name="plus" />
                  Add an answer
                </button>
              )}
              {problem(issues, 'correctIndex') && (
                <div id={`${id}-right`} className="field-error">
                  {problem(issues, 'correctIndex')}
                </div>
              )}
            </fieldset>
          </>
        )}

        {(exercise.type === 'translate' || exercise.type === 'writing') &&
          field('prompt', exercise.type === 'translate' ? 'Sentence to translate' : 'Task', { multiline: true, required: true, max: 500 })}

        {exercise.type === 'listening' &&
          field('prompt', 'Hint on screen', { hint: 'Optional. Shown beside the sound.', max: 500 })}

        {exercise.type === 'speaking' && (
          <>
            {field('prompt', 'Instruction', { required: true, max: 500, placeholder: 'Say: “Good morning”' })}
            {field('reference', 'Sentence to say', { required: true, max: 300, hint: 'The Kurdish the learner says; its native recording is what they compare with.' })}
          </>
        )}

        {(exercise.type === 'translate' || exercise.type === 'writing' || exercise.type === 'listening') && (
          <TextList
            label={exercise.type === 'listening' ? 'Accepted transcriptions' : 'Accepted answers'}
            hint="The first is shown as the correction, and is the one recorded in the audio studio."
            values={strings(p.accepted)}
            max={12}
            maxLength={exercise.type === 'writing' ? 500 : 300}
            readOnly={readOnly}
            idFor={(i) => at(`accepted.${i}`)}
            issueFor={(i) => problem(issues, `accepted.${i}`)}
            onChange={(accepted) => set({ accepted })}
          />
        )}

        {(exercise.type === 'translate' || exercise.type === 'writing' || exercise.type === 'listening') && (
          <Checkbox
            label="Strict spelling"
            hint="A slip in ê, î, û, ç or ş is not accepted. Leave off for beginners."
            checked={p.strict === true}
            disabled={readOnly}
            onChange={(strict) => set({ strict })}
          />
        )}

        {exercise.type === 'listening' && field('audioUrl', 'Clip address', { hint: 'Optional. Without one, the audio studio’s recording of the first transcription plays.', max: 2000 })}

        {exercise.type === 'match_pairs' && (
          <fieldset className="ex-list">
            <legend>Pairs — Kurdish on the left</legend>
            {(Array.isArray(p.pairs) ? (p.pairs as Array<Record<string, unknown>>) : []).map((pair, i, all) => (
              <div key={i} className="ex-list-row ex-pair">
                {(['left', 'right'] as const).map((side) => (
                  <input
                    key={side}
                    id={at(`pairs.${i}.${side}`)}
                    dir="auto"
                    value={str(pair[side])}
                    maxLength={120}
                    readOnly={readOnly}
                    aria-label={`Pair ${i + 1}, ${side === 'left' ? 'Kurdish' : 'meaning'}`}
                    aria-invalid={problem(issues, `pairs.${i}.${side}`) ? true : undefined}
                    onChange={(e) => set({ pairs: all.map((x, j) => (j === i ? { ...x, [side]: e.target.value } : x)) })}
                  />
                ))}
                {!readOnly && all.length > 2 && (
                  <button type="button" className="icon-button ghost" aria-label={`Remove pair ${i + 1}`} onClick={() => set({ pairs: all.filter((_, j) => j !== i) })}>
                    <Icon name="close" />
                  </button>
                )}
              </div>
            ))}
            {issues
              .filter((i) => i.path.startsWith('pairs.'))
              .map((i) => (
                <div key={i.path} className="field-error">
                  {i.message}
                </div>
              ))}
            {!readOnly && (Array.isArray(p.pairs) ? p.pairs.length : 0) < 8 && (
              <button
                type="button"
                className="ghost ex-add"
                onClick={() => set({ pairs: [...(Array.isArray(p.pairs) ? (p.pairs as unknown[]) : []), { left: '', right: '' }] })}
              >
                <Icon name="plus" />
                Add a pair
              </button>
            )}
          </fieldset>
        )}

        {field('say', 'Say (optional)', {
          max: 300,
          hint: 'The Kurdish a learner should hear for this item when it is not one of the answers — a multiple-choice item’s Kurdish, say. The audio studio asks for a recording of it.',
        })}

        {general.length > 0 && (
          <ul className="ex-problems">
            {general.map((g) => (
              <li key={`${g.path}:${g.message}`} className="field-error">
                {g.message}
              </li>
            ))}
          </ul>
        )}

        <Preview exercise={exercise} />
      </div>
    </article>
  );
}

function TextList({
  label,
  hint,
  values,
  max,
  maxLength,
  readOnly,
  idFor,
  issueFor,
  onChange,
}: {
  label: string;
  hint: string;
  values: string[];
  max: number;
  maxLength: number;
  readOnly: boolean;
  idFor: (i: number) => string;
  issueFor: (i: number) => string | undefined;
  onChange: (next: string[]) => void;
}): React.JSX.Element {
  const id = useId();
  return (
    <fieldset className="ex-list" aria-describedby={`${id}-hint`}>
      <legend>{label}</legend>
      <div id={`${id}-hint`} className="field-hint">
        {hint}
      </div>
      {values.map((v, i) => (
        <div key={i} className="ex-list-row">
          <span className="ex-list-n" aria-hidden="true">
            {i + 1}
          </span>
          <input
            id={idFor(i)}
            dir="auto"
            value={v}
            maxLength={maxLength}
            readOnly={readOnly}
            aria-label={`${label}: ${i + 1}`}
            aria-invalid={issueFor(i) ? true : undefined}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {!readOnly && values.length > 1 && (
            <button type="button" className="icon-button ghost" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(values.filter((_, j) => j !== i))}>
              <Icon name="close" />
            </button>
          )}
        </div>
      ))}
      {values.map((_, i) => issueFor(i)).filter(Boolean).length > 0 && (
        <div className="field-error">{values.map((_, i) => issueFor(i)).find(Boolean)}</div>
      )}
      {!readOnly && values.length < max && (
        <button type="button" className="ghost ex-add" onClick={() => onChange([...values, ''])}>
          <Icon name="plus" />
          Add another
        </button>
      )}
    </fieldset>
  );
}

/** What the learner sees — the same view-model the app's player renders from (preview.ts). */
function Preview({ exercise }: { exercise: Exercise }): React.JSX.Element {
  const m = toPreview(exercise.type, exercise.payload);
  return (
    <details className="ex-preview">
      <summary>What the learner sees</summary>
      <div className="ex-preview-body">
        {m.kind === 'multiple_choice' && (
          <>
            <p dir="auto">{m.prompt || '—'}</p>
            <ul>
              {m.options.map((o, i) => (
                <li key={i} dir="auto" className={o.correct ? 'is-right' : undefined}>
                  {o.text || '—'}
                  {o.correct && <span className="sr-only"> (right)</span>}
                </li>
              ))}
            </ul>
            <p className="subtle">The answers are shown in a different order to each learner.</p>
          </>
        )}
        {m.kind === 'translate' && (
          <>
            <p dir="auto">{m.prompt || '—'}</p>
            <p className="subtle" dir="auto">
              Correction shown: {m.accepted[0] || '—'}
            </p>
          </>
        )}
        {m.kind === 'match_pairs' && (
          <ul>
            {m.pairs.map((pair, i) => (
              <li key={i} dir="auto">
                {pair.left || '—'} ↔ {pair.right || '—'}
              </li>
            ))}
          </ul>
        )}
        {m.kind === 'prompt' && <p dir="auto">{m.prompt || (m.type === 'listening' ? 'A sound to write down.' : '—')}</p>}
        {m.kind === 'unsupported' && <p className="subtle">No preview for this kind.</p>}
      </div>
    </details>
  );
}
