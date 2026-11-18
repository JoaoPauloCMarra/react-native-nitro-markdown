// Ported from software-mansion/enriched-markdown (MIT, Copyright (c) 2025
// Software Mansion). See StreamText.hpp for the source.
#include "StreamText.hpp"

#include <algorithm>
#include <cctype>

namespace NitroMarkdown::StreamText {

namespace {

// The width of a list item marker at the start of `body` with the spaces
// after it (the column the item's content starts at), or 0.
std::size_t listMarkerWidth(std::string_view body) {
    const std::size_t i = leadingSpaces(body);
    if (i > 3 || i >= body.size()) return 0;
    std::size_t m = i;
    if (body[m] == '-' || body[m] == '*' || body[m] == '+') {
        m++;
    } else {
        std::size_t digits = m;
        while (
            digits < body.size() && digits - m < 9 &&
            std::isdigit(static_cast<unsigned char>(body[digits]))
        ) {
            digits++;
        }
        if (digits == m || digits >= body.size() || (body[digits] != '.' && body[digits] != ')')) {
            return 0;
        }
        m = digits + 1;
    }
    if (m == body.size()) return m;
    if (body[m] != ' ' && body[m] != '\t') return 0;
    std::size_t content = m;
    while (content < body.size() && body[content] == ' ' && content - m < 4) content++;
    return content;
}

struct FenceMarker {
    char ch = 0;
    std::size_t length = 0;
    std::string_view info;
};

bool parseFenceMarker(std::string_view line, FenceMarker& out) {
    std::size_t i = 0;
    while (i < line.size() && line[i] == ' ' && i < 3) i++;
    if (i >= line.size()) return false;
    const char ch = line[i];
    if (ch != '`' && ch != '~') return false;
    std::size_t run = 0;
    while (i < line.size() && line[i] == ch) {
        i++;
        run++;
    }
    if (run < 3) return false;
    const std::string_view info = line.substr(i);
    if (ch == '`' && info.find('`') != npos) return false;
    out = {ch, run, info};
    return true;
}

bool isStrictMathFence(std::string_view line) {
    const std::size_t indent = leadingSpaces(line);
    if (indent > 3 || !startsWith(line.substr(indent), "$$")) return false;
    for (std::size_t i = indent + 2; i < line.size(); i++) {
        const char ch = line[i];
        if (ch == ' ' || ch == '\t') continue;
        // A trailing `\r` belongs to the line ending.
        return ch == '\r' && i + 1 == line.size();
    }
    return true;
}

} // namespace

bool isWhitespace(char ch) {
    return ch == ' ' || ch == '\t' || ch == '\r' || ch == '\f' || ch == '\v';
}

bool isBlankFrom(std::string_view text, std::size_t from) {
    for (std::size_t i = from; i < text.size(); i++) {
        if (!isWhitespace(text[i])) return false;
    }
    return true;
}

bool isBlank(std::string_view text) {
    return isBlankFrom(text, 0);
}

bool startsWith(std::string_view text, std::string_view prefix) {
    return text.substr(0, prefix.size()) == prefix;
}

std::string_view trim(std::string_view text) {
    std::size_t start = 0;
    while (start < text.size() && isWhitespace(text[start])) start++;
    std::size_t end = text.size();
    while (end > start && isWhitespace(text[end - 1])) end--;
    return text.substr(start, end - start);
}

std::size_t leadingSpaces(std::string_view text) {
    std::size_t i = 0;
    while (i < text.size() && text[i] == ' ') i++;
    return i;
}

bool equalsIgnoringCase(char a, char b) {
    return std::tolower(static_cast<unsigned char>(a)) == std::tolower(static_cast<unsigned char>(b));
}

bool containsIgnoringCase(std::string_view text, std::string_view needle) {
    return std::search(text.begin(), text.end(), needle.begin(), needle.end(), equalsIgnoringCase) !=
        text.end();
}

bool isEscaped(std::string_view text, std::size_t index) {
    std::size_t backslashes = 0;
    while (index > backslashes && text[index - backslashes - 1] == '\\') backslashes++;
    return backslashes % 2 == 1;
}

// The parser ends a line at `\n`, at `\r\n` and at a lone `\r`.
Lines splitLines(std::string_view text) {
    Lines lines;
    std::size_t start = 0;
    while (true) {
        const std::size_t end = text.find_first_of("\r\n", start);
        if (end == npos) {
            lines.push_back({text.substr(start), start, false});
            return lines;
        }
        lines.push_back({text.substr(start, end - start), start, false});
        const bool crlf = text[end] == '\r' && end + 1 < text.size() && text[end + 1] == '\n';
        start = end + (crlf ? 2 : 1);
    }
}

Quoted stripQuotes(std::string_view line) {
    std::size_t depth = 0;
    std::size_t i = 0;
    while (true) {
        std::size_t j = i;
        while (j < line.size() && line[j] == ' ' && j - i < 3) j++;
        if (j >= line.size() || line[j] != '>') break;
        depth++;
        j++;
        if (j < line.size() && (line[j] == ' ' || line[j] == '\t')) j++;
        i = j;
    }
    return {line.substr(i), depth};
}

bool lineIsBlank(const Line& line) {
    return isBlank(stripQuotes(line.text).body);
}

std::size_t scanFences(Lines& lines) {
    std::size_t openFence = npos;
    struct {
        char ch = 0;
        std::size_t length = 0;
        std::size_t depth = 0;
        std::size_t indent = 0;
    } fence;
    bool inFence = false;
    std::size_t listIndent = 0; // content column of the list item being continued
    for (std::size_t i = 0; i < lines.size(); i++) {
        const Quoted quoted = stripQuotes(lines[i].text);
        const std::string_view body = quoted.body;
        const bool blank = isBlank(body);
        const std::size_t lead = leadingSpaces(body);
        if (inFence) {
            // A blank last line has not streamed its quote markers in yet, so
            // it cannot end a quoted fence.
            const bool undecided = i + 1 == lines.size() && isBlank(lines[i].text);
            const bool containerEnded =
                !undecided && (quoted.depth < fence.depth || (!blank && lead < fence.indent));
            if (!containerEnded) {
                lines[i].code = true;
                FenceMarker marker;
                if (
                    !blank && parseFenceMarker(body.substr(fence.indent), marker) &&
                    marker.ch == fence.ch && marker.length >= fence.length && isBlank(marker.info)
                ) {
                    inFence = false;
                }
                continue;
            }
            inFence = false;
        }
        if (blank) continue;
        std::size_t indent = 0;
        if (const std::size_t marker = listMarkerWidth(body)) {
            listIndent = marker;
            indent = marker;
        } else if (listIndent != 0 && lead >= listIndent) {
            indent = listIndent;
        } else {
            listIndent = 0;
        }
        FenceMarker marker;
        if (parseFenceMarker(body.substr(indent), marker)) {
            inFence = true;
            fence = {marker.ch, marker.length, quoted.depth, indent};
            lines[i].code = true;
            openFence = i;
        }
    }
    return inFence ? openFence : npos;
}

MathBlock nextMathBlock(MathBlock current, std::string_view line) {
    const bool strict = isStrictMathFence(line);
    const bool loose = trim(stripQuotes(line).body) == "$$";
    switch (current) {
        case MathBlock::Closed:
            if (strict) return MathBlock::Strict;
            return loose ? MathBlock::Loose : MathBlock::Closed;
        case MathBlock::Strict:
            return strict ? MathBlock::Closed : MathBlock::Strict;
        case MathBlock::Loose:
            return loose ? MathBlock::Closed : MathBlock::Loose;
    }
    return current;
}

} // namespace NitroMarkdown::StreamText
