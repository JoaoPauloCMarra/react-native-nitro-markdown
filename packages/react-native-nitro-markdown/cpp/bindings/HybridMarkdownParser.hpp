#pragma once

#include "HybridMarkdownParserSpec.hpp"
#include "../core/NitroMD4CParser.hpp"
#include <memory>

namespace margelo::nitro::Markdown {

using InternalMarkdownNode = ::NitroMarkdown::MarkdownNode;
using InternalParserOptions = ::NitroMarkdown::ParserOptions;

class MarkdownSerializationCache;

class HybridMarkdownParser : public HybridMarkdownParserSpec {
public:
    HybridMarkdownParser();
    ~HybridMarkdownParser() override;

    [[nodiscard]] std::string parse(const std::string& text) override;
    [[nodiscard]] std::string parseWithOptions(const std::string& text, const ParserOptions& options) override;
    [[nodiscard]] std::string parseForStreaming(const std::string& text);
    [[nodiscard]] std::string parseWithOptionsForStreaming(
        const std::string& text,
        const ParserOptions& options
    );
    [[nodiscard]] std::string extractPlainText(const std::string& text) override;
    [[nodiscard]] std::string extractPlainTextWithOptions(const std::string& text, const ParserOptions& options) override;

private:
    std::unique_ptr<::NitroMarkdown::MD4CParser> parser_;
    std::unique_ptr<MarkdownSerializationCache> cache_;
    std::string nodeToJson(
        const std::shared_ptr<InternalMarkdownNode>& node,
        const std::string& source,
        const InternalParserOptions& options,
        bool allowSerializationCache
    );
};

} // namespace margelo::nitro::Markdown
