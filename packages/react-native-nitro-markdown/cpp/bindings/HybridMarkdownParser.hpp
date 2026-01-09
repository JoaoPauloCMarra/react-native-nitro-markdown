#pragma once

#include "HybridMarkdownParserSpec.hpp"
#include "../core/MD4CParser.hpp"
#include <memory>

namespace margelo::nitro::Markdown {

using InternalMarkdownNode = ::NitroMarkdown::MarkdownNode;
using InternalParserOptions = ::NitroMarkdown::ParserOptions;

class HybridMarkdownParser : public HybridMarkdownParserSpec {
public:
    HybridMarkdownParser() : HybridObject(TAG), HybridMarkdownParserSpec() {
        parser_ = std::make_unique<::NitroMarkdown::MD4CParser>();
    }
    
    ~HybridMarkdownParser() override = default;

    std::string parse(const std::string& text) override;
    std::string parseWithOptions(const std::string& text, const ParserOptions& options) override;

private:
    std::unique_ptr<::NitroMarkdown::MD4CParser> parser_;
    std::string nodeToJson(const std::shared_ptr<InternalMarkdownNode>& node);
};

} // namespace margelo::nitro::Markdown
