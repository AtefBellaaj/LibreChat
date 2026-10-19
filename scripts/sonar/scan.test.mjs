import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { analyze, scan } from './scan.mjs';
import { addMessages, createReport } from './report.mjs';

test('real SonarJS rules classify JavaScript and TypeScript at each band edge', () => {
  for (const extension of ['js', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts', 'jsx']) {
    for (const count of [9, 10, 15, 16, 19, 20, 25, 26, 39, 40, 50, 51]) {
      const parameter = ['ts', 'tsx', 'mts', 'cts'].includes(extension) ? 'x: number' : 'x';
      const source =
        `export function check(${parameter}) {\n` +
        Array.from({ length: count }, (_, i) => `if (x === ${i}) return ${i};`).join('\n') +
        '\nreturn -1;\n}';
      const report = createReport();
      addMessages(report, `fixture.${extension}`, analyze(source, `fixture.${extension}`));
      const cognitive =
        count <= 15 ? [] : [`cognitive-${count <= 25 ? 'low' : count <= 50 ? 'medium' : 'high'}`];
      const cyclomatic =
        count + 1 <= 10
          ? []
          : [`cyclomatic-${count + 1 <= 20 ? 'low' : count + 1 <= 40 ? 'medium' : 'high'}`];
      assert.deepEqual(
        report.issues.map((issue) => issue.ruleId).sort(),
        [...cognitive, ...cyclomatic].sort(),
      );
      for (const issue of report.issues) {
        assert.equal(issue.primaryLocation.filePath, `fixture.${extension}`);
        assert.ok(issue.secondaryLocations.length > 0);
      }
    }
  }
});

test('a failed repository scan removes a stale report and never publishes partial findings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sonar-bands-'));
  try {
    execFileSync('/usr/bin/git', ['init', '--quiet', root]);
    await mkdir(join(root, '.sonar'));
    await writeFile(join(root, '.sonar/complexity.json'), '{"issues": []}');
    await writeFile(join(root, 'sonar-project.properties'), 'sonar.sources=.\nsonar.tests=.\n');
    await writeFile(join(root, 'broken.ts'), 'function {');
    await assert.rejects(scan(root), /broken.ts/);
    await assert.rejects(access(join(root, '.sonar/complexity.json')), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repository scan uses system Git and publishes only included source findings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sonar-bands-'));
  const originalPath = process.env.PATH;
  try {
    execFileSync('/usr/bin/git', ['init', '--quiet', root]);
    await writeFile(
      join(root, 'sonar-project.properties'),
      'sonar.sources=.\nsonar.tests=.\nsonar.test.inclusions=**/*.test.*\n',
    );
    const source =
      'export function example(x) {\n' +
      Array.from({ length: 16 }, (_, i) => `if (x === ${i}) return ${i};`).join('\n') +
      '\n}';
    await writeFile(join(root, 'tracked.js'), source);
    execFileSync('/usr/bin/git', ['-C', root, 'add', 'tracked.js']);
    await writeFile(join(root, 'untracked source.ts'), source);
    await writeFile(join(root, 'excluded.test.ts'), 'function {');
    await writeFile(join(root, '.gitignore'), 'ignored.js\n');
    await writeFile(join(root, 'ignored.js'), 'function {');
    // A writable PATH entry must not replace the Git executable used by the scan.
    await writeFile(join(root, 'git'), '#!/bin/sh\nexit 99\n');
    await chmod(join(root, 'git'), 0o755);
    process.env.PATH = root;

    const report = await scan(root);
    const published = JSON.parse(await readFile(join(root, '.sonar/complexity.json'), 'utf8'));
    assert.deepEqual(published, report);
    assert.equal(report.rules.length, 6);
    assert.deepEqual(
      report.issues.map((issue) => [issue.primaryLocation.filePath, issue.ruleId]),
      [
        ['tracked.js', 'cognitive-low'],
        ['tracked.js', 'cyclomatic-low'],
        ['untracked source.ts', 'cognitive-low'],
        ['untracked source.ts', 'cyclomatic-low'],
      ],
    );
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
});

test('ESLint suppression comments cannot hide complexity findings', () => {
  const source =
    '/* eslint-disable */\nfunction example(x) {\n' +
    Array.from({ length: 16 }, (_, i) => `if (x === ${i}) return ${i};`).join('\n') +
    '\n}';
  const report = createReport();
  addMessages(report, 'source.js', analyze(source, 'source.js'));
  assert.equal(report.issues.length, 2);
});

test('JSX and nested functions are analyzed without the application ESLint configuration', () => {
  const source = `export function Component({ x }: { x: number }) {
    function nested() { ${Array.from({ length: 21 }, (_, i) => `if (x === ${i}) return ${i};`).join(' ')} }
    return <span>{nested()}</span>;
  }`;
  const report = createReport();
  addMessages(report, 'Component.tsx', analyze(source, 'Component.tsx'));
  assert.equal(report.issues.filter((issue) => issue.ruleId === 'cyclomatic-medium').length, 1);
  assert.equal(report.issues.filter((issue) => issue.ruleId === 'cognitive-low').length, 1);
  assert.throws(() => addMessages(createReport(), 'broken.ts', analyze('function {', 'broken.ts')));
});
