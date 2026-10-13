/**
 * Story import CLI.
 *
 *   npm run stories:import --workspace api -- <file.json> [--dry-run] [--force] [--starter]
 *                                                         [--publish --by <editor email>]
 *
 * Imports a file of stories all or nothing, by slug; --dry-run writes
 * nothing. The rules, the flags and what it prints are in
 * src/stories/import-cli.ts, where they are tested.
 */
import { runStoryImportCommand } from '../src/stories/import-cli.js';

runStoryImportCommand(process.argv.slice(2), process.env, console).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
