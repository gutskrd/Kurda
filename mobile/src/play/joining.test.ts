import { describe, expect, it } from 'vitest';
import { joined, joining } from './joining';

describe('a lobby opened while its invite is still being accepted', () => {
  it('waits for the accept before it first asks, and for no longer', async () => {
    let accepted: () => void = () => undefined;
    joining('g1', new Promise<void>((resolve) => (accepted = resolve)));
    let asked = false;
    void joined('g1').then(() => (asked = true));
    await Promise.resolve();
    expect(asked).toBe(false);
    accepted();
    await joined('g1');
    expect(asked).toBe(true);
    // nothing is under way any more: the next read is not held up
    await expect(joined('g1')).resolves.toBeUndefined();
  });

  it('asks all the same when the accept was refused: the lobby says why', async () => {
    joining('g2', Promise.reject(new Error('gone')));
    await expect(joined('g2')).resolves.toBeUndefined();
  });

  it('holds up nobody else’s lobby', async () => {
    joining('g3', new Promise(() => undefined));
    await expect(joined('another')).resolves.toBeUndefined();
  });
});
