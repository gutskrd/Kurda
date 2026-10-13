import { describe, expect, it } from 'vitest';
import { parseStoryImportArgs } from './import-cli.js';

const args = (over: object = {}) => ({ file: 'stories.json', dryRun: false, publish: false, by: null, starter: false, force: false, ...over });

describe('parseStoryImportArgs', () => {
  it('takes one file and the switches, in any order', () => {
    expect(parseStoryImportArgs(['stories.json'])).toEqual({ ok: true, args: args() });
    expect(parseStoryImportArgs(['--dry-run', 'stories.json', '--force', '--starter'])).toEqual({
      ok: true,
      args: args({ dryRun: true, force: true, starter: true }),
    });
    expect(parseStoryImportArgs(['stories.json', '--publish', '--by', 'rojda@hevalo.app'])).toEqual({
      ok: true,
      args: args({ publish: true, by: 'rojda@hevalo.app' }),
    });
    expect(parseStoryImportArgs(['--by=rojda@hevalo.app', '--publish', 'stories.json'])).toEqual({
      ok: true,
      args: args({ publish: true, by: 'rojda@hevalo.app' }),
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
});
