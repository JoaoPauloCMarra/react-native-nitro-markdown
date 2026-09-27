import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const packageManifest = JSON.parse(
  readFileSync(
    new URL("../packages/react-native-nitro-markdown/package.json", import.meta.url),
    "utf8",
  ),
) as { version: string };
const securityPolicy = readFileSync(new URL("../SECURITY.md", import.meta.url), "utf8");

test("security support table matches the package's current rolling minor", () => {
  const [major, minor] = packageManifest.version.split(".");
  const currentMinor = `${major}.${minor}.x`;
  const supportedLines = [...securityPolicy.matchAll(/^\|\s*(\d+\.\d+\.x)\s*\|\s*✅\s*\|$/gm)].map(
    (match) => match[1],
  );

  expect(supportedLines).toEqual([currentMinor]);
  expect(securityPolicy).toMatch(
    /only the latest minor release\s+line receives security fixes\./,
  );
});
