#include "StreamView.hpp"

#include "MarkdownJson.hpp"
#include "NitroMD4CParser.hpp"
#include "StreamBoundary.hpp"
#include "StreamText.hpp"
#include "../repair/MarkdownRepair.hpp"
#include <algorithm>
#include <memory>
#include <utility>

namespace NitroMarkdown {

namespace {

// The characters `MarkdownStream` treats as a structural append
// (PLAIN_TEXT_APPEND_PATTERN in src/utils/incremental-ast.ts), without the
// line breaks.
bool isPlainTail(std::string_view tail) {
    return tail.find_first_of("`*_~[]#!<>()|$") == std::string_view::npos;
}

void clampOffsets(MarkdownNode& node, OFF limit) {
    node.beg = std::min(node.beg, limit);
    node.end = std::min(node.end, limit);
    for (const auto& child : node.children) {
        if (child) clampOffsets(*child, limit);
    }
}

NitroMarkdownRepair::RepairOptions repairOptionsFor(const ParserOptions& options) {
    NitroMarkdownRepair::RepairOptions repair;
    repair.linkMode = NitroMarkdownRepair::LinkMode::TextOnly;
    repair.withholdIncomplete = true;
    repair.inlineMath = options.math;
    repair.displayMath = options.math;
    repair.withholdMath = options.math;
    repair.strikethrough = options.gfm;
    // A lone `-` or `=` line under text is held back as a marker line, so
    // the zero-width space this handler would add is never needed.
    repair.setextHeadings = false;
    // `~` is literal text or strikethrough here, and this parser has none of
    // the spoiler, highlight, superscript or subscript extensions.
    repair.singleTilde = false;
    repair.spoilers = false;
    // `- > 5` is a quote inside a list item in the finished document, so it
    // stays one while it streams.
    repair.comparisonOperators = false;
    // Repair runs only when the parser does not read HTML, and then a tag is
    // literal text.
    repair.htmlTags = false;
    return repair;
}

// Two things the repair does to text without open syntax are not kept:
//
//   * it drops one trailing space;
//   * it holds back a `==` or `||` run at the end as the opener of a
//     highlight or spoiler span, which this parser does not have. A line
//     that is only `==` (a setext underline that has just started) or only
//     pipes (a table row that has just started) stays held back.
//
// The first and the `==` case keep an append of plain text a plain append:
// `MarkdownStream` adds such text in JS without asking for a new view.
bool repairOnlyCutText(std::string_view text, std::string_view repaired) {
    if (repaired.size() >= text.size() || text.compare(0, repaired.size(), repaired) != 0) return false;
    const std::string_view cut = text.substr(repaired.size());
    if (cut == " ") return true;
    const std::string_view run = StreamText::trim(cut);
    if (run.size() < 2) return false;
    const bool wholeLine = repaired.empty() || repaired.back() == '\n' || repaired.back() == '\r';
    if (run.find_first_not_of('|') == std::string_view::npos) return !wholeLine;
    if (run.find_first_not_of('=') == std::string_view::npos) return !(wholeLine && run.size() == 2);
    return false;
}

void repairInline(std::string& text, const NitroMarkdownRepair::RepairOptions& options) {
    std::string repaired = text;
    NitroMarkdownRepair::repairInlineMarkdownInPlace(repaired, options);
    if (!repairOnlyCutText(text, repaired)) text = std::move(repaired);
}

// Where the last line of `text` starts, when `text` ends with a line ending.
std::size_t lastLineStart(std::string_view text) {
    std::size_t end = text.size();
    if (end > 0 && text[end - 1] == '\n') end--;
    if (end > 0 && text[end - 1] == '\r') end--;
    const std::size_t lineBreak = text.substr(0, end).find_last_of("\r\n");
    return lineBreak == std::string_view::npos ? 0 : lineBreak + 1;
}

// Repair sees the text as it arrived. A delimiter row the filter added stays
// only while repair leaves the header row above it alone: closing a `**`
// there would turn the table back into a paragraph, so the header row is
// held back then.
void repairShownTail(StreamFilterResult& shown, const ParserOptions& options) {
    const NitroMarkdownRepair::RepairOptions repairOptions = repairOptionsFor(options);
    const std::string added = shown.text.substr(shown.text.size() - shown.addedBytes);
    const std::string arrived = shown.text.substr(0, shown.text.size() - shown.addedBytes);
    std::string repaired = arrived;
    repairInline(repaired, repairOptions);
    if (!added.empty()) {
        if (repaired == arrived) {
            repaired.append(added);
        } else {
            repaired = arrived.substr(0, lastLineStart(arrived));
            repairInline(repaired, repairOptions);
        }
    }
    shown.text = std::move(repaired);
}

std::string wrapView(const StreamViewText& view, const std::string& document) {
    std::string json;
    json.reserve(document.size() + 80);
    json.append("{\"modified\":").append(view.modified ? "true" : "false");
    json.append(",\"plainTail\":").append(view.plainTail ? "true" : "false");
    json.append(",\"openCodeFence\":").append(view.openCodeFence ? "true" : "false");
    json.append(",\"document\":").append(document).push_back('}');
    return json;
}

} // namespace

StreamViewText streamViewText(
    std::string_view source,
    const ParserOptions& options,
    const StreamViewOptions& view
) {
    const std::size_t finished =
        finishedBlocksEnd(source, StreamBoundaryOptions{options.math, options.html});
    const std::string_view tail = source.substr(finished);
    StreamFilterResult shown = filterStreamTail(
        tail,
        StreamFilterOptions{view.tables, view.codeBlocks, view.media, options.gfm, options.math}
    );
    if (view.repair && !options.html) repairShownTail(shown, options);

    StreamViewText result;
    result.plainTail = isPlainTail(tail);
    result.openCodeFence = shown.endsInsideOpenCodeFence;
    // A view that an added table row pushed over the hard input cap shows
    // the source instead.
    if (shown.text == tail || finished + shown.text.size() > kMaxInputBytes) return result;

    result.modified = true;
    result.text.reserve(finished + shown.text.size());
    result.text.append(source.substr(0, finished)).append(shown.text);
    return result;
}

void clampOffsetsToSource(MarkdownNode& root, std::size_t sourceUtf16Length) {
    clampOffsets(root, static_cast<OFF>(std::min<std::size_t>(sourceUtf16Length, kMaxInputBytes)));
}

std::string parseStreamViewToJson(
    const std::string& source,
    std::size_t sourceUtf16Length,
    const ParserOptions& options,
    const StreamViewOptions& view
) try {
    // A source over its limit takes the plain parse, which throws the error
    // a caller of parseWithOptions gets.
    const std::size_t sourceLimit = options.maxInputLength > 0
        ? std::min(options.maxInputLength, kMaxInputBytes)
        : kMaxInputBytes;
    if (source.size() > sourceLimit) {
        return wrapView(StreamViewText{}, parseMarkdownToJson(source, options));
    }

    const StreamViewText shown = streamViewText(source, options, view);
    if (!shown.modified) return wrapView(shown, parseMarkdownToJson(source, options));

    ParserOptions viewOptions = options;
    viewOptions.maxInputLength = 0;
    MD4CParser parser;
    const std::shared_ptr<MarkdownNode> root = parser.parse(shown.text, viewOptions);
    if (root && options.sourceOffsets) clampOffsetsToSource(*root, sourceUtf16Length);
    return wrapView(
        shown,
        serializeMarkdownJson(root, shown.text.size(), options.sourceOffsets)
    );
} catch (const std::bad_alloc&) {
    throw MarkdownOutOfMemory();
}

} // namespace NitroMarkdown
