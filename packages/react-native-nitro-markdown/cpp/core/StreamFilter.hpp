// Hides the blocks at the end of a streamed Markdown document that have not
// finished arriving.
//
// Ported from software-mansion/enriched-markdown, packages/core/cpp/parser
// (StreamingFilter.cpp, BlockKinds.cpp) at commit
// 5bcfe94d0e06d15f810e34a14f3544698ab40488. MIT License,
// Copyright (c) 2025 Software Mansion. See THIRD_PARTY_NOTICES.md.
//
// Changes for this parser: no `<video>` blocks, no spoilers, no bare-URL or
// `<autolink>` rule, tables only when the parser reads them, and `$$`
// follows the nitromd display-math fence grammar.
//
// All text is UTF-8.
#pragma once

#include <string>
#include <string_view>

namespace NitroMarkdown {

enum class StreamBlockMode { Progressive, Hidden };

struct StreamFilterOptions {
    StreamBlockMode tables = StreamBlockMode::Progressive;
    StreamBlockMode codeBlocks = StreamBlockMode::Progressive;
    StreamBlockMode media = StreamBlockMode::Progressive;
    bool gfmTables = true; // the parser reads tables
    bool math = true; // the parser reads `$$` fences
};

struct StreamFilterResult {
    std::string text;
    // The text ends inside a fenced code block whose closing fence has not
    // arrived. Only possible with codeBlocks Progressive.
    bool endsInsideOpenCodeFence = false;
};

// What to show of `tail`, the text after the last finished block:
//
//   * block math: an unterminated `$$` block is cut at its opening line;
//   * tables: Hidden withholds a trailing table until a blank line follows
//     it. Progressive shows a finished header row at once (with a delimiter
//     row added while the real one arrives) and trims an incomplete last row;
//   * fenced code: Hidden cuts an open fence, Progressive keeps it once its
//     opening line has ended;
//   * media (a trailing line that starts with `![alt](url)` or
//     `[label](url)`): cut while its syntax is still open. Hidden also
//     withholds a complete one until a blank line or another block follows.
//
// Inline syntax still being typed inside prose is not this filter's concern.
StreamFilterResult filterStreamTail(std::string_view tail, const StreamFilterOptions& options);

} // namespace NitroMarkdown
