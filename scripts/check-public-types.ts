const reactNativeOwnedPath = "node_modules/react-native/types_generated/";

const result = Bun.spawnSync(
  ["bunx", "tsc", "-p", "type-tests/tsconfig.json"],
  { stdout: "pipe", stderr: "pipe" },
);

if (result.exitCode === 0) process.exit(0);

const output = `${result.stdout.toString()}${result.stderr.toString()}`;
const errorLines = output
  .split("\n")
  .filter((line) => /^\S.*error TS\d+:/.test(line));
const ownedErrors = errorLines.filter(
  (line) => !line.includes(reactNativeOwnedPath),
);

if (errorLines.length === 0 || ownedErrors.length > 0) {
  console.error(output);
  process.exit(result.exitCode ?? 1);
}

console.log(
  `Public type check passed. Ignored ${errorLines.length} declaration error(s) owned by react-native/types_generated.`,
);
