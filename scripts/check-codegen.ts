#!/usr/bin/env bun

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  changedFiles,
  restoreDirectorySnapshot,
  snapshotDirectory,
  snapshotsMatch,
} from "./generated-snapshot.js";
import {
  MAX_PROCESS_TIMEOUT_MS,
  resolveBoundedTimeout,
  runProcess,
} from "./process-runner.js";

const repositoryDirectory = fileURLToPath(new URL("..", import.meta.url));
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
  crashSignal?: string;
};

const TIMEOUT_ENV = "NITRO_MARKDOWN_CODEGEN_TIMEOUT_MS";
const KILL_GRACE_ENV = "NITRO_MARKDOWN_CODEGEN_KILL_GRACE_MS";

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
  const timeoutMs = resolveBoundedTimeout(
    options.timeoutMs,
    TIMEOUT_ENV,
    DEFAULT_TIMEOUT_MS,
    MAX_PROCESS_TIMEOUT_MS,
  );
  const killGraceMs = resolveBoundedTimeout(
    options.killGraceMs,
    KILL_GRACE_ENV,
    DEFAULT_KILL_GRACE_MS,
    MAX_PROCESS_TIMEOUT_MS,
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
  let restoreNeeded = true;
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
    processTreeStopped = true;

    const afterCurrent = await snapshotDirectory(targetParent, targetSubdirectory);
    const trackedDirectoryChanged = !snapshotsMatch(before, afterCurrent);
    restoreNeeded =
      trackedDirectoryChanged ||
      processResult.exitCode !== 0 ||
      processResult.timedOut;
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
      signal: processResult.interruptedBy ?? undefined,
      crashSignal: processResult.interruptedBy || processResult.timedOut
        ? undefined
        : processResult.signal ?? undefined,
    };
  } finally {
    if (processTreeStopped) {
      try {
        if (restoreNeeded) {
          await restoreDirectorySnapshot(
            targetParent,
            targetSubdirectory,
            before,
          );
        }
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
  if (result.crashSignal) {
    console.error(
      `Nitro codegen child crashed with ${result.crashSignal}; the tracked generated directory was left as found.`,
    );
    return result.exitCode;
  }
  if (result.timedOut) {
    console.error(
      `Nitro codegen timed out after ${resolveBoundedTimeout(
        undefined,
        TIMEOUT_ENV,
        DEFAULT_TIMEOUT_MS,
        MAX_PROCESS_TIMEOUT_MS,
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
