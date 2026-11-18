/**
 * Imports a file of stories all or nothing, by slug; --dry-run writes nothing. The rules, flags and output are in
 * src/stories/import-cli.ts, where they are tested.
 *
 *   npm run stories:import --workspace api -- <file.json> [--dry-run] [--force] [--starter]
 *                                                         [--publish --by <editor email>]
 */
import { runStoryImportCommand } from '../src/stories/import-cli.js';

runStoryImportCommand(process.argv.slice(2), process.env, console).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
