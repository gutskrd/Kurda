/**
 * Offline answer buffer (KUR-029 edge case). When the network drops
 * mid-lesson, answers are appended here and flushed in order on reconnect.
 * FIFO and order-preserving: a failed submit stops the flush and keeps the
 * remaining answers queued, so nothing is lost or reordered.
 */

export interface PendingAnswer {
  exerciseId: string;
  answer: unknown;
}

/** Result of submitting one answer; `false` = still offline, requeue. */
export type SubmitFn<R> = (pending: PendingAnswer) => Promise<R | null>;

export class AnswerQueue {
  private items: PendingAnswer[] = [];

  enqueue(pending: PendingAnswer): void {
    this.items.push(pending);
  }

  get pending(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Flush queued answers in order. `submit` returns the server result, or
   * `null` to signal a still-failing network — flushing halts and the
   * unsent answers (including the failed one) remain queued. Returns the
   * results of the answers that went through, in order.
   */
  async flush<R>(submit: SubmitFn<R>): Promise<R[]> {
    const sent: R[] = [];
    while (this.items.length > 0) {
      const next = this.items[0]!;
      const result = await submit(next);
      if (result === null) break; // still offline — keep it and stop
      this.items.shift();
      sent.push(result);
    }
    return sent;
  }
}
