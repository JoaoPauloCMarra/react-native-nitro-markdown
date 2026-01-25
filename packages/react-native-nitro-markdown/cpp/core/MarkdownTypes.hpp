#pragma once

#include <string>
#include <vector>
#include <optional>
#include <memory>

namespace NitroMarkdown {

typedef unsigned MD_OFFSET;
typedef MD_OFFSET OFF;

enum class NodeType {
    Document,
    Heading,
    Paragraph,
    Text,
    Bold,
    Italic,
    Strikethrough,
    Link,
    Image,
    CodeInline,
    CodeBlock,
    Blockquote,
    HorizontalRule,
    LineBreak,
    SoftBreak,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    List,
    ListItem,
    TaskListItem,
    MathInline,
    MathBlock,
    HtmlBlock,
    HtmlInline
};

inline std::string nodeTypeToString(NodeType type) {
    switch (type) {
        case NodeType::Document: return "document";
        case NodeType::Heading: return "heading";
        case NodeType::Paragraph: return "paragraph";
        case NodeType::Text: return "text";
        case NodeType::Bold: return "bold";
        case NodeType::Italic: return "italic";
        case NodeType::Strikethrough: return "strikethrough";
        case NodeType::Link: return "link";
        case NodeType::Image: return "image";
        case NodeType::CodeInline: return "code_inline";
        case NodeType::CodeBlock: return "code_block";
        case NodeType::Blockquote: return "blockquote";
        case NodeType::HorizontalRule: return "horizontal_rule";
        case NodeType::LineBreak: return "line_break";
        case NodeType::SoftBreak: return "soft_break";
        case NodeType::Table: return "table";
        case NodeType::TableHead: return "table_head";
        case NodeType::TableBody: return "table_body";
        case NodeType::TableRow: return "table_row";
        case NodeType::TableCell: return "table_cell";
        case NodeType::List: return "list";
        case NodeType::ListItem: return "list_item";
        case NodeType::TaskListItem: return "task_list_item";
        case NodeType::MathInline: return "math_inline";
        case NodeType::MathBlock: return "math_block";
        case NodeType::HtmlBlock: return "html_block";
        case NodeType::HtmlInline: return "html_inline";
    }
    return "unknown";
}

enum class TextAlign {
    Default,
    Left,
    Center,
    Right
};

inline std::string textAlignToString(TextAlign align) {
    switch (align) {
        case TextAlign::Left: return "left";
        case TextAlign::Center: return "center";
        case TextAlign::Right: return "right";
        default: return "";
    }
}

struct MarkdownNode {
    NodeType type;
    std::optional<std::string> content;
    std::optional<int> level;
    std::optional<std::string> href;
    std::optional<std::string> title;
    std::optional<std::string> alt;
    std::optional<std::string> language;
    std::optional<bool> ordered;
    std::optional<int> start;
    std::optional<bool> checked;
    std::optional<bool> isHeader;
    std::optional<TextAlign> align;
    OFF beg;
    OFF end;
    std::vector<std::shared_ptr<MarkdownNode>> children;

    explicit MarkdownNode(NodeType t) : type(t), beg(0), end(0) {}

    void addChild(std::shared_ptr<MarkdownNode> child) {
        if (child) {
            children.push_back(std::move(child));
        }
    }
};

struct ParserOptions {
    bool gfm = true;
    bool math = true;
};

} // namespace NitroMarkdown

