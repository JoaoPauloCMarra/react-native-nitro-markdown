// Where the finished blocks of a streamed Markdown document end.
//
// Ported from software-mansion/enriched-markdown, packages/core/cpp/parser
// (StreamingFilter.cpp) at commit 5bcfe94d0e06d15f810e34a14f3544698ab40488.
// MIT License, Copyright (c) 2025 Software Mansion. See
// THIRD_PARTY_NOTICES.md.
//
// Changes for this parser: `$$` follows the nitromd display-math fence
// grammar, and HTML blocks are tracked only when the parser reads HTML.
//
// All text is UTF-8. Positions are byte offsets.
#pragma once

#include <cstddef>
#include <string_view>

namespace NitroMarkdown {

struct StreamBoundaryOptions {
    bool math = true; // the parser reads `$$` fences
    bool html = false; // the parser reads raw HTML blocks
};

// Where the bytes that later text can no longer change end: the start of the
// last line that begins a top-level block after a blank line, outside fenced
// code, `$$` math and HTML blocks that may hold blank lines; 0 when there is
// none. A last line that is still arriving counts once its first character
// rules out a fence and `$$`. A later `[label]: url` can still change how
// earlier bytes parse, so this is a boundary for what to show while a stream
// runs, not for parsing the two parts apart.
std::size_t finishedBlocksEnd(std::string_view markdown, const StreamBoundaryOptions& options);

// Whether a line that follows a blank line at the top level starts a block of
// its own, whatever came before it: not indented, and no list marker,
// reference definition or HTML that could belong to the block above.
bool startsTopLevelBlock(std::string_view line);

} // namespace NitroMarkdown
