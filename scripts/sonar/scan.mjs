import { Linter } from 'eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import parser from '@typescript-eslint/parser';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addMessages, createReport, metrics, sourceFiles } from './report.mjs';

export function analyze(source, filePath) {
  const linter = new Linter();
  return linter.verify(
    source,
    [
      {
        files: ['**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}'],
        languageOptions: {
          parser,
          ecmaVersion: 'latest',
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: false },
        plugins: { sonarjs },
        settings: { sonarRuntime: true },
        rules: {
          'sonarjs/cognitive-complexity': ['warn', metrics.cognitive.threshold],
          'sonarjs/cyclomatic-complexity': ['warn', { threshold: metrics.cyclomatic.threshold }],
        },
      },
    ],
    { filename: filePath, allowInlineConfig: false },
  );
}

export async function scan(root) {
  const output = resolve(root, '.sonar/complexity.json');
  // A failed run must not leave a previous report available for import.
  await rm(output, { force: true });
  const properties = await readFile(resolve(root, 'sonar-project.properties'), 'utf8');
  const gitFiles = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  )
    .split('\0')
    .filter(Boolean);
  const files = sourceFiles(gitFiles, properties);
  if (!files.length) throw new Error('No JavaScript or TypeScript source files found.');
  const report = createReport();
  for (const file of files) {
    const source = await readFile(resolve(root, file), 'utf8');
    addMessages(report, file, analyze(source, file));
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  const counts = Object.fromEntries(report.rules.map((rule) => [rule.id, 0]));
  for (const issue of report.issues) counts[issue.ruleId]++;
  console.log(
    JSON.stringify({ files: files.length, issues: report.issues.length, counts }, null, 2),
  );
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  await scan(root);
}
