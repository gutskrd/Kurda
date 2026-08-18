/** Shared types + pure helpers for the meme/image feed (KUR-291). Native-free so
 *  the helpers are unit-testable. */

export type Reaction = 'like' | 'laugh' | 'love' | 'wow' | 'sad' | 'angry';
export type Category = 'meme' | 'image';
export type AuthorRole = 'user' | 'admin' | 'founder';

/** Display order + emoji for the reaction bar. */
export const REACTION_ORDER: readonly Reaction[] = ['laugh', 'love', 'like', 'wow', 'sad', 'angry'];
export const REACTION_EMOJI: Record<Reaction, string> = {
  like: '👍',
  laugh: '😂',
  love: '❤️',
  wow: '😮',
  sad: '😢',
  angry: '😡',
};

export interface ImagePost {
  id: string;
  authorId: string;
  authorRole: AuthorRole;
  imageMediaId: string;
  imageUrl: string | null;
  caption: string | null;
  category: Category;
  language: string | null;
  viewCount: number;
  reactionCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReactionSummary {
  counts: Partial<Record<Reaction, number>>;
  total: number;
  mine: Reaction | null;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorRole: AuthorRole;
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  status: 'visible' | 'removed';
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Short relative age, e.g. "now", "5m", "3h", "2d", "5w". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 45) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(iso).toLocaleDateString();
}

/** The top-N reacted emojis for a compact summary chip, most-used first. */
export function topReactionEmojis(summary: ReactionSummary, max = 3): string[] {
  return (Object.entries(summary.counts) as [Reaction, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([r]) => REACTION_EMOJI[r]);
}

/** A tombstoned comment renders as a placeholder rather than empty. */
export function commentText(c: Comment): string {
  if (c.status === 'removed') return 'This comment was removed.';
  return c.body ?? '';
}
