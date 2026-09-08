# Security Policy

## Supported status

Current supported internal application version: APP v01.11.04. The current `main` branch and its deployed revision are supported for security fixes.

## Automation and credentials

CI checks pull requests to `main`; Deploy repeats the application checks before
publishing the Cloudflare Pages application and its companion Cron Worker.
CodeQL uses Default Setup. Dependency Review, Zizmor and Scorecard use official
repository-local actions, not a controller hosted in another LCV repository.

Dependabot's native auto-merge workflow uses the organization-provided
`DEPENDABOT_AUTOMERGE_TOKEN` Dependabot secret. This shared credential is the
accepted organizational baseline; no custom GitHub App is introduced. Native
required checks must be in place before the reform is admitted, so dependency
PRs remain subject to product CI without mandatory human or AI review. Minor
and patch updates are grouped; separate major updates use the same native
required-check policy.

Deployment credentials remain in `cloudflare-production`
(`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`). Linear's official Release action
reads `LINEAR_ACCESS_KEY` from `linear-release` only after a successful
push-triggered Deploy from this repository's `main`, at the exact deployed SHA.
GitHub Pages uses its native deployment identity. Nonsecret configuration
identifiers may be versioned; credentials and secret values must remain private.

The existing D1 binding, Vertex service-account authentication, API sanitization
and rate limiting remain application security controls. Complete browser and
Pages Functions license notices are maintained as static snapshots; dependency
or distribution changes require review and updates to the full texts and their
public copies. There is no automatic legal inventory or artifact-parity gate.

## Reporting a vulnerability

Please do not open a public issue for suspected vulnerabilities, credential leaks, private data exposure, authentication bypasses, payment-flow issues, supply-chain issues, or deployment misconfiguration.

Report privately by email:

- security@lcv.dev

If GitHub private vulnerability reporting is enabled for this repository, that channel is also acceptable.

Please include:

- affected repository, component, route, package, workflow, or public surface;
- affected internal application version, commit SHA, or deployment URL when known;
- impact and exploitability;
- reproduction steps or a safe proof of concept, if available;
- whether any credential, personal data, payment data, private editorial material, or operational secret may be involved.

## Scope

In scope: application code, Workers/Pages functions, GitHub Actions, dependency and supply-chain configuration, repository publication boundaries, security documentation, and public service configuration documented in this repository.

Out of scope: social engineering, physical attacks, denial-of-service testing without prior written authorization, spam, automated noisy scanning, and reports that rely only on outdated browser or dependency versions without a concrete vulnerable path in this repository.

## Coordinated disclosure

LCV Ideas & Software will triage reports privately, request clarification when needed, and coordinate remediation before public disclosure. Public disclosure should wait until a fix or mitigation is available, unless there is an immediate user-safety reason to do otherwise.
