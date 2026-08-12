#include "flatten.hpp"

#include <cctype>
#include <string>

namespace NitroMarkdown {

namespace {

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
    if (!node) return "";

    switch (node->type) {
        case NodeType::Text:
        case NodeType::CodeInline:
        case NodeType::MathInline:
        case NodeType::HtmlInline:
            return node->content.value_or("");
        case NodeType::LineBreak:
            return "\n";
        case NodeType::SoftBreak:
            return " ";
        case NodeType::HorizontalRule:
            return "---\n\n";
        case NodeType::Image:
            return node->alt.value_or(node->title.value_or(""));
        default:
            break;
    }

    std::string childrenText;
    childrenText.reserve(128);
    for (const auto& child : node->children) {
        childrenText += flattenNodeText(child);
    }

    switch (node->type) {
        case NodeType::Paragraph:
        case NodeType::Heading:
        case NodeType::Blockquote:
        case NodeType::CodeBlock:
        case NodeType::MathBlock:
        case NodeType::HtmlBlock:
            return trimCopy(childrenText) + "\n\n";
        case NodeType::ListItem:
        case NodeType::TaskListItem:
            return trimCopy(childrenText) + "\n";
        case NodeType::List:
            return childrenText + "\n";
        case NodeType::TableRow:
            return childrenText + "\n";
        case NodeType::TableCell:
            return childrenText + " | ";
        default:
            return childrenText;
    }
}

} // namespace NitroMarkdown
