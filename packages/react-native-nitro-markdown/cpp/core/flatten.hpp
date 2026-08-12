#pragma once

#include "MarkdownTypes.hpp"
#include <memory>
#include <string>

namespace NitroMarkdown {

// Flattens a parsed AST to plain text, normalizing spacing between blocks.
// Used by the native `extractPlainText*` bindings and by the C++ conformance
// tests, which share the same corpus as the JavaScript `getFlattenedText`.
std::string flattenNodeText(const std::shared_ptr<MarkdownNode>& node);

} // namespace NitroMarkdown
