import { expect, test } from "bun:test";
import { join } from "node:path";
import { packageSourceEntries } from "./package-source-entries";

test("lists every react-native export entry of the manifest", () => {
  const packageDir = join("/tmp", "pkg");
  expect(
    packageSourceEntries(
      {
        exports: {
          ".": { "react-native": "./src/index.ts", import: "./lib/index.js" },
          "./headless": { "react-native": "./src/headless.ts" },
          "./math": { "react-native": "./src/math.tsx" },
          "./package.json": "./package.json",
        },
      },
      packageDir,
    ),
  ).toEqual([
    join(packageDir, "src/index.ts"),
    join(packageDir, "src/headless.ts"),
    join(packageDir, "src/math.tsx"),
  ]);
});

test("covers the real package manifest exports", async () => {
  const manifest = await Bun.file(
    join(import.meta.dir, "../packages/react-native-nitro-markdown/package.json"),
  ).json();
  const entries = packageSourceEntries(manifest, "pkg");
  expect(entries).toContain(join("pkg", "src/math.tsx"));
  expect(entries).toContain(join("pkg", "src/index.ts"));
});

test("fails when no export has a react-native source entry", () => {
  expect(() => packageSourceEntries({ exports: {} }, "pkg")).toThrow(
    "react-native",
  );
});
