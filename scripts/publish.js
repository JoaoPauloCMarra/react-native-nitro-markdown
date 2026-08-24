#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const {
  restoreDirectorySnapshot,
  snapshotDirectory,
} = require("./generated-snapshot.js");
const {
  ProcessInterrupted,
  ProcessTreeTerminationError,
  runProcess,
} = require("./process-runner.js");

const PACKAGE_NAME = "react-native-nitro-markdown";
const VALID_TAG_PATTERN = /^[a-zA-Z0-9._-]+$/;

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

const projectRoot = path.resolve(__dirname, "..");
const packageDir = path.join(projectRoot, "packages", PACKAGE_NAME);
const packageJsonPath = path.join(packageDir, "package.json");
const rootReadmePath = path.join(projectRoot, "README.md");
const changelogPath = path.join(projectRoot, "CHANGELOG.md");
const podspecPath = path.join(packageDir, `${PACKAGE_NAME}.podspec`);
const packageDocsSyncScript = path.join(
  packageDir,
  "scripts",
  "sync-package-docs.js",
);
const generatedParent = packageDir;
const generatedSubdirectory = path.join("nitrogen", "generated");

class PublishCancelled extends Error {}

function log(message, color = "green") {
  console.log(colors[color](message));
}

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

async function run(command, args, options = {}) {
  const result = await runProcess({
    command,
    args,
    cwd: projectRoot,
    stdio: "inherit",
    ...options,
  });

  if (result.signal) throw new ProcessInterrupted(result.signal);
  if (result.error) {
    log(`Failed to run ${command}: ${result.error.message}`, "red");
    return false;
  }

  return result.ok;
}

