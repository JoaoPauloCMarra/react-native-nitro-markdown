#include "HybridMarkdownParser.hpp"
#include "../core/flatten.hpp"
#include <algorithm>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <limits>
#include <utility>

namespace margelo::nitro::Markdown {

namespace {

static constexpr size_t kMaxJsonSize = 64 * 1024 * 1024;

[[noreturn]] void throwJsonSizeError(size_t size) {
    throw std::runtime_error(
        "Markdown JSON output size " + std::to_string(size) +
        " bytes exceeds the maximum of " + std::to_string(kMaxJsonSize) +
        " bytes"
    );
}

class JsonWriter final {
public:
    void reserve(size_t capacity) {
        output_.reserve(std::min(capacity, kMaxJsonSize));
    }

    void append(std::string_view value) {
        grow(value.size());
        output_.append(value.data(), value.size());
    }

    void push(char value) {
        grow(1);
        output_.push_back(value);
    }

    [[nodiscard]] std::string take() && {
        return std::move(output_);
    }

private:
    void grow(size_t extra) {
        if (extra > kMaxJsonSize - output_.size()) {
            throwJsonSizeError(output_.size() + extra);
        }
        const size_t needed = output_.size() + extra;
        if (needed > output_.capacity()) {
            output_.reserve(
                std::min(std::max(needed, output_.capacity() * 2), kMaxJsonSize)
            );
        }
    }

    std::string output_;
};

template <typename Writer, typename T>
inline void appendInteger(Writer& output, T value) {
    char buffer[std::numeric_limits<T>::digits10 + 3];
    const auto result = std::to_chars(buffer, buffer + sizeof(buffer), value);
    if (result.ec != std::errc()) {
        throw std::runtime_error("Markdown JSON integer serialization failed");
    }
    output.append(std::string_view(buffer, static_cast<size_t>(result.ptr - buffer)));
}

template <typename Writer>
inline void appendEscapedJsonString(Writer& output, std::string_view input) {
    static constexpr char kHex[] = "0123456789abcdef";
    size_t safeStart = 0;

    for (size_t index = 0; index < input.size(); index++) {
        const unsigned char c = static_cast<unsigned char>(input[index]);
        switch (c) {
            case '"':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\\"");
                safeStart = index + 1;
                break;
            case '\\':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\\\");
                safeStart = index + 1;
                break;
            case '\b':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\b");
                safeStart = index + 1;
                break;
            case '\f':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\f");
                safeStart = index + 1;
                break;
            case '\n':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\n");
                safeStart = index + 1;
                break;
            case '\r':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\r");
                safeStart = index + 1;
                break;
            case '\t':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\t");
                safeStart = index + 1;
                break;
            default: {
                if (c <= 0x1f) {
                    if (index > safeStart) {
                        output.append(std::string_view(input.data() + safeStart, index - safeStart));
                    }
                    output.append("\\u00");
                    output.push(kHex[(c >> 4) & 0x0f]);
                    output.push(kHex[c & 0x0f]);
                    safeStart = index + 1;
                }
                break;
            }
        }
    }

