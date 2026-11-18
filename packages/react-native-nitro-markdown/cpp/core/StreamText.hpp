// Line scanning shared by the stream boundary and the stream filter.
//
// Ported from software-mansion/enriched-markdown, packages/core/cpp/parser
// (StreamingFilter.cpp, TextScan.hpp, BlockKinds.cpp) at commit
// 5bcfe94d0e06d15f810e34a14f3544698ab40488. MIT License,
// Copyright (c) 2025 Software Mansion. See THIRD_PARTY_NOTICES.md.
//
// All text is UTF-8. Positions are byte offsets.
#pragma once

#include <cstddef>
#include <string_view>
#include <vector>

namespace NitroMarkdown::StreamText {

inline constexpr std::size_t npos = std::string_view::npos;

// A line break is not whitespace here: every caller looks at one line.
bool isWhitespace(char ch);
bool isBlankFrom(std::string_view text, std::size_t from);
bool isBlank(std::string_view text);
bool startsWith(std::string_view text, std::string_view prefix);
std::string_view trim(std::string_view text);
std::size_t leadingSpaces(std::string_view text);
bool equalsIgnoringCase(char a, char b);
bool containsIgnoringCase(std::string_view text, std::string_view needle);

// Whether the character at `index` follows an odd run of backslashes.
bool isEscaped(std::string_view text, std::size_t index);

// One line of the document, a view into it.
struct Line {
    std::string_view text;
    std::size_t offset; // of its first character in the document
    bool code; // inside a fenced code block, fence lines included
};
using Lines = std::vector<Line>;

Lines splitLines(std::string_view text);

// A line without its blockquote markers.
struct Quoted {
    std::string_view body;
    std::size_t depth;
};
Quoted stripQuotes(std::string_view line);

// A line that holds only quote markers ends a paragraph like an empty line.
bool lineIsBlank(const Line& line);

// Marks the fenced code lines and returns the opening line of a fence still
// open at the end, or npos. Fences inside blockquotes and list items count: a
// quoted fence closes with its quote, a listed one when a line leaves the
// item's indent.
std::size_t scanFences(Lines& lines);

// Whether a `$$` block is open, and how it was opened. A fence the parser
// reads (Strict: zero to three spaces, `$$`, then only spaces or tabs) closes
// only with a line the parser reads as its closer. A line that only looks
// like one (indented deeper, or inside a quote) holds text back until the
// next line that looks like one.
enum class MathBlock { Closed, Strict, Loose };
MathBlock nextMathBlock(MathBlock current, std::string_view line);

} // namespace NitroMarkdown::StreamText
