import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Keep this outside Vitest's *.test.* discovery; CI invokes Node's runner directly.

const NATIVE_REF =
  "LCV-Ideas-Software/.github/native-auto-merge@231cd33f27c260a6b01fec26aa1d0eb606e1ee2d # native-auto-merge/v2.1.4";
const ZIZMOR_RELEASE_REF =
  /^ {4}uses: LCV-Ideas-Software\/\.github\/\.github\/workflows\/zizmor\.yml@([0-9a-f]{40}) # zizmor\/v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/gm;
const EXPECTED_ZIZMOR_WRAPPER = `name: Zizmor

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  merge_group:
    types:
      - checks_requested
  schedule:
    - cron: "43 5 * * 1"
  workflow_dispatch:

permissions: {}

jobs:
  zizmor:
    name: Run zizmor
    permissions:
      actions: read # Inspect workflow metadata during the central audit.
      contents: read
      security-events: write # Upload the Zizmor SARIF analysis.
    uses: <SIGNED_ZIZMOR_RELEASE>
`;
const CODEQL_SARIF_REF =
  "LCV-Ideas-Software/.github/codeql-sarif-gate@24b0bcc09a48b47f740b8a8bd972374f7289e48e # codeql-sarif-gate/v1.0.0";

const [
  autoReleaseWorkflow,
  codeqlWorkflow,
  dependencyReview,
  deployWorkflow,
  formatPublicWorkflow,
  native,
  pagesWorkflow,
  scorecardWorkflow,
  zizmorConfig,
  zizmorWorkflow,
] = await Promise.all([
  readFile(new URL("../workflows/auto-release.yml", import.meta.url), "utf8"),
  readFile(new URL("../workflows/codeql.yml", import.meta.url), "utf8"),
  readFile(
    new URL("../workflows/dependency-review.yml", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../workflows/deploy.yml", import.meta.url), "utf8"),
  readFile(new URL("../workflows/format-public.yml", import.meta.url), "utf8"),
  readFile(
    new URL("../workflows/native-auto-merge.yml", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../workflows/pages.yml", import.meta.url), "utf8"),
  readFile(new URL("../workflows/scorecard.yml", import.meta.url), "utf8"),
  readFile(new URL("../zizmor.yml", import.meta.url), "utf8"),
  readFile(new URL("../workflows/zizmor.yml", import.meta.url), "utf8"),
]);

const WORKFLOWS = new Map([
  ["auto-release.yml", autoReleaseWorkflow],
  ["codeql.yml", codeqlWorkflow],
  ["dependency-review.yml", dependencyReview],
  ["deploy.yml", deployWorkflow],
  ["format-public.yml", formatPublicWorkflow],
  ["native-auto-merge.yml", native],
  ["pages.yml", pagesWorkflow],
  ["scorecard.yml", scorecardWorkflow],
  ["zizmor.yml", zizmorWorkflow],
]);

const EXPECTED_JOB_PERMISSIONS = new Map([
  [
    "auto-release.yml:auto-release",
    { actions: "read", contents: "write", "security-events": "read" },
  ],
  ["codeql.yml:analyze", { contents: "read", "security-events": "write" }],
  ["dependency-review.yml:candidate_review", { contents: "read" }],
  ["dependency-review.yml:dependency_review", {}],
  ["deploy.yml:deploy", { contents: "read" }],
  ["format-public.yml:prettier-public", { contents: "read" }],
  ["native-auto-merge.yml:enable", {}],
  [
    "pages.yml:deploy",
    { contents: "read", "id-token": "write", pages: "write" },
  ],
  ["scorecard.yml:scorecard", { contents: "read", "security-events": "write" }],
  [
    "zizmor.yml:zizmor",
    { actions: "read", contents: "read", "security-events": "write" },
  ],
]);

function topLevelBody(workflow, key) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`${key}:`);
  assert.notEqual(start, -1, `${key} must be present`);
  const relativeEnd = lines
    .slice(start + 1)
    .findIndex((line) => /^[A-Za-z0-9_-]+:/.test(line));
  const end = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;
  return lines.slice(start + 1, end).join("\n");
}

function jobBody(workflow, jobName) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`  ${jobName}:`);
  assert.notEqual(start, -1, `${jobName} job must be present`);
  const relativeEnd = lines
    .slice(start + 1)
    .findIndex((line) => /^  [A-Za-z0-9_-]+:\s*$/.test(line));
  const end = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;
  return lines.slice(start + 1, end).join("\n");
}

