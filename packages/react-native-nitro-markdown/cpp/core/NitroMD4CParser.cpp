#include "NitroMD4CParser.hpp"
#include "flatten.hpp"
#include "../nitromd/nitromd.h"

#include <stack>
#include <vector>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <exception>
#include <new>
#include <algorithm>
#include <limits>
#include <stdexcept>
#include <utility>

namespace NitroMarkdown {

namespace {

// Hard input cap: oversized documents fail deterministically instead of
// exhausting memory. The JavaScript boundary enforces the same cap earlier.
static constexpr size_t kMaxInputBytes = 10 * 1024 * 1024;
static constexpr size_t kMinImageAltBudgetBytes = 4096;

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

static constexpr size_t kOffsetCheckpointStride = 64;
static constexpr uint32_t kOffsetCheckpointBackShift = 28;
static constexpr uint32_t kOffsetCheckpointUtf16Mask =
    (uint32_t{1} << kOffsetCheckpointBackShift) - 1;

static_assert(
    kMaxInputBytes <= kOffsetCheckpointUtf16Mask,
    "UTF-16 offset checkpoints store offsets in 28 bits"
);

static std::vector<uint32_t> createUtf16OffsetCheckpoints(
    const char* text,
    size_t size
) {
    const auto* bytes = reinterpret_cast<const unsigned char*>(text);
    size_t firstHighByte = 0;
    while (firstHighByte < size && bytes[firstHighByte] < 0x80) firstHighByte++;
    if (firstHighByte == size) return {};

    std::vector<uint32_t> checkpoints;
    checkpoints.reserve(size / kOffsetCheckpointStride + 1);
    size_t byteIndex = 0;
    size_t utf16Index = 0;
    size_t nextCheckpoint = 0;
    while (byteIndex < size) {
        const size_t sequenceLength =
            utf8SequenceLength(bytes + byteIndex, size - byteIndex);
        const size_t sequenceEnd = byteIndex + sequenceLength;
        while (nextCheckpoint < sequenceEnd) {
            checkpoints.push_back(
                static_cast<uint32_t>(utf16Index) |
                (static_cast<uint32_t>(nextCheckpoint - byteIndex)
                    << kOffsetCheckpointBackShift)
            );
            nextCheckpoint += kOffsetCheckpointStride;
        }
        utf16Index += sequenceLength == 4 ? 2 : 1;
        byteIndex = sequenceEnd;
    }
    if (utf16Index == size) return {};
    return checkpoints;
}

[[noreturn]] static void throwParseFailure(int result, const char* parserLog) {
    if (std::strstr(parserLog, "alloc() failed") != nullptr) {
        throw MarkdownOutOfMemory();
    }
    std::string message = "Markdown parsing failed with code " + std::to_string(result);
    if (parserLog[0] != '\0') {
        message += ": ";
        message += parserLog;
    }
    throw std::runtime_error(message);
}

static bool isMappedBlock(MD_BLOCKTYPE type) noexcept {
    switch (type) {
        case MD_BLOCK_QUOTE:
        case MD_BLOCK_UL:
        case MD_BLOCK_OL:
        case MD_BLOCK_LI:
        case MD_BLOCK_HR:
        case MD_BLOCK_H:
        case MD_BLOCK_CODE:
        case MD_BLOCK_HTML:
        case MD_BLOCK_FOOTNOTE_DEF:
        case MD_BLOCK_P:
        case MD_BLOCK_TABLE:
        case MD_BLOCK_THEAD:
        case MD_BLOCK_TBODY:
        case MD_BLOCK_TR:
        case MD_BLOCK_TH:
        case MD_BLOCK_TD:
            return true;
        default:
            return false;
    }
}

static bool isMappedSpan(MD_SPANTYPE type) noexcept {
    switch (type) {
        case MD_SPAN_EM:
        case MD_SPAN_STRONG:
        case MD_SPAN_DEL:
        case MD_SPAN_A:
        case MD_SPAN_IMG:
        case MD_SPAN_CODE:
        case MD_SPAN_LATEXMATH:
        case MD_SPAN_LATEXMATH_DISPLAY:
        case MD_SPAN_U:
            return true;
        default:
            return false;
    }
}
} // namespace

class MD4CParser::Impl {
public:
    std::shared_ptr<MarkdownNode> root;
    std::stack<std::shared_ptr<MarkdownNode>, std::vector<std::shared_ptr<MarkdownNode>>> nodeStack;
    std::string currentText;
    const char* inputText = nullptr;
    size_t inputTextSize = 0;
    std::vector<uint32_t> sourceOffsetCheckpoints;
    mutable size_t sourceOffsetCursorByte = 0;
    mutable size_t sourceOffsetCursorUtf16 = 0;
    bool sourceOffsetsTracked = false;
    bool sourceOffsetsIdentity = false;
    OFF currentTextBeg = 0;
    OFF lastTextEnd = 0;
    size_t lastTextByteEnd = 0;
    size_t lastSpanByteEnd = 0;
    size_t lastEnterByteOffset = 0;
    size_t nextBreakSearchByteOffset = 0;
    size_t imageAltBytes = 0;
    size_t parseBaseOffset = 0;
    bool forceCallbackFailure = false;
    std::string callbackError;
    std::exception_ptr callbackException;
    char parserLog[128] = {0};
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
        lastSpanByteEnd = 0;
        lastEnterByteOffset = 0;
        nextBreakSearchByteOffset = 0;
        imageAltBytes = 0;
        parseBaseOffset = 0;
        forceCallbackFailure = false;
        callbackError.clear();
        callbackException = nullptr;
        parserLog[0] = '\0';
    }

