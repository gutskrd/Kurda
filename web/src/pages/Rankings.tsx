import { useState } from 'react';
import { useApiGet } from '../lib/useApi';
import { Loading, ErrorState, EmptyState } from '../components/states';

interface Entry {
  rank: number;
  username: string;
  score: number;
}
interface Board {
  entries: Entry[];
  me: { rank: number; score: number } | null;
}

type BoardType = 'weekly_xp' | 'rating';
const LABEL: Record<BoardType, { unit: string; blurb: string }> = {
  weekly_xp: { unit: 'XP', blurb: 'This week’s top learners by experience earned.' },
  rating: { unit: 'Rating', blurb: 'All-time skill rating from ranked matches.' },
};

export function Rankings(): React.JSX.Element {
  const [board, setBoard] = useState<BoardType>('weekly_xp');
  const { data, error, loading, reload } = useApiGet<Board>(`/leaderboards/${board}`);
  const entries = data?.entries ?? [];

  return (
    <div className="container container-narrow">
      <div className="page-header">
        <span className="eyebrow">Pilebendî · Leaderboards</span>
        <h1 className="page-title">Rankings</h1>
        <p className="page-sub">{LABEL[board].blurb}</p>
      </div>

      <div className="toolbar">
        <button className={`chip${board === 'weekly_xp' ? ' active' : ''}`} onClick={() => setBoard('weekly_xp')}>
          Weekly XP
        </button>
        <button className={`chip${board === 'rating' ? ' active' : ''}`} onClick={() => setBoard('rating')}>
          Rating
        </button>
      </div>

      {data?.me && (
        <div className="rank-row" style={{ marginBottom: 16, borderColor: 'var(--border-strong)' }}>
          <span className="rank-pos">#{data.me.rank}</span>
          <span className="rank-name">You</span>
          <span className="rank-score">
            {data.me.score.toLocaleString()} {LABEL[board].unit}
          </span>
        </div>
      )}

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : entries.length === 0 ? (
        <EmptyState title="No rankings yet" message="Once learners start earning points, the leaderboard will fill up here." />
      ) : (
        <div className="post-list">
          {entries.map((e) => (
            <div className="rank-row" key={`${e.rank}-${e.username}`}>
              <span className="rank-pos">{e.rank}</span>
              <span className="rank-name">{e.username}</span>
              <span className="rank-score">
                {e.score.toLocaleString()} {LABEL[board].unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
