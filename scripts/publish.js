#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

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

function log(message, color = "green") {
  console.log(colors[color](message));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) {
    log(`✗ Failed to run ${command}: ${result.error.message}`, "red");
    return false;
  }

  return result.status === 0;
}

function runQuiet(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    ...options,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    error: result.error,
  };
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
    yes: false,
    tag: "latest",
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--skip-checks") {
      parsed.skipPreflight = true;
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

function getPackageJson() {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
}

function checkGitStatus() {
  const result = runQuiet("git", ["status", "--porcelain"], {
    cwd: projectRoot,
  });
  if (result.error || result.status !== 0) return false;
  return result.stdout === "";
}

function getNpmUser() {
  const result = runQuiet("npm", ["whoami"], { cwd: projectRoot });
  if (result.status !== 0 || result.stdout === "") return null;
  return result.stdout;
}

function getPublishedVersion(version) {
  const result = runQuiet("npm", ["view", `${PACKAGE_NAME}@${version}`, "version"], {
    cwd: projectRoot,
  });

  if (result.status === 0) return result.stdout;
  if (result.stderr.includes("E404") || result.stdout.includes("E404")) {
    return null;
  }
  return undefined;
}

function runStep(label, command, args, options = {}) {
  log(label, "cyan");
  if (!run(command, args, options)) {
    log(`✗ ${label.replace(/^[^a-zA-Z]+/, "")} failed`, "red");
    process.exit(1);
  }
  console.log("");
}

async function runPreflight({ dryRun, skipPreflight, version }) {
  if (skipPreflight) {
    log("Skipping git/npm preflight checks (--skip-checks)", "yellow");
    console.log("");
    return;
  }

  log("Running pre-publish checks...", "cyan");

  const gitClean = checkGitStatus();
  if (gitClean) {
    console.log("  ✓ Git working directory is clean");
  } else if (dryRun) {
    log("  ⚠ Git working directory is dirty; dry-run will continue", "yellow");
  } else {
    log("✗ Refusing to publish with uncommitted changes", "red");
    process.exit(1);
  }

  const publishedVersion = getPublishedVersion(version);
  if (publishedVersion === version) {
    log(`✗ ${PACKAGE_NAME}@${version} already exists on npm`, "red");
    process.exit(1);
  } else if (publishedVersion === null) {
    console.log(`  ✓ ${PACKAGE_NAME}@${version} is not published yet`);
  } else if (dryRun) {
    log("  ⚠ Could not verify npm version availability; dry-run will continue", "yellow");
  } else {
    log("✗ Could not verify npm version availability", "red");
    process.exit(1);
  }

  if (!dryRun) {
    const npmUser = getNpmUser();
    if (!npmUser) {
      log("✗ Not logged in to npm. Run: npm login", "red");
      process.exit(1);
    }
    console.log(`  ✓ Logged in to npm as: ${npmUser}`);
  } else {
    console.log("  ✓ npm auth skipped for dry-run");
  }

  console.log("");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const packageJson = getPackageJson();
  const version = packageJson.version;

  console.log("");
  log(`📦 Publishing ${PACKAGE_NAME}`, "bold");
  console.log("");
  log(`Version: ${version}`, "cyan");
  log(`Tag: ${options.tag}`, "cyan");
  if (options.dryRun) {
    log("Mode: DRY RUN (no actual publish)", "yellow");
  }
  console.log("");

  await runPreflight({ ...options, version });

  runStep("🧹 Running lint...", "bun", ["run", "lint"], { cwd: projectRoot });
  runStep("🧪 Running JS tests...", "bun", ["run", "test"], { cwd: packageDir });
  runStep("🧪 Running C++ tests...", "bun", ["run", "test:cpp"], {
    cwd: packageDir,
  });
  runStep("🔨 Building package...", "bun", ["run", "build"], { cwd: packageDir });
  runStep("📝 Running typecheck...", "bun", ["run", "typecheck"], {
    cwd: packageDir,
  });

  const publishArgs = [
    "publish",
    "--tag",
    options.tag,
    "--access",
    "public",
  ];
  if (options.dryRun) {
    publishArgs.push("--dry-run");
  }

  if (!options.dryRun && !options.yes) {
    const answer = await askQuestion(
      `Publish ${PACKAGE_NAME}@${version} to npm with tag "${options.tag}"? (y/n): `,
    );
    if (answer !== "y" && answer !== "yes") {
      log("Publish cancelled", "yellow");
      process.exit(0);
    }
    console.log("");
  }

  runStep(
    options.dryRun ? "📋 Running npm publish dry-run..." : "🚀 Publishing to npm...",
    "npm",
    publishArgs,
    { cwd: packageDir },
  );

  if (options.dryRun) {
    log("🏃 Dry run complete. Package publish path is ready.", "green");
    log(`Run without --dry-run to publish ${PACKAGE_NAME}@${version}`, "cyan");
  } else {
    log(`✅ Published ${PACKAGE_NAME}@${version}`, "green");
    log(`   https://www.npmjs.com/package/${PACKAGE_NAME}`, "cyan");
  }

  console.log("");
}

main().catch((error) => {
  log(`Publish failed: ${error.message}`, "red");
  process.exit(1);
});