async function runQuiet(command, args, options = {}) {
  const result = await runProcess({
    command,
    args,
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.signal) throw new ProcessInterrupted(result.signal);
  return {
    status: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    error: result.error,
  };
}

async function runAsync({ label, command, args, cwd = projectRoot }) {
  const startedAt = Date.now();
  log(`${label} started: ${formatCommand(command, args)}`, "cyan");
  const result = await runProcess({
    command,
    args,
    cwd,
    stdio: "inherit",
  });
  return {
    label,
    ok: result.ok,
    durationMs: Date.now() - startedAt,
    code: result.exitCode,
    error: result.error,
    signal: result.signal,
  };
}

async function runParallelSteps(label, steps) {
  log(label, "cyan");
  const results = await Promise.all(steps.map(runAsync));
  let failed = false;

  for (const result of results) {
    const duration = `${(result.durationMs / 1000).toFixed(1)}s`;
    if (result.ok) {
      console.log(`  ✓ ${result.label} (${duration})`);
    } else {
      failed = true;
      log(`  ✗ ${result.label} failed (${duration})`, "red");
      if (result.error) log(`    ${result.error.message}`, "red");
    }
  }

  console.log("");
  const interrupted = results.find((result) => result.signal);
  if (interrupted?.signal) throw new ProcessInterrupted(interrupted.signal);
  if (failed) throw new Error("One or more package checks failed");
}

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function parseArgs(args) {
  const parsed = {
    dryRun: false,
    skipPreflight: false,
    skipChecks: false,
    skipDocs: false,
    yes: false,
    tag: "latest",
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--skip-preflight") {
      parsed.skipPreflight = true;
    } else if (arg === "--skip-checks") {
      parsed.skipChecks = true;
    } else if (arg === "--skip-verify") {
      parsed.skipChecks = true;
    } else if (arg === "--skip-docs") {
      parsed.skipDocs = true;
    } else if (arg === "--yes" || arg === "-y") {
      parsed.yes = true;
    } else if (arg.startsWith("--tag=")) {
      parsed.tag = arg.slice("--tag=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!VALID_TAG_PATTERN.test(parsed.tag)) {
    throw new Error(`Invalid npm tag: ${parsed.tag}`);
  }

  return parsed;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getPackageJson() {
  return readJson(packageJsonPath);
}

async function checkGitStatus() {
  const result = await runQuiet("git", ["status", "--porcelain"], {
    cwd: projectRoot,
  });
  if (result.error || result.status !== 0) return false;
  return result.stdout === "";
}

async function getNpmUser() {
  const result = await runQuiet("npm", ["whoami"], { cwd: projectRoot });
  if (result.status !== 0 || result.stdout === "") return null;
  return result.stdout;
}

function hasGitHubTrustedPublishingContext() {
  return (
    process.env.GITHUB_ACTIONS === "true" &&
    Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) &&
    Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_URL)
  );
}

async function getPublishedVersion(version) {
  const result = await runQuiet(
    "npm",
    ["view", `${PACKAGE_NAME}@${version}`, "version"],
    { cwd: projectRoot },
  );

  if (result.status === 0) return result.stdout;
  if (result.stderr.includes("E404") || result.stdout.includes("E404")) return null;
  return undefined;
}

function assertTextIncludes(filePath, label, expected) {
  const text = fs.readFileSync(filePath, "utf-8");
  if (!text.includes(expected)) {
    log(`Missing ${label}: ${expected}`, "red");
    throw new Error(`Missing ${label}`);
  }
}

function validateReleaseDocs(version) {
  log("Validating release docs...", "cyan");

  assertTextIncludes(changelogPath, "CHANGELOG version entry", `## [${version}]`);
  assertTextIncludes(podspecPath, "podspec release tag", ':tag => "v#{s.version}"');
  assertTextIncludes(rootReadmePath, "README parseCache API", "parseCache");
  assertTextIncludes(
    rootReadmePath,
    "README sourceAst behavior",
    "When `sourceAst` is provided, `beforeParse` plugins are skipped",
  );
  assertTextIncludes(rootReadmePath, "README headless API", "parseMarkdownWithOptions");

  console.log("  ✓ README documents current API surface");
  console.log(`  ✓ CHANGELOG has ${version} entry`);
  console.log("  ✓ podspec uses v-prefixed release tags");
  console.log("");
}

async function validatePackedFiles() {
  log("Validating packed package contents...", "cyan");

  // Bun-native, auth-free dry-run with lifecycle scripts disabled (X4).
  const result = await runQuiet(
    "bun",
    ["pm", "pack", "--dry-run", "--ignore-scripts"],
    { cwd: packageDir },
  );
  if (result.error || result.status !== 0) {
    log("bun pm pack dry-run failed", "red");
    if (result.stderr) console.error(result.stderr);
    throw new Error("bun pm pack dry-run failed");
  }

  const files = new Set();
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^packed\s+\S+\s+(\S+)$/);
    if (match && match[1]) {
      files.add(match[1]);
    }
  }

  if (files.size === 0) {
    log("bun pm pack output did not list any packed files.", "red");
    throw new Error("bun pm pack output did not list any packed files");
  }

  const expectedFiles = [
    "README.md",
    "CHANGELOG.md",
    "SECURITY.md",
    "LICENSE",
    ".watchmanconfig",
    "android/build.gradle",
    "cpp/bindings/HybridMarkdownSession.cpp",
    "cpp/bindings/HybridMarkdownSession.hpp",
    "cpp/core/NitroMD4CParser.cpp",
    "cpp/core/flatten.cpp",
    "cpp/nitromd/nitromd.c",
    "lib/module/index.js",
    "lib/module/headless.js",
    "lib/commonjs/index.js",
    "lib/commonjs/headless.js",
    "lib/typescript/module/index.d.ts",
    "lib/typescript/module/headless.d.ts",
    "lib/typescript/commonjs/index.d.ts",
    "lib/typescript/commonjs/headless.d.ts",
    "nitrogen/generated/ios/NitroMarkdown+autolinking.rb",
    "nitrogen/generated/android/NitroMarkdown+autolinking.gradle",
    "nitrogen/generated/android/NitroMarkdownOnLoad.cpp",
    "nitrogen/generated/android/NitroMarkdownOnLoad.hpp",
    "nitrogen/generated/shared/c++/HybridMarkdownParserSpec.cpp",
    "nitrogen/generated/shared/c++/HybridMarkdownParserSpec.hpp",
    "nitrogen/generated/shared/c++/HybridMarkdownSessionSpec.cpp",
    "nitrogen/generated/shared/c++/HybridMarkdownSessionSpec.hpp",
    "nitrogen/generated/shared/c++/ParserOptions.hpp",
    "src/index.ts",
    "src/headless.ts",
    `${PACKAGE_NAME}.podspec`,
  ];

  const missing = expectedFiles.filter((file) => !files.has(file));
  if (missing.length > 0) {
    log(`Packed package is missing ${missing.length} required files:`, "red");
    for (const file of missing) {
      log(`  ${file}`, "red");
    }
    throw new Error(`Packed package is missing ${missing.length} required files`);
  }

  console.log(`  ✓ ${PACKAGE_NAME} pack contains all required package files`);
  console.log(`  ✓ headless JS, declarations, and source are packed`);
  console.log("");
}

