import { matchesGlob } from 'node:path';

// These bands are experiment policy, not Sonar's recommended severity levels.
export const metrics = {
  cognitive: { threshold: 15, medium: 26, high: 51 },
  cyclomatic: { threshold: 10, medium: 21, high: 41 },
};

export function severityFor(metric, score) {
  const band = metrics[metric];
  if (!band || !Number.isSafeInteger(score) || score < 0) {
    throw new Error(`Invalid complexity measurement: ${metric}=${score}`);
  }
  if (score <= band.threshold) return null;
  if (score >= band.high) return 'HIGH';
  if (score >= band.medium) return 'MEDIUM';
  return 'LOW';
}

export function sourceFiles(files, properties) {
  const values = Object.fromEntries(
    properties
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
  // A changed source root must also be reflected in the external analyzer.
  if (values['sonar.sources'] !== '.' || values['sonar.tests'] !== '.') {
    throw new Error('The complexity experiment expects sonar.sources=. and sonar.tests=.');
  }
  const exclusions = [
    ...(values['sonar.exclusions'] ?? '').split(','),
    ...(values['sonar.test.inclusions'] ?? '').split(','),
    '**/*.d.ts',
    '**/*.d.mts',
    '**/*.d.cts',
  ].filter(Boolean);
  return [...new Set(files)]
    .filter(
      (file) =>
        /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file) &&
        !exclusions.some((pattern) => matchesGlob(file, pattern)),
    )
    .sort();
}

export function createReport() {
  return {
    rules: Object.entries(metrics).flatMap(([metric, band]) =>
      ['LOW', 'MEDIUM', 'HIGH'].map((severity) => ({
        id: `${metric}-${severity.toLowerCase()}`,
        name: `${metric[0].toUpperCase()}${metric.slice(1)} complexity: ${severity.toLowerCase()}`,
        description: `Experimental function complexity bands: low ${band.threshold + 1}-${band.medium - 1}, medium ${band.medium}-${band.high - 1}, high ${band.high}+. Review the code and tests before refactoring.`,
        engineId: 'librechat-complexity',
        cleanCodeAttribute: 'FOCUSED',
        impacts: [{ softwareQuality: 'MAINTAINABILITY', severity }],
      })),
    ),
    issues: [],
  };
}

export function addMessages(report, filePath, messages) {
  for (const message of messages) {
    if (message.fatal || !message.ruleId) {
      throw new Error(`${filePath}:${message.line ?? 1}: ${message.message}`);
    }
    const metric = {
      'sonarjs/cognitive-complexity': 'cognitive',
      'sonarjs/cyclomatic-complexity': 'cyclomatic',
    }[message.ruleId];
    if (!metric) throw new Error(`Unexpected analyzer rule: ${message.ruleId}`);
    // The pinned SonarJS release may encode secondary locations in its message.
    const details = message.message.startsWith('{')
      ? JSON.parse(message.message)
      : { message: message.message };
    const text = details.message;
    const match =
      metric === 'cognitive'
        ? /Cognitive Complexity from (\d+) to/.exec(text)
        : /complexity of (\d+) which/.exec(text);
    if (!match) throw new Error(`Unrecognized ${metric} message: ${text}`);
    const score = Number(match[1]);
    const severity = severityFor(metric, score);
    if (!severity) continue;
    report.issues.push({
      ruleId: `${metric}-${severity.toLowerCase()}`,
      primaryLocation: {
        message: `${metric[0].toUpperCase()}${metric.slice(1)} complexity ${score}: ${severity.toLowerCase()} experimental band.`,
        filePath,
        textRange: {
          startLine: message.line,
          startColumn: message.column - 1,
          endLine: message.endLine ?? message.line,
          endColumn: (message.endColumn ?? message.column + 1) - 1,
        },
      },
      secondaryLocations: (details.secondaryLocations ?? []).map((location) => ({
        message: location.message,
        filePath,
        textRange: {
          startLine: location.line,
          startColumn: location.column,
          endLine: location.endLine,
          endColumn: location.endColumn,
        },
      })),
    });
  }
}
