import { describe, expect, it } from 'vitest';

/*
 * Rules every screen that comes and goes keeps, read from the sources: a Modal closes on Android's back and does not
 * slide under Reduce Motion, and every native stack moves alike and goes back to a place already open.
 */

/** Node's file system, which this workspace's types do not describe: the test reads the sources it runs beside. */
interface Files {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
}
const FILES = 'node:fs';
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ FILES)) as Files;

const SRC = new URL('..', import.meta.url).pathname;
const APP = new URL('../../App.tsx', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === 'testing' ? [] : sources(path);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : [];
  });
}

const files = [...sources(SRC), APP].map((file) => ({ file: file === APP ? 'App.tsx' : file.slice(SRC.length), text: readFileSync(file, 'utf8') }));

/** Each `<Modal …>` opening tag, with the file it is in; an arrow inside a prop does not end it. */
const modals = files.flatMap(({ file, text }) => [...text.matchAll(/<Modal\b(?:=>|[^>])*>/g)].map((m) => ({ file, tag: m[0] })));

describe('every Modal', () => {
  it('closes on Android’s back', () => {
    expect(modals.length).toBeGreaterThanOrEqual(15);
    expect(modals.filter(({ tag }) => !/\bonRequestClose=/.test(tag)).map(({ file }) => file)).toEqual([]);
  });

  it('fades rather than slides under Reduce Motion', () => {
    expect(modals.filter(({ tag }) => /animationType="slide"/.test(tag)).map(({ file }) => file)).toEqual([]);
  });
});

describe('every native stack', () => {
  // The navigators made by `createNativeStackNavigator`, by name, with each one's opening tag.
  const navigators = files.flatMap(({ file, text }) =>
    [...text.matchAll(/const (\w+) = createNativeStackNavigator\b/g)].flatMap(([, name]) =>
      [...text.matchAll(new RegExp(`<${name}\\.Navigator\\b[\\s\\S]*?\\n\\s*>`, 'g'))].map((m) => ({ file, tag: m[0] })),
    ),
  );

  it('takes the options every stack shares', () => {
    expect(navigators.length).toBeGreaterThanOrEqual(3);
    expect(navigators.filter(({ tag }) => !/screenOptions=\{stackOptions\(/.test(tag)).map(({ file }) => file)).toEqual([]);
  });

  it('pushes every card with the card options, so each one grows from a press and swipes back alike', () => {
    expect(files.filter(({ text }) => /presentation: 'card'/.test(text)).map(({ file }) => file)).toEqual([]);
  });

  it('goes back to a place already open', () => {
    expect(navigators.filter(({ tag }) => !/UNSTABLE_router=\{\w+Router\}/.test(tag)).map(({ file }) => file)).toEqual([]);
  });
});
