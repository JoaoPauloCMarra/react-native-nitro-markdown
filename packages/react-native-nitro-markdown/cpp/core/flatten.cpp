#include "flatten.hpp"

#include <cstdint>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace NitroMarkdown {

namespace {

void appendBounded(std::string& target, const std::string& value) {
    if (value.size() > kMaxOutputBytes - target.size()) {
        throwFlattenedTextSizeExceeded();
    }
    target += value;
}

bool isJsWhitespace(uint32_t cp) {
    return (cp >= 0x09 && cp <= 0x0D) || cp == 0x20 || cp == 0xA0 || cp == 0x1680 ||
           (cp >= 0x2000 && cp <= 0x200A) || cp == 0x2028 || cp == 0x2029 || cp == 0x202F ||
           cp == 0x205F || cp == 0x3000 || cp == 0xFEFF;
}

// Decodes the code point starting at index; returns its byte length (1 for invalid bytes).
size_t decodeCodePoint(const std::string& input, size_t index, uint32_t& cp) {
    const auto lead = static_cast<unsigned char>(input[index]);
    size_t length = lead < 0x80 ? 1 : (lead >> 5) == 0x6 ? 2 : (lead >> 4) == 0xE ? 3 : (lead >> 3) == 0x1E ? 4 : 1;
    if (length == 1 || index + length > input.size()) {
        cp = lead;
        return 1;
    }
    cp = lead & (0xFF >> (length + 1));
    for (size_t i = 1; i < length; i++) {
        const auto next = static_cast<unsigned char>(input[index + i]);
        if ((next & 0xC0) != 0x80) {
            cp = lead;
            return 1;
        }
        cp = (cp << 6) | (next & 0x3F);
    }
    return length;
}

std::string trimCopy(const std::string& input) {
    size_t start = 0;
    while (start < input.size()) {
        uint32_t cp = 0;
        const size_t length = decodeCodePoint(input, start, cp);
        if (!isJsWhitespace(cp)) break;
        start += length;
    }

    size_t end = input.size();
    while (end > start) {
        size_t begin = end - 1;
        while (begin > start && end - begin < 4 &&
               (static_cast<unsigned char>(input[begin]) & 0xC0) == 0x80) {
            begin--;
        }
        uint32_t cp = 0;
        size_t length = decodeCodePoint(input, begin, cp);
        if (begin + length != end) {
            begin = end - 1;
            cp = static_cast<unsigned char>(input[begin]);
        }
        if (!isJsWhitespace(cp)) break;
        end = begin;
    }

    return input.substr(start, end - start);
}

} // namespace

std::string flattenNodeText(const std::shared_ptr<MarkdownNode>& node) {
    struct Frame {
        std::shared_ptr<MarkdownNode> node;
        size_t nextChild = 0;
        std::string childrenText;
    };

    std::vector<Frame> frames;
    frames.push_back({node, 0, {}});
    size_t nodeCount = 0;
    while (!frames.empty()) {
        auto& frame = frames.back();
        if (frame.node && frame.nextChild < frame.node->children.size()) {
            if (frames.size() >= kMaxAstDepth) {
                throw std::runtime_error(
                    "Markdown AST depth exceeds the maximum of " +
                    std::to_string(kMaxAstDepth)
                );
            }
            frames.push_back({frame.node->children[frame.nextChild++], 0, {}});
            continue;
        }

        if (++nodeCount > kMaxAstNodes) {
            throw std::runtime_error(astNodeBudgetExceededMessage());
        }

        std::string value;
        if (!frame.node) {
            value = "";
        } else {
            const auto& current = frame.node;
            switch (current->type) {
                case NodeType::Text:
                case NodeType::CodeInline:
                case NodeType::HtmlInline:
                    value = current->content.value_or("");
                    break;
                case NodeType::MathInline:
                    value = current->content.value_or(frame.childrenText);
                    break;
                case NodeType::LineBreak:
                    value = "\n";
                    break;
                case NodeType::SoftBreak:
                    value = " ";
                    break;
                case NodeType::HorizontalRule:
                    value = "---\n\n";
                    break;
                case NodeType::Image:
                    value = current->alt.has_value() && !current->alt->empty()
                        ? *current->alt
                        : current->title.value_or("");
                    break;
                case NodeType::Paragraph:
                case NodeType::Heading:
                case NodeType::Blockquote:
                    value = trimCopy(frame.childrenText) + "\n\n";
                    break;
                case NodeType::CodeBlock:
                case NodeType::MathBlock:
                case NodeType::HtmlBlock:
                    value = trimCopy(current->content.value_or(frame.childrenText)) + "\n\n";
                    break;
                case NodeType::ListItem:
                case NodeType::TaskListItem:
                    value = trimCopy(frame.childrenText) + "\n";
                    break;
                case NodeType::List:
                case NodeType::TableRow:
                    value = frame.childrenText + "\n";
                    break;
                case NodeType::TableCell:
                    value = frame.childrenText + " | ";
                    break;
                default:
                    value = frame.childrenText;
                    break;
            }
        }
        if (value.size() > kMaxOutputBytes) {
            throwFlattenedTextSizeExceeded();
        }
        frames.pop_back();
        if (!frames.empty()) appendBounded(frames.back().childrenText, value);
        else return value;
    }
    return "";
}

} // namespace NitroMarkdown
