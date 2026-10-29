/**
 * Which exercises a test to jump ahead asks. Pure, so the spread is tested
 * without a database.
 */

/** A copy of `list` in an order drawn with `random` (Fisher–Yates). */
function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Up to `count` exercises, spread over the skills a test skips (`bySkill`,
 * each skill's exercises, the skills in course order): one from each skill in
 * turn, so every skill is asked about before any is asked twice, and each
 * skill's in an order of its own every time. With more skills than questions,
 * a draw of them, still asked in course order. Fewer than `count` when the
 * skills have fewer.
 */
export function pickJumpItems(bySkill: readonly (readonly string[])[], count: number, random: () => number = Math.random): string[] {
  const lists = bySkill.map((list) => shuffled(list, random));
  const skills = lists.map((_, i) => i).filter((i) => lists[i]!.length > 0);
  const asked = skills.length > count ? shuffled(skills, random).slice(0, count).sort((a, b) => a - b) : skills;
  const out: string[] = [];
  for (let round = 0; out.length < count; round++) {
    const turn = asked.map((i) => lists[i]![round]).filter((id): id is string => id !== undefined);
    if (turn.length === 0) break;
    out.push(...turn.slice(0, count - out.length));
  }
  return out;
}
