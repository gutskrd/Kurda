/**
 * The Kurmanji Road’s check from the command line.
 *
 *   tsx scripts/road-check.ts            the plan and every unit file written so far
 *   tsx scripts/road-check.ts 3          the plan and unit 3
 *   tsx scripts/road-check.ts 3 4        the plan and units 3 and 4
 *   tsx scripts/road-check.ts --hamo 3   unit 3 as if it were already marked as written for Hamo
 *                                        alone, so a writer can see what is left before marking it
 *   tsx scripts/road-check.ts --stories draft.json 3
 *                                        unit 3 with the stories of another file in the same shape,
 *                                        a draft a writer checks before it joins the road's file
 *
 * Each chapter's story (content/stories/road.json) is checked with it: its
 * words against what the chapter taught, and everything a published story
 * must be (its length, its questions and their evidence), as the seeding
 * checks it.
 *
 * Prints every problem with its place (lesson key, exercise position, field),
 * then what the units checked add up to: lessons, exercises, minutes, and
 * who records how much. Exits 1 when there is any problem, so a writer can
 * run it after each lesson and a unit lands only when it is clean.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROAD_RECORDER, ROAD_STORIES_FILE, checkRoad, checkRoadPlan, checkRoadStories, formatProblem, loadRoadPlan, loadRoadStories } from '../src/content/road-check.js';
import { parseStoryFile } from '../src/stories/import.js';

function main(): void {
  const args = process.argv.slice(2);
  const asHamo = args.includes('--hamo');
  const at = args.indexOf('--stories');
  const storiesFile = at >= 0 ? args[at + 1] : undefined;
  const units = args.filter((a, i) => a !== '--hamo' && (at < 0 || (i !== at && i !== at + 1))).map(Number);
  if (units.some((n) => !Number.isInteger(n) || n < 1 || n > 12) || (asHamo && units.length === 0) || (at >= 0 && !storiesFile)) {
    console.error('usage: tsx scripts/road-check.ts [--hamo] [--stories file.json] [unit 1–12 ...] (--hamo needs the units it is for)');
    process.exit(2);
  }
  const file = storiesFile ? resolve(storiesFile) : ROAD_STORIES_FILE;

  const plan = loadRoadPlan();
  // checked as if marked for Hamo alone: the chapter and every lesson in it his
  if (asHamo) {
    for (const unit of plan.units) {
      if (!units.includes(unit.number)) continue;
      unit.recorder = ROAD_RECORDER;
      for (const skill of unit.skills) for (const lesson of skill.lessons) lesson.voice = ROAD_RECORDER;
    }
  }
  const planProblems = checkRoadPlan(plan);
  const { problems, stats } = checkRoad({ plan, units: units.length > 0 ? units : undefined });
  // and the stories Hamo tells at the chapters' ends: those of the units asked about, or all of them
  const asked = (slug: string): boolean => units.length === 0 || units.some((n) => slug.startsWith(`road-${String(n).padStart(2, '0')}-`));
  const stories = loadRoadStories(file).filter((st) => asked(st.slug));
  // what a published story must be, as the seeding and the admin panel check it; advice is shown, not counted
  const told = stories.length > 0 ? parseStoryFile(JSON.parse(readFileSync(file, 'utf8')), 'publish') : { issues: [], warnings: [] };
  const ofAsked = (i: { path: string }): boolean => stories.some((st) => i.path.includes(`(${st.slug})`));
  const storyIssues = told.issues.filter(ofAsked).map((i) => ({ lesson: 'story', field: i.path, message: i.message }));
  const all = [...planProblems, ...problems, ...checkRoadStories(plan, stories), ...storyIssues];
  for (const p of all) console.log(formatProblem(p));
  for (const w of told.warnings.filter(ofAsked)) console.log(`advice ${w.path}: ${w.message}`);

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
