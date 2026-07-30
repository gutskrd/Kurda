// Admin panel entry (KUR-099). The API is the source of truth for authorization;
// this workspace's RBAC helpers only gate what the UI shows. The React/Vite shell
// is bootstrapped in a follow-up — the nav/capability model lands here first.
export const SERVICE = 'admin';
export { NAV_SECTIONS, visibleNav, type NavSection, type Capability } from './rbac.js';
export { toPreview, type PreviewModel, type ExerciseType } from './preview.js';
