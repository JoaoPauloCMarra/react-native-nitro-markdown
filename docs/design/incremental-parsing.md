# Design: Incremental Parsing via md4c Checkpoint/Resume

Status: design proposal (not implemented)
Scope: `packages/react-native-nitro-markdown` native parser (`cpp/nitromd`, `cpp/core`)
Related: [Streaming](../streaming.md), [API Reference](../api-reference.md)

## Background

`MarkdownStream` batches append-only session updates and re-parses on every
flush (per animation frame, or every ~50 ms with `updateStrategy="interval"`).
Each flush currently costs:

1. a full `nitromd_parse` run over the whole document (validation of
   cross-block structure), and
2. serialization of the whole AST to JSON plus a JS-side `JSON.parse`.

Cost 2 has already been addressed. The parser binding keeps a bounded LRU
cache (512 entries, 4 MiB) that maps a top-level block's exact source byte
slice, absolute start offset, parser flags, and node type to its serialized
JSON fragment, so unchanged prefix blocks are not re-serialized on re-parse.
Documents that may contain link reference definitions bypass the cache, and
blocks terminated by end-of-input are never cached, because their extent can
depend on EOF rather than on the slice alone. On the C++ flush benchmark this
keeps warm re-parse cost at roughly 0.68x of cold cost while output stays
byte-identical (see `testSerializationCacheFlushBudget` in
`cpp/core/NitroMD4CParserTest.cpp`).

Cost 1 remains O(document) per flush: the full parse still runs every time.
This document designs the next step — true O(tail) parsing — and explains why
it requires changes inside the vendored `nitromd` engine rather than another
layer around it.

## Why a parser fork is required

`nitromd` (like upstream md4c) is a single-shot parser: it walks the input
from byte 0, driven by line-based block recognition and an internal container
stack. There is no API to begin parsing at a mid-document offset, because the
meaning of the bytes at that offset depends on state accumulated from the
entire preceding document. Specifically:

1. **Reference definitions are document-global.** md4c collects link
   reference definitions (`[label]: destination`) while scanning blocks, and
   resolves reference-style links in a later pass. A definition at the end of
   the document changes how a link near the beginning renders. Any resume
   point must therefore carry the full reference map, and a new definition
   appended in the tail can invalidate already-emitted blocks.
2. **Open container stack.** At any line boundary the parser may sit inside
   nested block quotes, list items, and table rows. Each open container
   carries per-container state: marker type and width, indentation budget,
   ordered/unordered, start number, tight-vs-loose status, task-list marker
   state, and whether the container has seen content. Restarting without
   this stack mis-parses continuation lines.
3. **Lazy continuation.** A plain paragraph line inside a list item or block
   quote continues the innermost paragraph even without the container marker.
   Whether a line is lazy continuation or a new block depends on the open
   stack and on whether the innermost block is a paragraph.
4. **Setext heading state.** A paragraph followed by a `===`/`---` line is
   retroactively converted into a heading. The last open paragraph of a
   checkpoint must be treated as provisional until the next line is known.
5. **Block-termination context.** Fenced code, HTML blocks, and tables all
   terminate on conditions that depend on subsequent lines (closing fence,
   blank line, end of row structure). A checkpoint taken at a "safe boundary"
   must only be taken where no such block is open or all such state is
   captured.

None of this state is exposed by the public `md_parse` API, and the callback
interface only delivers completed structure. Reconstructing this state
outside the engine (for example, by re-parsing a prefix "invisibly") still
costs O(document) and gains nothing. The conclusion: O(tail) parsing requires
teaching the engine itself to snapshot and restore its parser context, i.e.
changes to `cpp/nitromd/nitromd.c`, which is a deliberate, pinned fork of
md4c.

## Checkpoint state model

A checkpoint is taken at a **safe block boundary**: a line boundary where the
document ends a complete top-level block and no container is open. For
streaming append-only input, checkpoints are taken lazily — the first flush
after a completed block closes.

State to capture at the boundary:

| State | Purpose | Notes |
| --- | --- | --- |
| `byteOffset`, `utf16Offset` | Resume position | Input is UTF-8; offsets must track both representations because the public AST emits UTF-16 ranges |
| `parserFlags` | gfm/math/html + md4c extension bits | A checkpoint is only valid for the flags that produced it |
| Reference map | Resolve `[label]` links in the tail | Must copy label → (destination, title), normalized per md4c's label rules |
| Open container stack | Quote/list/table continuation | Empty at a safe boundary; captured anyway so non-safe checkpoints stay possible later |
| List state | Tight/loose, start, task markers | Per open list/item |
| Line-ending context | CRLF handling, last line blank | md4c preprocesses line endings; resume must reproduce the same normalized view |
| `prefixHash` | Integrity check | Hash of all bytes up to the boundary; a mismatch invalidates the checkpoint |
| `lastBlockProvisional` | Setext/lazy guard | Reserved flag; always false at a safe boundary |

