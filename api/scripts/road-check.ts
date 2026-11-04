/**
 * The Kurmanji Road’s check from the command line.
 *
 *   tsx scripts/road-check.ts            the plan and every unit file written so far
 *   tsx scripts/road-check.ts 3          the plan and unit 3
 *   tsx scripts/road-check.ts 3 4        the plan and units 3 and 4
 *
 * Prints every problem with its place (lesson key, exercise position, field),
 * then what the units checked add up to: lessons, exercises, minutes, and
 * who records how much. Exits 1 when there is any problem, so a writer can
 * run it after each lesson and a unit lands only when it is clean.
 */
import { checkRoad, checkRoadPlan, formatProblem, loadRoadPlan } from '../src/content/road-check.js';

function main(): void {
  const args = process.argv.slice(2);
  const units = args.map(Number);
  if (units.some((n) => !Number.isInteger(n) || n < 1 || n > 12)) {
    console.error('usage: tsx scripts/road-check.ts [unit 1–12 ...]');
    process.exit(2);
  }

  const plan = loadRoadPlan();
  const planProblems = checkRoadPlan(plan);
  const { problems, stats } = checkRoad({ plan, units: units.length > 0 ? units : undefined });
  const all = [...planProblems, ...problems];
  for (const p of all) console.log(formatProblem(p));

  const per = (counts: Record<string, number>): string => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return Object.entries(counts)
      // the three voices always show; unvoiced recordings only when there are some
      .filter(([who, n]) => n > 0 || who !== 'unvoiced')
      .map(([who, n]) => `${who} ${n} (${total ? Math.round((n / total) * 100) : 0} %)`)
      .join(', ');
  };
  console.log('');
  console.log(stats.units.length > 0 ? `units checked: ${stats.units.join(', ')}` : 'no unit files written yet: only the plan was checked');
  if (stats.units.length > 0) {
    console.log(`lessons ${stats.lessons}, exercises ${stats.exercises}, about ${stats.minutes} minutes, new items ${stats.newItems}`);
    console.log(`sentences to record: ${per(stats.recordings)}`);
    console.log(`conversation lines: ${per(stats.conversationLines)}`);
  }
  console.log(all.length === 0 ? '✓ no problems' : `✗ ${all.length} problem(s)`);
  process.exit(all.length === 0 ? 0 : 1);
}

main();
