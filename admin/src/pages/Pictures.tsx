import { useMemo, useState } from 'react';
import {
  ART_SLOT_FAMILIES,
  ART_SLOT_FAMILY_INFO,
  BADGES,
  BADGE_TIERS,
  artSlotsOf,
  type ArtSlotEntry,
  type ArtSlotFamily,
  type LeagueTier,
  type RankTier,
} from '@kurda/shared';
import { api } from '../api';
import { badgeTierName, leagueTierName, rankTierName } from '../progress';
import { ArtPicker, type UploadedArt } from '../shop/ArtPicker';
import { artSrc } from '../shop/art';
import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Section,
  Tabs,
  TextInput,
  Time,
  errorLine,
  useDialogs,
  useLoad,
  useToast,
} from '../ui';
import { BadgeArt, LeagueEmblem, RankEmblem, SeasonFrame } from './RankParts';

interface Override {
  slot: string;
  assetKey: string;
  url: string | null;
  note: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

interface HistoryEntry {
  assetKey: string | null;
  url: string | null;
  note: string | null;
  changedAt: string;
  changedBy: string | null;
}

const badgeDefs = new Map(BADGES.map((b) => [b.key, b]));

/** What a slot is called, as an admin would say it. */
export function slotName(entry: Pick<ArtSlotEntry, 'family' | 'key' | 'level'>): string {
  switch (entry.family) {
    case 'badge': {
      const def = badgeDefs.get(entry.key);
      const name = def ? def.nameKu : entry.key;
      return entry.level ? `${name} · ${badgeTierName(BADGE_TIERS.indexOf(entry.level as never) + 1)}` : name;
    }
    case 'rank':
      return rankTierName(entry.key as RankTier);
    case 'frame':
      return `${rankTierName(entry.key as RankTier)} frame`;
    case 'league':
      return leagueTierName(entry.key as LeagueTier);
    case 'avatar':
      return `Default ${entry.key.replace('default-', '')}`;
    case 'event':
      return entry.key.charAt(0).toUpperCase() + entry.key.slice(1);
  }
}

/** The art that ships for a slot, drawn as the apps draw it. */
function Original({ entry, size }: { entry: ArtSlotEntry; size: number }): React.JSX.Element {
  switch (entry.family) {
    case 'badge': {
      const tiers = badgeDefs.get(entry.key)?.tiers.length ?? 1;
      const tier = entry.level ? BADGE_TIERS.indexOf(entry.level as never) + 1 : tiers;
      return <BadgeArt badgeKey={entry.key} tier={tier} tiers={tiers} size={size} />;
    }
    case 'rank':
      return <RankEmblem tier={entry.key as RankTier} size={size} />;
    case 'frame':
      return <SeasonFrame tier={entry.key as RankTier} size={size} />;
    case 'league':
      return <LeagueEmblem tier={entry.key as LeagueTier} size={size} />;
    case 'avatar':
      return <img className="pic-original-img" src={artSrc(`/cosmetics/avatars/${entry.key}.png`) ?? ''} alt="" width={size} height={size} />;
    case 'event':
      return <span className="pic-event-original">{slotName(entry)}: the app’s own colours</span>;
  }
}

function Shown({ entry, override, size }: { entry: ArtSlotEntry; override: Override | undefined; size: number }): React.JSX.Element {
  const url = override?.url ?? null;
  return (
    <span className={`pic-shown is-${ART_SLOT_FAMILY_INFO[entry.family].shape}`} style={{ '--pic-size': `${size}px` } as React.CSSProperties}>
      {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <Original entry={entry} size={size} />}
    </span>
  );
}

/**
 * Every picture the apps draw from their own art, and the uploaded picture
 * that replaces it where one does: badges (one for every level, or one per
 * level), rank and league emblems, season frames, the default profile
 * pictures, and event banners. A picture is uploaded and checked as shop art
 * is, shown in the apps within minutes, and taken back to the original with
 * one tap; each slot keeps its history. Shop backgrounds and icons are items
 * in Shop.
 */
export function Pictures(): React.JSX.Element {
  const [family, setFamily] = useState<ArtSlotFamily>('badge');
  const [query, setQuery] = useState('');
  const [onlyReplaced, setOnlyReplaced] = useState(false);
  const [open, setOpen] = useState<ArtSlotEntry | null>(null);
  const data = useLoad(() => api<{ overrides: Override[] }>('/admin/art'), []);
  const bySlot = useMemo(() => new Map((data.data?.overrides ?? []).map((o) => [o.slot, o])), [data.data]);

  // a badge is one card, its levels inside it
  const cards = useMemo(() => artSlotsOf(family).filter((e) => e.level === null), [family]);
  const replacedIn = (f: ArtSlotFamily): number => artSlotsOf(f).filter((e) => bySlot.has(e.slot)).length;
  const anyReplaced = (e: ArtSlotEntry): boolean => artSlotsOf(e.family).some((x) => x.key === e.key && bySlot.has(x.slot));
  const q = query.trim().toLowerCase();
  const shown = cards.filter((e) => (!onlyReplaced || anyReplaced(e)) && (!q || `${slotName(e)} ${e.key}`.toLowerCase().includes(q)));

  return (
    <div>
      <PageHeader
        title="Pictures"
        subtitle={
          <>
            Put your own picture in place of any badge, emblem, frame, default profile picture or event banner. It shows in the app and on the website within
            minutes, and the original comes back with one tap. Shop backgrounds and icons are in <a href="#/shop">Shop</a>.
          </>
        }
      />
      <Tabs
        label="Kind of picture"
        value={family}
        onChange={(f) => {
          setFamily(f);
          setQuery('');
        }}
        items={ART_SLOT_FAMILIES.map((f) => ({ key: f, label: ART_SLOT_FAMILY_INFO[f].label, count: data.data ? replacedIn(f) || undefined : undefined }))}
      />
      {data.error != null ? (
        <ErrorState error={data.error} onRetry={() => void data.reload()} what="the pictures" />
      ) : !data.data ? (
        <Loading rows={4} />
      ) : (
        <Section title={ART_SLOT_FAMILY_INFO[family].label} description={ART_SLOT_FAMILY_INFO[family].hint}>
          <div className="pic-tools">
            {family === 'badge' && <TextInput label="Find a badge" value={query} onChange={(e) => setQuery(e.target.value)} autoCapitalize="off" spellCheck={false} />}
            <Checkbox label="Only the replaced ones" checked={onlyReplaced} onChange={setOnlyReplaced} />
          </div>
          {shown.length === 0 ? (
            <EmptyState title={onlyReplaced ? 'Nothing here is replaced yet' : 'Nothing matches'} compact icon="search" />
          ) : (
            <ul className="pic-grid">
              {shown.map((e) => {
                const replaced = anyReplaced(e);
                return (
                  <li key={e.slot}>
                    <button type="button" className="card pic-card" onClick={() => setOpen(e)} aria-label={`${slotName(e)}: ${replaced ? 'replaced' : 'original'}. Change`}>
                      <Shown entry={e} override={bySlot.get(e.slot)} size={family === 'event' ? 120 : 72} />
                      <span className="pic-card-name" lang={family === 'avatar' || family === 'event' ? undefined : 'ku'}>
                        {slotName(e)}
                      </span>
                      <Badge tone={replaced ? 'info' : 'neutral'}>{replaced ? 'Replaced' : 'Original'}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}
      {open && (
        <SlotDrawer
          entry={open}
          overrides={bySlot}
          onClose={() => setOpen(null)}
          onChanged={() => void data.reload()}
        />
      )}
    </div>
  );
}

function SlotDrawer({
  entry,
  overrides,
  onClose,
  onChanged,
}: {
  entry: ArtSlotEntry;
  overrides: ReadonlyMap<string, Override>;
  onClose: () => void;
  onChanged: () => void;
}): React.JSX.Element {
  const slots = artSlotsOf(entry.family).filter((e) => e.key === entry.key);
  return (
    <Drawer open onClose={onClose} title={slotName(entry)}>
      <p className="subtle pic-drawer-hint">{ART_SLOT_FAMILY_INFO[entry.family].hint}</p>
      {slots.map((s) => (
        <SlotEditor
          key={s.slot}
          entry={s}
          override={overrides.get(s.slot)}
          // a level with no picture of its own shows the one for every level, as the apps do
          inherited={s.level ? overrides.get(slots[0]!.slot) : undefined}
          levelled={slots.length > 1}
          onChanged={onChanged}
        />
      ))}
    </Drawer>
  );
}

function SlotEditor({
  entry,
  override,
  inherited,
  levelled,
  onChanged,
}: {
  entry: ArtSlotEntry;
  override: Override | undefined;
  inherited: Override | undefined;
  levelled: boolean;
  onChanged: () => void;
}): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const kind = ART_SLOT_FAMILY_INFO[entry.family].shape === 'wide' ? 'background' : 'icon';
  const [uploaded, setUploaded] = useState<UploadedArt | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [picker, setPicker] = useState(0);
  const title = !levelled ? 'The picture' : entry.level ? `${badgeTierName(BADGE_TIERS.indexOf(entry.level as never) + 1)} only` : 'Every level';

  async function put(assetKey: string | null, what: string): Promise<void> {
    setSaving(true);
    try {
      const path = `/admin/art/${encodeURIComponent(entry.slot)}`;
      if (assetKey) await api(path, { method: 'PUT', body: { assetKey, ...(note.trim() ? { note: note.trim() } : {}) } });
      else await api(path, { method: 'DELETE', body: note.trim() ? { note: note.trim() } : {} });
      toast.success(what);
      setUploaded(null);
      setNote('');
      setPicker((n) => n + 1);
      setHistory(null);
      onChanged();
    } catch (err) {
      toast.error(errorLine(err, 'the picture'));
    } finally {
      setSaving(false);
    }
  }

  async function reset(): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Put the original back?',
      body: 'The app and the website show their own picture again within minutes. Yours can be put back from the history for a day.',
      confirmLabel: 'Put the original back',
    });
    if (ok) await put(null, 'The original picture is back.');
  }

  async function loadHistory(): Promise<void> {
    try {
      const res = await api<{ history: HistoryEntry[] }>(`/admin/art/${encodeURIComponent(entry.slot)}/history`);
      setHistory(res.history);
    } catch (err) {
      toast.error(errorLine(err, 'the history'));
    }
  }

  return (
    <section className="pic-editor" aria-label={title}>
      <h3 className="drawer-sub">{title}</h3>
      <div className="pic-compare">
        <figure>
          <Shown entry={entry} override={undefined} size={96} />
          <figcaption>Original</figcaption>
        </figure>
        <figure>
          <Shown entry={entry} override={override ?? inherited} size={96} />
          <figcaption>
            {override ? `Now: replaced${override.updatedBy ? ` by ${override.updatedBy}` : ''}` : inherited ? 'Now: the picture for every level' : 'Now: the original'}
          </figcaption>
        </figure>
      </div>
      {override?.note && <p className="subtle">“{override.note}”</p>}
      <ArtPicker key={picker} kind={kind} currentUrl={null} onChange={setUploaded} onBusy={setUploading} label="New picture" optional generic />
      <TextInput label="Note (optional)" hint="Why, or where the picture is from." value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      <div className="form-actions pic-actions">
        {override && (
          <Button onClick={() => void reset()} disabled={saving}>
            Put the original back
          </Button>
        )}
        <Button variant="primary" icon="check" disabled={!uploaded || uploading} busy={saving} onClick={() => uploaded && void put(uploaded.key, 'The new picture is in place.')}>
          Use this picture
        </Button>
      </div>
      {history === null ? (
        <Button variant="ghost" onClick={() => void loadHistory()}>
          Show the history
        </Button>
      ) : history.length === 0 ? (
        <p className="subtle">Never changed.</p>
      ) : (
        <ol className="pic-history">
          {history.map((h, i) => (
            <li key={`${h.changedAt}-${i}`}>
              <span className="pic-history-thumb">{h.url ? <img src={h.url} alt="" /> : <span className="subtle">Original</span>}</span>
              <span className="pic-history-text">
                {h.assetKey ? 'Replaced' : 'Original put back'} <Time value={h.changedAt} />
                {h.changedBy ? ` by ${h.changedBy}` : ''}
                {h.note && <span className="subtle">“{h.note}”</span>}
              </span>
              {h.assetKey && h.assetKey !== override?.assetKey && (
                <Button onClick={() => void put(h.assetKey, 'That picture is back in place.')} disabled={saving}>
                  Use again
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