## Checkpoint format sketch

```c
typedef struct MD_Checkpoint {
    uint32_t size;              /* sizeof + variable data, for forward compat */
    uint32_t byteOffset;
    uint32_t utf16Offset;
    uint32_t parserFlags;
    uint32_t refDefCount;
    MD_RefDef  refDefs[];       /* label[], destination, title */
    uint64_t prefixHash;        /* FNV-1a over input[0..byteOffset) */
    /* container stack omitted while only safe boundaries are supported */
} MD_Checkpoint;
```

Planned API additions on the engine:

```c
/* Write a checkpoint at the last safe boundary at-or-before `limit`. */
unsigned nitromd_checkpoint(const MD_PARSER* parser,
                            MD_SIZE limit,
                            MD_Checkpoint** out);

/* Parse only `input[checkpoint->byteOffset ..]`, replaying captured state. */
int nitromd_parse_resume(const MD_PARSER* parser,
                         const char* input, MD_SIZE inputSize,
                         const MD_Checkpoint* checkpoint,
                         void* userdata);
```

The wrapper (`cpp/core/NitroMD4CParser.cpp`) owns checkpoint lifetime on the
session, validates `prefixHash` and `parserFlags` before resuming, and falls
back to a full parse on any mismatch. Emitted `beg`/`end` offsets continue to
be absolute UTF-16 positions, so downstream consumers (including the
serialization cache, whose keys include absolute offsets) are unaffected.

## Correctness envelope

Two classes of tail input can invalidate work performed before the resume
point, and both must degrade to a full parse:

- **Reference definitions in the tail.** A newly appended definition can
  change how an earlier unresolved link resolved. The engine already resolves
  links in a second pass, so the practical rule is: if the tail contains a
  potential definition line, re-run link resolution over the whole document
  (or simply fall back to a full parse initially).
- **Open blocks at the flush point.** The final block of a partial document
  (open paragraph, open fence, open table) is provisional. Only blocks closed
  before the checkpoint offset are committed; everything after is re-parsed
  on every resume.

## Differential test strategy

The fork must be provably equivalent to full parsing. The existing test assets
make a strong differential harness:

1. **Conformance corpus replay.** For every entry in
   `src/__fixtures__/conformance-corpus.json`, and for every safe boundary in
   the input: parse the full document (oracle), then parse
   `input[0..boundary)` with a checkpoint and resume the remainder. Both
   canonicalized ASTs (`canonicalizeNode`, shared with the corpus generator)
   and serialized JSON must be byte-identical.
2. **Seeded fuzz differential.** Extend `testSeededFuzz` with a streaming
   mode: generate inputs with the existing alphabet (which includes
   multibyte, control characters, and NUL), grow them in random chunks, and
   after each chunk assert checkpoint-resume output equals full-parse output.
   Deterministic seeds keep failures reproducible.
3. **Adversarial cases.** A curated list for the known hazards: forward
   reference definitions, definitions that shadow earlier ones, lazy
   continuation across chunk boundaries, setext conversion where the `===`
   line arrives in a later chunk, CRLF splits, tables split across chunks,
   unterminated fences at chunk end, and task-list markers arriving
   mid-tail.
4. **Budget gates.** The flush benchmark gains a third mode: warm re-parse
   via checkpoint resume, asserted to be well under the serialization-cache
   warm budget, plus a memory gate for retained checkpoint size
   (reference map can grow with the document; cap and fall back to full
   parse above it).

## Effort and risk estimate

- Engine work (checkpoint capture, resume entry, ref-map serialization):
  the bulk of the effort; touches `md_build_block_structure` internals.
  Estimate 2–3 weeks including tests.
- Wrapper and session integration (checkpoint ownership, invalidation,
  fallback): 3–4 days.
- Test harness and adversarial corpus: 3–4 days, largely reusable from (1)
  and (2) above.
- Ongoing cost: every upstream md4c sync must re-apply the fork's diff. The
  fork's local modifications are currently kept deliberately minimal; this is
  the largest single change to it and makes future syncs measurably harder.

Main risks: hidden cross-block state beyond the five listed above (mitigated
by differential fuzzing before release), reference-map memory growth on
definition-heavy documents (mitigated by the size cap with full-parse
fallback), and setext/lazy edge cases where "safe boundary" is subtler than
expected (mitigated by taking checkpoints only at closed top-level blocks).

## Alternatives considered

- **Serialization cache (shipped).** Removes re-serialization cost only; the
  parse stays O(document). Delivered as the interim measure described in the
  background.
- **JS-side AST merging** (`src/utils/incremental-ast.ts`). Already reuses
  stable nodes for React rendering, but depends on the native full parse and
  cannot reduce parse cost.
- **Switching engines** to an incremental Markdown implementation. Rejected:
  it would discard the hardened fork, the conformance corpus, and the UTF-16
  offset contract that downstream ranges rely on.
