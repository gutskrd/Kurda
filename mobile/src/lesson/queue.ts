/**
 * Offline answer buffer (KUR-029 edge case), from @kurda/shared
 * (lesson-player.ts): FIFO and order-preserving, so an answer given offline is
 * neither lost nor reordered.
 */
export { AnswerQueue, type PendingAnswer, type SubmitFn } from '@kurda/shared';
