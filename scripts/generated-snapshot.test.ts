import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  resetSnapshotFsForTest,
  restoreDirectorySnapshot,
  setSnapshotFsForTest,
  snapshotDirectory,
  withDirectoryRestored,
} from "./generated-snapshot.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  resetSnapshotFsForTest();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

async function createFixture(): Promise<{ parent: string; directory: string }> {
  const parent = await mkdtemp(join(tmpdir(), "nitro-markdown-snapshot-test-"));
  const directory = join(parent, "generated");
  await mkdir(directory);
  temporaryDirectories.push(parent);
  await writeFile(join(directory, "kept.txt"), Buffer.from([0, 1, 2, 255]));
  await writeFile(join(directory, "deleted.txt"), "deleted");
  await writeFile(join(directory, "mode.txt"), "mode");
  await chmod(join(directory, "mode.txt"), 0o640);
  await writeFile(join(directory, ".hidden"), "hidden");
  return { parent, directory };
}

describe("generated directory snapshots", () => {
  test("restore byte-accurately handles modifications, creations, deletions, and modes", async () => {
    const { parent, directory } = await createFixture();
    const before = await snapshotDirectory(parent, "generated");

    await writeFile(join(directory, "kept.txt"), "modified");
    await unlink(join(directory, "deleted.txt"));
    await writeFile(join(directory, "created.txt"), "created");
    await chmod(join(directory, "mode.txt"), 0o600);

    await restoreDirectorySnapshot(parent, "generated", before);

    expect([...await readdir(directory)].sort()).toEqual([
      ".hidden",
      "deleted.txt",
      "kept.txt",
      "mode.txt",
    ]);
    expect(await readFile(join(directory, "kept.txt"))).toEqual(
      Buffer.from([0, 1, 2, 255]),
    );
    expect(await stat(join(directory, "mode.txt"))).toEqual(
      expect.objectContaining({ mode: expect.any(Number) }),
    );
    expect((await stat(join(directory, "mode.txt"))).mode & 0o777).toBe(0o640);
    expect(await snapshotDirectory(parent, "generated")).toEqual(before);
  });

  test("restores a safe injected build in a finally path", async () => {
    const { parent, directory } = await createFixture();
    const before = await snapshotDirectory(parent, "generated");

    await expect(
      withDirectoryRestored(parent, "generated", async () => {
        await writeFile(join(directory, "kept.txt"), "build output");
        await unlink(join(directory, "deleted.txt"));
        await writeFile(join(directory, "created.txt"), "build output");
        throw new Error("injected build failure");
      }),
    ).rejects.toThrow("injected build failure");

    expect(await snapshotDirectory(parent, "generated")).toEqual(before);
  });

  test("rejects unsafe snapshot keys before removing the target directory", async () => {
    const { parent, directory } = await createFixture();
    const outside = join(directory, "..", "snapshot-outside.txt");
    await writeFile(outside, "outside");
    const before = await snapshotDirectory(parent, "generated");

    const unsafeKeys = [
      "",
      ".",
      "..",
      "../snapshot-outside.txt",
      "nested/../../snapshot-outside.txt",
      "nested\\..\\snapshot-outside.txt",
      "nested//snapshot-outside.txt",
      "nested\\\\snapshot-outside.txt",
      "/tmp/snapshot-outside.txt",
      "nested\0file",
    ];

    try {
      for (const key of unsafeKeys) {
        await expect(
          restoreDirectorySnapshot(parent, "generated", {
            exists: true,
            mode: before.mode,
            entries: new Map([
              [key, { kind: "file", mode: 0o600, bytes: new Uint8Array([1]) }],
            ]),
          }),
        ).rejects.toThrow();
        expect(await readFile(outside, "utf8")).toBe("outside");
        expect(await snapshotDirectory(parent, "generated")).toEqual(before);
      }
    } finally {
      await rm(outside, { force: true });
    }
  });

  test("rejects snapshot entries nested below a symlink", async () => {
    const { parent, directory } = await createFixture();
    const outsideDirectory = await mkdtemp(
      join(tmpdir(), "nitro-markdown-snapshot-outside-"),
    );
    const outside = join(outsideDirectory, "outside.txt");
    await writeFile(outside, "outside");
    const before = await snapshotDirectory(parent, "generated");

    try {
      await expect(
        restoreDirectorySnapshot(parent, "generated", {
          exists: true,
          mode: before.mode,
          entries: new Map([
            [
              "escape",
              { kind: "symlink", mode: 0o777, target: outsideDirectory },
            ],
            [
              "escape/outside.txt",
              { kind: "file", mode: 0o600, bytes: new Uint8Array([1]) },
            ],
          ]),
        }),
      ).rejects.toThrow();
      expect(await readFile(outside, "utf8")).toBe("outside");
      expect(await snapshotDirectory(parent, "generated")).toEqual(before);
    } finally {
      await rm(outsideDirectory, { force: true, recursive: true });
    }
  });

  test("enumerates symlinks without following them outside the snapshot root", async () => {
    const { parent, directory } = await createFixture();
    const outsideDirectory = await mkdtemp(
      join(tmpdir(), "nitro-markdown-snapshot-source-"),
    );
    const outside = join(outsideDirectory, "outside.txt");
    await writeFile(outside, "outside");
    await symlink(outsideDirectory, join(directory, "escape"));

    try {
      const snapshot = await snapshotDirectory(parent, "generated");
      expect(snapshot.entries.get("escape")).toEqual(
        expect.objectContaining({ kind: "symlink" }),
      );
      expect(snapshot.entries.has("escape/outside.txt")).toBe(false);
    } finally {
      await rm(outsideDirectory, { force: true, recursive: true });
    }
  });

  test("rejects a broad filesystem root as a restore target", async () => {
    const root = process.platform === "win32" ? `${process.cwd().split("\\")[0]}\\` : "/";

    await expect(
      restoreDirectorySnapshot(root, "generated", {
        exists: false,
        mode: 0,
        entries: new Map(),
      }),
    ).rejects.toThrow();
  });

  test("rejects normalized parent and generated-root aliases", async () => {
    const { parent } = await createFixture();
    const aliases = [
      `${parent}/child/..`,
      `${parent}/.`,
    ];
    for (const alias of aliases) {
      await expect(snapshotDirectory(alias, "generated")).rejects.toThrow();
    }
    for (const alias of ["./generated", "child/../generated", "child/./generated"]) {
      await expect(snapshotDirectory(parent, alias)).rejects.toThrow();
    }
  });

  test("rejects a package parent symlink without touching the outside marker", async () => {
    const outsideParent = await mkdtemp(
      join(tmpdir(), "nitro-markdown-snapshot-parent-outside-"),
    );
    const marker = join(outsideParent, "marker.txt");
    await writeFile(marker, "preserve");
    const parentAlias = join(
      tmpdir(),
      `nitro-markdown-snapshot-parent-link-${Date.now()}-${Math.random()}`,
    );
    await symlink(outsideParent, parentAlias);
    try {
      await expect(snapshotDirectory(parentAlias, "generated")).rejects.toThrow();
      expect(await readFile(marker, "utf8")).toBe("preserve");
    } finally {
      await unlink(parentAlias);
      await rm(outsideParent, { force: true, recursive: true });
    }
  });

  test("rejects deep trees and oversized symlink payloads within bounded setup", async () => {
    const { parent, directory } = await createFixture();
    let current = directory;
    for (let index = 0; index < 260; index += 1) {
      current = join(current, "d");
      await mkdir(current);
    }
    await expect(snapshotDirectory(parent, "generated")).rejects.toThrow();

    const snapshot = await snapshotDirectory(parent, "generated").catch(() => ({
      exists: true,
      mode: 0o755,
      entries: new Map(),
    }));
    snapshot.entries.set("oversized-link", {
      kind: "symlink",
      mode: 0o777,
      target: "x".repeat(4_097),
    });
    await expect(
      restoreDirectorySnapshot(parent, "generated", snapshot),
    ).rejects.toThrow();
  });

  test("keeps the original tree when restore construction fails", async () => {
    const { parent, directory } = await createFixture();
    const before = await snapshotDirectory(parent, "generated");
    const nestedSnapshot = {
      exists: true,
      mode: before.mode,
      entries: new Map([
        ["nested", { kind: "directory", mode: 0o755 }],
        ["nested/file.txt", { kind: "file", mode: 0o600, bytes: new Uint8Array([1]) }],
      ]),
    };

    const failures = [
      ["mkdir", nestedSnapshot],
      ["writeFile", before],
      ["chmod", before],
      [
        "symlink",
        {
          exists: true,
          mode: before.mode,
          entries: new Map([
            ["link", { kind: "symlink", mode: 0o777, target: "outside" }],
          ]),
        },
      ],
    ] as const;

    for (const [operation, snapshot] of failures) {
      setSnapshotFsForTest({
        [operation]: async () => {
          throw new Error(`injected ${operation} failure`);
        },
      });
      await expect(
        restoreDirectorySnapshot(parent, "generated", snapshot),
      ).rejects.toThrow(`injected ${operation} failure`);
      resetSnapshotFsForTest();
      expect(await snapshotDirectory(parent, "generated")).toEqual(before);
    }
    expect(await readFile(join(directory, "kept.txt"))).toEqual(
      Buffer.from([0, 1, 2, 255]),
    );
  });

  test("rejects path collisions before swapping the original tree", async () => {
    const { parent } = await createFixture();
    const before = await snapshotDirectory(parent, "generated");

    await expect(
      restoreDirectorySnapshot(parent, "generated", {
        exists: true,
        mode: before.mode,
        entries: new Map([
          ["collision", { kind: "file", mode: 0o600, bytes: new Uint8Array([1]) }],
          [
            "collision/child.txt",
            { kind: "file", mode: 0o600, bytes: new Uint8Array([2]) },
          ],
        ]),
      }),
    ).rejects.toThrow("non-directory");
    expect(await snapshotDirectory(parent, "generated")).toEqual(before);
  });
});
