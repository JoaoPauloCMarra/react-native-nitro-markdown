#!/usr/bin/env node

const path = require("path");
const { runProcess } = require("./process-runner.js");

const projectRoot = path.resolve(__dirname, "..");
const bunBin = process.platform === "win32" ? "bun.cmd" : "bun";
const dryRun = process.argv.includes("--dry-run");

const steps = [
  "codegen:check",
  "lint",
  "typecheck",
  "typecheck:public",
  "size",
  "test:coverage",
  "benchmark",
  "test:cpp:coverage",
];

async function runStep(scriptName) {
  console.log(`\n> bun run ${scriptName}`);
  const result = await runProcess({
    command: bunBin,
    args: ["run", scriptName],
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (!result.ok) {
    const detail = result.error ? `: ${result.error.message}` : "";
    console.error(
      `Step "${scriptName}" failed with exit code ${result.exitCode}${detail}`,
    );
    process.exitCode = result.exitCode || 1;
  }
}

async function main() {
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
    await runStep(step);
    if (process.exitCode) return;
  }

  console.log("\nHarness completed.");
}

main().catch((error) => {
  console.error(`Harness failed: ${error.message}`);
  process.exitCode = 1;
});
