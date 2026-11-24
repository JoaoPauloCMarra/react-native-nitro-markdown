#include "MarkdownJson.hpp"
#include "flatten.hpp"
#include <algorithm>
#include <charconv>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>

namespace NitroMarkdown {

namespace {

[[noreturn]] void throwJsonSizeError(size_t size) {
    throw std::runtime_error(
        "Markdown JSON output size " + std::to_string(size) +
        " bytes exceeds the maximum of " + std::to_string(kMaxOutputBytes) +
        " bytes"
    );
}

class JsonWriter final {
public:
    void reserve(size_t capacity) {
        reallocate(std::min(capacity, kMaxOutputBytes));
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
        if (extra > kMaxOutputBytes - output_.size()) {
            throwJsonSizeError(output_.size() + extra);
        }
        const size_t needed = output_.size() + extra;
        if (needed > capacity_) {
            reallocate(std::min(std::max(needed, capacity_ * 2), kMaxOutputBytes));
        }
    }

    void reallocate(size_t capacity) {
        std::string next;
        next.reserve(capacity);
        next.append(output_);
        output_ = std::move(next);
        capacity_ = capacity;
    }

    std::string output_;
    size_t capacity_ = 0;
};

template <typename T>
inline void appendInteger(JsonWriter& output, T value) {
    char buffer[std::numeric_limits<T>::digits10 + 3];
    const auto result = std::to_chars(buffer, buffer + sizeof(buffer), value);
    if (result.ec != std::errc()) {
        throw std::runtime_error("Markdown JSON integer serialization failed");
    }
    output.append(std::string_view(buffer, static_cast<size_t>(result.ptr - buffer)));
}

inline void appendEscapedJsonString(JsonWriter& output, std::string_view input) {
    static constexpr char kHex[] = "0123456789abcdef";
    size_t safeStart = 0;

    for (size_t index = 0; index < input.size(); index++) {
        const unsigned char c = static_cast<unsigned char>(input[index]);
        char control[6];
        std::string_view escape;
        switch (c) {
            case '"': escape = "\\\""; break;
            case '\\': escape = "\\\\"; break;
            case '\b': escape = "\\b"; break;
            case '\f': escape = "\\f"; break;
            case '\n': escape = "\\n"; break;
            case '\r': escape = "\\r"; break;
            case '\t': escape = "\\t"; break;
            default:
                if (c > 0x1f) continue;
                control[0] = '\\';
                control[1] = 'u';
                control[2] = '0';
                control[3] = '0';
                control[4] = kHex[(c >> 4) & 0x0f];
                control[5] = kHex[c & 0x0f];
                escape = std::string_view(control, sizeof(control));
                break;
        }

        if (index > safeStart) {
            output.append(std::string_view(input.data() + safeStart, index - safeStart));
        }
        output.append(escape);
        safeStart = index + 1;
    }

    if (safeStart < input.size()) {
        output.append(std::string_view(input.data() + safeStart, input.size() - safeStart));
    }
}

// Each field writes its `,"key":` prefix as one literal.
#define FIELD_PREFIX(key) ",\"" key "\":"

inline void appendStringField(JsonWriter& output, std::string_view prefix, std::string_view value) {
    output.append(prefix);
    output.push('"');
    appendEscapedJsonString(output, value);
    output.push('"');
}

template <typename T>
inline void appendNumberField(JsonWriter& output, std::string_view prefix, T value) {
    output.append(prefix);
    appendInteger(output, value);
}

inline void appendBoolField(JsonWriter& output, std::string_view prefix, bool value) {
    output.append(prefix);
    output.append(value ? "true" : "false");
}

void appendNodeJson(
    JsonWriter& output,
    const std::shared_ptr<MarkdownNode>& node,
    bool includeOffsets
) {
    if (!node) throw std::runtime_error("Markdown AST contains a null node");

    output.append("{\"type\":\"");
    output.append(nodeTypeToStringView(node->type));
    output.push('"');

    if (includeOffsets) {
        appendNumberField(output, FIELD_PREFIX("beg"), node->beg);
        appendNumberField(output, FIELD_PREFIX("end"), node->end);
    }
    if (node->content.has_value()) appendStringField(output, FIELD_PREFIX("content"), node->content.value());
    if (node->level.has_value()) appendNumberField(output, FIELD_PREFIX("level"), node->level.value());
    if (node->href.has_value()) appendStringField(output, FIELD_PREFIX("href"), node->href.value());
    if (node->title.has_value()) appendStringField(output, FIELD_PREFIX("title"), node->title.value());
    if (node->alt.has_value()) appendStringField(output, FIELD_PREFIX("alt"), node->alt.value());
    if (node->language.has_value()) appendStringField(output, FIELD_PREFIX("language"), node->language.value());
    if (node->ordered.has_value()) appendBoolField(output, FIELD_PREFIX("ordered"), node->ordered.value());
    if (node->start.has_value()) appendNumberField(output, FIELD_PREFIX("start"), node->start.value());
    if (node->checked.has_value()) appendBoolField(output, FIELD_PREFIX("checked"), node->checked.value());
    if (node->isHeader.has_value()) appendBoolField(output, FIELD_PREFIX("isHeader"), node->isHeader.value());
    if (node->align.has_value()) {
        const std::string_view alignStr = textAlignToStringView(node->align.value());
        if (!alignStr.empty()) appendStringField(output, FIELD_PREFIX("align"), alignStr);
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

#undef FIELD_PREFIX

} // namespace

std::string serializeMarkdownJson(
    const std::shared_ptr<MarkdownNode>& node,
    size_t sourceBytes,
    bool includeOffsets
) {
    JsonWriter writer;
    writer.reserve(std::max<size_t>(
        4096,
        std::min<size_t>(sourceBytes * 2 + 256, kMaxOutputBytes)
    ));
    appendNodeJson(writer, node, includeOffsets);
    return std::move(writer).take();
}

std::string parseMarkdownToJson(
    const std::string& text,
    const ParserOptions& options
) try {
    MD4CParser parser;
    return serializeMarkdownJson(
        parser.parse(text, options),
        text.size(),
        options.sourceOffsets
    );
} catch (const std::bad_alloc&) {
    throw MarkdownOutOfMemory();
}

} // namespace NitroMarkdown
