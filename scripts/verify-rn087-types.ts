import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Glob } from "bun";

type JsonRecord = Record<string, unknown>;
type DependencyMap = Record<string, string>;

const projectRoot = import.meta.dir + "/..";

function asRecord(value: unknown): JsonRecord {
  return value != null && typeof value === "object"
    ? (value as JsonRecord)
    : {};
}

function asDependencies(value: unknown): DependencyMap {
  const entries = Object.entries(asRecord(value)).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return Object.fromEntries(entries);
}

function run(
  command: string[],
  cwd: string,
): { exitCode: number; output: string } {
  const result = Bun.spawnSync(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const decoder = new TextDecoder();
  return {
    exitCode: result.exitCode,
    output: `${decoder.decode(result.stdout)}${decoder.decode(result.stderr)}`,
  };
}

async function main(): Promise<void> {
  const packageFiles = Array.from(
    new Glob("packages/*/package.json").scanSync({ cwd: projectRoot }),
  );
  if (packageFiles.length !== 1) {
    throw new Error(
      `Expected one package manifest, found ${packageFiles.length}.`,
    );
  }

  const packageRelativePath = packageFiles[0];
  const packageManifestPath = join(projectRoot, packageRelativePath);
  const packageManifest = JSON.parse(
    await Bun.file(packageManifestPath).text(),
  ) as JsonRecord;
  const packageName = String(packageManifest.name);
  const sourceDirectory = packageManifestPath.replace(
    /\/package\.json$/,
    "/src",
  );
  const sourceEntry = join(sourceDirectory, "index.ts");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "nitro-rn087-types-"));

  try {
    const dependencies: DependencyMap = {
      ...asDependencies(packageManifest.dependencies),
      ...asDependencies(packageManifest.peerDependencies),
      ...asDependencies(packageManifest.devDependencies),
      "@types/node": "^24.0.0",
      "@types/react": "~19.2.18",
      react: "19.2.3",
      "react-native": "0.87.0",
      "react-native-nitro-modules": "0.37.0",
      typescript: "6.0.3",
    };

    await Bun.write(
      join(temporaryRoot, "package.json"),
      JSON.stringify(
        {
          name: `${packageName}-rn087-typecheck`,
          private: true,
          dependencies,
        },
        null,
        2,
      ),
    );
    await Bun.write(
      join(temporaryRoot, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            allowSyntheticDefaultImports: true,
            baseUrl: temporaryRoot,
            esModuleInterop: true,
            ignoreDeprecations: "6.0",
            jsx: "react-native",
            module: "ESNext",
            moduleResolution: "bundler",
            noEmit: true,
            noFallthroughCasesInSwitch: true,
            noImplicitReturns: true,
            noImplicitOverride: true,
            noUncheckedIndexedAccess: true,
            paths: {
              [packageName]: [sourceEntry],
              [`${packageName}/*`]: [`${sourceDirectory}/*`],
              react: [
                join(temporaryRoot, "node_modules/@types/react/index.d.ts"),
              ],
              "react/*": [join(temporaryRoot, "node_modules/@types/react/*")],
              "react-native": [
                join(
                  temporaryRoot,
                  "node_modules/react-native/types_generated/index.d.ts",
                ),
              ],
              "react-native/*": [
                join(temporaryRoot, "node_modules/react-native/*"),
              ],
            },
            skipLibCheck: true,
            strict: true,
            target: "ES2020",
            types: ["node", "react", "react-native"],
          },
          include: [sourceEntry, `${sourceDirectory}/**/*.d.ts`],
        },
        null,
        2,
      ),
    );

    const install = run(
      ["bun", "install", "--ignore-scripts", "--no-progress"],
      temporaryRoot,
    );
    if (install.exitCode !== 0) {
      throw new Error(
        `RN 0.87 compatibility dependencies failed to install:\n${install.output}`,
      );
    }

    const typecheck = run(
      ["bun", "x", "tsc", "--noEmit", "-p", "tsconfig.json"],
      temporaryRoot,
    );
    if (typecheck.exitCode !== 0) {
      throw new Error(
        `RN 0.87 Strict TypeScript compatibility failed:\n${typecheck.output}`,
      );
    }

    console.log(
      `${packageName} passes the RN 0.87 Strict TypeScript compatibility check.`,
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

await main();
