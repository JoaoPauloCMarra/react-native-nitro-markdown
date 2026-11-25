// Ported from software-mansion/enriched-markdown (MIT, Copyright (c) 2025
// Software Mansion). See StreamFilter.hpp for the source and the changes.
#include "StreamFilter.hpp"

#include "StreamText.hpp"

#include <algorithm>
#include <cstddef>
#include <unordered_map>
#include <utility>
#include <vector>

namespace NitroMarkdown {

namespace {

using namespace StreamText;

// The part of the tail still shown, and its lines. Every rule cuts at a line
// start, so the lines are truncated instead of split again.
struct Document {
    std::string_view text;
    Lines lines;
    // Shown after `text`: a table's delimiter row while its own is arriving.
    std::string appended;

    void cutAtLine(std::size_t index) {
        const std::size_t offset = lines[index].offset;
        text = text.substr(0, offset);
        lines.resize(index);
        // The text now ends with the newline before the cut line, or is empty.
        lines.push_back({std::string_view(), offset, false});
    }
};

// The last line that is not blank, or npos.
std::size_t lastNonBlankLine(const Lines& lines) {
    for (std::size_t i = lines.size(); i-- > 0;) {
        if (!lineIsBlank(lines[i])) return i;
    }
    return npos;
}

// A trailing block is still arriving unless a blank line follows it.
bool trailingBlockIsOpen(const Lines& lines, std::size_t last) {
    return last != npos && last + 2 >= lines.size();
}

std::size_t blockStart(const Lines& lines, std::size_t last) {
    std::size_t start = last;
    while (start > 0 && !lineIsBlank(lines[start - 1]) && !lines[start - 1].code) start--;
    return start;
}

// ---- block math

void cutPendingMath(Document& doc) {
    MathBlock math = MathBlock::Closed;
    std::size_t opener = npos;
    for (std::size_t i = 0; i < doc.lines.size(); i++) {
        if (doc.lines[i].code) continue;
        const MathBlock next = nextMathBlock(math, doc.lines[i].text);
        if (math == MathBlock::Closed && next != MathBlock::Closed) opener = i;
        if (next == MathBlock::Closed) opener = npos;
        math = next;
    }
    if (opener != npos) doc.cutAtLine(opener);
}

// ---- tables

std::string_view tableRow(const Line& line) {
    return trim(stripQuotes(line.text).body);
}

// The cells of a row, without the optional outer pipes.
std::vector<std::string_view> tableCells(std::string_view row) {
    if (!row.empty() && row.front() == '|') row.remove_prefix(1);
    if (!row.empty() && row.back() == '|' && !isEscaped(row, row.size() - 1)) row.remove_suffix(1);
    std::vector<std::string_view> cells;
    std::size_t start = 0;
    for (std::size_t i = 0; i <= row.size(); i++) {
        if (i == row.size() || (row[i] == '|' && !isEscaped(row, i))) {
            cells.push_back(trim(row.substr(start, i - start)));
            start = i + 1;
        }
    }
    return cells;
}

bool isDelimiterRow(std::string_view row, std::size_t headerCells) {
    if (row.find('-') == npos) return false;
    const auto cells = tableCells(row);
    if (cells.size() != headerCells) return false;
    for (auto cell : cells) {
        if (!cell.empty() && cell.front() == ':') cell.remove_prefix(1);
        if (!cell.empty() && cell.back() == ':') cell.remove_suffix(1);
        if (cell.empty() || cell.find_first_not_of('-') != npos) return false;
    }
    return true;
}

std::size_t pipeCount(std::string_view row) {
    std::size_t count = 0;
    for (std::size_t i = 0; i < row.size(); i++) {
        if (row[i] == '|' && !isEscaped(row, i)) count++;
    }
    return count;
}

// What a delimiter row may hold before its last cell arrives.
bool isPartialDelimiterRow(std::string_view row, std::size_t headerCells) {
    return row.find_first_not_of("|-: \t") == npos && tableCells(row).size() <= headerCells;
}

void cutPendingTable(Document& doc, const StreamFilterOptions& options, bool terminated) {
    if (!options.gfmTables) return; // a row of pipes is prose
    const Lines& lines = doc.lines;
    const std::size_t last = lastNonBlankLine(lines);
    if (!trailingBlockIsOpen(lines, last)) return;
    const std::size_t start = blockStart(lines, last);
    if (lines[start].code) return;
    const std::string_view header = tableRow(lines[start]);
    const std::size_t lineCount = last - start + 1;
    const std::size_t headerCells = tableCells(header).size();
    const bool hasDelimiter =
        lineCount >= 2 && isDelimiterRow(tableRow(lines[start + 1]), headerCells);
    bool piped = true;
    for (std::size_t i = start; i <= last; i++) {
        if (tableRow(lines[i]).front() != '|') piped = false;
    }
    // A row of pipes may become a table; without outer pipes only the
    // delimiter row tells a table from prose that holds a `|`.
    if (!piped && (!hasDelimiter || header.find('|') == npos)) return;

    // A finished row of pipes shows as a table header while its delimiter row
    // arrives: while the delimiter row is still arriving too, not once it has
    // ended without being one. Not without tables, and not in indented code.
    const std::string_view headerLine = lines[start].text;
    const std::string_view indent = headerLine.substr(0, headerLine.find('|'));
    const std::size_t lastQuote = indent.rfind('>');
    const std::string_view lineIndent = indent.substr(lastQuote == npos ? 0 : lastQuote + 1);
    const bool indentedCode = lineIndent.size() >= 4 || lineIndent.find('\t') != npos;
    const bool headerEnded = lineCount == 1
        ? last + 1 < lines.size()
        : lineCount == 2 && last + 1 == lines.size() &&
            isPartialDelimiterRow(tableRow(lines[last]), headerCells);
    // Pipes inside code spans make the cell count uncertain until the
    // delimiter row says it.
    const bool uncertainCells = header.find('`') != npos;
    if (
        options.tables == StreamBlockMode::Progressive && !hasDelimiter && piped &&
        !terminated && headerEnded && !indentedCode && !uncertainCells &&
        header.size() > 1 && header.back() == '|' && !isEscaped(header, header.size() - 1)
    ) {
        doc.cutAtLine(start + 1);
        doc.appended.assign(indent).append("|");
        for (std::size_t i = 0; i < headerCells; i++) doc.appended.append(" --- |");
        return;
    }
    if (options.tables == StreamBlockMode::Hidden || !hasDelimiter) {
        doc.cutAtLine(start);
        return;
    }
    if (lineCount > 2) {
        const std::string_view lastRow = tableRow(lines[last]);
        if ((piped && lastRow.back() != '|') || pipeCount(lastRow) < pipeCount(header)) {
            doc.cutAtLine(last);
        }
    }
}

// ---- media: `![alt](url)` or `[label](url)` at the start of a line

// The byte ranges of code spans in a line: a backtick run opens a span when a
// later run of the same length closes it.
class CodeSpans {
public:
    explicit CodeSpans(std::string_view text) {
        struct Run {
            std::size_t start;
            std::size_t length;
        };
        std::vector<Run> runs;
        for (std::size_t i = 0; i < text.size();) {
            if (text[i] != '`') {
                i++;
                continue;
            }
            // An escaped first backtick is literal; the rest of the run counts.
            const std::size_t start = isEscaped(text, i) ? i + 1 : i;
            while (i < text.size() && text[i] == '`') i++;
            if (i > start) runs.push_back({start, i - start});
        }
        // The next run of the same length after each run, found right to left.
        std::vector<std::size_t> next(runs.size(), runs.size());
        std::unordered_map<std::size_t, std::size_t> lastOfLength;
        for (std::size_t r = runs.size(); r-- > 0;) {
            const auto found = lastOfLength.find(runs[r].length);
            if (found != lastOfLength.end()) next[r] = found->second;
            lastOfLength[runs[r].length] = r;
        }
        for (std::size_t r = 0; r < runs.size();) {
            if (next[r] == runs.size()) {
                r++;
                continue;
            }
            const Run& close = runs[next[r]];
            ranges_.emplace_back(runs[r].start, close.start + close.length);
            r = next[r] + 1;
        }
    }

