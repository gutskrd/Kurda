import { useState } from 'react';
import { HandPeace } from '@phosphor-icons/react/dist/icons/HandPeace';
import { ICON_WEIGHT } from '../components/icons';
import { useAuth } from '../auth/AuthProvider';

/**
 * The seven reactions a picture can get.
 *
 * The server has stored these since the table was created and nothing on the
 * web ever offered one. A reaction is at most one per person per post, so
 * picking a second replaces the first, and picking the same one again takes it
 * back — which is what tapping a reaction you already left is asking for.
 *
 * Drawn as line glyphs rather than emoji, so they inherit the page's ink and
 * sit with the rest of the icon set instead of importing a second visual
 * language at three different vendors' idea of what "wow" looks like.
 */
// Warmest first, and the same order the server lists them in. Not alphabetical,
// not the order they were added: love, peace, like, laugh, wow, sad, angry.
export const REACTIONS = ['love', 'peace', 'like', 'laugh', 'wow', 'sad', 'angry'] as const;
export type Reaction = (typeof REACTIONS)[number];

const LABELS: Record<Reaction, string> = {
  love: 'Love',
  peace: 'Peace',
  like: 'Like',
  laugh: 'Funny',
  wow: 'Wow',
  sad: 'Sad',
  angry: 'Angry',
};

const face = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

/** A face per reaction: same head, different eyes and mouth. */
function ReactionGlyph({ kind, size = 19 }: { kind: Reaction; size?: number }): React.JSX.Element {
  if (kind === 'like') {
    return (
      <svg {...face(size)}>
        <path d="M7 10.5v9H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" />
        <path d="M7 10.5 11 3a2 2 0 0 1 2 2v4h5.2a1.8 1.8 0 0 1 1.75 2.2l-1.3 6a1.8 1.8 0 0 1-1.75 1.3H7" />
      </svg>
    );
  }
  if (kind === 'love') {
    return (
      <svg {...face(size)}>
        <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13z" />
      </svg>
    );
  }
  const head = <circle cx="12" cy="12" r="9" />;
  if (kind === 'laugh') {
    return (
      <svg {...face(size)}>
        {head}
        <path d="M7.5 9.5c.7-.9 1.8-.9 2.5 0M14 9.5c.7-.9 1.8-.9 2.5 0" />
        <path d="M7 13.5h10a5 5 0 0 1-10 0z" />
      </svg>
    );
  }
  if (kind === 'wow') {
    return (
      <svg {...face(size)}>
        {head}
        <path d="M8.6 8.2h.01M15.4 8.2h.01" strokeWidth="2.2" />
        <ellipse cx="12" cy="15" rx="2.2" ry="2.8" />
      </svg>
    );
  }
  if (kind === 'sad') {
    return (
      <svg {...face(size)}>
        {head}
        <path d="M8.6 10h.01M15.4 10h.01" strokeWidth="2.2" />
        <path d="M8.5 16.2a5 5 0 0 1 7 0" />
      </svg>
    );
  }
  if (kind === 'angry') {
    return (
      <svg {...face(size)}>
        {head}
        {/* brows down toward the nose — the only thing separating this from sad */}
        <path d="M7.6 8.4 10.4 10M16.4 8.4 13.6 10" />
        <path d="M9 11.4h.01M15 11.4h.01" strokeWidth="2.2" />
        <path d="M8.5 16.6a5 5 0 0 1 7 0" />
      </svg>
    );
  }
  // a hand, two fingers up — the only one here that is not a face, and the one
  // glyph taken whole from Phosphor rather than drawn, because a hand has more
  // in it than a circle with a mouth
  return <HandPeace size={size} weight={ICON_WEIGHT} aria-hidden />;
}

export interface ReactionSummary {
  counts: Partial<Record<Reaction, number>>;
  total: number;
  mine: Reaction | null;
}

export function Reactions({ postId, initial }: { postId: string; initial: ReactionSummary }): React.JSX.Element {
  const { client, status } = useAuth();
  const [summary, setSummary] = useState<ReactionSummary>(initial);
  const [busy, setBusy] = useState(false);
  const signedIn = status === 'signedIn';

  async function choose(reaction: Reaction): Promise<void> {
    if (!signedIn || busy) return;
    setBusy(true);
    // tapping the one you already left means "take it back"
    const res =
      summary.mine === reaction
        ? await client.delete<ReactionSummary>(`/images/${postId}/reaction`)
        : await client.put<ReactionSummary>(`/images/${postId}/reaction`, { reaction });
    setBusy(false);
    // the server returns the whole summary; taking it as given keeps the counts
    // right even when someone else reacted while this page was open
    if (res.ok) setSummary(res.data);
  }

  return (
    <div className="reactions" role="group" aria-label="Reactions">
      {REACTIONS.map((r) => {
        const count = summary.counts[r] ?? 0;
        const mine = summary.mine === r;
        return (
          <button
            key={r}
            type="button"
            className={`reaction${mine ? ' is-mine' : ''}`}
            disabled={!signedIn || busy}
            aria-pressed={mine}
            title={signedIn ? LABELS[r] : 'Sign in to react'}
            onClick={() => void choose(r)}
          >
            <ReactionGlyph kind={r} />
            <span className="sr-only">{LABELS[r]}</span>
            {count > 0 && <span className="reaction-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
