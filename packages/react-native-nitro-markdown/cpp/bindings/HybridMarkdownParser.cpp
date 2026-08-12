#include "HybridMarkdownParser.hpp"
#include "../core/flatten.hpp"
#include <cmath>
#include <optional>
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
static constexpr size_t kMaxJsonSize = 64 * 1024 * 1024; // hard JSON output cap

// Converts the optional JS-side maxInputLength (UTF-16 characters) to a byte
// cap for the C++ parser. Non-finite, negative, fractional, or missing values
// fall back to the default (0 = default hard cap).
size_t resolveMaxInputBytes(const std::optional<double>& maxInputLength) {
    if (!maxInputLength.has_value()) return 0;
    double value = maxInputLength.value();
    if (!std::isfinite(value) || value <= 0) return 0;
    return static_cast<size_t>(value);
}

static size_t estimateJsonSize(const std::shared_ptr<InternalMarkdownNode>& node, bool includeOffsets) noexcept {
    if (!node) return 0;
    size_t size = includeOffsets ? 64 : 44; // base overhead per node (type[, beg, end], braces)
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
        size_t childSize = estimateJsonSize(child, includeOffsets);
        size = safeAdd(size, childSize);
    }
    return size;
}

void appendNodeJson(std::string& output, const std::shared_ptr<InternalMarkdownNode>& node, bool includeOffsets) {
    output.push_back('{');

    output += "\"type\":\"";
    output += ::NitroMarkdown::nodeTypeToString(node->type);
    output.push_back('"');

    if (includeOffsets) {
        appendOffsetField(output, "beg", node->beg);
        appendOffsetField(output, "end", node->end);
    }

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
            appendNodeJson(output, node->children[i], includeOffsets);
        }
        output.push_back(']');
    }

    output.push_back('}');
}

} // namespace

std::string HybridMarkdownParser::parse(const std::string& text) {
    InternalParserOptions opts{.gfm = true, .math = true, .html = false};

    auto ast = parser_->parse(text, opts);
    return nodeToJson(ast, true);
}

std::string HybridMarkdownParser::parseWithOptions(const std::string& text, const ParserOptions& options) {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    internalOpts.html = options.html.value_or(false);
    internalOpts.sourceOffsets = options.sourceOffsets.value_or(true);
    internalOpts.maxInputLength = resolveMaxInputBytes(options.maxInputLength);

    auto ast = parser_->parse(text, internalOpts);
    return nodeToJson(ast, internalOpts.sourceOffsets);
}

std::string HybridMarkdownParser::extractPlainText(const std::string& text) {
    InternalParserOptions opts{.gfm = true, .math = true, .html = false};

    auto ast = parser_->parse(text, opts);
    return flattenNodeText(ast);
}

std::string HybridMarkdownParser::extractPlainTextWithOptions(const std::string& text, const ParserOptions& options) {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    internalOpts.html = options.html.value_or(false);
    internalOpts.sourceOffsets = options.sourceOffsets.value_or(true);
    internalOpts.maxInputLength = resolveMaxInputBytes(options.maxInputLength);

    auto ast = parser_->parse(text, internalOpts);
    return flattenNodeText(ast);
}

std::string HybridMarkdownParser::nodeToJson(const std::shared_ptr<InternalMarkdownNode>& node, bool includeOffsets) {
    std::string json;
    json.reserve(estimateJsonSize(node, includeOffsets));
    appendNodeJson(json, node, includeOffsets);
    if (json.size() > kMaxJsonSize) {
        throw std::runtime_error(
            "Markdown JSON output size " + std::to_string(json.size()) +
            " bytes exceeds the maximum of " + std::to_string(kMaxJsonSize) +
            " bytes"
        );
    }
    return json;
}

} // namespace margelo::nitro::Markdown
