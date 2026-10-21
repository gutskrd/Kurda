/** Shared types + pure helpers for the meme/image feed (KUR-291). Native-free so
 *  the helpers are unit-testable. */

import type { Translate } from '../api/errors';
import type { TranslationKey } from '../i18n/translations.js';
import type { CommentAuthor } from '../comments/thread';

export type Reaction = 'like' | 'laugh' | 'love' | 'wow' | 'sad' | 'angry';
export type Category = 'meme' | 'image';
export type AuthorRole = 'user' | 'admin' | 'founder';

/**
 * What a screen reader says in place of the emoji. A TranslationKey rather
 * than a string, so a name cannot reach a button without going through t().
 */
export const REACTION_LABEL: Record<Reaction, TranslationKey> = {
  like: 'memes.reaction.like',
  laugh: 'memes.reaction.laugh',
  love: 'memes.reaction.love',
  wow: 'memes.reaction.wow',
  sad: 'memes.reaction.sad',
  angry: 'memes.reaction.angry',
};

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
  /** who wrote it: a face and a name, rather than an id */
  author?: CommentAuthor;
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  status: 'visible' | 'removed';
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

/** The top-N reacted emojis for a compact summary chip, most-used first. */
export function topReactionEmojis(summary: ReactionSummary, max = 3): string[] {
  return (Object.entries(summary.counts) as [Reaction, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([r]) => REACTION_EMOJI[r]);
}

/**
 * A tombstoned comment renders as a placeholder rather than empty.
 *
 * Takes a translator because the other case passes through: the body is
 * whatever the commenter wrote, in whatever language they wrote it.
 */
export function commentText(c: Comment, t: Translate): string {
  if (c.status === 'removed') return t('comments.removed');
  return c.body ?? '';
}
