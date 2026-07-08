import { describe, expect, it } from 'vitest';
import { AnswerQueue, type PendingAnswer } from './queue';

const pa = (id: string): PendingAnswer => ({ exerciseId: id, answer: { choice: 0 } });

describe('AnswerQueue', () => {
  it('flushes queued answers in FIFO order', async () => {
    const q = new AnswerQueue();
    q.enqueue(pa('a'));
    q.enqueue(pa('b'));
    q.enqueue(pa('c'));

    const seen: string[] = [];
    const sent = await q.flush(async (p) => {
      seen.push(p.exerciseId);
      return p.exerciseId;
    });

    expect(seen).toEqual(['a', 'b', 'c']);
    expect(sent).toEqual(['a', 'b', 'c']);
    expect(q.isEmpty()).toBe(true);
  });

  it('stops on a still-offline submit and keeps the rest queued', async () => {
    const q = new AnswerQueue();
    q.enqueue(pa('a'));
    q.enqueue(pa('b'));
    q.enqueue(pa('c'));

    // 'a' succeeds, 'b' is still offline (null) → halt before 'c'
    const sent = await q.flush(async (p) => (p.exerciseId === 'a' ? p.exerciseId : null));

    expect(sent).toEqual(['a']);
    expect(q.pending).toBe(2); // b and c remain, in order
  });

  it('resumes cleanly on a later flush', async () => {
    const q = new AnswerQueue();
    q.enqueue(pa('a'));
    q.enqueue(pa('b'));

    let online = false;
    await q.flush(async (p) => (online ? p.exerciseId : null));
    expect(q.pending).toBe(2);

    online = true;
    const sent = await q.flush(async (p) => p.exerciseId);
    expect(sent).toEqual(['a', 'b']);
    expect(q.isEmpty()).toBe(true);
  });
});
