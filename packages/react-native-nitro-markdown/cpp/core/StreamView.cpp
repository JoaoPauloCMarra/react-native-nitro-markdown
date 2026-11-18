#include "StreamView.hpp"

#include "MarkdownJson.hpp"
#include "NitroMD4CParser.hpp"
#include "StreamBoundary.hpp"
#include <algorithm>
#include <memory>

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
