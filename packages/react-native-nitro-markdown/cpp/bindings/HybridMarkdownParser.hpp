#pragma once

#include "HybridMarkdownParserSpec.hpp"
#include "../core/NitroMD4CParser.hpp"
#include <cstdint>
#include <memory>

namespace margelo::nitro::Markdown {

using InternalMarkdownNode = ::NitroMarkdown::MarkdownNode;
using InternalParserOptions = ::NitroMarkdown::ParserOptions;

class HybridMarkdownParser : public HybridMarkdownParserSpec {
public:
    HybridMarkdownParser();
    ~HybridMarkdownParser() override;

    [[nodiscard]] std::string parse(const std::string& text) override;
    [[nodiscard]] std::string parseWithOptions(const std::string& text, const ParserOptions& options) override;
    [[nodiscard]] std::string extractPlainText(const std::string& text) override;
    [[nodiscard]] std::string extractPlainTextWithOptions(const std::string& text, const ParserOptions& options) override;

#ifdef NITRO_MARKDOWN_TESTING
    static uint64_t resolveMaxInputBytesForTest(double value, bool narrowSize);
#endif

private:
    std::unique_ptr<::NitroMarkdown::MD4CParser> parser_;
    std::string nodeToJson(
        const std::shared_ptr<InternalMarkdownNode>& node,
        const std::string& source,
        const InternalParserOptions& options
    );
};

} // namespace margelo::nitro::Markdown
