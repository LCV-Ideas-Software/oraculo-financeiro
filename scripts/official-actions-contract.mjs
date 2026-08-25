import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CHECKOUT_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const LINEAR_ACTION_SHA = "0a25abab892a91062ebf42260dbb2ce6277aa205";
const WRANGLER_ACTION_SHA = "ebbaa1584979971c8614a24965b4405ff95890e0";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const workflowsDirectory = path.join(repositoryRoot, ".github", "workflows");

function read(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function occurrences(text, fragment) {
  return text.split(fragment).length - 1;
}

function workflowJob(workflow, jobId) {
  const lines = workflow.split(/\r?\n/u);
  const jobsIndexes = lines.flatMap((line, index) =>
    /^jobs:\s*(?:#.*)?$/u.test(line) ? [index] : [],
  );

  assert.equal(
    jobsIndexes.length,
    1,
    "workflow must contain exactly one top-level jobs mapping",
  );

  const jobsIndex = jobsIndexes[0];
  let jobIndent = null;
  const jobStarts = [];

  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      break;
    }

    jobIndent ??= indent;
    if (indent === jobIndent && trimmed === `${jobId}:`) {
      jobStarts.push(index);
    }
  }

  assert.equal(
    jobStarts.length,
    1,
    `workflow must contain exactly one ${jobId} job`,
  );

  const jobStart = jobStarts[0];
  let jobEnd = lines.length;
  for (let index = jobStart + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (indent <= jobIndent) {
      jobEnd = index;
      break;
    }
  }

  return lines.slice(jobStart, jobEnd).join("\n");
}

function assertStepOrderWithinJob(workflow, jobId, firstStep, secondStep) {
  const job = workflowJob(workflow, jobId);
  const firstStepIndex = job.indexOf(firstStep);
  const secondStepIndex = job.indexOf(secondStep);

  assert.ok(firstStepIndex >= 0, `${jobId} job must contain ${firstStep}`);
  assert.ok(secondStepIndex >= 0, `${jobId} job must contain ${secondStep}`);
  assert.ok(
    firstStepIndex < secondStepIndex,
    `${firstStep} must precede ${secondStep} in the ${jobId} job`,
  );

  return job;
}

const linearRelease = read(".github/workflows/linear-release.yml");
const deploy = read(".github/workflows/deploy.yml");
const actionsLock = read(".github/workflows/actions.lock");
const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const installedWrangler = JSON.parse(
  read("node_modules/wrangler/package.json"),
);
const allWorkflows = readdirSync(workflowsDirectory)
  .filter((file) => /\.ya?ml$/u.test(file))
  .map((file) => read(path.join(".github", "workflows", file)))
  .join("\n");

test("Linear Release remains tied to the exact successful Deploy SHA", () => {
  assert.match(linearRelease, /workflow_run:/u);
  assert.match(linearRelease, /workflows:\s*\n\s*- Deploy/u);
  assert.match(linearRelease, /types:\s*\n\s*- completed/u);
  assert.match(
    linearRelease,
    /github\.event\.workflow_run\.conclusion == 'success'/u,
  );
  assert.match(
    linearRelease,
    /github\.event\.workflow_run\.head_branch == 'main'/u,
  );
  assert.match(
    linearRelease,
    /group: linear-release-\$\{\{ github\.event\.workflow_run\.head_branch \}\}-\$\{\{ github\.event\.workflow_run\.conclusion \}\}/u,
  );
  assert.match(linearRelease, /queue: max/u);
  assert.doesNotMatch(linearRelease, /cancel-in-progress:/u);
  assert.match(linearRelease, /environment: linear-release/u);
  assert.match(linearRelease, /permissions:\s*\n\s*contents: read/u);
  assert.match(
    linearRelease,
    new RegExp(`uses: actions/checkout@${CHECKOUT_SHA}`, "u"),
  );
  assert.match(
    linearRelease,
    /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/u,
  );
  assert.match(linearRelease, /fetch-depth: 0/u);
  assert.match(linearRelease, /persist-credentials: false/u);
  assert.doesNotMatch(linearRelease, /continue-on-error:\s*true/u);
});

test("Linear Release uses the pinned official action and lock entry", () => {
  const officialUse = `linear/linear-release-action@${LINEAR_ACTION_SHA}`;

  assert.equal(occurrences(linearRelease, officialUse), 1);
  assert.match(
    linearRelease,
    /access_key: \$\{\{ secrets\.LINEAR_ACCESS_KEY \}\}/u,
  );
  assert.match(linearRelease, /cli_version: v0\.16\.0/u);
  assert.doesNotMatch(
    linearRelease,
    /CLI_URL|CLI_SHA256|linear-release-linux|curl\s+-|sha256sum/u,
  );
  assert.equal(occurrences(actionsLock, officialUse), 2);
  assert.match(
    actionsLock,
    /'linear\/linear-release-action@0a25abab892a91062ebf42260dbb2ce6277aa205':[\s\S]*?ref: 'v0\.16\.0'/u,
  );
});

