/**
 * Kurdish Kingdom, the village that grows from real learning: its buildings
 * and thresholds (buildings.ts), the view the API answers with (view.ts), and
 * the village's drawings, which live with the rest of the art (art/kingdom.ts).
 */
export * from './buildings.js';
export * from './view.js';
export {
  KINGDOM_PLOTS,
  KINGDOM_SCENE,
  kingdomBuildingSvg,
  kingdomLife,
  kingdomLifeSvg,
  kingdomSceneSvg,
  type KingdomBuildingOptions,
  type KingdomLifeKind,
  type KingdomLifeSpot,
  type KingdomPlot,
  type KingdomSceneOptions,
} from '../../art/kingdom.js';
