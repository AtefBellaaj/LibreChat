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

Pushes to `dev` and PRs targeting `dev` trigger analysis. A manual run is allowed
on `dev`. GitHub only exposes manual dispatch after the workflow also exists on
the repository's default branch (`main`); the initial scan uses the `dev` push.
Other manual branches and PRs from external forks are skipped. External
fork PRs cannot access the repository secret. The workflow uses `pull_request`,
not `pull_request_target`, and gives the GitHub token read access to contents only.

The root properties file includes all source directories, including nested
packages, scripts, and infrastructure. SonarQube analyzes the file types its
analyzers support. Test patterns separate tests and fixtures from application
code. Dependencies, generated output, source maps, and reports are excluded.
Git-ignored files also remain outside the scan under SonarQube's default behavior.

The workflow runs static analysis without installing application dependencies or
executing the application. It does not run Jest or upload test coverage. Any
coverage percentage or coverage-related quality-gate failure must not be read as
a measurement of the existing test suites. A successful workflow means that the
scanner submitted its report; inspect SonarQube for the processed result and
quality gate. This setup does not change branch protection or require the quality
gate for merging.

The branch selection matches the repository's normal PR target, `dev`. Setting
`dev` as the SonarQube main branch keeps this setup within the Free plan's branch
restriction. Release pushes to `main` do not trigger a separate analysis.

## References

- [GitHub Actions setup](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/ci-based-analysis/github-actions-for-sonarcloud)
- [Automatic analysis conflicts](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/automatic-analysis)
- [Plan limits](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans)
- [JavaScript and TypeScript coverage](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/test-coverage/javascript-typescript-test-coverage)
