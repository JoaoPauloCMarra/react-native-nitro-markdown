import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "./process-runner.js";

test("Node identity fallback terminates a timed-out process tree", async () => {
  if (process.platform === "win32") return;

  const directory = await mkdtemp(join(tmpdir(), "nitro-markdown-node-runner-"));
  const marker = join(directory, "marker.txt");
  const child = `
    const fs = require("node:fs");
    setTimeout(() => fs.writeFileSync(${JSON.stringify(marker)}, "late"), 180);
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
    const result = await runProcess({
      command: process.execPath,
      args: ["-e", parent],
      timeoutMs: 20,
      killGraceMs: 80,
      stdio: "ignore",
      identityMode: "ps",
    });
    assert.equal(result.timedOut, true);
    assert.equal(result.treeGone, true);
    await new Promise((resolve) => setTimeout(resolve, 260));
    await assert.rejects(readFile(marker));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
