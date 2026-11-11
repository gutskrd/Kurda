import { useMemo, useState } from 'react';
import {
  APP_LOCALE_CODES,
  GAME_DIALECTS,
  GAME_LEVELS,
  WHO_AM_I_CATEGORIES,
  WHO_AM_I_FACTS,
  dialectDirection,
  type GameDialect,
  type GameWordCandidate,
  type GameWordSource,
  type WordCardKind,
} from '@kurda/shared';
import { go } from '../nav';
import { GAME_DIALECT_NAME } from '../gameContent';
import { WORD_SOURCE_NAME, listGameWords, makeCardFromWord } from '../gameWords';
import { Badge, Banner, Button, Field, Icon, Section, errorLine, useDebounced, useLoad, useToast } from '../ui';
import './game-words.css';

/**
 * Who Am I?'s identities and its questions, in the admin's Game content page
 * (pages/GameContent.tsx).
 *
 * - `WordPicker`: approved words taught by published lessons, each with its
 *   approved meanings and an example, to make an identity of. The server copies the
 *   Kurdish across (api/src/games/word-cards.ts): nothing Kurdish is typed
 *   here, and each card is a draft until a reviewer approves it.
 * - The editors for those rows afterwards: the word and anything Kurdish read
 *   only, as it was copied; the meanings in the interface languages, an
 *   identity's category and its yes/no facts table, and the level, the
 *   editor's to set.
 * - The editor for a question template: new Kurdish, so a draft for a native
 *   speaker, with the fact it asks and what it means.
 */

export const CATEGORY_NAME: Record<string, string> = {
  animal: 'Animal',
  object: 'Thing',
  profession: 'Job',
  food: 'Food',
  place: 'Place',
};

type Payload = Record<string, unknown>;
type Facts = Record<string, boolean>;

/** The facts table: every fact an identity can be asked about, yes, no or not said. */
export function FactsTable({ facts, onChange, readOnly }: { facts: Facts; onChange: (f: Facts) => void; readOnly: boolean }): React.JSX.Element {
  const set = (key: string, value: string): void => {
    const next = { ...facts };
    if (value === 'yes') next[key] = true;
    else if (value === 'no') next[key] = false;
    else delete next[key];
    onChange(next);
  };
  return (
    <table className="gc-facts">
      <caption>Yes or no for each question a player can ask (at least four)</caption>
      <thead>
        <tr>
          <th scope="col">Fact</th>
          <th scope="col">Answer</th>
        </tr>
      </thead>
      <tbody>
        {WHO_AM_I_FACTS.map((f) => (
          <tr key={f.key}>
            <th scope="row">{f.en}</th>
            <td>
              <select
                aria-label={f.en}
                value={facts[f.key] === true ? 'yes' : facts[f.key] === false ? 'no' : ''}
                disabled={readOnly}
                onChange={(e) => set(f.key, e.target.value)}
              >
                <option value="">Not said</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Meanings by interface language: the Kurdish ones read only when they were copied, the rest the editor's. */
function LanguageMeanings({
  value,
  onChange,
  label,
  readOnly,
  lockedKurdish,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  label: string;
  readOnly: boolean;
  lockedKurdish: boolean;
}): React.JSX.Element {
  const set = (code: string, text: string): void => {
    const next = { ...value };
    if (text === '') delete next[code];
    else next[code] = text;
    onChange(next);
  };
  return (
    <div className="gc-meanings">
      {APP_LOCALE_CODES.map((code) => {
        const kurdish = code === 'ku' || code === 'ckb';
        return (
          <Field key={code} label={`${label} (${code})`} hint={kurdish && lockedKurdish ? 'Copied from the approved source: not typed here.' : undefined}>
            <input value={value[code] ?? ''} onChange={(e) => set(code, e.target.value)} readOnly={readOnly || (kurdish && lockedKurdish)} dir="auto" lang={code} />
          </Field>
        );
      })}
    </div>
  );
}

/** An identity: its word as picked, what it means, what kind of thing it is, and its facts table. */
export function IdentityFields({ payload, onChange, dialect, readOnly }: { payload: Payload; onChange: (p: Payload) => void; dialect: GameDialect; readOnly: boolean }): React.JSX.Element {
  const script = dialectDirection(dialect);
  return (
    <>
      <Field label="The word" hint="Picked from published lessons’ vocabulary; make an identity of another word rather than change it.">
        <input value={String(payload.word ?? '')} readOnly lang={script.lang} dir={script.dir} />
      </Field>
      <LanguageMeanings
        label="What it means"
        value={(payload.meanings as Record<string, string>) ?? { en: '' }}
        onChange={(meanings) => onChange({ ...payload, meanings })}
        readOnly={readOnly}
        lockedKurdish
      />
      <Field label="What kind of thing it is" required>
        <select value={String(payload.category ?? '')} disabled={readOnly} onChange={(e) => onChange({ ...payload, category: e.target.value })}>
          <option value="">Choose…</option>
          {WHO_AM_I_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_NAME[c]}
            </option>
          ))}
        </select>
      </Field>
      <FactsTable facts={(payload.facts as Facts) ?? {}} onChange={(facts) => onChange({ ...payload, facts })} readOnly={readOnly} />
    </>
  );
}

/** A yes/no question: new Kurdish, so a draft for a native speaker; the fact it asks; what it means. */
export function QuestionTemplateFields({ payload, onChange, dialect, readOnly }: { payload: Payload; onChange: (p: Payload) => void; dialect: GameDialect; readOnly: boolean }): React.JSX.Element {
  const script = dialectDirection(dialect);
  return (
    <>
      <Banner tone="warn">
        A question is new Kurdish: it stays a draft that no player sees until a native speaker has read it and approved it. Keep it short and plain, the way a
        learner will read it.
      </Banner>
      <Field label="The question" hint="One yes/no question, in this variety’s script." required>
        <input value={String(payload.ku ?? '')} onChange={(e) => onChange({ ...payload, ku: e.target.value })} lang={script.lang} dir={script.dir} readOnly={readOnly} />
      </Field>
      <Field label="The fact it asks" hint="The identity’s answer to it comes from this row of its facts table." required>
        <select value={String(payload.fact ?? '')} disabled={readOnly} onChange={(e) => onChange({ ...payload, fact: e.target.value })}>
          <option value="">Choose…</option>
          {WHO_AM_I_FACTS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.en}
            </option>
          ))}
        </select>
      </Field>
      <LanguageMeanings
        label="What it means"
        value={(payload.meanings as Record<string, string>) ?? { en: '' }}
        onChange={(meanings) => onChange({ ...payload, meanings })}
        readOnly={readOnly}
        lockedKurdish={false}
      />
    </>
  );
}

