import { makePushSendJob } from '../jobs/push-jobs.js';
import type { JobQueue } from '../jobs/queue.js';
import type { Notification, PushService } from '../push/service.js';
import type { InboxService } from './inbox-service.js';

/**
 * League and badge news, as the leagues and badges send it: a line in the
 * in-app list (`record`), or that and a push (`push`) — the push gated at
 * delivery by the learner's settings and quiet hours, like every other.
 *
 * The push goes through the queue when there is one, as the streak reminders
 * do, so a weekly settle telling a few hundred people is not a few hundred
 * sends in a row; without a queue (a single process in development) it is
 * delivered straight away.
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
