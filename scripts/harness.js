#!/usr/bin/env node

const { spawnSync } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const bunBin = process.platform === "win32" ? "bun.cmd" : "bun";
const dryRun = process.argv.includes("--dry-run");

const steps = [
  "lint",
  "typecheck",
  "test:coverage",
  "benchmark",
  "test:cpp:coverage",
];

function runStep(scriptName) {
  console.log(`\n> bun run ${scriptName}`);
  const result = spawnSync(bunBin, ["run", scriptName], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to start "${scriptName}": ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  console.log(
    `Running harness (${dryRun ? "dry-run" : "full"}): ${steps.join(" -> ")}`,
  );

  if (dryRun) {
    for (const step of steps) {
      console.log(`[dry-run] bun run ${step}`);
    }
    return;
  }

  for (const step of steps) {
    runStep(step);
  }

  console.log("\nHarness completed.");
}

main();
