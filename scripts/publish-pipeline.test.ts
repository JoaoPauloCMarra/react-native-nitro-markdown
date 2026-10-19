import { expect, test } from "bun:test";
import { runReleasePipeline } from "./publish-pipeline.js";

test("verification runs before the package docs are prepared and not inside them", async () => {
  const events: string[] = [];
  let docsActive = false;

  await runReleasePipeline({
    verify: async () => {
      events.push(docsActive ? "verify-inside-docs" : "verify");
    },
    withDocsRestored: async (task: () => Promise<void>) => {
      events.push("docs-prepare");
      docsActive = true;
      try {
        await task();
      } finally {
        docsActive = false;
        events.push("docs-cleanup");
      }
    },
    pack: async () => {
      events.push(docsActive ? "pack" : "pack-without-docs");
    },
  });

  expect(events).toEqual(["verify", "docs-prepare", "pack", "docs-cleanup"]);
});

test("a failed verification never prepares the package docs", async () => {
  const events: string[] = [];
  await expect(
    runReleasePipeline({
      verify: async () => {
        throw new Error("gate failed");
      },
      withDocsRestored: async () => {
        events.push("docs-prepare");
      },
      pack: async () => {},
    }),
  ).rejects.toThrow("gate failed");
  expect(events).toEqual([]);
});

test("rejects -x, 1x, v1.2.3 as publish dist-tags", () => {
  const { parseArgs } = require("./publish.js");

  for (const tag of ["-x", "1x", "v1.2.3"]) {
    expect(() => parseArgs([`--tag=${tag}`])).toThrow();
  }
  expect(parseArgs(["--tag=next"]).tag).toBe("next");
  expect(parseArgs([]).tag).toBe("latest");
});
