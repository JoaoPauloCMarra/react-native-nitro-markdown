#include "NitroMD4CParser.hpp"
#include "../nitromd/nitromd.h"

#include <stack>
#include <vector>
#include <cstring>
#include <algorithm>
#include <limits>
#include <stdexcept>
#include <utility>

namespace NitroMarkdown {

namespace {

// Hard input cap: oversized documents fail deterministically instead of
// exhausting memory. The JavaScript boundary enforces the same cap earlier.
static constexpr size_t kMaxInputBytes = 10 * 1024 * 1024;

size_t clampInputSize(size_t inputSize) {
    size_t maxSize = static_cast<size_t>(std::numeric_limits<MD_SIZE>::max());
    if (inputSize > maxSize) {
        return maxSize;
    }
    return inputSize;
}

// Safe pointer offset calculation — guards against out-of-allocation arithmetic.
// md4c callbacks receive pointers into the input buffer, so arithmetic is valid
// as long as the input string is stable. This check catches any edge cases.
static MD_OFFSET safeOffset(const char* text, const char* base, size_t baseSize) noexcept {
    if (text < base) return 0;
    ptrdiff_t diff = text - base;
    if (diff < 0 || static_cast<size_t>(diff) > baseSize) return 0;
    // Check MD_OFFSET won't truncate
    if (static_cast<size_t>(diff) > static_cast<size_t>(std::numeric_limits<MD_OFFSET>::max())) return 0;
    return static_cast<MD_OFFSET>(diff);
}

static size_t utf8SequenceLength(
    const unsigned char* bytes,
    size_t remaining
) noexcept {
    const unsigned char first = bytes[0];
    const auto isContinuation = [](unsigned char value) {
        return (value & 0xC0) == 0x80;
    };

    if (first <= 0x7F) return 1;
    if (
        first >= 0xC2 &&
        first <= 0xDF &&
        remaining >= 2 &&
        isContinuation(bytes[1])
    ) {
        return 2;
    }
    if (
        first >= 0xE0 &&
        first <= 0xEF &&
        remaining >= 3 &&
        isContinuation(bytes[1]) &&
        isContinuation(bytes[2]) &&
        !(first == 0xE0 && bytes[1] < 0xA0) &&
        !(first == 0xED && bytes[1] >= 0xA0)
    ) {
        return 3;
    }
    if (
        first >= 0xF0 &&
        first <= 0xF4 &&
        remaining >= 4 &&
        isContinuation(bytes[1]) &&
        isContinuation(bytes[2]) &&
        isContinuation(bytes[3]) &&
        !(first == 0xF0 && bytes[1] < 0x90) &&
        !(first == 0xF4 && bytes[1] >= 0x90)
    ) {
        return 4;
    }
    return 1;
}

struct Utf16OffsetRun {
    size_t byteBeg;
    size_t byteEnd;
    OFF utf16Beg;
    size_t cumulativeExtra;
};

static std::vector<Utf16OffsetRun> createUtf16OffsetRuns(
    const char* text,
    size_t size
) {
    std::vector<Utf16OffsetRun> runs;
    const auto* bytes = reinterpret_cast<const unsigned char*>(text);
    size_t byteIndex = 0;
    OFF utf16Index = 0;
    size_t cumulativeExtra = 0;

    while (byteIndex < size) {
        const size_t sequenceLength =
            utf8SequenceLength(bytes + byteIndex, size - byteIndex);
        if (sequenceLength > 1) {
            const OFF utf16Length = sequenceLength == 4 ? 2 : 1;
            cumulativeExtra += sequenceLength - utf16Length;
            runs.push_back({
                byteIndex,
                byteIndex + sequenceLength,
                utf16Index,
                cumulativeExtra,
            });
            utf16Index += utf16Length;
        } else {
            utf16Index += 1;
        }
        byteIndex += sequenceLength;
    }

    return runs;
}
} // namespace

class MD4CParser::Impl {
public:
    std::shared_ptr<MarkdownNode> root;
    std::stack<std::shared_ptr<MarkdownNode>, std::vector<std::shared_ptr<MarkdownNode>>> nodeStack;
    std::string currentText;
    const char* inputText = nullptr;
    size_t inputTextSize = 0;
    std::vector<Utf16OffsetRun> sourceOffsetRuns;
    bool sourceOffsetsTracked = false;
    bool sourceOffsetsIdentity = false;
    OFF currentTextBeg = 0;
    OFF lastTextEnd = 0;
    size_t lastTextByteEnd = 0;
    bool forceCallbackFailure = false;
    std::string callbackError;
    size_t nodeCount = 0;
    size_t childSlotCount = 0;
    size_t workCount = 0;

