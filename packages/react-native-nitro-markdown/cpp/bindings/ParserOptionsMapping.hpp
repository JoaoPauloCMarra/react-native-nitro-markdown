#pragma once

#include "ParserOptions.hpp"
#include "../core/NitroMD4CParser.hpp"

namespace margelo::nitro::Markdown {

using InternalMarkdownNode = ::NitroMarkdown::MarkdownNode;
using InternalParserOptions = ::NitroMarkdown::ParserOptions;

InternalParserOptions toInternalParserOptions(const ParserOptions& options);
InternalParserOptions defaultInternalParserOptions();

} // namespace margelo::nitro::Markdown
