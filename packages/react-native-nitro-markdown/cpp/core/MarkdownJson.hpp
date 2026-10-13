#pragma once

#include "MarkdownTypes.hpp"
#include "NitroMD4CParser.hpp"
#include <cstddef>
#include <memory>
#include <string>

namespace NitroMarkdown {

std::string serializeMarkdownJson(
    const std::shared_ptr<MarkdownNode>& node,
    size_t sourceBytes,
    bool includeOffsets
);

std::string parseMarkdownToJson(
    MD4CParser& parser,
    const std::string& text,
    const ParserOptions& options
);

} // namespace NitroMarkdown
