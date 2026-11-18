/**
 * The comment thread under a post and the optimistic changes made to it before the server answers. Native-free,
 * so reply placement, deletes and their undo are unit-tested. Library posts and pictures share it (paths in
 * api.ts).
 */

/** Which set of endpoints a thread talks to. */
export type CommentSurface = 'library' | 'images';

/** A comment's author as the API sends it (api/src/social/authors.ts); the avatar is already resolved. */
export interface CommentAuthor {
  id: string;
  username: string;
  avatarUrl: string | null;
}

/** A comment as the thread draws it; a library comment and a picture's comment both fit. */
export interface ThreadComment {
  id: string;
  postId: string;
  authorId: string;
  authorRole: string;
  /** Sent on reads; a library comment just posted comes back without one. */
  author?: CommentAuthor;
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  audioMediaId?: string | null;
  audioUrl?: string | null;
  status: 'visible' | 'removed';
  replyCount: number;
  createdAt: string;
  /** Written on this phone and not yet taken by the server. */
  pending?: boolean;
  /** Pending, and the server was not reached: it waits for Try again or Cancel. */
  failed?: boolean;
  /** The id it had while pending, kept once the server's copy replaces it so its row keeps its key and place. */
  localId?: string;
}

/** The key a comment's row is drawn under: the same before and after the server takes it. */
export const rowKey = (c: ThreadComment): string => c.localId ?? c.id;

/**
 * The loaded thread: the top level, newest first, and each opened branch, oldest first so a conversation reads
 * down. A branch in `replies` is open; others still show "View N replies".
 */
export interface ThreadState<C extends ThreadComment = ThreadComment> {
  top: C[] | null;
  replies: Record<string, C[]>;
}

/** The person signed in, as far as a byline needs them. */
export interface Me {
  id: string;
  username: string;
  profilePhotoUrl: string | null;
}

/**
 * The byline a comment is drawn with. Your own fresh comment has no author from the library API (only reads
 * attach one) and is obviously you; anyone else's without one is drawn from the id.
 */
export function authorOf(c: Pick<ThreadComment, 'author' | 'authorId'>, me: Me | null): CommentAuthor {
  if (c.author) return c.author;
  if (me && c.authorId === me.id) return { id: me.id, username: me.username, avatarUrl: me.profilePhotoUrl };
  return { id: c.authorId, username: '', avatarUrl: null };
}

/** Every list a comment can be in: the top level and each open branch. */
function mapLists<C extends ThreadComment>(state: ThreadState<C>, fn: (list: C[]) => C[]): ThreadState<C> {
  const replies: Record<string, C[]> = {};
  for (const [id, list] of Object.entries(state.replies)) replies[id] = fn(list);
  return { top: state.top ? fn(state.top) : state.top, replies };
}

/** One comment changed wherever it is drawn. */
export function updateComment<C extends ThreadComment>(state: ThreadState<C>, id: string, fn: (c: C) => C): ThreadState<C> {
  return mapLists(state, (list) => (list.some((c) => c.id === id) ? list.map((c) => (c.id === id ? fn(c) : c)) : list));
}

/** Add a comment: a new one at the top, a reply at the end of its branch (which opens), adding one to its parent's count. */
export function addToThread<C extends ThreadComment>(state: ThreadState<C>, c: C): ThreadState<C> {
  const parent = c.parentCommentId;
  if (!parent) return { ...state, top: [c, ...(state.top ?? [])] };
  const withCount = updateComment(state, parent, (p) => ({ ...p, replyCount: p.replyCount + 1 }));
  return { ...withCount, replies: { ...withCount.replies, [parent]: [...(withCount.replies[parent] ?? []), c] } };
}

/** A comment that never made it: gone again, and its parent's count with it. */
export function withdrawFromThread<C extends ThreadComment>(state: ThreadState<C>, c: C): ThreadState<C> {
  const without = mapLists(state, (list) => list.filter((x) => x.id !== c.id));
  if (!c.parentCommentId) return without;
  return updateComment(without, c.parentCommentId, (p) => ({ ...p, replyCount: Math.max(0, p.replyCount - 1) }));
}

/** Where a removed comment stood, so a refused delete can put it back exactly there. */
export interface Removal<C extends ThreadComment = ThreadComment> {
  comment: C;
  /** 'top', or the id of the branch it was in. */
  list: string;
  index: number;
  /** It had replies, so it stayed as a placeholder holding them up. */
  tombstoned: boolean;
}

/** Remove a comment. One with replies stays as the server keeps it ("This comment was removed.") so its replies remain. */
export function removeFromThread<C extends ThreadComment>(
  state: ThreadState<C>,
  id: string,
): { state: ThreadState<C>; removal: Removal<C> | null } {
  const lists: Array<[string, C[]]> = [['top', state.top ?? []], ...Object.entries(state.replies)];
  for (const [list, items] of lists) {
    const index = items.findIndex((c) => c.id === id);
    if (index < 0) continue;
    const comment = items[index]!;
    const tombstoned = comment.replyCount > 0;
    const next = tombstoned
      ? updateComment(state, id, (c) => ({ ...c, status: 'removed' as const, body: null, audioMediaId: null, audioUrl: null }))
      : mapLists(state, (l) => l.filter((c) => c.id !== id));
    return { state: next, removal: { comment, list, index, tombstoned } };
  }
  return { state, removal: null };
}

/** A delete the server refused: put the comment back where it was. */
export function restoreToThread<C extends ThreadComment>(state: ThreadState<C>, removal: Removal<C>): ThreadState<C> {
  const { comment, list, index, tombstoned } = removal;
  if (tombstoned) return updateComment(state, comment.id, () => comment);
  const insert = (items: C[]): C[] => {
    if (items.some((c) => c.id === comment.id)) return items;
    const at = Math.min(index, items.length);
    return [...items.slice(0, at), comment, ...items.slice(at)];
  };
  if (list === 'top') return { ...state, top: insert(state.top ?? []) };
  if (!state.replies[list]) return state;
  return { ...state, replies: { ...state.replies, [list]: insert(state.replies[list]!) } };
}

/** A branch as the server sent it, keeping local additions the server's page lacks, such as a reply sent while it loaded. */
export function mergeBranch<C extends ThreadComment>(server: C[], local: C[] | undefined): C[] {
  const seen = new Set(server.map((c) => c.id));
  return [...server, ...(local ?? []).filter((c) => !seen.has(c.id))];
}
