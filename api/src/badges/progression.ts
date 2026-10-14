import type pg from 'pg';
import { LeagueService, type ActivityPublisher, type GemGranter } from '../leagues/service.js';
import { XpService } from '../xp/service.js';
import { BadgeService, type BadgeNotices } from './service.js';
import type { ProgressNotices } from '../notifications/progress-notices.js';

interface Log {
  warn: (obj: unknown, msg: string) => void;
}

export interface Progression {
  xp: XpService;
  leagues: LeagueService;
  badges: BadgeService;
}

/**
 * XP, the leagues and the badges, wired to one another the same way in every
 * process that pays XP or settles a week — the API, the job worker, and the
 * story games the worker finishes for a closing account: every award can join
 * the week's league and tell it the goal is met, and a settled week moves the
 * league badges.
 */
export function createProgression(
  pool: pg.Pool,
  deps: {
    gems?: GemGranter;
    activity?: ActivityPublisher;
    notices?: ProgressNotices;
    /** given the badge service to come (the day's bundled push reads it) */
    badgeNotices?: (badges: () => BadgeService) => BadgeNotices;
    weeklyGoalXp?: number;
    log?: Log;
  } = {},
): Progression {
  const made: { badges?: BadgeService } = {};
  const badges = new BadgeService(pool, { notices: deps.badgeNotices?.(() => made.badges!), log: deps.log });
  made.badges = badges;
  const leagues = new LeagueService(pool, {
    gems: deps.gems,
    activity: deps.activity,
    notices: deps.notices,
    badges,
    weeklyGoalXp: deps.weeklyGoalXp,
    log: deps.log,
  });
  const xp = new XpService(pool, (award) => void leagues.onXp(award).catch((err) => deps.log?.warn({ err }, 'league join failed')));
  return { xp, leagues, badges };
}
