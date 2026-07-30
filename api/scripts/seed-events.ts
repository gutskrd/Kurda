/**
 * Cultural event seeder (KUR-090).
 *
 *   tsx scripts/seed-events.ts [file.json ...] [--years N] [--dry-run]
 *
 * Reads annual event templates (defaults to every template in content/events/)
 * and upserts one events-table row per upcoming year — so recurring holidays
 * like Newroz appear on time without a code deploy. Idempotent: rows are keyed
 * `<key>-<year>`, so re-running only refreshes. Files that aren't event
 * templates (e.g. lesson content) are skipped. --dry-run reports without writing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { z } from 'zod';
import { loadConfig } from '../src/config/env.js';
import { Cache } from '../src/cache/cache.js';
import { EventService } from '../src/events/service.js';
import { upcomingOccurrences, type AnnualEventTemplate } from '../src/events/recurrence.js';

const templateSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().min(1),
  type: z.string().min(1),
  theme: z.string().min(1),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  durationDays: z.number().int().min(1).max(60),
  priority: z.number().int().min(0).optional(),
  quests: z.array(z.unknown()).optional(),
  rewards: z.record(z.string(), z.unknown()).optional(),
});

const EVENTS_DIR = fileURLToPath(new URL('../content/events', import.meta.url));

function templateFiles(args: string[]): string[] {
  if (args.length > 0) return args.map((a) => resolve(a));
  return readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => resolve(EVENTS_DIR, f));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const files = argv.filter((a) => !a.startsWith('--'));
  const dryRun = argv.includes('--dry-run');
  const yearsArg = argv.find((a) => a.startsWith('--years='));
  const years = yearsArg ? Math.max(1, Number(yearsArg.split('=')[1])) : 3;

  const templates: AnnualEventTemplate[] = [];
  for (const file of templateFiles(files)) {
    const parsed = templateSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (parsed.success) templates.push(parsed.data);
    else console.log(`• skipping ${file} (not an event template)`);
  }
  if (templates.length === 0) {
    console.error('no event templates found');
    process.exit(1);
  }

  const now = new Date();
  const occurrences = templates.flatMap((t) => upcomingOccurrences(t, now, years));

  if (dryRun) {
    console.log(`would seed ${occurrences.length} occurrence(s):`);
    for (const o of occurrences) console.log(`  ${o.key}  ${o.startsAt} → ${o.endsAt}`);
    return;
  }

  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  try {
    const events = new EventService(pool, new Cache(null));
    for (const o of occurrences) {
      await events.upsert({
        key: o.key,
        name: o.name,
        type: o.type,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        priority: o.priority,
        theme: o.theme,
        quests: o.quests,
        rewards: o.rewards,
      });
      console.log(`✓ ${o.key}  ${o.startsAt} → ${o.endsAt}`);
    }
    console.log(`seeded ${occurrences.length} occurrence(s) from ${templates.length} template(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