async function runPackageDocs(mode) {
  const result = await runProcess({
    command: "node",
    args: [packageDocsSyncScript, mode],
    cwd: packageDir,
    stdio: "inherit",
  });
  if (result.signal) throw new ProcessInterrupted(result.signal);
  if (!result.ok) {
    throw new Error(`${mode} package document lifecycle step failed`);
  }
}

async function withPackageDocsRestored(task) {
  try {
    await runPackageDocs("prepare");
    return await task();
  } finally {
    await runPackageDocs("cleanup");
  }
}

async function runStep(label, command, args, options = {}) {
  log(label, "cyan");
  if (!(await run(command, args, options))) {
    log(`${label.replace(/^[^a-zA-Z]+/, "")} failed`, "red");
    throw new Error(`${label.replace(/^[^a-zA-Z]+/, "")} failed`);
  }
  console.log("");
}

async function runPreflight({ dryRun, skipPreflight, version }) {
  if (skipPreflight) {
    log("Skipping git/npm preflight checks", "yellow");
    console.log("");
    return;
  }

  log("Running pre-publish checks...", "cyan");

  const gitClean = await checkGitStatus();
  if (gitClean) {
    console.log("  ✓ Git working directory is clean");
  } else if (dryRun) {
    log("  ⚠ Git working directory is dirty; dry-run will continue", "yellow");
  } else {
    log("Refusing to publish with uncommitted changes", "red");
    throw new Error("Refusing to publish with uncommitted changes");
  }

  const publishedVersion = await getPublishedVersion(version);
  if (publishedVersion === version) {
    if (dryRun) {
      log(`  ⚠ ${PACKAGE_NAME}@${version} already exists on npm; dry-run will continue`, "yellow");
    } else {
      log(`${PACKAGE_NAME}@${version} already exists on npm`, "red");
      throw new Error(`${PACKAGE_NAME}@${version} already exists on npm`);
    }
  } else if (publishedVersion === null) {
    console.log(`  ✓ ${PACKAGE_NAME}@${version} is not published yet`);
  } else if (dryRun) {
    log("  ⚠ Could not verify npm version availability; dry-run will continue", "yellow");
  } else {
    log("Could not verify npm version availability", "red");
    throw new Error("Could not verify npm version availability");
  }

  if (!dryRun && hasGitHubTrustedPublishingContext()) {
    console.log("  ✓ npm auth will use GitHub Actions trusted publishing (OIDC)");
  } else if (!dryRun) {
    const npmUser = await getNpmUser();
    if (!npmUser) {
      log("Not logged in to npm. Run: npm login", "red");
      throw new Error("Not logged in to npm");
    }
    console.log(`  ✓ Logged in to npm as: ${npmUser}`);
  } else {
    console.log("  ✓ npm auth skipped for dry-run");
  }

  console.log("");
}

