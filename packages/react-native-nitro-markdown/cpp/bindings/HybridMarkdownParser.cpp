#include "HybridMarkdownParser.hpp"
#include "../core/MarkdownJson.hpp"
#include "../core/flatten.hpp"
#include <algorithm>
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

} // namespace

InternalParserOptions toInternalParserOptions(const ParserOptions& options) {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    internalOpts.html = options.html.value_or(false);
    internalOpts.sourceOffsets = options.sourceOffsets.value_or(true);
    internalOpts.maxInputLength = resolveMaxInputBytes(options.maxInputLength);
    return internalOpts;
}

InternalParserOptions defaultInternalParserOptions() {
    return InternalParserOptions{.gfm = true, .math = true, .html = false};
}

HybridMarkdownParser::HybridMarkdownParser()
    : HybridObject(TAG), HybridMarkdownParserSpec() {
    parser_ = std::make_unique<::NitroMarkdown::MD4CParser>();
}

HybridMarkdownParser::~HybridMarkdownParser() = default;

std::string HybridMarkdownParser::parse(const std::string& text) {
    return ::NitroMarkdown::parseMarkdownToJson(
        *parser_,
        text,
        defaultInternalParserOptions()
    );
}

std::string HybridMarkdownParser::parseWithOptions(const std::string& text, const ParserOptions& options) {
    return ::NitroMarkdown::parseMarkdownToJson(
        *parser_,
        text,
        toInternalParserOptions(options)
    );
}

std::string HybridMarkdownParser::extractPlainText(const std::string& text) try {
    InternalParserOptions opts = defaultInternalParserOptions();
    opts.sourceOffsets = false;

    auto ast = parser_->parse(text, opts);
    return flattenNodeText(ast);
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownOutOfMemory();
}

std::string HybridMarkdownParser::extractPlainTextWithOptions(const std::string& text, const ParserOptions& options) try {
    InternalParserOptions internalOpts = toInternalParserOptions(options);
    internalOpts.sourceOffsets = false;

    auto ast = parser_->parse(text, internalOpts);
    return flattenNodeText(ast);
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownOutOfMemory();
}

#ifdef NITRO_MARKDOWN_TESTING
uint64_t HybridMarkdownParser::resolveMaxInputBytesForTest(double value, bool narrowSize) {
    return narrowSize
        ? static_cast<uint64_t>(resolveMaxInputBytesAs<uint32_t>(value))
        : resolveMaxInputBytesAs<uint64_t>(value);
}
#endif

} // namespace margelo::nitro::Markdown
