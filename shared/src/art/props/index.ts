/**
 * What Hevalo shows on each badge, drawn whole: the picture beside him or
 * behind him (awards.ts says where), in its own colours, modelled like the
 * secrets (pictures.ts) — one module for each family's pictures.
 */
import type { Picture } from '../pen.js';
import { GAMES } from './games.js';
import { HABIT } from './habit.js';
import { LEARNING } from './learning.js';
import { SEASONS } from './seasons.js';
import { SOCIAL } from './social.js';

export const PROPS: Readonly<Record<string, Picture>> = { ...LEARNING, ...HABIT, ...GAMES, ...SOCIAL, ...SEASONS };