/** One word of the picker, made into an identity here, once its category and facts are given. */
function MakeCard({ word, kind, onMade }: { word: GameWordCandidate; kind: WordCardKind; onMade: (id: string) => void }): React.JSX.Element {
  const toast = useToast();
  const [level, setLevel] = useState(1);
  const [category, setCategory] = useState('');
  const [facts, setFacts] = useState<Facts>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = category !== '' && Object.keys(facts).length >= 4;
  const make = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const row = await makeCardFromWord({ kind, dialect: word.dialect, ref: word.ref, level, category, facts });
      toast.success('An identity draft was made. It waits for review.');
      onMade(row.id);
    } catch (err) {
      setError(errorLine(err, 'the card'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gc-make">
      <Field label="Level" hint="1 is the first; beginners play levels 1–2.">
        <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
          {GAME_LEVELS.map((l) => (
            <option key={l} value={l}>
              Level {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What kind of thing it is" required>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Choose…</option>
          {WHO_AM_I_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_NAME[c]}
            </option>
          ))}
        </select>
      </Field>
      <FactsTable facts={facts} onChange={setFacts} readOnly={false} />
      {error && <p className="field-error">{error}</p>}
      <Button variant="primary" icon="plus" busy={busy} disabled={!ready} onClick={() => void make()}>
        Make an identity
      </Button>
    </div>
  );
}

/**
 * Approved words to make a card of, searched by their Kurdish or their
 * meaning, with what each means and an example, and what has already been
 * made of it.
 */
export function WordPicker({ kind, dialect: fixed }: { kind: WordCardKind; dialect?: GameDialect }): React.JSX.Element {
  const [dialect, setDialect] = useState<GameDialect>(fixed ?? 'kmr');
  const [query, setQuery] = useState('');
  // an identity is always a word the lessons teach
  const from: GameWordSource = 'vocabulary';
  const [open, setOpen] = useState<string | null>(null);
  const q = useDebounced(query, 300);
  const list = useLoad(() => listGameWords(dialect, q, from), [dialect, q, from]);
  const script = dialectDirection(dialect);
  const words = useMemo(() => list.data?.words ?? [], [list.data]);
  return (
    <Section
      title="Make identities from approved words"
      description="Pick an animal, a thing, a job, a food or a place from published lessons, say what kind it is and fill in its facts table. Nothing Kurdish is typed; each identity is a draft until a reviewer approves it."
    >
      <div className="table-tools">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input type="search" aria-label="Search the words" placeholder="A Kurdish word or a meaning" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!fixed && (
          <select aria-label="Variety" value={dialect} onChange={(e) => setDialect(e.target.value as GameDialect)}>
            {GAME_DIALECTS.map((d) => (
              <option key={d} value={d}>
                {GAME_DIALECT_NAME[d]}
              </option>
            ))}
          </select>
        )}
      </div>
      {list.error ? <Banner tone="bad">{errorLine(list.error, 'the words')}</Banner> : null}
      {list.loading && !list.data ? <p className="subtle">Looking…</p> : null}
      {list.data && words.length === 0 ? <p className="subtle">No approved word matches. Words come from published lessons and the dictionary entries curated for the games.</p> : null}
      <ul className="gc-words">
        {words.map((w) => {
          const made = w.made[kind];
          return (
            <li key={w.ref} className="gc-word">
              <div className="gc-word-head">
                <span className="gc-word-ku" lang={script.lang} dir={script.dir}>
                  {w.word}
                </span>
                <span>{w.meanings.en ?? Object.values(w.meanings)[0]}</span>
                <Badge>{WORD_SOURCE_NAME[w.source]}</Badge>
                {made ? (
                  <a href={`#/game-content/${made}`}>
                    <Badge tone="ok">Is an identity</Badge>
                  </a>
                ) : null}
              </div>
              {w.example ? (
                <p className="subtle">
                  <span lang={script.lang} dir={script.dir}>
                    {w.example.ku}
                  </span>
                  {w.example.meanings.en ? ` — ${w.example.meanings.en}` : ''}
                </p>
              ) : null}
              {!made &&
                (open === w.ref ? (
                  <MakeCard word={w} kind={kind} onMade={(id) => go(`game-content/${id}`)} />
                ) : (
                  <Button icon="plus" onClick={() => setOpen(w.ref)}>
                    Use this word
                  </Button>
                ))}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