    void captureCallbackException() noexcept {
        if (!callbackException) callbackException = std::current_exception();
    }

    static void recordParserLog(const char* message, void* userdata) noexcept {
        auto* impl = static_cast<Impl*>(userdata);
        if (impl == nullptr || message == nullptr) return;
        std::snprintf(impl->parserLog, sizeof(impl->parserLog), "%s", message);
    }

    void setInput(const char* text, size_t size, bool trackOffsets) {
        inputText = text;
        inputTextSize = size;
        nextBreakSearchByteOffset = 0;
        sourceOffsetCheckpoints.clear();
        sourceOffsetCursorByte = 0;
        sourceOffsetCursorUtf16 = 0;
        sourceOffsetsTracked = trackOffsets;
        sourceOffsetsIdentity = false;
        if (!trackOffsets) return;

        sourceOffsetCheckpoints = createUtf16OffsetCheckpoints(text, size);
        sourceOffsetsIdentity = sourceOffsetCheckpoints.empty();
    }

    OFF sourceOffset(size_t byteOffset) const {
        const size_t index =
            byteOffset > inputTextSize ? inputTextSize : byteOffset;
        if (!sourceOffsetsTracked) return 0;
        if (sourceOffsetsIdentity) return static_cast<OFF>(index);

        size_t byteIndex = sourceOffsetCursorByte;
        size_t utf16Index = sourceOffsetCursorUtf16;
        if (index < byteIndex || index - byteIndex >= kOffsetCheckpointStride) {
            const size_t checkpoint = std::min(
                index / kOffsetCheckpointStride,
                sourceOffsetCheckpoints.size() - 1
            );
            const uint32_t packed = sourceOffsetCheckpoints[checkpoint];
            byteIndex = checkpoint * kOffsetCheckpointStride -
                (packed >> kOffsetCheckpointBackShift);
            utf16Index = packed & kOffsetCheckpointUtf16Mask;
        }

        const auto* bytes = reinterpret_cast<const unsigned char*>(inputText);
        while (byteIndex < inputTextSize) {
            const size_t sequenceLength =
                utf8SequenceLength(bytes + byteIndex, inputTextSize - byteIndex);
            if (index < byteIndex + sequenceLength) break;
            byteIndex += sequenceLength;
            utf16Index += sequenceLength == 4 ? 2 : 1;
        }
        sourceOffsetCursorByte = byteIndex;
        sourceOffsetCursorUtf16 = utf16Index;
        return static_cast<OFF>(utf16Index);
    }

    void noteEnterOffset(MD_OFFSET byteOffset) {
        lastEnterByteOffset = std::max(
            lastEnterByteOffset,
            std::min(static_cast<size_t>(byteOffset), inputTextSize)
        );
    }

    std::pair<OFF, OFF> sourceRange(const char* text, MD_SIZE size) {
        size_t byteBeg = static_cast<size_t>(
            safeOffset(text, inputText, inputTextSize)
        );
        if (byteBeg == 0 && text != inputText) {
            byteBeg = std::max(lastTextByteEnd, lastEnterByteOffset);
        }
        size_t byteEnd = byteBeg + static_cast<size_t>(size);
        if (byteEnd > inputTextSize) {
            byteEnd = inputTextSize;
        }
        lastTextByteEnd = byteEnd;
        lastTextEnd = sourceOffset(byteEnd);
        return {sourceOffset(byteBeg), lastTextEnd};
    }