    std::shared_ptr<MarkdownNode> makeNode(NodeType type) {
        if (nodeCount >= kMaxAstNodes || workCount >= kMaxAstWork) {
            callbackError =
                "Markdown AST node/work budget exceeds the maximum of " +
                std::to_string(kMaxAstWork);
            throw std::runtime_error(callbackError);
        }
        nodeCount += 1;
        workCount += 1;
        return std::make_shared<MarkdownNode>(type);
    }

    void addChild(
        const std::shared_ptr<MarkdownNode>& parent,
        std::shared_ptr<MarkdownNode> child
    ) {
        if (!parent || !child) return;
        if (childSlotCount >= kMaxAstChildSlots || workCount >= kMaxAstWork) {
            callbackError =
                "Markdown AST child/work budget exceeds the maximum of " +
                std::to_string(kMaxAstWork);
            throw std::runtime_error(callbackError);
        }
        childSlotCount += 1;
        workCount += 1;
        parent->addChild(std::move(child));
    }
    
    void reset() {
        nodeCount = 0;
        childSlotCount = 0;
        workCount = 0;
        root = makeNode(NodeType::Document);
        while (!nodeStack.empty()) nodeStack.pop();
        nodeStack.push(root);
        currentText.clear();
        currentText.reserve(256);
        currentTextBeg = 0;
        lastTextEnd = 0;
        lastTextByteEnd = 0;
        forceCallbackFailure = false;
        callbackError.clear();
    }

    void setInput(const char* text, size_t size, bool trackOffsets) {
        inputText = text;
        inputTextSize = size;
        sourceOffsetRuns.clear();
        sourceOffsetsTracked = trackOffsets;
        sourceOffsetsIdentity = false;
        if (!trackOffsets) return;

        sourceOffsetRuns = createUtf16OffsetRuns(text, size);
        sourceOffsetsIdentity = sourceOffsetRuns.empty();
    }

    OFF sourceOffset(size_t byteOffset) const {
        const size_t index =
            byteOffset > inputTextSize ? inputTextSize : byteOffset;
        if (!sourceOffsetsTracked) return 0;
        if (sourceOffsetsIdentity) return static_cast<OFF>(index);
        if (sourceOffsetRuns.empty()) return static_cast<OFF>(index);

        size_t low = 0;
        size_t high = sourceOffsetRuns.size();
        while (low < high) {
            const size_t middle = low + (high - low) / 2;
            if (sourceOffsetRuns[middle].byteEnd <= index) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }

        const size_t extraBefore = low == 0
            ? 0
            : sourceOffsetRuns[low - 1].cumulativeExtra;
        if (
            low < sourceOffsetRuns.size() &&
            index >= sourceOffsetRuns[low].byteBeg
        ) {
            return sourceOffsetRuns[low].utf16Beg;
        }
        return static_cast<OFF>(index - extraBefore);
    }

    std::pair<OFF, OFF> sourceRange(const char* text, MD_SIZE size) {
        size_t byteBeg = static_cast<size_t>(
            safeOffset(text, inputText, inputTextSize)
        );
        if (byteBeg == 0 && text != inputText) {
            byteBeg = lastTextByteEnd;
        }
        size_t byteEnd = byteBeg + static_cast<size_t>(size);
        if (byteEnd > inputTextSize) {
            byteEnd = inputTextSize;
        }
        lastTextByteEnd = byteEnd;
        lastTextEnd = sourceOffset(byteEnd);
        return {sourceOffset(byteBeg), lastTextEnd};
    }
    
    void flushText() {
        if (!currentText.empty()) {
            if (!nodeStack.empty()) {
                auto textNode = makeNode(NodeType::Text);
                textNode->content = std::move(currentText);
                textNode->beg = currentTextBeg;
                textNode->end = lastTextEnd;
                addChild(nodeStack.top(), std::move(textNode));
                currentText.clear();
            } else {
#if defined(NITROMARKDOWN_DEBUG) || defined(DEBUG)
                // This indicates a parser state bug - text available but no node to attach it to
                fprintf(stderr, "[NitroMarkdown] Warning: flushText called with empty nodeStack, text dropped: %.50s\n", currentText.c_str());
#endif
                currentText.clear();
            }
        }
    }
    
