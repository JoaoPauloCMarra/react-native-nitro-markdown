#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

const projectRoot = path.resolve(__dirname, "..");
const packageDir = path.join(
  projectRoot,
  "packages/react-native-nitro-markdown",
);
const packageJsonPath = path.join(packageDir, "package.json");

function log(message, color = "green") {
  console.log(colors[color](message));
}

function execCommand(command, options = {}) {
  try {
    execSync(command, {
      stdio: "inherit",
      cwd: projectRoot,
      shell: true,
      ...options,
    });
    return true;
  } catch {
    return false;
  }
}

function execCommandWithOutput(command, options = {}) {
  try {
    return execSync(command, {
      encoding: "utf-8",
      cwd: projectRoot,
      shell: true,
      ...options,
    }).trim();
  } catch {
    return null;
  }
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

function getPackageVersion() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  return packageJson.version;
}

function checkGitStatus() {
  const status = execCommandWithOutput("git status --porcelain", {
    cwd: packageDir,
  });
  return status === "" || status === null;
}

function checkNpmAuth() {
  const whoami = execCommandWithOutput("npm whoami 2>/dev/null");
  return whoami !== null && whoami !== "";
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const skipChecks = args.includes("--skip-checks");
  const tag =
    args.find((arg) => arg.startsWith("--tag="))?.split("=")[1] || "latest";

  console.log("");
  log("📦 Publishing react-native-nitro-markdown", "bold");
  console.log("");

  const version = getPackageVersion();
  log(`Version: ${version}`, "cyan");
  log(`Tag: ${tag}`, "cyan");
  if (isDryRun) {
    log("Mode: DRY RUN (no actual publish)", "yellow");
  }
  console.log("");

  if (!skipChecks) {
    log("Running pre-publish checks...", "cyan");

    if (!checkGitStatus()) {
      log("⚠️  Warning: You have uncommitted changes", "yellow");
      const answer = await askQuestion("Continue anyway? (y/n): ");
      if (answer !== "y" && answer !== "yes") {
        log("Publish cancelled", "red");
        process.exit(1);
      }
    } else {
      console.log("  ✓ Git working directory is clean");
    }

    if (!checkNpmAuth()) {
      log("✗ Not logged in to npm. Run: npm login", "red");
      process.exit(1);
    } else {
      const npmUser = execCommandWithOutput("npm whoami");
      console.log(`  ✓ Logged in to npm as: ${npmUser}`);
    }

    console.log("");
  }

  log("🧪 Running tests...", "cyan");
  if (!execCommand("bun run test", { cwd: packageDir })) {
    log("✗ Tests failed", "red");
    process.exit(1);
  }
  console.log("");

  log("🔨 Building package...", "cyan");
  if (!execCommand("bun run build", { cwd: packageDir })) {
    log("✗ Build failed", "red");
    process.exit(1);
  }
  console.log("");

  log("📝 Running typecheck...", "cyan");
  if (!execCommand("bun run typecheck", { cwd: packageDir })) {
    log("✗ Typecheck failed", "red");
    process.exit(1);
  }
  console.log("");

  log("📋 Package contents:", "cyan");
  execCommand("npm pack --dry-run", { cwd: packageDir });
  console.log("");

  if (!isDryRun) {
    const answer = await askQuestion(
      `Publish version ${version} to npm with tag "${tag}"? (y/n): `,
    );
    if (answer !== "y" && answer !== "yes") {
      log("Publish cancelled", "yellow");
      process.exit(0);
    }
    console.log("");
  }

  if (isDryRun) {
    log("🏃 Dry run complete! Package is ready to publish.", "green");
    log(`Run without --dry-run to publish version ${version}`, "cyan");
  } else {
    log("🚀 Publishing to npm...", "cyan");
    const publishCommand = `npm publish --tag ${tag} --access public`;
    if (!execCommand(publishCommand, { cwd: packageDir })) {
      log("✗ Publish failed", "red");
      process.exit(1);
    }
    console.log("");
    log(
      `✅ Successfully published react-native-nitro-markdown@${version}`,
      "green",
    );
    log(`   https://www.npmjs.com/package/react-native-nitro-markdown`, "cyan");
  }

  console.log("");
}

main().catch((error) => {
  log(`Publish failed: ${error.message}`, "red");
  process.exit(1);
});
