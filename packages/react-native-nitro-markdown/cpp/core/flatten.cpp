#include "flatten.hpp"

#include <cctype>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace NitroMarkdown {

namespace {

static constexpr size_t kMaxFlattenedTextSize = 64 * 1024 * 1024;

void appendBounded(std::string& target, const std::string& value) {
    if (value.size() > kMaxFlattenedTextSize - target.size()) {
        throw std::runtime_error(
            "Markdown flattened text exceeds the maximum of " +
            std::to_string(kMaxFlattenedTextSize) + " bytes"
        );
    }
    target += value;
}

std::string trimCopy(const std::string& input) {
    size_t start = 0;
    while (start < input.size() && std::isspace(static_cast<unsigned char>(input[start]))) {
        start++;
    }

    size_t end = input.size();
    while (end > start && std::isspace(static_cast<unsigned char>(input[end - 1]))) {
        end--;
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
    size_t childSlotCount = 0;
    size_t workCount = 0;
    while (!frames.empty()) {
        auto& frame = frames.back();
        if (frame.node && frame.nextChild < frame.node->children.size()) {
            if (++childSlotCount > kMaxAstChildSlots ||
                ++workCount > kMaxAstWork) {
                throw std::runtime_error(
                    "Markdown AST child/work budget exceeds the maximum of " +
                    std::to_string(kMaxAstWork)
                );
            }
            if (frames.size() >= kMaxAstDepth) {
                throw std::runtime_error(
                    "Markdown AST depth exceeds the maximum of " +
                    std::to_string(kMaxAstDepth)
                );
            }
            frames.push_back({frame.node->children[frame.nextChild++], 0, {}});
            continue;
        }

        if (++nodeCount > kMaxAstNodes || ++workCount > kMaxAstWork) {
            throw std::runtime_error(
                "Markdown AST node/work budget exceeds the maximum of " +
                std::to_string(kMaxAstWork)
            );
        }

        std::string value;
        if (!frame.node) {
            value = "";
        } else {
            const auto& current = frame.node;
            switch (current->type) {
                case NodeType::Text:
                case NodeType::CodeInline:
                case NodeType::MathInline:
                case NodeType::HtmlInline:
                    value = current->content.value_or("");
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
                    value = current->alt.value_or(current->title.value_or(""));
                    break;
                case NodeType::Paragraph:
                case NodeType::Heading:
                case NodeType::Blockquote:
                case NodeType::CodeBlock:
                case NodeType::MathBlock:
                case NodeType::HtmlBlock:
                    value = trimCopy(frame.childrenText) + "\n\n";
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
        if (value.size() > kMaxFlattenedTextSize) {
            throw std::runtime_error(
                "Markdown flattened text exceeds the maximum of " +
                std::to_string(kMaxFlattenedTextSize) + " bytes"
            );
        }
        frames.pop_back();
        if (!frames.empty()) appendBounded(frames.back().childrenText, value);
        else return value;
    }
    return "";
}

} // namespace NitroMarkdown