    if (safeStart < input.size()) {
        output.append(std::string_view(input.data() + safeStart, input.size() - safeStart));
    }
}

template <typename Writer>
inline void appendStringField(Writer& output, const char* key, std::string_view value) {
    output.push(',');
    output.push('"');
    output.append(key);
    output.append("\":\"");
    appendEscapedJsonString(output, value);
    output.push('"');
}

template <typename Writer>
inline void appendIntField(Writer& output, const char* key, int value) {
    output.push(',');
    output.push('"');
    output.append(key);
    output.append("\":");
    appendInteger(output, value);
}

template <typename Writer>
inline void appendOffsetField(Writer& output, const char* key, unsigned int value) {
    output.push(',');
    output.push('"');
    output.append(key);
    output.append("\":");
    appendInteger(output, value);
}

template <typename Writer>
inline void appendBoolField(Writer& output, const char* key, bool value) {
    output.push(',');
    output.push('"');
    output.append(key);
    output.append("\":");
    output.append(value ? "true" : "false");
}

// Converts the optional JS-side UTF-8 byte maxInputLength to the native size
// type before the parser applies its hard cap. Invalid numeric values are
// rejected before any narrowing conversion.
template <typename SizeT>
SizeT resolveMaxInputBytesAs(const std::optional<double>& maxInputLength) {
    if (!maxInputLength.has_value()) return 0;
    double value = maxInputLength.value();
    if (!std::isfinite(value) || value < 0 || std::floor(value) != value) {
        throw std::runtime_error(
            "maxInputLength must be a finite non-negative integer in bytes"
        );
    }
    if (value == 0) return 0;
    if (value >= 18446744073709551616.0) {
        throw std::runtime_error("maxInputLength cannot be represented as a native size");
    }
    const uint64_t wide = static_cast<uint64_t>(value);
    const uint64_t maxSize = static_cast<uint64_t>(std::numeric_limits<SizeT>::max());
    return static_cast<SizeT>(std::min(wide, maxSize));
}

size_t resolveMaxInputBytes(const std::optional<double>& maxInputLength) {
    return resolveMaxInputBytesAs<size_t>(maxInputLength);
}

template <typename Writer>
void appendNodeJson(
    Writer& output,
    const std::shared_ptr<InternalMarkdownNode>& node,
    bool includeOffsets
) {
    if (!node) throw std::runtime_error("Markdown AST contains a null node");

    output.push('{');
    output.append("\"type\":\"");
    output.append(::NitroMarkdown::nodeTypeToStringView(node->type));
    output.push('"');

    if (includeOffsets) {
        appendOffsetField(output, "beg", node->beg);
        appendOffsetField(output, "end", node->end);
    }
    if (node->content.has_value()) appendStringField(output, "content", node->content.value());
    if (node->level.has_value()) appendIntField(output, "level", node->level.value());
    if (node->href.has_value()) appendStringField(output, "href", node->href.value());
    if (node->title.has_value()) appendStringField(output, "title", node->title.value());
    if (node->alt.has_value()) appendStringField(output, "alt", node->alt.value());
    if (node->language.has_value()) appendStringField(output, "language", node->language.value());
    if (node->ordered.has_value()) appendBoolField(output, "ordered", node->ordered.value());
    if (node->start.has_value()) appendIntField(output, "start", node->start.value());
    if (node->checked.has_value()) appendBoolField(output, "checked", node->checked.value());
    if (node->isHeader.has_value()) appendBoolField(output, "isHeader", node->isHeader.value());
    if (node->align.has_value()) {
        const std::string_view alignStr = ::NitroMarkdown::textAlignToStringView(node->align.value());
        if (!alignStr.empty()) appendStringField(output, "align", alignStr);
    }

    if (!node->children.empty()) {
        output.append(",\"children\":[");
        for (size_t index = 0; index < node->children.size(); index++) {
            if (index > 0) output.push(',');
            appendNodeJson(output, node->children[index], includeOffsets);
        }
        output.push(']');
    }

    output.push('}');
}

} // namespace

HybridMarkdownParser::HybridMarkdownParser()
    : HybridObject(TAG), HybridMarkdownParserSpec() {
    parser_ = std::make_unique<::NitroMarkdown::MD4CParser>();
}

HybridMarkdownParser::~HybridMarkdownParser() = default;

std::string HybridMarkdownParser::parse(const std::string& text) try {
    InternalParserOptions opts{.gfm = true, .math = true, .html = false};

    auto ast = parser_->parse(text, opts);
    return nodeToJson(ast, text, opts);
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownOutOfMemory();
}

std::string HybridMarkdownParser::parseWithOptions(const std::string& text, const ParserOptions& options) try {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    internalOpts.html = options.html.value_or(false);
    internalOpts.sourceOffsets = options.sourceOffsets.value_or(true);
    internalOpts.maxInputLength = resolveMaxInputBytes(options.maxInputLength);

    auto ast = parser_->parse(text, internalOpts);
    return nodeToJson(ast, text, internalOpts);
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownOutOfMemory();
}

std::string HybridMarkdownParser::extractPlainText(const std::string& text) try {
    InternalParserOptions opts{.gfm = true, .math = true, .html = false};
    opts.sourceOffsets = false;

    auto ast = parser_->parse(text, opts);
    return flattenNodeText(ast);
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownOutOfMemory();
}

std::string HybridMarkdownParser::extractPlainTextWithOptions(const std::string& text, const ParserOptions& options) try {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    internalOpts.html = options.html.value_or(false);
    internalOpts.sourceOffsets = false;
    internalOpts.maxInputLength = resolveMaxInputBytes(options.maxInputLength);

    auto ast = parser_->parse(text, internalOpts);
    return flattenNodeText(ast);
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownOutOfMemory();
}

std::string HybridMarkdownParser::nodeToJson(
    const std::shared_ptr<InternalMarkdownNode>& node,
    const std::string& source,
    const InternalParserOptions& options
) {
    JsonWriter writer;
    const size_t reserveSize = source.size() > (kMaxJsonSize - 256) / 2
        ? kMaxJsonSize
        : std::max<size_t>(4096, source.size() * 2 + 256);
    writer.reserve(reserveSize);
    appendNodeJson(writer, node, options.sourceOffsets);
    return std::move(writer).take();
}

#ifdef NITRO_MARKDOWN_TESTING
uint64_t HybridMarkdownParser::resolveMaxInputBytesForTest(double value, bool narrowSize) {
    return narrowSize
        ? static_cast<uint64_t>(resolveMaxInputBytesAs<uint32_t>(value))
        : resolveMaxInputBytesAs<uint64_t>(value);
}
#endif

} // namespace margelo::nitro::Markdown
