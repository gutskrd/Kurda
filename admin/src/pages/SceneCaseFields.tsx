import { useState } from 'react';
import {
  CHARACTER_NAMES,
  EVIDENCE_KINDS,
  SCENE_PLACES,
  SPEAKERS,
  dialectDirection,
  unusedEvidence,
  type CaseFileContent,
  type EvidenceKind,
  type GameDialect,
  type PublishedLine,
  type ScenePlace,
} from '@kurda/shared';
import { publishedLines } from '../gameContent';
import { Badge, Banner, Button, Field, Icon, Note, errorLine, useDebounced, useLoad } from '../ui';

/**
 * The editors of What Would You Say?'s scenes and Kurdish Detective's case
 * files, on the Game content page (GameContent.tsx).
 *
 * Neither ever has Kurdish typed into it. Every Kurdish line is copied from a
 * published lesson, conversation or story with the line picker (GET
 * /admin/game-content/lines), which brings its English and the key its
 * recording is filed under; a line already in a row is shown, never edited,
 * and can only be swapped for another picked one or removed. What the editor
 * writes is in the interface languages: a scene's situation, why a reply fits
 * or not, a case's story, its suspects, questions, solution and hints.
 *
 * The importer fills a scene's line, reply and wrong replies from published
 * conversations; the editor writes the situation, checks each wrong reply
 * really does not fit (removing one that might), and may pick more. A case is
 * put together here card by card.
 */

type Payload = Record<string, unknown>;
type M = Record<string, string>;

const PLACE_NAME: Record<ScenePlace, string> = {
  home: 'At home',
  street: 'In the street',
  market: 'At the market',
  shop: 'In a shop',
  school: 'At school',
  cafe: 'At a café',
  bus: 'On the bus',
  doctor: 'At the doctor’s',
  phone: 'On the phone',
  village: 'In the village',
  party: 'At a celebration',
  work: 'At work',
};

const KIND_LABEL: Record<EvidenceKind, string> = { message: 'Message', statement: 'Statement', overheard: 'Overheard (plays its recording)', note: 'Note' };

const ORIGIN_LABEL: Record<PublishedLine['origin']['type'], string> = { conversation: 'Conversation', lesson: 'Lesson', story: 'Story' };

/** An English line with what it means; English is the one every other language falls back to. */
function English({ label, value, onChange, readOnly, hint }: { label: string; value: M | undefined; onChange: (m: M) => void; readOnly: boolean; hint?: string }): React.JSX.Element {
  return (
    <Field label={label} hint={hint}>
      <input value={value?.en ?? ''} onChange={(e) => onChange({ ...(value ?? {}), en: e.target.value })} readOnly={readOnly} />
    </Field>
  );
}

/** A Kurdish line as it is stored: shown, with where it came from, never typed. */
function KurdishLine({ ku, en, dialect }: { ku: string; en?: string; dialect: GameDialect }): React.JSX.Element {
  const script = dialectDirection(dialect);
  return (
    <span className="gc-line">
      <span className="gc-line-ku" lang={script.lang} dir={script.dir}>
        {ku || '—'}
      </span>
      {en && <span className="subtle">{en}</span>}
    </span>
  );
}

/**
 * The line picker: published lines of the row's variety, searched by their
 * Kurdish or their English, each one a click from being copied in.
 */
