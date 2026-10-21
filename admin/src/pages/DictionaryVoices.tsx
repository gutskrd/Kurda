import { useCallback, useEffect, useRef, useState } from 'react';
import type { DictionaryAudioAdminItem, DictionaryAudioAdminPage } from '@kurda/shared';
import { scriptOf } from '../lessonAudio';
import { Button, EmptyState, ErrorState, Icon, Loading, Tabs, TextInput, useDebounced } from '../ui';
import { SpeakerPicker, bustUrl, speakerName, useSpeakerChange } from '../ui/SpeakerPicker';
import { SpeakingPreview } from '../ui/SpeakingPreview';
import type { Speaker } from '../voice';
import { dictionaryPage, type DictionaryFilter } from '../voiceBatch';
import { usePlayer, type Player } from './LessonAudio';

type Show = 'all' | 'noSpeaker' | 'noTimeline';

const SHOWS: ReadonlyArray<{ key: Show; label: string; filter: DictionaryFilter }> = [
  { key: 'all', label: 'All', filter: {} },
  { key: 'noSpeaker', label: 'No character', filter: { speaker: 'none' } },
  { key: 'noTimeline', label: 'No timeline', filter: { speaker: 'any', lipsync: 'missing' } },
];

/** A page of the list: enough to work through without a long wait for each. */
const PAGE_SIZE = 50;

const DIALECT_NAMES: Record<string, string> = { kurmanji: 'Kurmancî', sorani: 'Soranî' };

type Counts = DictionaryAudioAdminPage['counts'];

/** The counts after one pronunciation goes from having a character to none, or back. */
function recount(counts: Counts, item: DictionaryAudioAdminItem, to: Speaker): Counts {
  if ((item.speaker === null) === (to === null)) return counts;
  const step = to === null ? 1 : -1;
  return {
    ...counts,
    noSpeaker: counts.noSpeaker + step,
    speakerNoTimeline: item.hasLipsync ? counts.speakerNoTimeline : counts.speakerNoTimeline - step,
  };
}

/**
 * The dictionary's pronunciations: the Dictionary side of the audio studio.
 *
 * They are not recorded here — they come with the dictionary's words, from
 * an import — so this is only who says each one: open a word, choose a
 * character, and hear it say the word. A choice is sent at once (PATCH
 * /admin/audio/dictionary), as for any recording already saved. The
 * Characters side gives many of them a character, and makes their timelines,
 * in one go.
 *
 * Read a page at a time in headword order (GET /admin/dictionary/audio), since
 * an import can bring thousands; a search finds a word by its start, as typed
 * or without its accents.
 */
