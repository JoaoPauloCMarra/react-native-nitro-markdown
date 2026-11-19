#pragma once

#include "MarkdownTypes.hpp"
#include "StreamFilter.hpp"
#include <cstddef>
#include <string>
#include <string_view>

namespace NitroMarkdown {

struct StreamViewOptions {
    StreamBlockMode tables = StreamBlockMode::Progressive;
    StreamBlockMode codeBlocks = StreamBlockMode::Progressive;
    StreamBlockMode media = StreamBlockMode::Progressive;
    // Close or hold back inline syntax that is still being typed at the end
    // (`**bold`, `[label](http://…`, `` `code ``). Has no effect when the
    // parser reads HTML: the repair rules treat `<` inside a line as text.
    bool repair = true;
};

// What a stream shows before it has ended: the finished blocks as written,
// then the unfinished tail without the blocks that have not finished
// arriving and with its half-written inline syntax repaired.
struct StreamViewText {
    // The text to parse. Set only when `modified` is true; otherwise the
    // source itself is what shows.
    std::string text;
    bool modified = false;
    // The unfinished tail holds no Markdown syntax character, so appending
    // plain text cannot change what is hidden.
    bool plainTail = false;
    // The shown text ends inside a fence whose closer has not arrived.
    bool openCodeFence = false;
};

StreamViewText streamViewText(
    std::string_view source,
    const ParserOptions& options,
    const StreamViewOptions& view
);

// A view can hold text that is not in the source (the delimiter row of a
// table whose own is still arriving). Ranges that end past the source are
// cut back to its length.
void clampOffsetsToSource(MarkdownNode& root, std::size_t sourceUtf16Length);

// Returns `{"modified":bool,"plainTail":bool,"openCodeFence":bool,"document":{...}}`.
// `document` is the AST of the shown text. Limit errors are the ones a parse
// of `source` throws.
std::string parseStreamViewToJson(
    const std::string& source,
    std::size_t sourceUtf16Length,
    const ParserOptions& options,
    const StreamViewOptions& view
);

} // namespace NitroMarkdown