export function LinePicker({ dialect, onPick, label = 'Pick a published line', onClose }: { dialect: GameDialect; onPick: (line: PublishedLine) => void; label?: string; onClose: () => void }): React.JSX.Element {
  const [query, setQuery] = useState('');
  const q = useDebounced(query, 300);
  const found = useLoad(() => publishedLines(dialect, q), [dialect, q]);
  const script = dialectDirection(dialect);
  return (
    <div className="gc-picker" role="group" aria-label={label}>
      <div className="row">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input type="search" aria-label="Search published lines" placeholder="Search the Kurdish or its English" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button variant="ghost" icon="close" onClick={onClose}>
          Close
        </Button>
      </div>
      {found.error ? (
        <Banner tone="bad">{errorLine(found.error, 'the published lines')}</Banner>
      ) : !found.data ? (
        <p className="subtle">Looking…</p>
      ) : found.data.lines.length === 0 ? (
        <p className="subtle">No published line matches.</p>
      ) : (
        <ul className="gc-picker-list">
          {found.data.lines.map((line, i) => (
            <li key={`${line.origin.type}:${line.origin.ref}:${i}`}>
              <span className="gc-line">
                <span className="gc-line-ku" lang={script.lang} dir={script.dir}>
                  {line.ku}
                </span>
                <span className="subtle">
                  {line.en ?? 'No English with it: write what it means after picking it.'} · {ORIGIN_LABEL[line.origin.type]}
                  {line.from ? ` “${line.from}”` : ''}
                  {line.speaker ? ` · ${CHARACTER_NAMES[line.speaker]}` : ''} · level {line.level}
                </span>
              </span>
              <Button onClick={() => onPick(line)}>Use this line</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A picked line as a scene's reply: its Kurdish, its English, its recording's key. */
function asReply(line: PublishedLine): Payload {
  return { ku: line.ku, meanings: { en: line.en ?? '' }, ...(line.recording ? { recording: line.recording } : {}) };
}

/** What Would You Say?'s scene: the situation and place, the line heard, the real reply, and the wrong ones. */
export function ScenarioFields({ payload, onChange, dialect, readOnly }: { payload: Payload; onChange: (p: Payload) => void; dialect: GameDialect; readOnly: boolean }): React.JSX.Element {
  const [picking, setPicking] = useState<'line' | 'reply' | 'other' | null>(null);
  const line = (payload.line as Payload | undefined) ?? {};
  const reply = (payload.reply as Payload | undefined) ?? {};
  const others = (payload.others as Payload[] | undefined) ?? [];
  const set = (patch: Payload) => onChange({ ...payload, ...patch });
  const pick = (picked: PublishedLine): void => {
    if (picking === 'line') set({ line: asReply(picked), ...(picked.speaker ? { speaker: picked.speaker } : {}) });
    else if (picking === 'reply') set({ reply: asReply(picked) });
    else if (picking === 'other') set({ others: [...others, asReply(picked)] });
    setPicking(null);
  };
  return (
    <>
      <English
        label="The situation"
        hint="Where this happens and who is talking, in a sentence, in the interface language — never Kurdish. The importer only says who speaks: write the scene."
        value={payload.situation as M}
        onChange={(m) => set({ situation: m })}
        readOnly={readOnly}
      />
      <div className="row">
        <Field label="Place" hint="Drawn on the scene card.">
          <select value={String(payload.place ?? '')} disabled={readOnly} onChange={(e) => set({ place: e.target.value || undefined })}>
            <option value="">No place</option>
            {SCENE_PLACES.map((p) => (
              <option key={p} value={p}>
                {PLACE_NAME[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who is speaking" hint="The character shown saying the line.">
          <select value={String(payload.speaker ?? '')} disabled={readOnly} onChange={(e) => set({ speaker: e.target.value || undefined })}>
            <option value="">Nobody shown</option>
            {SPEAKERS.map((s) => (
              <option key={s} value={s}>
                {CHARACTER_NAMES[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="What they say" hint="Copied from a published conversation.">
        <div className="gc-list">
          <KurdishLine ku={String(line.ku ?? '')} en={(line.meanings as M | undefined)?.en} dialect={dialect} />
          {!readOnly && (
            <Button icon="search" onClick={() => setPicking('line')}>
              {line.ku ? 'Pick another line' : 'Pick the line'}
            </Button>
          )}
        </div>
      </Field>
      <Field label="The real reply" hint="What was really said next. Learners choose it, or build it from tiles at the advanced level.">
        <div className="gc-list">
          <KurdishLine ku={String(reply.ku ?? '')} en={(reply.meanings as M | undefined)?.en} dialect={dialect} />
          {!readOnly && (
            <Button icon="search" onClick={() => setPicking('reply')}>
              {reply.ku ? 'Pick another reply' : 'Pick the reply'}
            </Button>
          )}
          <English label="What the reply means" value={reply.meanings as M} onChange={(m) => set({ reply: { ...reply, meanings: m } })} readOnly={readOnly} />
          <English label="Why it fits (optional)" value={reply.why as M} onChange={(m) => set({ reply: { ...reply, why: m.en ? m : undefined } })} readOnly={readOnly} />
        </div>
      </Field>
      <Field label="Wrong replies" hint="Two to four real lines from other conversations. Check each one could not answer what was said; remove any that might.">
        <div className="gc-list">
          {others.map((o, i) => (
            <div key={i} className="gc-card">
              <KurdishLine ku={String(o.ku ?? '')} dialect={dialect} />
              <English label={`What wrong reply ${i + 1} means`} value={o.meanings as M} onChange={(m) => set({ others: others.map((x, j) => (j === i ? { ...x, meanings: m } : x)) })} readOnly={readOnly} />
              <English
                label={`Why wrong reply ${i + 1} does not fit (optional)`}
                value={o.why as M}
                onChange={(m) => set({ others: others.map((x, j) => (j === i ? { ...x, why: m.en ? m : undefined } : x)) })}
                readOnly={readOnly}
              />
              {!readOnly && (
                <Button variant="ghost" icon="trash" aria-label={`Remove wrong reply ${i + 1}`} disabled={others.length <= 2} onClick={() => set({ others: others.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              )}
            </div>
          ))}
          {!readOnly && others.length < 4 && (
            <Button icon="plus" onClick={() => setPicking('other')}>
              Add a wrong reply from a published line
            </Button>
          )}
        </div>
      </Field>
      {picking && <LinePicker dialect={dialect} onPick={pick} onClose={() => setPicking(null)} label={picking === 'other' ? 'Pick a wrong reply' : 'Pick a published line'} />}
    </>
  );
}

const nextId = (taken: readonly string[], stem: string): string => {
  for (let n = 1; ; n++) if (!taken.includes(`${stem}-${n}`)) return `${stem}-${n}`;
};

/** Kurdish Detective's case file: its story, suspects, evidence picked from published lines, deduction steps, solution and hints. */
export function CaseFileFields({ payload, onChange, dialect, readOnly }: { payload: Payload; onChange: (p: Payload) => void; dialect: GameDialect; readOnly: boolean }): React.JSX.Element {
  const [picking, setPicking] = useState(false);
  const suspects = (payload.suspects as Array<Payload & { id: string }> | undefined) ?? [];
  const evidence = (payload.evidence as Array<Payload & { id: string }> | undefined) ?? [];
  const steps = (payload.steps as Payload[] | undefined) ?? [];
  const hints = (payload.hints as M[] | undefined) ?? [];
  const set = (patch: Payload) => onChange({ ...payload, ...patch });
  const setAt = <T extends Payload>(list: T[], i: number, patch: Payload): T[] => list.map((x, j) => (j === i ? ({ ...x, ...patch } as T) : x));
  const unused = (() => {
    try {
      return unusedEvidence(payload as unknown as CaseFileContent);
    } catch {
      return [];
    }
  })();

  const pick = (line: PublishedLine): void => {
    const card: Payload = {
      id: nextId(
        evidence.map((e) => e.id),
        'card',
      ),
      kind: 'statement',
      ku: line.ku,
      meanings: { en: line.en ?? '' },
      ...(line.speaker ? { speaker: line.speaker } : {}),
      ...(line.recording ? { recording: line.recording } : {}),
      origin: line.origin,
    };
    set({ evidence: [...evidence, card] });
    setPicking(false);
  };

  return (
    <>
      <English label="Title" value={payload.title as M} onChange={(m) => set({ title: m })} readOnly={readOnly} />
      <Field label="The story so far (English)" hint="What the player is told before the evidence: in the interface language, never Kurdish.">
        <textarea rows={3} value={(payload.intro as M | undefined)?.en ?? ''} readOnly={readOnly} onChange={(e) => set({ intro: { ...((payload.intro as M) ?? {}), en: e.target.value } })} />
      </Field>

      <Field label="Suspects" hint="Two to six. A suspect one of the app's characters plays is drawn as them; anyone else gets a plain silhouette.">
        <div className="gc-list">
          {suspects.map((s, i) => (
            <div key={i} className="gc-card row">
              <input aria-label={`Suspect ${i + 1} id`} value={s.id} readOnly={readOnly} onChange={(e) => set({ suspects: setAt(suspects, i, { id: e.target.value }) })} />
              <input aria-label={`Suspect ${i + 1} name`} value={String(s.name ?? '')} readOnly={readOnly} onChange={(e) => set({ suspects: setAt(suspects, i, { name: e.target.value }) })} />
              <input
                aria-label={`Who suspect ${i + 1} is`}
                value={(s.about as M | undefined)?.en ?? ''}
                readOnly={readOnly}
                onChange={(e) => set({ suspects: setAt(suspects, i, { about: { ...((s.about as M) ?? {}), en: e.target.value } }) })}
              />
              <select aria-label={`Suspect ${i + 1} portrait`} value={String(s.portrait ?? '')} disabled={readOnly} onChange={(e) => set({ suspects: setAt(suspects, i, { portrait: e.target.value || undefined }) })}>
                <option value="">Plain silhouette</option>
                {SPEAKERS.map((c) => (
                  <option key={c} value={c}>
                    Drawn as {CHARACTER_NAMES[c]}
                  </option>
                ))}
              </select>
              {!readOnly && (
                <Button variant="ghost" icon="trash" aria-label={`Remove suspect ${i + 1}`} disabled={suspects.length <= 2} onClick={() => set({ suspects: suspects.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              )}
            </div>
          ))}
          {!readOnly && suspects.length < 6 && (
            <Button icon="plus" onClick={() => set({ suspects: [...suspects, { id: nextId(suspects.map((x) => x.id), 'suspect'), name: '', about: { en: '' } }] })}>
              Add a suspect
            </Button>
          )}
        </div>
      </Field>

      <Field label="Evidence" hint="Three to sixteen cards, each a published line picked below. Its meaning stays hidden from the player until a deduction finds it or a hint buys it.">
        <div className="gc-list">
          {evidence.map((e, i) => (
            <div key={i} className="gc-card">
              <div className="row">
                <Badge>{e.id}</Badge>
                {e.origin ? <span className="subtle">{ORIGIN_LABEL[(e.origin as PublishedLine['origin']).type]}</span> : null}
                {unused.includes(e.id) && <Badge tone="warn">No step uses it</Badge>}
              </div>
              <KurdishLine ku={String(e.ku ?? '')} dialect={dialect} />
              <div className="row">
                <select aria-label={`Card ${i + 1} kind`} value={String(e.kind ?? 'statement')} disabled={readOnly} onChange={(ev) => set({ evidence: setAt(evidence, i, { kind: ev.target.value }) })}>
                  {EVIDENCE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <select aria-label={`Card ${i + 1} is from`} value={String(e.from ?? '')} disabled={readOnly} onChange={(ev) => set({ evidence: setAt(evidence, i, { from: ev.target.value || undefined }) })}>
                  <option value="">From no suspect</option>
                  {suspects.map((s) => (
                    <option key={s.id} value={s.id}>
                      From {String(s.name || s.id)}
                    </option>
                  ))}
                </select>
              </div>
              <English label={`What card ${i + 1} means`} value={e.meanings as M} onChange={(m) => set({ evidence: setAt(evidence, i, { meanings: m }) })} readOnly={readOnly} />
              {!readOnly && (
                <Button variant="ghost" icon="trash" aria-label={`Remove card ${i + 1}`} onClick={() => set({ evidence: evidence.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              )}
            </div>
          ))}
          {!readOnly && evidence.length < 16 && (
            <Button icon="plus" onClick={() => setPicking(true)}>
              Add a card from a published line
            </Button>
          )}
          {picking && <LinePicker dialect={dialect} onPick={pick} onClose={() => setPicking(false)} label="Pick a line for the evidence" />}
        </div>
      </Field>

      <Field label="Deduction steps" hint="One to six questions, in the interface language, whose answers can only be worked out from the Kurdish on the cards. Tick the cards that prove each answer.">
        <div className="gc-list">
          {steps.map((s, i) => {
            const options = (s.options as M[] | undefined) ?? [];
            const proof = (s.evidence as string[] | undefined) ?? [];
            return (
              <div key={i} className="gc-card">
                <English label={`Question ${i + 1}`} value={s.prompt as M} onChange={(m) => set({ steps: setAt(steps, i, { prompt: m }) })} readOnly={readOnly} />
                {options.map((o, j) => (
                  <div key={j} className="row">
                    <input
                      type="radio"
                      name={`step-${i}-right`}
                      aria-label={`Answer ${j + 1} of question ${i + 1} is right`}
                      checked={s.correctIndex === j}
                      disabled={readOnly}
                      onChange={() => set({ steps: setAt(steps, i, { correctIndex: j }) })}
                    />
                    <input
                      aria-label={`Answer ${j + 1} of question ${i + 1}`}
                      value={o.en ?? ''}
                      readOnly={readOnly}
                      onChange={(e) => set({ steps: setAt(steps, i, { options: options.map((x, k) => (k === j ? { ...x, en: e.target.value } : x)) }) })}
                    />
                    {!readOnly && options.length > 2 && (
                      <Button
                        variant="ghost"
                        icon="trash"
                        aria-label={`Remove answer ${j + 1} of question ${i + 1}`}
                        onClick={() =>
                          set({ steps: setAt(steps, i, { options: options.filter((_, k) => k !== j), correctIndex: Math.min(Number(s.correctIndex ?? 0), options.length - 2) }) })
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                {!readOnly && options.length < 4 && (
                  <Button icon="plus" onClick={() => set({ steps: setAt(steps, i, { options: [...options, { en: '' }] }) })}>
                    Add an answer
                  </Button>
                )}
                <fieldset className="gc-proof">
                  <legend>The cards that prove it</legend>
                  {evidence.map((e) => (
                    <label key={e.id} className="row">
                      <input
                        type="checkbox"
                        checked={proof.includes(e.id)}
                        disabled={readOnly}
                        onChange={(ev) => set({ steps: setAt(steps, i, { evidence: ev.target.checked ? [...proof, e.id] : proof.filter((x) => x !== e.id) }) })}
                      />
                      <span>{e.id}</span>
                    </label>
                  ))}
                </fieldset>
                {!readOnly && (
                  <Button variant="ghost" icon="trash" aria-label={`Remove question ${i + 1}`} disabled={steps.length <= 1} onClick={() => set({ steps: steps.filter((_, j) => j !== i) })}>
                    Remove the question
                  </Button>
                )}
              </div>
            );
          })}
          {!readOnly && steps.length < 6 && (
            <Button icon="plus" onClick={() => set({ steps: [...steps, { prompt: { en: '' }, options: [{ en: '' }, { en: '' }], correctIndex: 0, evidence: [] }] })}>
              Add a question
            </Button>
          )}
        </div>
      </Field>

      <Field label="Who did it">
        <select value={String(payload.culprit ?? '')} disabled={readOnly} onChange={(e) => set({ culprit: e.target.value })}>
          {suspects.map((s) => (
            <option key={s.id} value={s.id}>
              {String(s.name || s.id)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="The solution (English)" hint="Shown after the accusation: walk back through the evidence, card by card.">
        <textarea rows={3} value={(payload.solution as M | undefined)?.en ?? ''} readOnly={readOnly} onChange={(e) => set({ solution: { ...((payload.solution as M) ?? {}), en: e.target.value } })} />
      </Field>
      <Field label="Written hints" hint="Up to three, in the interface language. Each one read costs the player a point of XP, as a card translated does.">
        <div className="gc-list">
          {hints.map((h, i) => (
            <span key={i} className="row">
              <input aria-label={`Hint ${i + 1}`} value={h.en ?? ''} readOnly={readOnly} onChange={(e) => set({ hints: hints.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)) })} />
              {!readOnly && (
                <Button variant="ghost" icon="trash" aria-label={`Remove hint ${i + 1}`} onClick={() => set({ hints: hints.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              )}
            </span>
          ))}
          {!readOnly && hints.length < 3 && (
            <Button icon="plus" onClick={() => set({ hints: [...hints, { en: '' }] })}>
              Add a hint
            </Button>
          )}
        </div>
      </Field>
      {unused.length > 0 && <Note>Cards no step points at are allowed — a red herring — but are worth a second look: {unused.join(', ')}.</Note>}
    </>
  );
}