async function runVerification() {
  await runParallelSteps("Running independent package checks in parallel...", [
    { label: "lint", command: "bun", args: ["run", "lint"], cwd: projectRoot },
    { label: "JS coverage", command: "bun", args: ["run", "test:coverage"], cwd: packageDir },
  ]);

  await runStep("Running C++ coverage...", "bun", ["run", "test:cpp:coverage"], {
    cwd: packageDir,
  });
  await runStep("Running repo typecheck...", "bun", ["run", "typecheck"], {
    cwd: projectRoot,
  });
  // Root build regenerates Nitro bindings before compiling, so publish
  // verification can never run against stale generated state.
  await runStep("Building package (with codegen)...", "bun", ["run", "build"], {
    cwd: projectRoot,
  });
}

async function withGeneratedDirectoryRestored(task) {
  const snapshot = await snapshotDirectory(generatedParent, generatedSubdirectory);
  let restorePromise;
  let receivedSignal;
  let safeToRestore = true;
  const restore = () => {
    if (!restorePromise) {
      restorePromise = restoreDirectorySnapshot(
        generatedParent,
        generatedSubdirectory,
        snapshot,
      );
    }
    return restorePromise;
  };

  const handleSignal = (signal) => {
    receivedSignal ??= signal;
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  try {
    const result = await task();
    if (receivedSignal) throw new ProcessInterrupted(receivedSignal);
    return result;
  } catch (error) {
    if (error instanceof ProcessTreeTerminationError) safeToRestore = false;
    throw error;
  } finally {
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
    if (safeToRestore) await restore();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const packageJson = getPackageJson();
  const version = packageJson.version;

  console.log("");
  log(`Publishing ${PACKAGE_NAME}`, "bold");
  console.log("");
  log(`Version: ${version}`, "cyan");
  log(`Tag: ${options.tag}`, "cyan");
  if (options.dryRun) log("Mode: DRY RUN (no actual publish)", "yellow");
  console.log("");

  const publish = async () => {
    await runPreflight({ ...options, version });

    if (!options.skipDocs) validateReleaseDocs(version);
    else log("Skipping release doc validation", "yellow");

    if (!options.skipChecks) await runVerification();
    else log("Skipping verification checks", "yellow");

    await validatePackedFiles();

    const publishCommand = options.dryRun ? "bun" : "npm";
    const publishArgs = options.dryRun
      ? ["pm", "pack", "--dry-run", "--ignore-scripts"]
      : ["publish", "--tag", options.tag, "--access", "public"];

    if (!options.dryRun && !options.yes) {
      const answer = await askQuestion(
        `Publish ${PACKAGE_NAME}@${version} to npm with tag "${options.tag}"? (y/n): `,
      );
      if (answer !== "y" && answer !== "yes") {
        log("Publish cancelled", "yellow");
        throw new PublishCancelled("Publish cancelled");
      }
      console.log("");
    }

    await runStep(
      options.dryRun ? "Running package pack dry-run..." : "Publishing to npm...",
      publishCommand,
      publishArgs,
      { cwd: packageDir },
    );

    if (options.dryRun) {
      log("Dry run complete. Package publish path is ready.", "green");
      log(`Run without --dry-run to publish ${PACKAGE_NAME}@${version}`, "cyan");
    } else {
      log(`Published ${PACKAGE_NAME}@${version}`, "green");
      log(`https://www.npmjs.com/package/${PACKAGE_NAME}`, "cyan");
    }

    console.log("");
  };

  if (options.dryRun) {
    await withGeneratedDirectoryRestored(() => withPackageDocsRestored(publish));
  } else {
    await withPackageDocsRestored(publish);
  }
}

main().catch((error) => {
  if (error instanceof PublishCancelled) {
    process.exitCode = 0;
    return;
  }
  if (error instanceof ProcessInterrupted) {
    process.exitCode = error.exitCode;
    return;
  }
  log(`Publish failed: ${error.message}`, "red");
  process.exitCode = 1;
});
