# Native libraries

The parser stays on vendored md4c (`nitromd`). AST transport stays a streaming
C++ JSON writer plus `JSON.parse` on the JavaScript side.

## Kept

| Library | Where | Why |
| --- | --- | --- |
| md4c | `cpp/core/NitroMD4CParser` | CommonMark/GFM AST already matches the public node types. |
| Streaming `JsonWriter` | `HybridMarkdownParser.cpp` | Writes JSON without building a DOM. Faster than allocating a yyjson/FlatBuffers tree for the same payload. |

## Evaluated and not shipped

| Library | Decision |
| --- | --- |
| yyjson | Rejected for AST export. A mutable document allocates more than the existing writer and still needs `JSON.parse`. |
| FlatBuffers / Cap'n Proto | Rejected. Would change the public JSON AST contract and add generated schemas. |
| tree-sitter-markdown | Rejected. Different dialect and node names than the current AST. |
| comrak | Rejected. Rust/C ABI plus a GFM dialect that does not match md4c output. |
| syntect | Rejected. Highlighting stays on `defaultHighlighter` / `CodeHighlighter` so themes stay in JavaScript. |

Incremental parse, fragment JSON cache, and UTF-16 offset math stay in-tree.
Do not describe `astTransform` as a parser-plugin syntax extension.
