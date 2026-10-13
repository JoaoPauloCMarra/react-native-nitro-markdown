import { join } from "node:path";

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value != null && typeof value === "object" ? (value as JsonRecord) : {};

export function packageSourceEntries(
  manifest: JsonRecord,
  packageDir: string,
): string[] {
  const entries = Object.values(asRecord(manifest.exports)).flatMap(
    (condition) => {
      const source = asRecord(condition)["react-native"];
      return typeof source === "string" ? [join(packageDir, source)] : [];
    },
  );
  if (entries.length === 0) {
    throw new Error(
      'The package manifest has no "react-native" export entries.',
    );
  }
  return entries;
}