    void pushNode(std::shared_ptr<MarkdownNode> node, OFF beg = 0) {
        flushText();
        if (node && !nodeStack.empty()) {
            if (nodeStack.size() >= kMaxAstDepth) {
                callbackError =
                    "Markdown AST depth exceeds the maximum of " +
                    std::to_string(kMaxAstDepth);
                throw std::runtime_error(callbackError);
            }
            node->beg = beg;
            addChild(nodeStack.top(), node);
            nodeStack.push(std::move(node));
        }
    }
    
    void popNode(OFF end = 0) {
        flushText();
        if (nodeStack.size() > 1) {
            nodeStack.top()->end = end;
            nodeStack.pop();
        }
    }
    
    std::string getAttributeText(const MD_ATTRIBUTE* attr) {
        if (!attr || attr->size == 0 || !attr->text) return "";
        if (!attr->substr_types || !attr->substr_offsets) {
            return std::string(attr->text, attr->size);
        }

        std::string result;
        result.reserve(attr->size);

        // md4c invariant: substr_types is terminated by an entry where
        // substr_offsets[i] == attr->size (the sentinel entry). Reading
        // substr_offsets[i+1] is always valid when substr_offsets[i] < attr->size.
        for (unsigned i = 0; attr->substr_offsets[i] < attr->size; i++) {
            size_t start = static_cast<size_t>(attr->substr_offsets[i]);
            size_t end = static_cast<size_t>(attr->substr_offsets[i + 1]); // safe: [i+1] always valid when [i] < size

            if (end > static_cast<size_t>(attr->size)) {
                end = static_cast<size_t>(attr->size);
            }

            // Append content for all recognised text types
            if (attr->substr_types[i] == MD_TEXT_NORMAL ||
                attr->substr_types[i] == MD_TEXT_ENTITY ||
                attr->substr_types[i] == MD_TEXT_NULLCHAR) {
                if (end > start) {
                    result.append(attr->text + start, end - start);
                }
            }
        }

        // Fallback: if all substrings had unrecognised types (should not occur
        // per the md4c spec, but guards against future spec extensions), return
        // the raw attribute text.
        if (result.empty() && attr->size > 0) {
            result.assign(attr->text, attr->size);
        }

        return result;
    }
    
