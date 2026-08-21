const projectRoot = import.meta.dir + "/..";

type JsonRecord = Record<string, unknown>;

const readJson = async (relativePath: string): Promise<JsonRecord> =>
  JSON.parse(
    await Bun.file(`${projectRoot}/${relativePath}`).text(),
  ) as JsonRecord;

const dependencyValue = (
  manifest: JsonRecord,
  section: string,
  name: string,
): unknown => {
  const dependencies = manifest[section];
  return dependencies != null && typeof dependencies === "object"
    ? (dependencies as JsonRecord)[name]
    : undefined;
};

const developmentDependency = (manifest: JsonRecord, name: string): unknown =>
  dependencyValue(manifest, "devDependencies", name) ??
  dependencyValue(manifest, "dependencies", name);

const root = await readJson("package.json");
const example = await readJson("apps/example/package.json");
const packageManifest = await readJson(
  "packages/react-native-nitro-markdown/package.json",
);

const failures: string[] = [];

const expectValue = (
  label: string,
  actual: unknown,
  expected: string,
): void => {
  if (actual !== expected) {
    failures.push(`${label}: expected "${expected}", got "${String(actual)}"`);
  }
};

expectValue(
  "package workspace React Native",
  developmentDependency(root, "react-native") ??
    developmentDependency(packageManifest, "react-native"),
  "0.86.2",
);
expectValue(
  "example Expo",
  dependencyValue(example, "dependencies", "expo"),
  "~57.0.15",
);
expectValue(
  "example React Native",
  dependencyValue(example, "dependencies", "react-native"),
  "0.86.2",
);
expectValue(
  "example React",
  dependencyValue(example, "dependencies", "react"),
  "19.2.3",
);
expectValue(
  "example Nitro Modules",
  dependencyValue(example, "dependencies", "react-native-nitro-modules"),
  "0.37.0",
);
expectValue(
  "Nitrogen",
  developmentDependency(root, "nitrogen") ??
    developmentDependency(packageManifest, "nitrogen"),
  "0.37.0",
);
expectValue(
  "Nitro Modules",
  developmentDependency(root, "react-native-nitro-modules") ??
    developmentDependency(packageManifest, "react-native-nitro-modules"),
  "0.37.0",
);
expectValue(
  "Nitro peer range",
  dependencyValue(
    packageManifest,
    "peerDependencies",
    "react-native-nitro-modules",
  ),
  ">=0.37.0 <0.38.0",
);

const rootOverrides = root.overrides;
if (
  rootOverrides != null &&
  typeof rootOverrides === "object" &&
  (rootOverrides as JsonRecord)["react-native"] !== "0.86.2"
) {
  failures.push(
    "root overrides.react-native must stay pinned to 0.86.2 for the Expo SDK 57 workspace",
  );
}

for (const manifest of [root, packageManifest]) {
  const babelPreset = developmentDependency(
    manifest,
    "@react-native/babel-preset",
  );
  if (babelPreset !== undefined && babelPreset !== "^0.86.2") {
    failures.push(
      `@react-native/babel-preset must use ^0.86.2, got "${String(babelPreset)}"`,
    );
  }
  const jestPreset = developmentDependency(
    manifest,
    "@react-native/jest-preset",
  );
  if (jestPreset !== undefined && jestPreset !== "0.86.2") {
    failures.push(
      `@react-native/jest-preset must use 0.86.2, got "${String(jestPreset)}"`,
    );
  }
}

expectValue(
  "RN 0.87 Strict TypeScript script",
  dependencyValue(root, "scripts", "typecheck:rn087"),
  "bun scripts/verify-rn087-types.ts",
);

if (failures.length > 0) {
  console.error("Core dependency version guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Expo SDK 57 workspace and RN 0.87 compatibility baselines are aligned.",
);
