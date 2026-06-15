# NitroMD parser engine

`nitromd.c` / `nitromd.h` are this package's owned, vendored Markdown parsing
engine. They are a hardened fork of **md4c** — not a runtime dependency. Nothing
external is fetched at install or build time; the engine ships as package source.

## Upstream

- Project: md4c — Markdown parser for C (https://github.com/mity/md4c)
- Author: Martin Mitáš, © 2016–2024
- License: MIT (retained in the `nitromd.h` / `nitromd.c` headers)

The exact upstream commit was not tagged in the source when vendored; record the
upstream tag/commit here whenever the engine is next synced.

## Local modifications

The fork is deliberately minimal so upstream fixes stay easy to re-apply:

1. **Renamed files** — `md4c.h` → `nitromd.h`, `md4c.c` → `nitromd.c`. Generic
   upstream basenames collide in CocoaPods' shared header map with any other
   md4c-based pod, resolving the wrong header into the wrong translation unit.
2. **Namespaced the exported symbol** — md4c exports exactly one global symbol,
   `md_parse` (everything else is `static`). `nitromd.h` defines
   `md_parse` → `nitromd_parse` so two md4c-based static libraries can link into
   one binary without a duplicate-symbol error.

Everything else is stock md4c. The C++ wrapper lives in
`../core/NitroMD4CParser.{hpp,cpp}` and is the only intended entry point.

## Build wiring

- Compiled with `MD4C_USE_UTF8=1`.
- Header search path: `cpp/nitromd` (iOS podspec, `cpp/CMakeLists.txt`,
  `android/CMakeLists.txt`).
- The C++ headers are marked `private_header_files` in the podspec so they never
  enter the public header map.

## Syncing upstream

1. Diff the new upstream `md4c.c` / `md4c.h` against `nitromd.c` / `nitromd.h`.
2. Re-apply only the two local changes above (the `#include "nitromd.h"` line in
   `nitromd.c` and the `#define md_parse nitromd_parse` block in `nitromd.h`).
3. Run `bun run test:cpp` and record the synced upstream tag/commit above.
