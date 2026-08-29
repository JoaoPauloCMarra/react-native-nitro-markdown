# NitroMD parser engine

`nitromd.c` / `nitromd.h` are this package's owned, vendored Markdown parsing
engine. They are a hardened fork of **md4c** — not a runtime dependency. Nothing
external is fetched at install or build time; the engine ships as package source.

## Upstream

- Project: md4c — Markdown parser for C (https://github.com/mity/md4c)
- Author: Martin Mitáš, © 2016–2026
- License: MIT (retained in the `nitromd.h` / `nitromd.c` headers)

- Synced from upstream `master` at commit
  `3e7ace20d262028baf702db9850520f017c25591` (2026-08-17).
- This commit contains the upstream 0.5.3 changes and the current work-in-progress
  parser fixes and extensions. NitroMarkdown keeps its existing enabled flag set,
  so new upstream extensions remain opt-in and do not change the package grammar.

## Local modifications

The fork is deliberately minimal so upstream fixes stay easy to re-apply:

1. **Renamed files** — `md4c.h` → `nitromd.h`, `md4c.c` → `nitromd.c`. Generic
   upstream basenames collide in CocoaPods' shared header map with any other
   md4c-based pod, resolving the wrong header into the wrong translation unit.
2. **Namespaced the exported symbol** — md4c exports exactly one global symbol,
   `md_parse` (everything else is `static`). `nitromd.h` defines
   `md_parse` → `nitromd_parse` so two md4c-based static libraries can link into
   one binary without a duplicate-symbol error.
3. **Source-offset callback extension** — NitroMarkdown retains the callback
   `MD_OFFSET` argument and block range fields that its AST wrapper needs. The
   current upstream parser does not expose those callback offsets, so this
   small ABI-local change is re-applied when syncing upstream.
4. **Standalone display-math fences** — With the existing math flag enabled,
   NitroMarkdown recognizes exact line-oriented `$$` fences and reuses the
   existing fenced-code storage and callbacks to emit opaque math content.

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
2. Re-apply only the local changes above (including the `#include
   "nitromd.h"` line in `nitromd.c` and the `#define md_parse nitromd_parse`
   block in `nitromd.h`).
3. Run `bun run test:cpp` and update the synced upstream commit above.
