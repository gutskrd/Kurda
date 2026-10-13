import { describe, expect, it } from 'vitest';
import { parseStoryImportArgs } from './import-cli.js';

const args = (over: object = {}) => ({ file: 'stories.json', dryRun: false, publish: false, by: null, starter: false, force: false, ...over });

describe('parseStoryImportArgs', () => {
  it('takes one file and the switches, in any order', () => {
    expect(parseStoryImportArgs(['stories.json'])).toEqual({ ok: true, args: args(), notes: [] });
    expect(parseStoryImportArgs(['--dry-run', 'stories.json', '--force', '--starter'])).toEqual({
      ok: true,
      args: args({ dryRun: true, force: true, starter: true }),
      notes: [],
    });
    expect(parseStoryImportArgs(['stories.json', '--publish', '--by', 'rojda@hevalo.app'])).toEqual({
      ok: true,
      args: args({ publish: true, by: 'rojda@hevalo.app' }),
      notes: [],
    });
    expect(parseStoryImportArgs(['--by=rojda@hevalo.app', '--publish', 'stories.json'])).toEqual({
      ok: true,
      args: args({ publish: true, by: 'rojda@hevalo.app' }),
      notes: [],
    });
  });

  it('publishes only as a named editor, and names one only to publish', () => {
    expect(parseStoryImportArgs(['stories.json', '--publish'])).toEqual({
      ok: false,
      message: '--publish needs --by <email>: the editor who publishes',
    });
    expect(parseStoryImportArgs(['stories.json', '--publish', '--by'])).toMatchObject({ ok: false });
    expect(parseStoryImportArgs(['stories.json', '--publish', '--by', '--dry-run'])).toMatchObject({ ok: false });
    expect(parseStoryImportArgs(['stories.json', '--by', 'rojda@hevalo.app'])).toMatchObject({ ok: false });
  });

  it('refuses what it does not know rather than ignore it', () => {
    // a misspelt dry run must not become a write
    expect(parseStoryImportArgs(['stories.json', '--dryrun'])).toEqual({ ok: false, message: 'unknown option --dryrun' });
    expect(parseStoryImportArgs([])).toEqual({ ok: false, message: 'which file?' });
    expect(parseStoryImportArgs(['a.json', 'b.json'])).toEqual({ ok: false, message: 'one file at a time (got a.json, b.json)' });
  });

  // `npm run stories:import stories.json --dry-run` (no "--"): npm keeps the option, the command sees only the file
  it('honours a dry run npm kept for itself', () => {
    expect(parseStoryImportArgs(['stories.json'], { npm_config_dry_run: 'true' })).toEqual({
      ok: true,
      args: args({ dryRun: true }),
      notes: ['! npm kept --dry-run for itself (options before "--" are npm\'s); this is a dry run all the same'],
    });
    // given after "--" as well: nothing to say
    expect(parseStoryImportArgs(['stories.json', '--dry-run'], { npm_config_dry_run: 'true' })).toMatchObject({ notes: [] });
    // npm writes a negated or empty option as false or empty
    for (const value of ['', 'false']) {
      expect(parseStoryImportArgs(['stories.json'], { npm_config_dry_run: value })).toMatchObject({ ok: true, args: { dryRun: false } });
    }
  });

  it('refuses, rather than guesses, any option npm kept that would write more or differently', () => {
    // npm 10 with `stories.json --publish --by rojda@hevalo.app`: the address is left behind as a second file
    const res = parseStoryImportArgs(['stories.json', 'rojda@hevalo.app'], { npm_config_publish: 'true', npm_config_by: 'true' });
    expect(res).toEqual({
      ok: false,
      message:
        'npm kept --publish --by for itself (options before "--" are npm\'s), so nothing was done. ' +
        'Put them after "--": npm run stories:import --workspace api -- <file.json> --publish --by …',
    });
    for (const option of ['starter', 'force']) {
      expect(parseStoryImportArgs(['stories.json'], { [`npm_config_${option}`]: 'true' })).toMatchObject({ ok: false });
    }
    // with a dry run among them, still nothing
    expect(parseStoryImportArgs(['stories.json'], { npm_config_dry_run: 'true', npm_config_force: 'true' })).toMatchObject({ ok: false });
    // the same options after "--" are the command's own
    expect(parseStoryImportArgs(['stories.json', '--force'], { npm_config_force: 'true' })).toMatchObject({ ok: true, args: { force: true } });
  });
});