    static int enterBlock(MD_BLOCKTYPE type, void* detail, MD_OFFSET off, void* userdata) noexcept {
        try {
        auto* impl = static_cast<Impl*>(userdata);
        if (impl == nullptr) return 1; // Signal error to md4c
        if (impl->forceCallbackFailure) return 7;
        off = impl->sourceOffset(off);

        switch (type) {
            case MD_BLOCK_DOC:
                break;

            case MD_BLOCK_QUOTE: {
                impl->pushNode(impl->makeNode(NodeType::Blockquote), off);
                break;
            }

            case MD_BLOCK_UL: {
                auto node = impl->makeNode(NodeType::List);
                node->ordered = false;
                impl->pushNode(node, off);
                break;
            }

            case MD_BLOCK_OL: {
                auto* d = static_cast<MD_BLOCK_OL_DETAIL*>(detail);
                auto node = impl->makeNode(NodeType::List);
                node->ordered = true;
                node->start = d->start;
                impl->pushNode(node, off);
                break;
            }

            case MD_BLOCK_LI: {
                auto* d = static_cast<MD_BLOCK_LI_DETAIL*>(detail);
                if (d->is_task) {
                    auto node = impl->makeNode(NodeType::TaskListItem);
                    node->checked = (d->task_mark == 'x' || d->task_mark == 'X');
                    impl->pushNode(node, off);
                } else {
                    impl->pushNode(impl->makeNode(NodeType::ListItem), off);
                }
                break;
            }

            case MD_BLOCK_HR: {
                impl->pushNode(impl->makeNode(NodeType::HorizontalRule), off);
                break;
            }

            case MD_BLOCK_H: {
                auto* d = static_cast<MD_BLOCK_H_DETAIL*>(detail);
                auto node = impl->makeNode(NodeType::Heading);
                node->level = d->level;
                impl->pushNode(node, off);
                break;
            }

            case MD_BLOCK_CODE: {
                auto* d = static_cast<MD_BLOCK_CODE_DETAIL*>(detail);
                if (d->fence_char == '$') {
                    impl->pushNode(impl->makeNode(NodeType::MathBlock), off);
                } else {
                    auto node = impl->makeNode(NodeType::CodeBlock);
                    if (d->lang.size > 0) {
                        node->language = impl->getAttributeText(&d->lang);
                    }
                    impl->pushNode(node, off);
                }
                break;
            }

            case MD_BLOCK_HTML: {
                impl->pushNode(impl->makeNode(NodeType::HtmlBlock), off);
                break;
            }

            case MD_BLOCK_P: {
                impl->pushNode(impl->makeNode(NodeType::Paragraph), off);
                break;
            }

            case MD_BLOCK_TABLE: {
                impl->pushNode(impl->makeNode(NodeType::Table), off);
                break;
            }

            case MD_BLOCK_THEAD: {
                impl->pushNode(impl->makeNode(NodeType::TableHead), off);
                break;
            }

            case MD_BLOCK_TBODY: {
                impl->pushNode(impl->makeNode(NodeType::TableBody), off);
                break;
            }

            case MD_BLOCK_TR: {
                impl->pushNode(impl->makeNode(NodeType::TableRow), off);
                break;
            }

            case MD_BLOCK_TH: {
                auto* d = static_cast<MD_BLOCK_TD_DETAIL*>(detail);
                auto node = impl->makeNode(NodeType::TableCell);
                node->isHeader = true;
                switch (d->align) {
                    case MD_ALIGN_LEFT: node->align = TextAlign::Left; break;
                    case MD_ALIGN_CENTER: node->align = TextAlign::Center; break;
                    case MD_ALIGN_RIGHT: node->align = TextAlign::Right; break;
                    default: node->align = TextAlign::Default; break;
                }
                impl->pushNode(node, off);
                break;
            }

            case MD_BLOCK_TD: {
                auto* d = static_cast<MD_BLOCK_TD_DETAIL*>(detail);
                auto node = impl->makeNode(NodeType::TableCell);
                node->isHeader = false;
                switch (d->align) {
                    case MD_ALIGN_LEFT: node->align = TextAlign::Left; break;
                    case MD_ALIGN_CENTER: node->align = TextAlign::Center; break;
                    case MD_ALIGN_RIGHT: node->align = TextAlign::Right; break;
                    default: node->align = TextAlign::Default; break;
                }
                impl->pushNode(node, off);
                break;
            }

            default:
                break;
        }

        return 0;
        } catch (...) {
            return 1; // Signal error to md4c
        }
    }
    
    static int leaveBlock(MD_BLOCKTYPE type, [[maybe_unused]] void* detail, MD_OFFSET off, void* userdata) noexcept {
        try {
        auto* impl = static_cast<Impl*>(userdata);
        if (impl == nullptr) return 1; // Signal error to md4c
        off = impl->sourceOffset(off);

        switch (type) {
            case MD_BLOCK_DOC:
                impl->root->end = off;
                break;
            case MD_BLOCK_HR:
                impl->popNode(off);
                break;
            default:
                impl->popNode(off);
                break;
        }

        return 0;
        } catch (...) {
            return 1; // Signal error to md4c
        }
    }
    
    static int enterSpan(MD_SPANTYPE type, void* detail, MD_OFFSET off, void* userdata) noexcept {
        try {
        auto* impl = static_cast<Impl*>(userdata);
        if (impl == nullptr) return 1; // Signal error to md4c
        off = impl->sourceOffset(off);

        switch (type) {
            case MD_SPAN_EM: {
                impl->pushNode(impl->makeNode(NodeType::Italic), off);
                break;
            }

            case MD_SPAN_STRONG: {
                impl->pushNode(impl->makeNode(NodeType::Bold), off);
                break;
            }

            case MD_SPAN_DEL: {
                impl->pushNode(impl->makeNode(NodeType::Strikethrough), off);
                break;
            }

            case MD_SPAN_A: {
                auto* d = static_cast<MD_SPAN_A_DETAIL*>(detail);
                auto node = impl->makeNode(NodeType::Link);
                if (d->href.size > 0) {
                    node->href = impl->getAttributeText(&d->href);
                }
                if (d->title.size > 0) {
                    node->title = impl->getAttributeText(&d->title);
                }
                impl->pushNode(node, off);
                break;
            }

            case MD_SPAN_IMG: {
                auto* d = static_cast<MD_SPAN_IMG_DETAIL*>(detail);
                auto node = impl->makeNode(NodeType::Image);
                if (d->src.size > 0) {
                    node->href = impl->getAttributeText(&d->src);
                }
                if (d->title.size > 0) {
                    node->title = impl->getAttributeText(&d->title);
                }
                impl->pushNode(node, off);
                break;
            }

            case MD_SPAN_CODE: {
                impl->pushNode(impl->makeNode(NodeType::CodeInline), off);
                break;
            }

            case MD_SPAN_LATEXMATH: {
                impl->pushNode(impl->makeNode(NodeType::MathInline), off);
                break;
            }

            case MD_SPAN_LATEXMATH_DISPLAY: {
                impl->pushNode(impl->makeNode(NodeType::MathBlock), off);
                break;
            }

            case MD_SPAN_U: {
                impl->pushNode(impl->makeNode(NodeType::Italic), off);
                break;
            }

            case MD_SPAN_WIKILINK:
                return 0;

            default:
                break;
        }

        return 0;
        } catch (...) {
            return 1; // Signal error to md4c
        }
    }
    
