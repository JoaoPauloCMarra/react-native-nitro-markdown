#include "HybridMarkdownParser.hpp"
#include <cctype>
#include <string>

namespace margelo::nitro::Markdown {

namespace {

inline void appendEscapedJsonString(std::string& output, const std::string& input) {
    static constexpr char kHex[] = "0123456789abcdef";

    for (unsigned char c : input) {
        switch (c) {
            case '"':
                output += "\\\"";
                break;
            case '\\':
                output += "\\\\";
                break;
            case '\b':
                output += "\\b";
                break;
            case '\f':
                output += "\\f";
                break;
            case '\n':
                output += "\\n";
                break;
            case '\r':
                output += "\\r";
                break;
            case '\t':
                output += "\\t";
                break;
            default: {
                if (c <= 0x1f) {
                    output += "\\u00";
                    output.push_back(kHex[(c >> 4) & 0x0f]);
                    output.push_back(kHex[c & 0x0f]);
                } else {
                    output.push_back(static_cast<char>(c));
                }
                break;
            }
        }
    }
}

inline void appendStringField(std::string& output, const char* key, const std::string& value) {
    output.push_back(',');
    output.push_back('"');
    output += key;
    output += "\":\"";
    appendEscapedJsonString(output, value);
    output.push_back('"');
}

inline void appendIntField(std::string& output, const char* key, int value) {
    output.push_back(',');
    output.push_back('"');
    output += key;
    output += "\":";
    output += std::to_string(value);
}

inline void appendOffsetField(std::string& output, const char* key, unsigned int value) {
    output.push_back(',');
    output.push_back('"');
    output += key;
    output += "\":";
    output += std::to_string(value);
}

inline void appendBoolField(std::string& output, const char* key, bool value) {
    output.push_back(',');
    output.push_back('"');
    output += key;
    output += "\":";
    output += value ? "true" : "false";
}

static constexpr size_t kMaxEstimatedSize = 64 * 1024 * 1024; // 64 MB cap

static size_t estimateJsonSize(const std::shared_ptr<InternalMarkdownNode>& node) noexcept {
    if (!node) return 0;
    size_t size = 64; // base overhead per node (type, beg, end, braces)
    auto safeAdd = [](size_t a, size_t b) -> size_t {
        return (b > kMaxEstimatedSize - a) ? kMaxEstimatedSize : a + b;
    };
    if (node->content && size < kMaxEstimatedSize) {
        size = safeAdd(size, node->content->size());
    }
    if (node->href && size < kMaxEstimatedSize) {
        size = safeAdd(size, node->href->size() + 10);
    }
    if (node->title && size < kMaxEstimatedSize) {
        size = safeAdd(size, node->title->size() + 10);
    }
    if (node->alt && size < kMaxEstimatedSize) {
        size = safeAdd(size, node->alt->size() + 8);
    }
    if (node->language && size < kMaxEstimatedSize) {
        size = safeAdd(size, node->language->size() + 12);
    }
    for (const auto& child : node->children) {
        if (size >= kMaxEstimatedSize) break;
        size_t childSize = estimateJsonSize(child);
        size = safeAdd(size, childSize);
    }
    return size;
}

void appendNodeJson(std::string& output, const std::shared_ptr<InternalMarkdownNode>& node) {
    output.push_back('{');

    output += "\"type\":\"";
    output += ::NitroMarkdown::nodeTypeToString(node->type);
    output.push_back('"');

    appendOffsetField(output, "beg", node->beg);
    appendOffsetField(output, "end", node->end);

    if (node->content.has_value()) {
        appendStringField(output, "content", node->content.value());
    }

    if (node->level.has_value()) {
        appendIntField(output, "level", node->level.value());
    }

    if (node->href.has_value()) {
        appendStringField(output, "href", node->href.value());
    }

    if (node->title.has_value()) {
        appendStringField(output, "title", node->title.value());
    }

    if (node->alt.has_value()) {
        appendStringField(output, "alt", node->alt.value());
    }

    if (node->language.has_value()) {
        appendStringField(output, "language", node->language.value());
    }

    if (node->ordered.has_value()) {
        appendBoolField(output, "ordered", node->ordered.value());
    }

    if (node->start.has_value()) {
        appendIntField(output, "start", node->start.value());
    }

    if (node->checked.has_value()) {
        appendBoolField(output, "checked", node->checked.value());
    }

    if (node->isHeader.has_value()) {
        appendBoolField(output, "isHeader", node->isHeader.value());
    }

    if (node->align.has_value()) {
        std::string alignStr = ::NitroMarkdown::textAlignToString(node->align.value());
        if (!alignStr.empty()) {
            appendStringField(output, "align", alignStr);
        }
    }

    if (!node->children.empty()) {
        output += ",\"children\":[";
        for (size_t i = 0; i < node->children.size(); ++i) {
            if (i > 0) {
                output.push_back(',');
            }
            appendNodeJson(output, node->children[i]);
        }
        output.push_back(']');
    }

    output.push_back('}');
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

std::string flattenNodeText(const std::shared_ptr<InternalMarkdownNode>& node) {
    using ::NitroMarkdown::NodeType;

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

} // namespace

std::string HybridMarkdownParser::parse(const std::string& text) {
    InternalParserOptions opts{.gfm = true, .math = true};

    auto ast = parser_->parse(text, opts);
    return nodeToJson(ast);
}

std::string HybridMarkdownParser::parseWithOptions(const std::string& text, const ParserOptions& options) {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    
    auto ast = parser_->parse(text, internalOpts);
    return nodeToJson(ast);
}

std::string HybridMarkdownParser::extractPlainText(const std::string& text) {
    InternalParserOptions opts{.gfm = true, .math = true};

    auto ast = parser_->parse(text, opts);
    return flattenNodeText(ast);
}

std::string HybridMarkdownParser::extractPlainTextWithOptions(const std::string& text, const ParserOptions& options) {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);

    auto ast = parser_->parse(text, internalOpts);
    return flattenNodeText(ast);
}

std::string HybridMarkdownParser::nodeToJson(const std::shared_ptr<InternalMarkdownNode>& node) {
    std::string json;
    json.reserve(estimateJsonSize(node));
    appendNodeJson(json, node);
    return json;
}

} // namespace margelo::nitro::Markdown
