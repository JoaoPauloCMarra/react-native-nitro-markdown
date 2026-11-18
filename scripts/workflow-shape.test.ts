import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
};

type Job = {
  "runs-on"?: string;
  if?: string;
  needs?: unknown;
  permissions?: Record<string, string>;
  steps?: Step[];
};

type Workflow = {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
};

const readText = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const loadWorkflow = (name: string): Workflow =>
  Bun.YAML.parse(readText(`../.github/workflows/${name}`)) as Workflow;

const rootManifest = JSON.parse(readText("../package.json")) as {
  scripts: Record<string, string>;
  packageManager: string;
};

const ci = loadWorkflow("ci.yml");
const publish = loadWorkflow("npm-publish.yml");

const stepsOf = (job: Job): Step[] => job.steps ?? [];
const allJobs = (workflow: Workflow): [string, Job][] =>
  Object.entries(workflow.jobs);
const scriptSteps = (script: string): string[] =>
  script.split("&&").map((part) => part.trim());

describe("workflow shape", () => {
  test("every job runs on the pinned Linux runner", () => {
    for (const workflow of [ci, publish]) {
      for (const [, job] of allJobs(workflow)) {
        expect(job["runs-on"]).toBe("ubuntu-26.04");
      }
    }
  });

  test("every checkout drops credentials", () => {
    for (const workflow of [ci, publish]) {
      for (const [, job] of allJobs(workflow)) {
        for (const step of stepsOf(job)) {
          if (step.uses?.startsWith("actions/checkout@")) {
            expect(step.with?.["persist-credentials"]).toBe(false);
          }
        }
      }
    }
  });

  test("pull requests and publish validation run the same release gate", () => {
    const gate = "bun run release:preflight";
    const ciRuns = allJobs(ci).flatMap(([, job]) =>
      stepsOf(job).map((step) => step.run),
    );
    const validateRuns = stepsOf(publish.jobs["validate"]!).map(
      (step) => step.run,
    );
    expect(ciRuns).toContain(gate);
    expect(validateRuns).toContain(gate);
    expect(ci.on["pull_request"]).toBeDefined();
  });

  test("workflows never build or run an example app", () => {
    const text = [
      readText("../.github/workflows/ci.yml"),
      readText("../.github/workflows/npm-publish.yml"),
    ].join("\n");
    for (const forbidden of [
      "example:android",
      "example:ios",
      "example:prebuild",
      "example:smoke",
      "xcodebuild",
      "macos-",
      "eas build",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  test("only the publish job holds id-token and it runs on release events only", () => {
    expect(ci.permissions).toEqual({ contents: "read" });
    expect(publish.permissions).toEqual({ contents: "read" });
    for (const [name, job] of allJobs(publish)) {
      if (name === "publish") {
        expect(job.permissions).toEqual({
          contents: "read",
          "id-token": "write",
        });
        expect(job.if).toContain("github.event_name == 'release'");
      } else {
        expect(job.permissions?.["id-token"]).toBeUndefined();
      }
    }
    for (const [, job] of allJobs(ci)) {
      expect(job.permissions?.["id-token"]).toBeUndefined();
    }
  });

  test("the Bun version matches packageManager in both workflows", () => {
    const expected = rootManifest.packageManager.replace("bun@", "");
    for (const text of [
      readText("../.github/workflows/ci.yml"),
      readText("../.github/workflows/npm-publish.yml"),
    ]) {
      expect(text).toContain(`BUN_VERSION: "${expected}"`);
    }
  });
});

describe("dependency cache", () => {
  test("ci restores the Bun cache keyed on runner OS and bun.lock before install", () => {
    const steps = allJobs(ci).flatMap(([, job]) => stepsOf(job));
    const cacheIndex = steps.findIndex((step) =>
      step.uses?.startsWith("actions/cache@v6"),
    );
    const installIndex = steps.findIndex(
      (step) => step.run === "bun install --frozen-lockfile",
    );
    expect(cacheIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeGreaterThan(cacheIndex);
    expect(steps[cacheIndex]!.uses).toBe("actions/cache@v6");
    expect(steps[cacheIndex]!.with).toEqual({
      path: "~/.bun/install/cache",
      key: "${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}",
    });
  });

  test("setup-bun keeps its own cache disabled", () => {
    for (const [, job] of allJobs(ci)) {
      for (const step of stepsOf(job)) {
        if (step.uses?.startsWith("oven-sh/setup-bun@")) {
          expect(step.with?.["no-cache"]).toBe(true);
        }
      }
    }
  });

  test("publish workflows restore no cache", () => {
    for (const [, job] of allJobs(publish)) {
      for (const step of stepsOf(job)) {
        expect(step.uses?.startsWith("actions/cache@") ?? false).toBe(false);
      }
    }
  });
});

describe("release gate composition", () => {
  test("release:preflight runs check:ci, example checks and the pack check", () => {
    expect(scriptSteps(rootManifest.scripts["release:preflight"]!)).toEqual([
      "bun run check:ci",
      "bun run example:check",
      "bun run publish-package:pack-check",
    ]);
  });

  test("check:ci builds once through the harness and audits the built package", () => {
    const steps = scriptSteps(rootManifest.scripts["check:ci"]!);
    expect(steps).toContain("bun run harness");
    expect(steps).toContain("bun run audit:package:built");
    expect(steps).not.toContain("bun run audit:package");
    expect(steps.indexOf("bun run harness")).toBeLessThan(
      steps.indexOf("bun run audit:package:built"),
    );
  });

  test("the harness builds the package before the audit consumes it", () => {
    const harness = readText("./harness.js");
    expect(harness).toContain('"typecheck:public"');
    expect(rootManifest.scripts["typecheck:public"]).toStartWith(
      "bun run build &&",
    );
  });

  test("audit:package still builds before it audits", () => {
    expect(rootManifest.scripts["audit:package"]).toBe(
      "bun run build && bun run audit:package:built",
    );
  });
});