    static int leaveSpan(MD_SPANTYPE type, [[maybe_unused]] void* detail, MD_OFFSET off, void* userdata) noexcept {
        try {
        auto* impl = static_cast<Impl*>(userdata);
        if (impl == nullptr) return 1; // Signal error to md4c
        off = impl->sourceOffset(off);

        if (type == MD_SPAN_WIKILINK) return 0;

        if (!impl->nodeStack.empty()) {
            auto currentNode = impl->nodeStack.top();

            switch (type) {
                case MD_SPAN_CODE:
                    currentNode->content = impl->currentText;
                    impl->currentText.clear();
                    break;

                case MD_SPAN_IMG:
                    currentNode->alt = impl->currentText;
                    impl->currentText.clear();
                    break;

                default:
                    break;
            }
        }

        impl->popNode(off);
        return 0;
        } catch (...) {
            return 1; // Signal error to md4c
        }
    }
    
    static int text(MD_TEXTTYPE type, const MD_CHAR* text, MD_SIZE size, void* userdata) noexcept {
        try {
        auto* impl = static_cast<Impl*>(userdata);
        if (impl == nullptr) return 1; // Signal error to md4c

        if (!text || size == 0) return 0;

        switch (type) {
            case MD_TEXT_NULLCHAR: {
                const auto [beg, end] = impl->sourceRange(text, 1);
                if (impl->currentText.empty()) impl->currentTextBeg = beg;
                impl->currentText += '\0';
                impl->lastTextEnd = end;
                break;
            }

            case MD_TEXT_BR:
                impl->flushText();
                if (!impl->nodeStack.empty()) {
                    impl->addChild(impl->nodeStack.top(),
                        impl->makeNode(NodeType::LineBreak));
                }
                break;

            case MD_TEXT_SOFTBR:
                impl->flushText();
                if (!impl->nodeStack.empty()) {
                    impl->addChild(impl->nodeStack.top(),
                        impl->makeNode(NodeType::SoftBreak));
                }
                break;

            case MD_TEXT_HTML:
                impl->flushText();
                if (!impl->nodeStack.empty() && text && size > 0) {
                    const auto [beg, end] = impl->sourceRange(text, size);

                    if (impl->nodeStack.top()->type == NodeType::HtmlBlock) {
                        auto htmlBlock = impl->nodeStack.top();
                        if (htmlBlock->content.has_value()) {
                            htmlBlock->content->append(text, size);
                        } else {
                            htmlBlock->content = std::string(text, size);
                        }
                        htmlBlock->end = end;
                        impl->lastTextEnd = end;
                        break;
                    }

                    auto node = impl->makeNode(NodeType::HtmlInline);
                    node->content = std::string(text, size);
                    node->beg = beg;
                    node->end = end;
                    impl->addChild(impl->nodeStack.top(), node);
                    impl->lastTextEnd = end;
                }
                break;

            case MD_TEXT_ENTITY:
                if (text && size > 0) {
                    const auto [beg, end] = impl->sourceRange(text, size);
                    if (impl->currentText.empty()) impl->currentTextBeg = beg;
                    impl->currentText.append(text, size);
                    impl->lastTextEnd = end;
                }
                break;

            case MD_TEXT_NORMAL:
            case MD_TEXT_CODE:
            case MD_TEXT_LATEXMATH:
            default: {
                if (text && size > 0) {
                    const auto [beg, end] = impl->sourceRange(text, size);

                    if (impl->currentText.empty()) {
                        impl->currentTextBeg = beg;
                    }
                    impl->currentText.append(text, size);
                    impl->lastTextEnd = end;
                }
                break;
            }
        }

        return 0;
        } catch (...) {
            return 1; // Signal error to md4c
        }
    }
};

MD4CParser::MD4CParser() = default;

MD4CParser::~MD4CParser() = default;

std::shared_ptr<MarkdownNode> MD4CParser::parse(const std::string& markdown, const ParserOptions& options) {
    return parseWithFlags(markdown, options, 0);
}

std::shared_ptr<MarkdownNode> MD4CParser::parseWithFlags(
    const std::string& markdown,
    const ParserOptions& options,
    unsigned int extraFlags,
    bool forceCallbackFailure
) {
    Impl impl;
    impl.reset();
    size_t maxInputBytes = options.maxInputLength > 0
        ? std::min(options.maxInputLength, kMaxInputBytes)
        : kMaxInputBytes;
    if (markdown.size() > maxInputBytes) {
        throw std::runtime_error(
            "Markdown input size " + std::to_string(markdown.size()) +
            " bytes exceeds the maximum of " + std::to_string(maxInputBytes) +
            " bytes"
        );
    }
    size_t inputSize = clampInputSize(markdown.size());
    impl.setInput(markdown.c_str(), inputSize, options.sourceOffsets);
    impl.forceCallbackFailure = forceCallbackFailure;
#ifdef NITRO_MARKDOWN_TESTING
    lastParseTrackedOffsets = options.sourceOffsets;
#endif

    unsigned int flags = options.html ? 0 : MD_FLAG_NOHTML;
    
    if (options.gfm) {
        flags |= MD_FLAG_TABLES;
        flags |= MD_FLAG_STRIKETHROUGH;
        flags |= MD_FLAG_TASKLISTS;
        flags |= MD_FLAG_PERMISSIVEAUTOLINKS;
    }
    
    if (options.math) {
        flags |= MD_FLAG_LATEXMATHSPANS;
    }
    flags |= extraFlags;
    
    MD_PARSER parser = {
        0,
        flags,
        &Impl::enterBlock,
        &Impl::leaveBlock,
        &Impl::enterSpan,
        &Impl::leaveSpan,
        &Impl::text,
        nullptr,
        nullptr
    };

    int result = md_parse(markdown.c_str(),
                          static_cast<MD_SIZE>(inputSize),
                          &parser,
                          &impl);
    if (!impl.callbackError.empty()) {
        throw std::runtime_error(impl.callbackError);
    }
    if (result != 0) {
        throw std::runtime_error(
            "Markdown parsing failed with code " + std::to_string(result)
        );
    }

    impl.flushText();
    return impl.root;
}

#ifdef NITRO_MARKDOWN_TESTING
std::shared_ptr<MarkdownNode> MD4CParser::parseWithExtraFlagsForTest(
    const std::string& markdown,
    const ParserOptions& options,
    unsigned int extraFlags
) {
    return parseWithFlags(markdown, options, extraFlags);
}

std::shared_ptr<MarkdownNode> MD4CParser::parseWithForcedFailureForTest(
    const std::string& markdown,
    const ParserOptions& options
) {
    return parseWithFlags(markdown, options, 0, true);
}

int MD4CParser::enterBlockNullUserdataForTest() {
    return Impl::enterBlock(MD_BLOCK_DOC, nullptr, 0, nullptr);
}

int MD4CParser::leaveBlockNullUserdataForTest() {
    return Impl::leaveBlock(MD_BLOCK_DOC, nullptr, 0, nullptr);
}

int MD4CParser::enterSpanNullUserdataForTest() {
    return Impl::enterSpan(MD_SPAN_EM, nullptr, 0, nullptr);
}

int MD4CParser::leaveSpanNullUserdataForTest() {
    return Impl::leaveSpan(MD_SPAN_EM, nullptr, 0, nullptr);
}

int MD4CParser::textNullUserdataForTest() {
    return Impl::text(MD_TEXT_NORMAL, "x", 1, nullptr);
}

int MD4CParser::offsetBeforeBaseForTest() {
    char buffer[2] = {'a', 'b'};
    return safeOffset(buffer, buffer + 1, 1);
}

int MD4CParser::offsetPastBaseForTest() {
    char buffer[2] = {'a', 'b'};
    return safeOffset(buffer + 1, buffer, 0);
}
#endif

} // namespace NitroMarkdown
