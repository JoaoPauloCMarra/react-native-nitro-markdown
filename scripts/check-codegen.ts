#!/usr/bin/env bun

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  changedFiles,
  restoreDirectorySnapshot,
  snapshotDirectory,
  snapshotsMatch,
} from "./generated-snapshot.js";
import { runProcess } from "./process-runner.js";

const repositoryDirectory = new URL("..", import.meta.url).pathname;
const packageDirectory = join(
  repositoryDirectory,
  "packages",
  "react-native-nitro-markdown",
);
const generatedDirectory = join(packageDirectory, "nitrogen", "generated");
const nitrogenCommand = join(repositoryDirectory, "node_modules", ".bin", "nitrogen");
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_KILL_GRACE_MS = 500;

type SpawnOutput = "inherit" | "ignore";

export type CodegenRunOptions = {
  command?: string;
  args?: string[];
  cwd?: string;
  generatedDirectory?: string;
  generatedParent?: string;
  generatedSubdirectory?: string;
  timeoutMs?: number;
  killGraceMs?: number;
  identityMode?: "ps";
  stdout?: SpawnOutput;
  stderr?: SpawnOutput;
};

export type CodegenRunResult = {
  exitCode: number;
  timedOut: boolean;
  forceKilled: boolean;
  changedFiles: string[];
  trackedDirectoryChanged: boolean;
  signal?: string;
};

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function configuredTimeout(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return positiveInteger(parsed, name);
}

export async function runCodegen(
  options: CodegenRunOptions = {},
): Promise<CodegenRunResult> {
  const targetDirectory = options.generatedDirectory ?? generatedDirectory;
  const targetParent =
    options.generatedParent ??
    (options.generatedDirectory ? dirname(targetDirectory) : packageDirectory);
  const targetSubdirectory =
    options.generatedSubdirectory ??
    (options.generatedDirectory ? basename(targetDirectory) : "nitrogen/generated");
  const timeoutMs = positiveInteger(
    options.timeoutMs ??
      configuredTimeout("NITRO_MARKDOWN_CODEGEN_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    "codegen timeout",
  );
  const killGraceMs = positiveInteger(
    options.killGraceMs ??
      configuredTimeout(
        "NITRO_MARKDOWN_CODEGEN_KILL_GRACE_MS",
        DEFAULT_KILL_GRACE_MS,
      ),
    "codegen kill grace",
  );
  const before = await snapshotDirectory(targetParent, targetSubdirectory);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "nitro-markdown-codegen-"));
  const temporaryGeneratedDirectory = join(temporaryRoot, "generated");
  const command = options.command ?? nitrogenCommand;
  const args = options.args ?? [
    "--log-level=debug",
    "--out",
    temporaryGeneratedDirectory,
  ];
  let processTreeStopped = false;
  try {
    const processResult = await runProcess({
      command,
      args,
      cwd: options.cwd ?? packageDirectory,
      stdio: [
        "ignore",
        options.stdout === "ignore" ? "ignore" : "inherit",
        options.stderr === "ignore" ? "ignore" : "inherit",
      ],
      timeoutMs,
      killGraceMs,
      identityMode: options.identityMode,
    });
    processTreeStopped = processResult.treeGone;

    const afterCurrent = await snapshotDirectory(targetParent, targetSubdirectory);
    const trackedDirectoryChanged = !snapshotsMatch(before, afterCurrent);
    const generated = await snapshotDirectory(temporaryRoot, "generated");
    const outputChanges =
      processResult.exitCode === 0 && !processResult.timedOut
        ? changedFiles(before, generated)
        : [];

    return {
      exitCode: processResult.exitCode,
      timedOut: processResult.timedOut,
      forceKilled: processResult.forceKilled,
      changedFiles: outputChanges,
      trackedDirectoryChanged,
      signal: processResult.signal ?? undefined,
    };
  } finally {
    if (processTreeStopped) {
      try {
        await restoreDirectorySnapshot(targetParent, targetSubdirectory, before);
      } finally {
        await rm(temporaryRoot, { force: true, recursive: true });
      }
    }
  }
}

async function main(): Promise<number> {
  console.log("[1/2] Running Nitro codegen in a temporary directory");
  const result = await runCodegen();

  if (result.signal) {
    console.error(`Codegen interrupted by ${result.signal}; original files were restored.`);
    return result.exitCode;
  }
  if (result.timedOut) {
    console.error(
      `Nitro codegen timed out after ${configuredTimeout(
        "NITRO_MARKDOWN_CODEGEN_TIMEOUT_MS",
        DEFAULT_TIMEOUT_MS,
      )}ms; child terminated${result.forceKilled ? " with SIGKILL" : " with SIGTERM"}.`,
    );
    return result.exitCode;
  }
  if (result.trackedDirectoryChanged) {
    console.error(
      "Codegen changed the tracked generated directory; the original files were restored.",
    );
    return 1;
  }
  if (result.exitCode !== 0) {
    console.error("Codegen failed; the tracked generated directory was unchanged.");
    return result.exitCode;
  }

  console.log("[1/2] Codegen completed");
  if (result.changedFiles.length > 0) {
    console.error("Nitro codegen changed generated bindings:");
    for (const file of result.changedFiles) console.error(`  ${file}`);
    console.error("Run `bun run codegen` and commit the regenerated bindings.");
    return 1;
  }

  console.log("[2/2] Generated files unchanged");
  return 0;
}

if (import.meta.main) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
