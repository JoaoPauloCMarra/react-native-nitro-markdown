import { describe, expect, test } from "bun:test";
import { join } from "node:path";

describe("stream AST benchmark script", () => {
  test("a quick run against HEAD exits 0 and reports parity", () => {
    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        join(import.meta.dir, "benchmark-stream-ast.js"),
        "HEAD",
        "--quick",
      ],
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout.toString());
    expect(report.parityCases).toBe(200);
    expect(report.results).toHaveLength(1);
  }, 60000);
});
