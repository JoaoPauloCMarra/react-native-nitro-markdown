#include "HybridMarkdownParser.hpp"
#include "../core/MarkdownJson.hpp"
#include "../core/flatten.hpp"
#include <cstdint>
#include <new>
#include <string>

namespace margelo::nitro::Markdown {

HybridMarkdownParser::HybridMarkdownParser()
    : HybridObject(TAG), HybridMarkdownParserSpec() {}

std::string HybridMarkdownParser::parse(const std::string& text) {
    return parseWithOptions(text, {});
}

std::string HybridMarkdownParser::parseWithOptions(const std::string& text, const ParserOptions& options) {
    return ::NitroMarkdown::parseMarkdownToJson(text, toInternalParserOptions(options));
}

std::string HybridMarkdownParser::extractPlainText(const std::string& text) {
    return extractPlainTextWithOptions(text, {});
}

std::string HybridMarkdownParser::extractPlainTextWithOptions(const std::string& text, const ParserOptions& options) try {
    InternalParserOptions internalOpts = toInternalParserOptions(options);
    internalOpts.sourceOffsets = false;

    ::NitroMarkdown::MD4CParser parser;
    return flattenNodeText(parser.parse(text, internalOpts));
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
