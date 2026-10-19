import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMessages, createReport, severityFor, sourceFiles } from './report.mjs';

test('every approved band boundary maps to exactly one severity', () => {
  for (const [metric, cases] of Object.entries({
    cognitive: [
      [0, null],
      [15, null],
      [16, 'LOW'],
      [25, 'LOW'],
      [26, 'MEDIUM'],
      [50, 'MEDIUM'],
      [51, 'HIGH'],
      [130, 'HIGH'],
    ],
    cyclomatic: [
      [1, null],
      [10, null],
      [11, 'LOW'],
      [20, 'LOW'],
      [21, 'MEDIUM'],
      [40, 'MEDIUM'],
      [41, 'HIGH'],
      [100, 'HIGH'],
    ],
  })) {
    for (const [score, severity] of cases) {
      assert.equal(severityFor(metric, score), severity, `${metric} ${score}`);
    }
  }
  assert.throws(() => severityFor('cognitive', NaN));
});

test('source scope follows Sonar exclusions and test patterns across nested packages', () => {
  const properties = `sonar.sources=.
sonar.tests=.
sonar.exclusions=**/node_modules/**,**/dist/**,.sonar/**
sonar.test.inclusions=**/*.test.*,**/*.spec.*,**/__tests__/**,**/test/**,e2e/**`;
  const files = [
    'api/server.js',
    'client/view.tsx',
    'packages/nested/src/code.mts',
    'scripts/tool.cjs',
    'packages/nested/src/code.mts',
    'client/view.test.tsx',
    'packages/nested/test/unit.ts',
    'packages/nested/src/__tests__/fixture.ts',
    'api/server.spec.js',
    'e2e/setup.ts',
    'node_modules/dep/index.js',
    'packages/nested/dist/code.js',
    '.sonar/report.js',
    'types.d.ts',
    'types.d.mts',
    'types.d.cts',
    'README.md',
  ];
  assert.deepEqual(sourceFiles(files, properties), [
    'api/server.js',
    'client/view.tsx',
    'packages/nested/src/code.mts',
    'scripts/tool.cjs',
  ]);
  assert.throws(() => sourceFiles(files, 'sonar.sources=client'));
});

test('each measurement produces one imported issue with its exact score and source location', () => {
  const report = createReport();
  addMessages(report, 'src/component.tsx', [
    {
      ruleId: 'sonarjs/cognitive-complexity',
      message:
        'Refactor this function to reduce its Cognitive Complexity from 26 to the 15 allowed.',
      line: 12,
      column: 8,
      endLine: 12,
      endColumn: 16,
    },
    {
      ruleId: 'sonarjs/cyclomatic-complexity',
      message: JSON.stringify({
        message: 'Function has a complexity of 41 which is greater than 10 authorized.',
      }),
      line: 12,
      column: 8,
      endLine: 12,
      endColumn: 16,
    },
  ]);
  assert.equal(report.issues.length, 2);
  assert.deepEqual(
    report.issues.map((issue) => issue.ruleId),
    ['cognitive-medium', 'cyclomatic-high'],
  );
  assert.deepEqual(report.issues[0].primaryLocation.textRange, {
    startLine: 12,
    startColumn: 7,
    endLine: 12,
    endColumn: 15,
  });
  assert.match(report.issues[0].primaryLocation.message, /26/);
  assert.equal(
    report.rules.find((rule) => rule.id === 'cognitive-medium').impacts[0].severity,
    'MEDIUM',
  );
});

test('parser errors and changed analyzer messages cannot produce a misleading report', () => {
  assert.throws(
    () =>
      addMessages(createReport(), 'broken.ts', [
        {
          fatal: true,
          line: 4,
          message: 'Unexpected token',
        },
      ]),
    /broken.ts:4/,
  );
  assert.throws(
    () =>
      addMessages(createReport(), 'source.ts', [
        {
          ruleId: 'sonarjs/cognitive-complexity',
          message: 'A changed message format',
          line: 1,
        },
      ]),
    /Unrecognized/,
  );
});
