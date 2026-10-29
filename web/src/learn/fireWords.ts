import type { LitFireStage } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

/** Each stage's name, standing alone. */
export const FIRE_STAGE_NAME: Record<LitFireStage, MessageKey> = {
  spark: 'fire.stage.spark',
  kindling: 'fire.stage.kindling',
  campfire: 'fire.stage.campfire',
  bigfire: 'fire.stage.bigfire',
  bonfire: 'fire.stage.bonfire',
  blaze: 'fire.stage.blaze',
  newroz: 'fire.stage.newroz',
};

/** What the fire grew into, said on the day it did. */
export const FIRE_GREW: Record<LitFireStage, MessageKey> = {
  spark: 'fire.grew.spark',
  kindling: 'fire.grew.kindling',
  campfire: 'fire.grew.campfire',
  bigfire: 'fire.grew.bigfire',
  bonfire: 'fire.grew.bonfire',
  blaze: 'fire.grew.blaze',
  newroz: 'fire.grew.newroz',
};

/** The next stage as a near goal, and the day it comes; never the spark, which a kept streak has already lit. */
export const FIRE_NEXT: Record<Exclude<LitFireStage, 'spark'>, MessageKey> = {
  kindling: 'fire.next.kindling',
  campfire: 'fire.next.campfire',
  bigfire: 'fire.next.bigfire',
  bonfire: 'fire.next.bonfire',
  blaze: 'fire.next.blaze',
  newroz: 'fire.next.newroz',
};