export function DictionaryVoices(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 300);
  const [show, setShow] = useState<Show>('all');
  const [items, setItems] = useState<DictionaryAudioAdminItem[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<'first' | 'more' | null>('first');
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const player = usePlayer();
  // an older search that answers after a newer one is dropped
  const ticket = useRef(0);
  const latest = useRef(items);
  latest.current = items;

  const load = useCallback(
    async (from: string | null) => {
      const mine = ++ticket.current;
      setLoading(from ? 'more' : 'first');
      try {
        const page = await dictionaryPage({ ...SHOWS.find((s) => s.key === show)!.filter, q }, from, { limit: PAGE_SIZE });
        if (mine !== ticket.current) return;
        setItems((all) => (from ? [...all, ...page.items] : page.items));
        setCursor(page.nextCursor);
        setCounts(page.counts);
        setError(null);
      } catch (err) {
        if (mine === ticket.current) setError(err);
      } finally {
        if (mine === ticket.current) setLoading(null);
      }
    },
    [show, q],
  );

  useEffect(() => {
    setSelected(null);
    void load(null);
  }, [load]);

  const changeSpeaker = useSpeakerChange('dictionary', (id, speaker) => {
    const item = latest.current.find((i) => i.id === id);
    if (!item) return;
    setCounts((c) => c && recount(c, item, speaker));
    setItems((all) => all.map((i) => (i.id === id ? { ...i, speaker } : i)));
  });

  return (
    <div>
      <div className="card aa-summary">
        <div className="aa-summary-head">
          <div>
            <strong className="aa-count">{counts ? `${counts.total} ${counts.total === 1 ? 'pronunciation' : 'pronunciations'}` : 'Pronunciations'}</strong>
            <div className="subtle">
              {counts && `${counts.noSpeaker} without a character, ${counts.speakerNoTimeline} with a character and no mouth timeline. `}
              They come with the dictionary’s words, so there is nothing to record: choose who says each one. The{' '}
              <a href="#/audio/characters">Characters</a> side does many at once.
            </div>
          </div>
        </div>
      </div>

      <div className="dv-tools">
        <TextInput
          label="Find a word"
          type="search"
          value={query}
          dir="auto"
          autoComplete="off"
          spellCheck={false}
          placeholder="sêv"
          onChange={(e) => setQuery(e.target.value)}
          fieldClassName="dv-search"
        />
        <Tabs label="Show" value={show} onChange={setShow} items={SHOWS.map(({ key, label }) => ({ key, label }))} />
      </div>

      {error != null && <ErrorState error={error} onRetry={() => void load(items.length > 0 ? cursor : null)} what="the dictionary’s pronunciations" compact />}

      {loading === 'first' && <Loading rows={4} />}

      {loading !== 'first' && error == null && items.length === 0 && (
        <div className="card">
          <EmptyState
            icon={q || show === 'all' ? 'search' : 'check'}
            title={
              q
                ? `No word starting with “${q}” has a pronunciation${show === 'all' ? '' : ' here'}.`
                : show === 'noSpeaker'
                  ? 'Every pronunciation has a character.'
                  : show === 'noTimeline'
                    ? 'Every pronunciation with a character has a timeline.'
                    : 'The dictionary has no pronunciations yet.'
            }
          />
        </div>
      )}

      {loading !== 'first' && items.length > 0 && (
        <div className="card la-lesson dv-list">
          {items.map((item) => (
            <Row
              key={item.id}
              item={item}
              selected={item.id === selected}
              onSelect={() => setSelected(item.id === selected ? null : item.id)}
              player={player}
              onSpeaker={(speaker) => changeSpeaker({ key: item.id, from: item.speaker, to: speaker, label: item.headword })}
            />
          ))}
        </div>
      )}

      {cursor && loading !== 'first' && (
        <div className="dv-more">
          <Button onClick={() => void load(cursor)} busy={loading === 'more'}>
            {loading === 'more' ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({
  item,
  selected,
  onSelect,
  player,
  onSpeaker,
}: {
  item: DictionaryAudioAdminItem;
  selected: boolean;
  onSelect: () => void;
  player: Player;
  onSpeaker: (speaker: Speaker) => void;
}): React.JSX.Element {
  const script = scriptOf(item.headword);
  const status = !item.speaker
    ? { label: 'No character', tone: '' }
    : item.hasLipsync
      ? { label: 'Timeline made', tone: ' ok' }
      : { label: 'No timeline', tone: ' mid' };
  return (
    <div className={`la-row${selected ? ' is-on' : ''}`}>
      <div className="la-row-line">
        <button
          type="button"
          className="ghost la-play"
          onClick={() => player.toggle(item.url)}
          aria-label={`Play “${item.headword}”`}
          title="Play"
        >
          <Icon name={player.playing === item.url ? 'stop' : 'play'} size={16} />
        </button>
        <button type="button" className="ghost la-row-main" onClick={onSelect} aria-expanded={selected}>
          <span className="la-text" lang={script.lang} dir={script.dir}>
            {item.headword}
          </span>
          <span className="subtle la-used">{DIALECT_NAMES[item.dialect] ?? item.dialect}</span>
        </button>
        {item.speaker && (
          <img className="voice-tag" src={bustUrl(item.speaker)} width={28} height={28} alt={`Said by ${speakerName(item.speaker)}`} title={`Said by ${speakerName(item.speaker)}`} />
        )}
        <span className={`badge${status.tone}`}>{status.label}</span>
      </div>
      {selected && (
        <div className="la-studio">
          <div className="voice-row">
            <SpeakerPicker value={item.speaker} onChange={onSpeaker} hint="Changed as soon as you choose." />
            {item.speaker && (
              <SpeakingPreview key={`${item.url}|${item.speaker}`} speaker={item.speaker} url={item.url} text={item.headword} lipsync={item.lipsync} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
