import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const rootManifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageManifest = JSON.parse(readFileSync(new URL("../packages/react-native-nitro-markdown/package.json", import.meta.url), "utf8"));

for (const failure of ["", "codegen", "build"]) {
  test(`root build runs package codegen once and propagates ${failure || "success"}`, () => {
    const root = mkdtempSync(join(tmpdir(), "nitro-markdown-build-"));
    try {
      const pkg = join(root, "packages/react-native-nitro-markdown");
      mkdirSync(pkg, { recursive: true });
      const events = join(root, "events");
      writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { build: rootManifest.scripts.build, codegen: rootManifest.scripts.codegen } }));
      writeFileSync(join(pkg, "package.json"), JSON.stringify({ scripts: { prebuild: packageManifest.scripts.prebuild, codegen: "bun step.js codegen", build: "bun step.js build" } }));
      writeFileSync(join(pkg, "step.js"), `const fs = require("node:fs"); const step = process.argv[2]; fs.appendFileSync(process.env.NITRO_FIXTURE_EVENTS, step + "\\n"); if (step === process.env.NITRO_FIXTURE_FAIL) process.exit(7);`);
      const result = spawnSync(process.execPath, ["run", "build"], { cwd: root, env: { ...process.env, NITRO_FIXTURE_EVENTS: events, NITRO_FIXTURE_FAIL: failure }, encoding: "utf8" });
      expect(result.status === 0).toBe(failure === "");
      expect(readFileSync(events, "utf8").trim().split("\n")).toEqual(failure === "codegen" ? ["codegen"] : ["codegen", "build"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