    std::pair<OFF, OFF> sourceBreakRange(bool hardBreak) {
        if (!sourceOffsetsTracked) return {0, 0};

        const size_t searchBeg = std::min(
            std::max({
                nextBreakSearchByteOffset,
                lastTextByteEnd,
                lastSpanByteEnd,
                lastEnterByteOffset,
            }),
            inputTextSize
        );
        size_t lineEndingBeg = searchBeg;
        while (
            lineEndingBeg < inputTextSize &&
            inputText[lineEndingBeg] != '\n' &&
            inputText[lineEndingBeg] != '\r'
        ) {
            lineEndingBeg += 1;
        }
        if (lineEndingBeg == inputTextSize) return {0, 0};

        size_t byteEnd = lineEndingBeg + 1;
        if (
            inputText[lineEndingBeg] == '\r' &&
            byteEnd < inputTextSize &&
            inputText[byteEnd] == '\n'
        ) {
            byteEnd += 1;
        }

        size_t byteBeg = lineEndingBeg;
        if (hardBreak) {
            size_t markerEnd = lineEndingBeg;
            while (markerEnd > searchBeg && inputText[markerEnd - 1] == ' ') {
                markerEnd -= 1;
            }
            if (lineEndingBeg - markerEnd >= 2) {
                byteBeg = markerEnd;
            } else if (
                markerEnd > searchBeg &&
                inputText[markerEnd - 1] == '\\'
            ) {
                byteBeg = markerEnd - 1;
            }
        }

        nextBreakSearchByteOffset = byteEnd;
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
            const auto& parent = nodeStack.top();
            OFF floor = parent->beg;
            if (!parent->children.empty() && parent->children.back()) {
                floor = std::max(floor, parent->children.back()->end);
            }
            node->beg = std::max(beg, floor);
            addChild(parent, node);
            nodeStack.push(std::move(node));
        }
    }
    
    static OFF containedEnd(const MarkdownNode& node, OFF end) {
        OFF result = std::max(end, node.beg);
        if (!node.children.empty() && node.children.back()) {
            result = std::max(result, node.children.back()->end);
        }
        return result;
    }

    void popNode(OFF end = 0) {
        flushText();
        if (nodeStack.size() > 1) {
            nodeStack.top()->end = containedEnd(*nodeStack.top(), end);
            nodeStack.pop();
        }
    }

    std::string flattenImageAlt(const MarkdownNode& image) {
        std::string alt;
        try {
            for (const auto& child : image.children) {
                alt += flattenNodeText(child);
            }
        } catch (const std::exception& error) {
            callbackError = error.what();
            throw;
        }
        alt += currentText;
        const size_t maxImageAltBytes =
            std::max(inputTextSize, kMinImageAltBudgetBytes) * 2;
        if (alt.size() > maxImageAltBytes - std::min(imageAltBytes, maxImageAltBytes)) {
            callbackError =
                "Markdown flattened text exceeds the maximum of " +
                std::to_string(maxImageAltBytes) + " bytes";
            throw std::runtime_error(callbackError);
        }
        imageAltBytes += alt.size();
        return alt;
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
        off += static_cast<MD_OFFSET>(impl->parseBaseOffset);
        impl->noteEnterOffset(off);
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

            case MD_BLOCK_FOOTNOTE_DEF: {
                impl->pushNode(impl->makeNode(NodeType::Paragraph), off);
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
            static_cast<Impl*>(userdata)->captureCallbackException();
            return 1; // Signal error to md4c
        }
    }
    
    static int leaveBlock(MD_BLOCKTYPE type, [[maybe_unused]] void* detail, MD_OFFSET off, void* userdata) noexcept {
        try {
        auto* impl = static_cast<Impl*>(userdata);
        if (impl == nullptr) return 1; // Signal error to md4c
        off += static_cast<MD_OFFSET>(impl->parseBaseOffset);
        off = impl->sourceOffset(off);

        switch (type) {
            case MD_BLOCK_DOC:
                impl->flushText();
                impl->root->end = containedEnd(*impl->root, off);
                break;
            default:
                if (isMappedBlock(type)) impl->popNode(off);
                break;
        }

        return 0;
        } catch (...) {
            static_cast<Impl*>(userdata)->captureCallbackException();
            return 1; // Signal error to md4c
        }
    }
    
    static int enterSpan(MD_SPANTYPE type, void* detail, MD_OFFSET off, void* userdata) noexcept {
        try {
        auto* impl = static_cast<Impl*>(userdata);
        if (impl == nullptr) return 1; // Signal error to md4c
        off += static_cast<MD_OFFSET>(impl->parseBaseOffset);
        impl->noteEnterOffset(off);
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
            static_cast<Impl*>(userdata)->captureCallbackException();
            return 1; // Signal error to md4c
        }
    }
    
    static int leaveSpan(MD_SPANTYPE type, [[maybe_unused]] void* detail, MD_OFFSET off, void* userdata) noexcept {
        try {
        auto* impl = static_cast<Impl*>(userdata);
        if (impl == nullptr) return 1; // Signal error to md4c
        off += static_cast<MD_OFFSET>(impl->parseBaseOffset);
        impl->lastSpanByteEnd = std::max(
            impl->lastSpanByteEnd,
            std::min(static_cast<size_t>(off), impl->inputTextSize)
        );
        off = impl->sourceOffset(off);

        if (!isMappedSpan(type)) return 0;

        if (!impl->nodeStack.empty()) {
            auto currentNode = impl->nodeStack.top();

            switch (type) {
                case MD_SPAN_CODE:
                    currentNode->content = impl->currentText;
                    impl->currentText.clear();
                    break;

                case MD_SPAN_IMG:
                    currentNode->alt = impl->flattenImageAlt(*currentNode);
                    impl->currentText.clear();
                    break;

                default:
                    break;
            }
        }

        impl->popNode(off);
        return 0;
        } catch (...) {
            static_cast<Impl*>(userdata)->captureCallbackException();
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
                {
                    const auto [beg, end] = impl->sourceBreakRange(true);
                    if (!impl->nodeStack.empty()) {
                        auto node = impl->makeNode(NodeType::LineBreak);
                        node->beg = beg;
                        node->end = end;
                        impl->addChild(impl->nodeStack.top(), std::move(node));
                    }
                }
                break;

            case MD_TEXT_SOFTBR:
                impl->flushText();
                {
                    const auto [beg, end] = impl->sourceBreakRange(false);
                    if (!impl->nodeStack.empty()) {
                        auto node = impl->makeNode(NodeType::SoftBreak);
                        node->beg = beg;
                        node->end = end;
                        impl->addChild(impl->nodeStack.top(), std::move(node));
                    }
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
            static_cast<Impl*>(userdata)->captureCallbackException();
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
) try {
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
    const size_t bomBytes =
        inputSize >= 3 && markdown.compare(0, 3, "\xEF\xBB\xBF") == 0 ? 3 : 0;
    impl.parseBaseOffset = bomBytes;
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
        &Impl::recordParserLog,
        nullptr
    };

    int result = md_parse(markdown.c_str() + bomBytes,
                          static_cast<MD_SIZE>(inputSize - bomBytes),
                          &parser,
                          &impl);
    if (impl.callbackException) {
        std::rethrow_exception(impl.callbackException);
    }
    if (result != 0) {
        throwParseFailure(result, impl.parserLog);
    }

    impl.flushText();
    return impl.root;
} catch (const std::bad_alloc&) {
    throw MarkdownOutOfMemory();
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

std::vector<OFF> MD4CParser::sourceOffsetsForTest(const std::string& text) {
    Impl impl;
    impl.setInput(text.data(), text.size(), true);
    std::vector<OFF> offsets;
    offsets.reserve(text.size() + 2);
    for (size_t index = 0; index <= text.size() + 1; index++) {
        offsets.push_back(impl.sourceOffset(index));
    }
    return offsets;
}

std::vector<OFF> MD4CParser::sourceOffsetsForTest(
    const std::string& text,
    const std::vector<size_t>& byteOffsets
) {
    Impl impl;
    impl.setInput(text.data(), text.size(), true);
    std::vector<OFF> offsets;
    offsets.reserve(byteOffsets.size());
    for (const size_t byteOffset : byteOffsets) {
        offsets.push_back(impl.sourceOffset(byteOffset));
    }
    return offsets;
}

std::string MD4CParser::parseFailureMessageForTest(int result, const char* parserLog) {
    try {
        throwParseFailure(result, parserLog);
    } catch (const std::exception& error) {
        return error.what();
    }
}

size_t MD4CParser::sourceOffsetMapBytesForTest(const std::string& text) {
    return createUtf16OffsetCheckpoints(text.data(), text.size()).capacity() *
        sizeof(uint32_t);
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
