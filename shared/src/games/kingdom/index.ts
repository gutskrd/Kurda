/**
 * The Village (named "kingdom" throughout the code), which grows from real
 * learning: its buildings and thresholds (buildings.ts), the view the API
 * answers with (view.ts), what the valley round them gains as the total level
 * rises (growth.ts), and the village's drawings and life, which live with the
 * rest of the art (art/kingdom.ts).
 */
export * from './buildings.js';
export * from './view.js';
export * from './growth.js';
/** The camera both apps move over the village's world (camera.ts), as one name so its plain words never clash with others. */
export * as villageCamera from './camera.js';
export type { Camera as VillageCamera, Stage as VillageStage } from './camera.js';
export {
  BUILDING_SCALE,
  KINGDOM_ANIMAL_HEIGHT,
  KINGDOM_FIGURE_HEIGHT,
  KINGDOM_FRAME,
  KINGDOM_ORIGIN,
  KINGDOM_PLOTS,
  KINGDOM_SCENE,
  KINGDOM_SPRITES,
  KINGDOM_SPRITE_BOX,
  KINGDOM_TILE,
  kingdomActorReach,
  kingdomBuildingDoors,
  kingdomBuildingSvg,
  kingdomFeatureAt,
  kingdomLife,
  kingdomPlotBox,
  kingdomPlotSvg,
  kingdomSceneSvg,
  kingdomSpriteSvg,
  kingdomTiles,
  kingdomTotal,
  kingdomWaterAt,
  type KingdomActor,
  type KingdomTile,
  type KingdomBuildingOptions,
  type KingdomFrame,
  type KingdomLifeKind,
  type KingdomMotion,
  type KingdomNode,
  type KingdomPlot,
  type KingdomPlotOptions,
  type KingdomSceneOptions,
  type KingdomSprite,
  type KingdomTap,
} from '../../art/kingdom.js';
