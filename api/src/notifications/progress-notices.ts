import { makePushSendJob } from '../jobs/push-jobs.js';
import type { JobQueue } from '../jobs/queue.js';
import type { Notification, PushService } from '../push/service.js';
import type { InboxService } from './inbox-service.js';

/**
 * League and badge news: a notification (`record`), or that and a push (`push`) gated at delivery like every push.
 * Pushes go through the queue when there is one, so a weekly settle is not hundreds of sends in a row; without a queue
 * they are delivered at once.
 */
export interface ProgressNotices {
  record(userId: string, notification: Notification): Promise<void>;
  push(userId: string, notification: Notification): Promise<void>;
}

export function progressNotices(deps: {
  inbox: Pick<InboxService, 'record'>;
  push: PushService;
  jobs?: JobQueue | null;
}): ProgressNotices {
  return {
    record: (userId, notification) => deps.inbox.record(userId, notification),
    push: async (userId, notification) => {
      // the job records to the inbox in the worker; inline records here
      if (deps.jobs) {
        await deps.jobs.enqueue(makePushSendJob(deps.push), { userId, notification });
        return;
      }
      await deps.inbox.record(userId, notification);
      await deps.push.deliver(userId, notification);
    },
  };
}