function jobPermissions(workflow, jobName) {
  const lines = jobBody(workflow, jobName).split(/\r?\n/);
  const start = lines.findIndex((line) => /^ {4}permissions:/.test(line));
  assert.notEqual(start, -1, `${jobName} must declare job permissions`);

  const declaration = lines[start].match(/^ {4}permissions:\s*(.*)$/);
  assert.ok(declaration, `${jobName} permissions declaration is malformed`);
  if (declaration[1] === "{}") return {};
  assert.equal(declaration[1], "", `${jobName} permissions must be a mapping`);

  const permissions = {};
  for (const line of lines.slice(start + 1)) {
    if (/^ {4}\S/.test(line)) break;
    if (/^\s*$/.test(line)) continue;
    const entry = line.match(/^ {6}([a-z][a-z-]*): (read|write)(?:\s+#.*)?$/);
    assert.ok(entry, `${jobName} has a malformed permission entry: ${line}`);
    assert.equal(
      Object.hasOwn(permissions, entry[1]),
      false,
      `${jobName} duplicates ${entry[1]}`,
    );
    permissions[entry[1]] = entry[2];
  }
  return permissions;
}

function assertExactJobPermissions(filename, workflow, jobName, expected) {
  assert.deepEqual(
    jobPermissions(workflow, jobName),
    expected,
    `${filename}:${jobName} must keep its exact least-privilege boundary`,
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertExactExpression(body, input, expression) {
  assert.match(
    body,
    new RegExp(
      `\\n\\s+${escapeRegex(input)}: \\$\\{\\{ ${escapeRegex(expression)} \\}\\}`,
    ),
    `${input} must bind exactly to ${expression}`,
  );
}

function assertZizmorReleaseReference(workflow) {
  const normalized = workflow.replaceAll("\r\n", "\n");
  const releaseRefs = [...normalized.matchAll(ZIZMOR_RELEASE_REF)];
  assert.equal(
    releaseRefs.length,
    1,
    "the Zizmor workflow must use exactly one full-SHA component release reference",
  );
  assert.equal(releaseRefs[0][1].length, 40);
  assert.equal(
    normalized.replace(ZIZMOR_RELEASE_REF, "    uses: <SIGNED_ZIZMOR_RELEASE>"),
    EXPECTED_ZIZMOR_WRAPPER,
    "the canonical Zizmor wrapper contract changed",
  );
}

test("the trusted controller exposes both pinned v2.1.4 wake-up paths", () => {
  const events = topLevelBody(native, "on");
  const enable = jobBody(native, "enable");

  assert.match(events, /workflow_run:[\s\S]*workflows:[\s\S]*- CodeQL/);
  assert.match(events, /pull_request_target:[\s\S]*- review_requested/);
  assert.match(
    topLevelBody(native, "concurrency"),
    /github\.event\.workflow_run\.id \|\| github\.run_id/,
  );
  assert.match(enable, /timeout-minutes: 30/);
  assert.equal(
    (
      native.match(
        new RegExp(NATIVE_REF.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      ) ?? []
    ).length,
    2,
  );
  assert.match(enable, /github\.event\.requested_reviewer\.id == 175728472/);
  assert.match(
    enable,
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
  );

  for (const [input, expression] of Object.entries({
    workflow_name: "github.event.workflow_run.name",
    workflow_path: "github.event.workflow_run.path",
    workflow_display_title: "github.event.workflow_run.display_title",
    workflow_status: "github.event.workflow_run.status",
    workflow_event: "github.event.workflow_run.event",
    workflow_head_sha: "github.event.workflow_run.head_sha",
    workflow_actor_id: "github.event.workflow_run.actor.id",
    workflow_pull_requests: "toJSON(github.event.workflow_run.pull_requests)",
    event_action: "github.event.action",
    pull_number: "github.event.pull_request.number",
    pull_head_sha: "github.event.pull_request.head.sha",
    pull_head_repository: "github.event.pull_request.head.repo.full_name",
    pull_base_ref: "github.event.pull_request.base.ref",
    requested_reviewer_id: "github.event.requested_reviewer.id",
    trigger_run_id: "github.run_id",
  })) {
    assertExactExpression(enable, input, expression);
  }

  assert.doesNotMatch(
    native,
    /actions\/checkout|download-artifact|actions\/cache|github_token:|continue-on-error:|uses:\s*\.\//,
  );
});

test("the required Dependency Review context stays fail-closed and least privilege", () => {
  const candidate = jobBody(dependencyReview, "candidate_review");
  const required = jobBody(dependencyReview, "dependency_review");

  assert.match(
    topLevelBody(dependencyReview, "on"),
    /merge_group:[\s\S]*checks_requested/,
  );
  assert.match(candidate, /name: Dependency Review candidate/);
  assert.match(candidate, /permissions:\n\s+contents: read/);
  assert.match(
    candidate,
    /actions\/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294/,
  );
  assert.match(required, /^ {4}name: Dependency Review$/m);
  assert.match(required, /^ {4}permissions: \{\}$/m);
  assert.match(required, /always\(\)/);
  assert.match(
    required,
    /github\.event_name == 'merge_group'[\s\S]*github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
  );
  assert.match(required, /needs:[\s\S]*- candidate_review/);
  assert.match(required, /timeout-minutes: 30/);
  assert.match(
    required,
    /needs\.candidate_review\.result != 'success'[\s\S]*run: exit 1/,
  );
  assert.match(required, /Preserve the required dependency review context/);
  assert.match(
    required,
    /Repository\.mergeQueue,[\s\S]*failed under least privilege/,
  );
  assert.doesNotMatch(
    required,
    /actions\/checkout|download-artifact|actions\/cache|automation_token:|github_token:|continue-on-error:|secrets\.|uses:/,
  );
});

test("the privileged-trigger exception documents both trusted paths", () => {
  assert.match(zizmorConfig, /workflow_run and pull_request_target jobs/);
  assert.match(
    zizmorConfig,
    /never check out or\s*#\s*execute pull-request content/,
  );
});

test("every workflow enforces least privilege and Zizmor audits that boundary", () => {
  const writeAllLocations = [];
  for (const [filename, workflow] of WORKFLOWS) {
    assert.match(
      workflow,
      /^permissions: \{\}$/m,
      `${filename} must deny GITHUB_TOKEN permissions by default`,
    );
    workflow.split(/\r?\n/).forEach((line, index) => {
      if (/^\s*permissions:\s*write-all\s*$/.test(line)) {
        writeAllLocations.push(`${filename}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(
    writeAllLocations,
    [],
    `permissions: write-all remains at ${writeAllLocations.join(", ")}`,
  );
  assert.doesNotMatch(
    zizmorConfig,
    /Organization policy requires explicit `permissions: write-all`/,
  );
  assert.doesNotMatch(
    zizmorConfig,
    /excessive-permissions:\s*\n\s+disable:\s*true/,
  );

  for (const [identity, expected] of EXPECTED_JOB_PERMISSIONS) {
    const separator = identity.indexOf(":");
    const filename = identity.slice(0, separator);
    const jobName = identity.slice(separator + 1);
    assertExactJobPermissions(
      filename,
      WORKFLOWS.get(filename),
      jobName,
      expected,
    );
  }
});

test("auto-release can read every API it verifies before publishing", () => {
  const release = jobBody(autoReleaseWorkflow, "auto-release");

  assert.match(release, /actions: read/);
  assert.match(release, /contents: write/);
  assert.match(release, /security-events: read/);
  assert.match(
    release,
    /code-scanning\/analyses\?tool_name=CodeQL&ref=refs\/heads\/main/,
  );
});

test("the least-privilege boundary rejects a widened grant", () => {
  const widened = autoReleaseWorkflow.replace(
    "security-events: read",
    "security-events: write",
  );
  assert.throws(
    () =>
      assertExactJobPermissions(
        "auto-release.yml",
        widened,
        "auto-release",
        EXPECTED_JOB_PERMISSIONS.get("auto-release.yml:auto-release"),
      ),
    /must keep its exact least-privilege boundary/,
  );
});

test("internal reusable Actions identify their component release families", () => {
  assertZizmorReleaseReference(zizmorWorkflow);
  assert.match(
    codeqlWorkflow,
    new RegExp(CODEQL_SARIF_REF.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("the Zizmor boundary rejects YAML-escaped duplicate references", () => {
  const escapedDuplicate = `${zizmorWorkflow}\n  duplicate:\n    uses: "LCV-Ideas-Software\\x2F.github\\x2F.github\\x2Fworkflows\\x2Fzizmor.yml@main"\n`;
  assert.throws(
    () => assertZizmorReleaseReference(escapedDuplicate),
    /canonical Zizmor wrapper contract changed/,
  );
});

test("the Zizmor boundary rejects leading-zero release versions", () => {
  const leadingZero = zizmorWorkflow.replace(
    /# zizmor\/v(?=[0-9])/,
    "# zizmor/v0",
  );
  assert.throws(
    () => assertZizmorReleaseReference(leadingZero),
    /full-SHA component release reference/,
  );
});
