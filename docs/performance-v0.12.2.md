# v0.12.2 performance and physical-device validation plan

## Scope and baseline

Extend PR #77 on `v0.12.2`. Preserve the public API, Unicode offsets, parser
limits, AST isolation, custom renderers, accessibility, and Android/iOS parity.
The starting commit is `4c22d8243f4caaf199d81cfbbc21b10fdd051409`.

The physical baseline uses an iPhone 17e, iOS 26.6.1, Hermes, React Native
0.86.3, and a Debug build. Debug and profiler overhead are not production
latency estimates. Synthetic helper measurements are not frame-rate claims.

## Work and acceptance criteria

| Area | Evidence and planned change | Acceptance |
| --- | --- | --- |
| Native session ranges | A 20-character tail read in a 500,000-character Unicode session took about 6.4 ms. Both offsets scan the full prefix. Reuse a validated byte/UTF-16 cursor and scan the end from the start. | Identical clamping, surrogate rejection, mutation and disposal behavior; lower repeated and append-tail latency without growing retained memory. |
| Input validation | CPU samples identify UTF-8 byte counting as a hot path. Add a native-regex ASCII prefix shortcut while retaining exact Unicode byte counts. | Boundary tests and deterministic UTF-8 oracle agreement; repeatable gains for ASCII documents and no material Unicode regression. |
| AST reuse | Reusing an already identical 1,001-block AST took about 1.7 ms. Stop immediately when node identity matches. | Preserve reference reuse and changed-subtree results; lower repeated and shared-prefix work. |
| Streaming correctness | Physical native-parser comparisons found incomplete automatic URL/email recognition across chunks. Guard ambiguous trailing tokens before the plain-text shortcut. | Incremental output equals full native parsing across every split of URL/email fixtures and deterministic chunk streams. |
| Rendering | Existing benchmark: 45 React commits, 23 over 16 ms; repeated mixed-document mounts were about 70–81 ms in the instrumented Debug run. Legacy MathJax dominates its own comparison. | Repeat identical benchmark and inspect package-owned costs; retain only proven changes, with no speculative layout or memoization rewrite. |
| Memory and lifecycle | Exercise repeated creation, append, replace, reset, listeners, clear, and disposal. | No stale text, listener leaks, crashes, or unbounded retained session capacity after disposal; separate heap trend from proven leaks. |

## Execution

1. Save reproducible physical Hermes workload definitions and baseline results.
2. Add focused regression tests, then implement the bounded changes above.
3. Run focused JS and native tests as each affected area changes.
4. Rebuild and install on the same iPhone; compare identical fixtures and sample
   counts in multiple runs, with timing runs separate from CPU instrumentation.
5. Run physical smoke tests, rendering/streaming checks, and captured log review.
6. Run final release preflight, generated-code/package audit, and Android/iOS
   example build and runtime checks for the final native implementation.
7. Update consumer changelog, measured results, and PR #77; verify exact-head CI
   before release delivery. Keep the version at 0.12.2.

## Measurement rules

- Use fixed inputs, warmups, repeated samples, medians and p95; record fixture
  length in UTF-16 units and compare complete output as well as timing.
- Keep each debugger evaluation bounded. A response timeout does not prove a
  native crash. Do not pool warm and cold samples or profiled and unprofiled runs.
- Record physical phone, simulator, local tests, CI, and registry evidence
  separately. Never substitute one for another.
- Preserve errors and validation. Do not remove AST defensive copies or parser
  checks merely to improve a benchmark.

## Results

The four bounded optimizations/correctness changes above are implemented.
Reference-definition allocation also checks integer and allocation bounds
before narrowing sizes. Public APIs and AST defensive validation are unchanged.

### Physical Hermes measurements

These are unprofiled Debug-binary microbenchmarks on the same iPhone, using
fixed fixtures and three warmups: 20 timing samples for helpers/session reads,
10 for parsing, and five for AST cloning. Values are median
milliseconds; before is PR #77's starting commit, after is the final candidate.

| Operation | Before | After |
| --- | ---: | ---: |
| Append and read tail, 500,000 UTF-16 units | 5.739 | 0.0023 |
| Repeated tail read, 500,000 units | 5.830 | 0.0013 |
| UTF-8 byte count, 500,000 ASCII units | 17.77 | 1.29 |
| UTF-8 byte count, 500,000 mixed Unicode units | 18.73 | 17.47 |
| Reuse identical 682-block AST | 1.138 | 0.00017 |
| Full native parse, 500,000 units | 139.24 | 141.93 |
| Defensive AST clone, about 16,000 units | 34.87 | 34.88 |

A repeated session run measured 0.0021 ms for append/read and 0.0013 ms for
tail reads. These near-clock-resolution values establish removal of the large
prefix scan, not a reliable exact speedup multiplier. Unchanged `getAllText`
varied from about 0.58 ms before to 0.88–0.95 ms after; the cause of this
variation was not isolated. There is no claim of uniform package speedup.

The physical native-parser oracle passed 933 checks, including automatic-link
split boundaries and repeated Unicode ranges/mutations. Two further batches
each passed 300 lifecycle checks over 100 large sessions. Sampled process memory
was 457,040, 457,728 and 458,448 kB across those batches. This short trend is not
proof of leak absence; native tests separately verify released session capacity.

### Rendering limit

An actual mounted `MarkdownStream` received 60 appends requested 16 ms apart
after a 16,005-unit mixed document. Final text matched in both configurations:

| JS configuration, same Debug native binary | Elapsed including settle time | Median JS frame gap | p95 JS frame gap |
| --- | ---: | ---: | ---: |
| Development JS, no CPU profile | 7,768 ms | 113 ms | 128 ms |
| Production JS (`dev=false`), minimal root-capture hook | 5,928 ms | 82 ms | 92 ms |

These are JS callback gaps, not native FPS or a Release-build benchmark.
Production JS used a temporary example entry solely to locate the mounted
controller; that entry and manifest change were removed after measurement.
The React profile shows stable completed nodes do not rerender; two tail nodes
change per append. Full AST validation/copying and document child reconciliation
remain significant costs. This release does not promise smooth 60 Hz updates
for this large workload. A future rendering change needs its own mutation,
custom-renderer and validation contract tests.

### Reproduction and verification

`bun scripts/stress-package.js <suite> <output.js>` emits a bounded Hermes
expression for `session`, `parse`, `ast`, `correctness`, `lifecycle` or `render`.
Evaluate it in the example's development runtime. For `render`, open Token
stream, start and pause it first; read `globalThis.__nitroMarkdownRenderStress`
after completion. Timing runs must be separate from CPU profiling.

Final native builds passed on Android, the iOS simulator and the physical phone.
Final package preflight and runtime smoke receipts are recorded in PR #77.
