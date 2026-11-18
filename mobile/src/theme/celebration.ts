/**
 * The app's one celebration (timing and flecks) lives in @kurda/shared (celebration.ts), so phone and website play it
 * the same; theme/CelebrationParts.tsx draws it.
 */
export {
  BURST,
  CELEBRATE_MS,
  burstPlan,
  celebrationEndMs,
  celebrationPlan,
  type CelebrationPlan,
  type CelebrationFleck as Fleck,
} from '@kurda/shared';
