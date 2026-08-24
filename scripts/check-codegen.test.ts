import { describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCodegen } from "./check-codegen.ts";

describe("codegen check process guard", () => {
  test("terminates a hanging child within the configured timeout", async () => {
    const result = await runCodegen({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 200)"],
      timeoutMs: 20,
      killGraceMs: 20,
      stdout: "ignore",
      stderr: "ignore",
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(124);
  });

  test("preserves a normal child failure code", async () => {
    const result = await runCodegen({
      command: process.execPath,
      args: ["-e", "process.exit(7)"],
      timeoutMs: 1000,
      killGraceMs: 20,
      stdout: "ignore",
      stderr: "ignore",
    });

    expect(result).toMatchObject({
      exitCode: 7,
      timedOut: false,
      signal: undefined,
    });
  });

  test("preserves a signal received while codegen is running", async () => {
    if (process.platform === "win32") return;

    const result = await runCodegen({
      command: process.execPath,
      args: [
        "-e",
        "setTimeout(() => process.kill(process.ppid, 'SIGTERM'), 20); setTimeout(() => {}, 1000)",
      ],
      timeoutMs: 1000,
      killGraceMs: 40,
      stdout: "ignore",
      stderr: "ignore",
    });

    expect(result).toMatchObject({
      exitCode: 143,
      timedOut: false,
      signal: "SIGTERM",
    });
  });

  test("restores the tracked generated directory when a child mutates it", async () => {
    const parent = await mkdtemp(join(tmpdir(), "nitro-markdown-codegen-test-"));
    const directory = join(parent, "generated");
    await mkdir(directory);
    const file = join(directory, "generated.txt");
    await writeFile(file, "original");

    try {
      const result = await runCodegen({
        command: process.execPath,
        args: [
          "-e",
          `require("node:fs").writeFileSync(${JSON.stringify(file)}, "mutated")`,
        ],
        generatedDirectory: directory,
        timeoutMs: 1000,
        killGraceMs: 20,
        stdout: "ignore",
        stderr: "ignore",
      });

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.trackedDirectoryChanged).toBe(true);
      expect(await readFile(file, "utf8")).toBe("original");
    } finally {
      await rm(parent, { force: true, recursive: true });
    }
  });

  test("kills a grandchild before restoring a timed-out generated tree", async () => {
    if (process.platform === "win32") return;

    const parentDirectory = await mkdtemp(join(tmpdir(), "nitro-markdown-codegen-tree-"));
    const directory = join(parentDirectory, "generated");
    await mkdir(directory);
    const file = join(directory, "generated.txt");
    const pidDirectory = await mkdtemp(join(tmpdir(), "nitro-markdown-codegen-pid-"));
    const pidFile = join(pidDirectory, "grandchild.pid");
    await writeFile(file, "original");

    const grandchild = `
      const fs = require("node:fs");
      setTimeout(() => fs.writeFileSync(${JSON.stringify(file)}, "late"), 120);
      setTimeout(() => {}, 1000);
    `;
    const parent = `
      const fs = require("node:fs");
      const { spawn } = require("node:child_process");
      process.on("SIGTERM", () => {});
      const child = spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], { stdio: "ignore" });
      fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
      setTimeout(() => {}, 1000);
    `;

    try {
      const result = await runCodegen({
        command: process.execPath,
        args: ["-e", parent],
        generatedDirectory: directory,
        timeoutMs: 30,
        killGraceMs: 40,
        stdout: "ignore",
        stderr: "ignore",
      });

      expect(result).toMatchObject({ exitCode: 124, timedOut: true });
      const grandchildPid = Number(await readFile(pidFile, "utf8"));
      expect(Number.isInteger(grandchildPid)).toBe(true);

      const deadline = Date.now() + 300;
      while (Date.now() < deadline) {
        expect(await readFile(file, "utf8")).toBe("original");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(await readFile(file, "utf8")).toBe("original");
    } finally {
      await rm(parentDirectory, { force: true, recursive: true });
      await rm(pidDirectory, { force: true, recursive: true });
    }
  });

  test("discovers a descendant spawned by the leader while it exits", async () => {
    if (process.platform === "win32") return;

    const parentDirectory = await mkdtemp(join(tmpdir(), "nitro-markdown-codegen-race-"));
    const directory = join(parentDirectory, "generated");
    await mkdir(directory);
    const file = join(directory, "generated.txt");
    await writeFile(file, "original");

    const child = `
      const fs = require("node:fs");
      setTimeout(() => fs.writeFileSync(${JSON.stringify(file)}, "late"), 180);
      setTimeout(() => {}, 1000);
    `;
    const parent = `
      const { spawn } = require("node:child_process");
      process.on("SIGTERM", () => {
        spawn(process.execPath, ["-e", ${JSON.stringify(child)}], { stdio: "ignore" });
        process.exit(0);
      });
      setTimeout(() => {}, 1000);
    `;

    try {
      const result = await runCodegen({
        command: process.execPath,
        args: ["-e", parent],
        generatedDirectory: directory,
        timeoutMs: 20,
        killGraceMs: 80,
        stdout: "ignore",
        stderr: "ignore",
      });

      expect(result).toMatchObject({ exitCode: 124, timedOut: true });
      await new Promise((resolve) => setTimeout(resolve, 260));
      expect(await readFile(file, "utf8")).toBe("original");
    } finally {
      await rm(parentDirectory, { force: true, recursive: true });
    }
  });
});
