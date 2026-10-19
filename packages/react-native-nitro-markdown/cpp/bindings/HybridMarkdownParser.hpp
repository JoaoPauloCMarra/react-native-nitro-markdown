#pragma once

#include "HybridMarkdownParserSpec.hpp"
#include "ParserOptionsMapping.hpp"
#include "../core/NitroMD4CParser.hpp"
#include <cstdint>

namespace margelo::nitro::Markdown {

class HybridMarkdownParser : public HybridMarkdownParserSpec {
public:
    HybridMarkdownParser();

    [[nodiscard]] std::string parse(const std::string& text) override;
    [[nodiscard]] std::string parseWithOptions(const std::string& text, const ParserOptions& options) override;
    [[nodiscard]] std::string extractPlainText(const std::string& text) override;
    [[nodiscard]] std::string extractPlainTextWithOptions(const std::string& text, const ParserOptions& options) override;

#ifdef NITRO_MARKDOWN_TESTING
    static uint64_t resolveMaxInputBytesForTest(double value, bool narrowSize);
#endif
};

} // namespace margelo::nitro::Markdown
