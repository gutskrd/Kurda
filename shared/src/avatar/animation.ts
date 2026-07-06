/**
 * Animation-ready asset rules (KUR-080).
 *
 * The avatar pipeline is procedural SVG, so "animated cosmetics" are
 * SVG fragments carrying declarative SMIL nodes (<animate>/
 * <animateTransform>) on top of their static shapes. Rules:
 *
 *  1. ADDITIVE ONLY — the static art must render completely when the
 *     animation nodes are stripped (react-native-svg ignores SMIL, so
 *     mobile silently falls back to the static frame until the
 *     Reanimated pipeline lands).
 *  2. LOOP-SAFE — every animation node repeats indefinitely; nothing
 *     depends on document load time.
 *  3. BOUNDED — at most MAX_ANIMATED_NODES nodes, durations between
 *     MIN/MAX_DURATION so avatars never distract from gameplay.
 *
 * validateAnimatedFragment() enforces these; new animatable cosmetics
 * must pass it in tests before shipping.
 */

export const MAX_ANIMATED_NODES = 3;
export const MIN_DURATION_SECONDS = 1;
export const MAX_DURATION_SECONDS = 4;

export type AnimationRuleViolation =
  | { rule: 'too_many_nodes'; count: number }
  | { rule: 'bad_duration'; dur: string }
  | { rule: 'not_looping'; node: number }
  | { rule: 'no_static_base' };

export function validateAnimatedFragment(fragment: string): AnimationRuleViolation[] {
  const violations: AnimationRuleViolation[] = [];

  const animatedNodes = fragment.match(/<animate(Transform|Motion)?\b/g) ?? [];
  if (animatedNodes.length > MAX_ANIMATED_NODES) {
    violations.push({ rule: 'too_many_nodes', count: animatedNodes.length });
  }

  const withoutAnimation = fragment.replace(/<animate(Transform|Motion)?\b[^>]*\/>/g, '');
  const staticShapes = withoutAnimation.match(/<(path|polygon|circle|rect|ellipse)\b/g) ?? [];
  if (staticShapes.length === 0) {
    violations.push({ rule: 'no_static_base' });
  }

  for (const dur of fragment.matchAll(/dur="([^"]+)"/g)) {
    const seconds = Number((dur[1] as string).replace(/s$/, ''));
    if (!Number.isFinite(seconds) || seconds < MIN_DURATION_SECONDS || seconds > MAX_DURATION_SECONDS) {
      violations.push({ rule: 'bad_duration', dur: dur[1] as string });
    }
  }

  let nodeIndex = 0;
  for (const node of fragment.matchAll(/<animate(?:Transform|Motion)?\b[^>]*\/>/g)) {
    nodeIndex++;
    if (!node[0].includes('repeatCount="indefinite"')) {
      violations.push({ rule: 'not_looping', node: nodeIndex });
    }
  }

  return violations;
}
