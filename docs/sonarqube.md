# SonarQube Cloud for the personal fork

The `SonarQube Cloud` workflow sends code analysis from `AtefBellaaj/LibreChat` to
[the personal SonarQube project](https://sonarcloud.io/dashboard?id=AtefBellaaj_LibreChat).
Its repository guard prevents it from running in upstream or another fork.

## Connect the project

1. Open [Analysis Method](https://sonarcloud.io/project/configuration?id=AtefBellaaj_LibreChat).
   Select GitHub Actions and turn off Automatic Analysis. Both methods cannot run
   on the same project.
2. Check that the GitHub binding points to `AtefBellaaj/LibreChat`. This binding
   lets SonarQube report the quality gate on pull requests.
3. Create an analysis token in SonarQube with access to this project. Use a
   project-scoped organization token if the plan supports it. Otherwise use a
   personal token from an account with Execute Analysis permission.
4. Save the token as `SONAR_TOKEN` in this fork's
   [Actions secrets](https://github.com/AtefBellaaj/LibreChat/settings/secrets/actions).
   Never put the token in the properties file, a commit, or a workflow input.
5. In the SonarQube project's branch settings, rename its main branch from `main`
   to `dev` before the first scan. This changes the analysis baseline, not a Git
   branch or GitHub's default branch. The scanner must report the real Git branch.
6. Enable workflows on the fork's [Actions page](https://github.com/AtefBellaaj/LibreChat/actions)
   if GitHub displays the fork-workflow enablement prompt. Make the workflow and
   properties file available on `dev`. The push to `dev` starts the first scan.
7. Check that the workflow succeeds and the SonarQube dashboard shows the same
   commit on `dev`. Then check a PR from a branch in this fork to `dev` for its analysis
   and quality-gate result.

## Scan behavior

Pushes to `dev` or `atef/sonarcloud`, and PRs targeting `dev`, trigger analysis.
A manual run is allowed on either named branch. GitHub only exposes manual
dispatch after the workflow also exists on the repository's default branch
(`main`); the experiment starts from a push to `atef/sonarcloud`.
Other manual branches and PRs from external forks are skipped. External
fork PRs cannot access the repository secret. The workflow uses `pull_request`,
not `pull_request_target`, and gives the GitHub token read access to contents only.

The root properties file includes all source directories, including nested
packages, scripts, and infrastructure. SonarQube analyzes the file types its
analyzers support. Test patterns separate tests and fixtures from application
code. Dependencies, generated output, source maps, and reports are excluded.
Git-ignored files also remain outside the scan under SonarQube's default behavior.

The workflow installs an isolated complexity analyzer from `scripts/sonar` and
tests its severity bands. It uploads LCOV coverage from the analysis tool's Node
tests. It does not install application dependencies, execute the application,
or run Jest. Coverage for other source files is not measured by this workflow.
A successful workflow means that the
scanner submitted its report; inspect SonarQube for the processed result and
quality gate. This setup does not change branch protection or require the quality
gate for merging.

The SonarQube main branch stays `dev`, which matches the repository's normal PR
target. Release pushes to `main` do not trigger a separate analysis.

## Isolated experiment branch

The `atef/sonarcloud` branch has its own full-code analysis. It does not need to
merge into `dev`. This requires a SonarQube plan with branch-analysis access.

Before the first branch scan, add `atef/sonarcloud` as an exact alternative to
the project's existing long-lived branch name pattern. Keep the existing
alternatives. SonarQube determines the branch type on its first analysis and
does not change it when the pattern changes later.

A push to `atef/sonarcloud` runs branch analysis. The scanner detects the branch
from GitHub Actions. The separate PR event still reports issues introduced by
the PR; its results do not replace the full branch report. The two runs use
separate concurrency groups.

In SonarQube, select `atef/sonarcloud`, open Issues, and filter the six imported
cognitive and cyclomatic complexity rules. Include Low, Medium, and High. The
`dev` view continues to show its own last scan and original complexity rules.

## Complexity severity bands

The experiment reports one finding per function and complexity metric. Its
severity depends on the measured score. A function with cyclomatic complexity
20 produces a Low finding; 21 produces Medium; 41 produces High.

| Severity   | Cognitive complexity | Cyclomatic complexity |
| ---------- | -------------------- | --------------------- |
| No finding | 0–15                 | 1–10                  |
| Low        | 16–25                | 11–20                 |
| Medium     | 26–50                | 21–40                 |
| High       | 51 or more           | 41 or more            |

These bands are experimental choices, not Sonar recommendations. They are
defined in `scripts/sonar/report.mjs`. Sonar's published ESLint plugin supplies
both complexity measurements. Its version is pinned separately from the cloud
analyzer, so results can differ when SonarCloud updates its analyzer.

The scan reads tracked and untracked, non-ignored JavaScript and TypeScript
files, including JSX, TSX, CommonJS, and ECMAScript modules. It reuses the root
properties file's source exclusions and test inclusion patterns. TypeScript
declaration files are excluded because they contain no executable functions.
Local ESLint suppression comments do not suppress this experiment's findings.
Parser errors stop report generation. A failed run removes the previous report
so the scanner cannot import stale results.

Run the tool from the repository root on Linux or macOS with Node 24.16 or later.
The scan uses `/usr/bin/git` so a writable directory in `PATH` cannot replace Git.

```sh
npm ci --prefix scripts/sonar --ignore-scripts --no-audit --no-fund
npm run test:coverage --prefix scripts/sonar
npm run scan --prefix scripts/sonar
```

The generated `.sonar/complexity.json` is imported through
`sonar.externalIssuesReportPaths`. SonarCloud displays the imported findings,
but their rule configuration is maintained in this repository. These external
rules do not appear in the SonarCloud quality profile.
The report preserves the source locations that contribute to each score. Each
band has a separate external rule ID. Moving between bands therefore closes the
old finding and creates a finding under the new band; its issue history is not
continuous across severity changes.

The root scanner properties exclude the native JavaScript and TypeScript
`S3776` and `S1541` findings from this analysis. Other native rules and complexity
metrics remain active. Keeping the exclusions beside the external report import
prevents duplicate High findings when the replacement workflow starts, without
changing the live profiles ahead of deployment. To roll back, remove the four
issue exclusions, the external report import, and its workflow steps together.

These findings do not calculate a CRAP score. Coverage is imported only for the
analysis tool, from `.sonar/lcov.info`. Application test coverage requires running
the application's test suites and importing their reports.

## References

- [GitHub Actions setup](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/ci-based-analysis/github-actions-for-sonarcloud)
- [Automatic analysis conflicts](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/automatic-analysis)
- [Plan limits](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans)
- [JavaScript and TypeScript coverage](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/test-coverage/javascript-typescript-test-coverage)
- [Importing external findings and severity](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/importing-external-issues/generic-issue-data)