    // The end of the code span that holds `index`, or npos. Call with rising
    // indexes.
    std::size_t spanEndAt(std::size_t index) {
        while (next_ < ranges_.size() && ranges_[next_].second <= index) next_++;
        return next_ < ranges_.size() && ranges_[next_].first <= index
            ? ranges_[next_].second
            : npos;
    }

private:
    std::vector<std::pair<std::size_t, std::size_t>> ranges_;
    std::size_t next_ = 0;
};

// The `]` that closes the label opened at `bracket`, or npos.
std::size_t labelEnd(std::string_view text, std::size_t bracket) {
    CodeSpans code(text);
    std::size_t depth = 0;
    for (std::size_t i = bracket; i < text.size(); i++) {
        const std::size_t codeEnd = code.spanEndAt(i);
        if (codeEnd != npos) {
            i = codeEnd - 1;
            continue;
        }
        const char ch = text[i];
        if (ch == '\\') {
            i++; // the escaped character is literal
            continue;
        }
        if (ch == '[') {
            depth++;
        } else if (ch == ']' && --depth == 0) {
            return i;
        }
    }
    return npos;
}

bool isSpaceOrTab(char ch) {
    return ch == ' ' || ch == '\t';
}

// The index just past a title that opens at `i` with `open` (`"`, `'` or
// `(`), or npos while its closing character has not arrived.
std::size_t titleEnd(std::string_view text, std::size_t i, char open) {
    const char close = open == '(' ? ')' : open;
    for (i++; i < text.size(); i++) {
        if (text[i] == '\\') {
            i++;
            continue;
        }
        if (text[i] == close) return i + 1;
    }
    return npos;
}

// The text after a destination is not a link.
constexpr std::size_t kInvalid = npos - 1;

// The `)` that closes the destination opened at `openParen`, npos while it
// is still being typed, or kInvalid.
std::size_t destinationEnd(std::string_view text, std::size_t openParen) {
    const std::size_t n = text.size();
    std::size_t i = openParen + 1;
    while (i < n && isSpaceOrTab(text[i])) i++;
    if (i < n && text[i] == '<') {
        for (i++; i < n && text[i] != '>'; i++) {
            if (text[i] == '\\') i++;
        }
        if (i >= n) return npos;
        i++;
    } else {
        std::size_t depth = 0;
        while (i < n) {
            const char ch = text[i];
            if (ch == '\\') {
                i += 2;
                continue;
            }
            if (isSpaceOrTab(ch) || ch == '\n' || (ch == ')' && depth == 0)) break;
            if (ch == '(') {
                depth++;
            } else if (ch == ')') {
                depth--;
            }
            i++;
        }
    }
    if (i >= n) return npos; // still typing the destination
    const std::size_t afterDestination = i;
    while (i < n && (isSpaceOrTab(text[i]) || text[i] == '\n')) i++;
    if (i >= n) return npos; // `[a](u ` may still get a title
    if (text[i] == ')') return i;
    // A title needs whitespace before it and one of three delimiters.
    if (i == afterDestination || (text[i] != '"' && text[i] != '\'' && text[i] != '(')) {
        return kInvalid;
    }
    i = titleEnd(text, i, text[i]);
    if (i == npos) return npos; // `[a](u "t` still typing the title
    while (i < n && (isSpaceOrTab(text[i]) || text[i] == '\n')) i++;
    if (i >= n) return npos;
    return text[i] == ')' ? i : kInvalid;
}

enum class MediaLine { None, Open, Complete };

// `[label](url)` whose `[` is at `bracket`.
MediaLine bracketSyntaxState(std::string_view text, std::size_t bracket) {
    const std::size_t close = labelEnd(text, bracket);
    if (close == npos) return MediaLine::Open; // `[label` still typing
    if (isBlankFrom(text, close + 1)) return MediaLine::Open; // `[label]`: the `(` may be next
    if (text[close + 1] != '(') return MediaLine::None; // `[INFO] done`: prose
    const std::size_t end = destinationEnd(text, close + 1);
    if (end == npos) return MediaLine::Open; // `[label](https://e` still typing
    if (end == kInvalid) return MediaLine::None; // `[label](u then prose`
    return isBlankFrom(text, end + 1) ? MediaLine::Complete : MediaLine::None;
}

MediaLine classifyMediaLine(std::string_view body) {
    if (body == "!") return MediaLine::Open;
    if (startsWith(body, "![")) return bracketSyntaxState(body, 1);
    if (!startsWith(body, "[")) return MediaLine::None;
    // Not a link: a task box or a reference definition (`[id]: url`).
    if (startsWith(body, "[ ]") || startsWith(body, "[x]") || startsWith(body, "[X]")) {
        return MediaLine::None;
    }
    const std::size_t open = body.find("](");
    const std::size_t definition = body.find("]:");
    if (definition != npos && (open == npos || definition < open)) return MediaLine::None;
    return bracketSyntaxState(body, 0);
}

// HTML blocks that may hold blank lines, so the filter leaves them whole.
bool startsRawHtmlBlock(std::string_view body) {
    if (startsWith(body, "<!--")) return true;
    static const std::string_view kTags[] = {
        "pre", "script", "style", "div", "details", "summary",
        "table", "figure", "section", "p", "center",
    };
    if (body.empty() || body[0] != '<') return false;
    for (const std::string_view tag : kTags) {
        const std::size_t after = tag.size() + 1;
        if (
            body.size() >= after &&
            std::equal(tag.begin(), tag.end(), body.begin() + 1, equalsIgnoringCase) &&
            (after == body.size() || body[after] == ' ' || body[after] == '\t' || body[after] == '>')
        ) {
            return true;
        }
    }
    return false;
}

// `terminated` says another block (an open code fence) follows the text,
// which closes a trailing paragraph the way a blank line does.
void cutPendingMedia(Document& doc, StreamBlockMode mode, bool terminated) {
    const Lines& lines = doc.lines;
    const std::size_t last = lastNonBlankLine(lines);
    if (!trailingBlockIsOpen(lines, last) || lines[last].code) return;
    const std::size_t start = blockStart(lines, last);
    const std::string_view firstBody = stripQuotes(lines[start].text).body;
    const std::size_t firstIndent = leadingSpaces(firstBody);
    if (firstIndent >= 4 || startsRawHtmlBlock(firstBody.substr(firstIndent))) {
        return; // indented code or raw HTML
    }

    const std::string_view body = stripQuotes(lines[last].text).body;
    const std::size_t indent = leadingSpaces(body);
    const MediaLine state = indent < 4 ? classifyMediaLine(body.substr(indent)) : MediaLine::None;
    if (state == MediaLine::None) return;
    if (state == MediaLine::Complete && (mode == StreamBlockMode::Progressive || terminated)) return;
    doc.text = doc.text.substr(0, lines[last].offset);
}

StreamFilterResult removePendingBlocks(
    Document doc,
    const StreamFilterOptions& options,
    bool terminated
) {
    if (options.math) cutPendingMath(doc);
    cutPendingTable(doc, options, terminated);
    cutPendingMedia(doc, options.media, terminated);
    return {std::string(doc.text).append(doc.appended), false, doc.appended.size()};
}

} // namespace

StreamFilterResult filterStreamTail(std::string_view tail, const StreamFilterOptions& options) {
    Lines lines = splitLines(tail);
    const std::size_t openFence = scanFences(lines);
    if (openFence == npos) {
        return removePendingBlocks({tail, std::move(lines), {}}, options, false);
    }

    // The fence terminates whatever paragraph precedes it, shown or not.
    // Until its opening line ends the info string may still grow, so the
    // fence waits for it and its language never changes while it shows.
    const bool openerEnded = openFence + 1 < lines.size();
    Document head{tail, std::move(lines), {}};
    const std::size_t fenceOffset = head.lines[openFence].offset;
    head.cutAtLine(openFence);
    // Before a fence the table is terminated, so nothing was added.
    std::string kept = removePendingBlocks(std::move(head), options, true).text;
    if (options.codeBlocks == StreamBlockMode::Hidden || !openerEnded) {
        return {std::move(kept), false, 0};
    }
    kept.append(tail.substr(fenceOffset));
    return {std::move(kept), true, 0};
}

} // namespace NitroMarkdown
