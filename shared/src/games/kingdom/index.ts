/**
 * The Village (named "kingdom" throughout the code), which grows from real learning: its buildings
 * and thresholds (buildings.ts), the view the API answers with (view.ts), and
 * the village's drawings and life, which live with the rest of the art
 * (art/kingdom.ts).
 */
export * from './buildings.js';
export * from './view.js';
export {
  BUILDING_SCALE,
  KINGDOM_FRAME,
  KINGDOM_ORIGIN,
  KINGDOM_PLOTS,
  KINGDOM_SCENE,
  KINGDOM_SPRITES,
  KINGDOM_SPRITE_BOX,
  kingdomBuildingSvg,
  kingdomLife,
  kingdomPlotBox,
  kingdomPlotSvg,
  kingdomSceneSvg,
  kingdomSpriteSvg,
  type KingdomActor,
  type KingdomBuildingOptions,
  type KingdomFrame,
  type KingdomLifeKind,
  type KingdomMotion,
  type KingdomNode,
  type KingdomPlot,
  type KingdomPlotOptions,
  type KingdomSceneOptions,
  type KingdomSprite,
} from '../../art/kingdom.js';
