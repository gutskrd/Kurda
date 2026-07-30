import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';

export type RoomEvent = Record<string, unknown> & { type: string };
export type RoomListener = (roomId: string, event: RoomEvent) => void;

/**
 * Room fan-out seam (KUR-049). Publishes go through the bus so ANY node
 * can serve any room: each node subscribes and delivers to its local
 * members. LocalRoomBus (EventEmitter) covers single-node dev/test.
 */
export interface RoomBus {
  publish(roomId: string, event: RoomEvent): Promise<void>;
  onEvent(listener: RoomListener): void;
  close(): Promise<void>;
}

const CHANNEL = 'kurda:rooms';

export class RedisRoomBus implements RoomBus {
  private readonly listeners: RoomListener[] = [];

  /** @param subscriber MUST be a dedicated connection (subscribe mode). */
  constructor(
    private readonly publisher: Redis,
    private readonly subscriber: Redis,
  ) {
    void this.subscriber.subscribe(CHANNEL);
    this.subscriber.on('message', (_channel, raw) => {
      try {
        const { roomId, event } = JSON.parse(raw) as { roomId: string; event: RoomEvent };
        for (const listener of this.listeners) listener(roomId, event);
      } catch {
        // malformed bus payloads are dropped; publishers are trusted code
      }
    });
  }

  async publish(roomId: string, event: RoomEvent): Promise<void> {
    await this.publisher.publish(CHANNEL, JSON.stringify({ roomId, event }));
  }

  onEvent(listener: RoomListener): void {
    this.listeners.push(listener);
  }

  async close(): Promise<void> {
    await this.subscriber.unsubscribe(CHANNEL).catch(() => undefined);
    this.subscriber.disconnect();
  }
}

export class LocalRoomBus implements RoomBus {
  private readonly emitter = new EventEmitter();

  async publish(roomId: string, event: RoomEvent): Promise<void> {
    // next-tick so local publish behaves async like the Redis path
    setImmediate(() => this.emitter.emit('event', roomId, event));
  }

  onEvent(listener: RoomListener): void {
    this.emitter.on('event', listener);
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}