test("both Cloudflare deploys remain on the official Wrangler action", () => {
  const officialUse = `cloudflare/wrangler-action@${WRANGLER_ACTION_SHA}`;
  const installCommand = "npm ci --ignore-scripts --no-audit --no-fund";
  const deployJob = assertStepOrderWithinJob(
    deploy,
    "deploy",
    `run: ${installCommand}`,
    `uses: ${officialUse}`,
  );
  const wranglerVersion = packageJson.devDependencies.wrangler;
  const lockRootVersion = packageLock.packages[""].devDependencies.wrangler;
  const lockedWrangler = packageLock.packages["node_modules/wrangler"];

  assert.equal(occurrences(deploy, officialUse), 2);
  assert.equal(occurrences(deployJob, officialUse), 2);
  assert.equal(occurrences(deploy, "wranglerVersion:"), 0);
  assert.equal(
    occurrences(deploy, "apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}"),
    2,
  );
  assert.equal(
    occurrences(deploy, "accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"),
    2,
  );

  const pages = deployJob.indexOf(
    "- name: Deploy Pages application with Wrangler",
  );
  const worker = deployJob.indexOf("- name: Deploy Cron Worker with Wrangler");
  assert.ok(pages >= 0 && worker > pages);
  assert.match(
    deployJob.slice(pages, worker),
    /workingDirectory: \.[\s\S]*command: pages deploy dist --project-name=oraculo-financeiro --branch=main --commit-dirty=true/u,
  );
  assert.match(
    deployJob.slice(worker),
    /workingDirectory: \.[\s\S]*command: deploy --strict --config workers\/taxaipca-motor\/wrangler\.json/u,
  );

  assert.match(wranglerVersion, /^4\.\d+\.\d+$/u);
  assert.equal(lockRootVersion, wranglerVersion);
  assert.equal(lockedWrangler.version, wranglerVersion);
  assert.equal(installedWrangler.version, lockedWrangler.version);
  assert.equal(lockedWrangler.dev, true);
  assert.match(lockedWrangler.integrity, /^sha512-/u);
  assert.equal(occurrences(actionsLock, officialUse), 2);
});

test("the local Wrangler installation cannot come from a different job", () => {
  const officialUse = `cloudflare/wrangler-action@${WRANGLER_ACTION_SHA}`;
  const splitRunnerWorkflow = `jobs:
  prepare:
    steps:
      - run: npm ci --ignore-scripts --no-audit --no-fund
  deploy:
    steps:
      - uses: ${officialUse}
      - uses: ${officialUse}
`;

  assert.throws(
    () =>
      assertStepOrderWithinJob(
        splitRunnerWorkflow,
        "deploy",
        "run: npm ci --ignore-scripts --no-audit --no-fund",
        `uses: ${officialUse}`,
      ),
    /deploy job must contain run: npm ci/u,
  );
});

test("the local Wrangler installation must precede both actions", () => {
  const officialUse = `cloudflare/wrangler-action@${WRANGLER_ACTION_SHA}`;
  const reversedStepsWorkflow = `jobs:
  deploy:
    steps:
      - uses: ${officialUse}
      - uses: ${officialUse}
      - run: npm ci --ignore-scripts --no-audit --no-fund
`;

  assert.throws(
    () =>
      assertStepOrderWithinJob(
        reversedStepsWorkflow,
        "deploy",
        "run: npm ci --ignore-scripts --no-audit --no-fund",
        `uses: ${officialUse}`,
      ),
    /npm ci .* must precede .*wrangler-action.* in the deploy job/u,
  );
});

test("the deploy job must exist exactly once", () => {
  assert.throws(
    () => workflowJob("jobs:\n  prepare:\n    steps: []\n", "deploy"),
    /exactly one deploy job/u,
  );
  assert.throws(
    () =>
      workflowJob(
        "jobs:\n  deploy:\n    steps: []\n  deploy:\n    steps: []\n",
        "deploy",
      ),
    /exactly one deploy job/u,
  );
});

test("no direct Slack workflow is invented for this repository", () => {
  assert.doesNotMatch(
    allWorkflows,
    /slackapi\/slack-github-action@|hooks\.slack\.com|slack\.com\/api\/chat\.postMessage|chat\.postMessage|SLACK_WEBHOOK|SLACK_BOT_TOKEN/u,
  );
});
