#pragma once

#include "MarkdownTypes.hpp"
#include <string>
#include <memory>
#include <cstddef>

#ifdef NITRO_MARKDOWN_TESTING
#include "../md4c/md4c.h"
#include <limits>
#endif

namespace NitroMarkdown {

class MD4CParser {
public:
    MD4CParser();
    ~MD4CParser();
    std::shared_ptr<MarkdownNode> parse(const std::string& markdown, const ParserOptions& options);

#ifdef NITRO_MARKDOWN_TESTING
    static size_t clampInputSizeForTest(size_t inputSize) {
        size_t maxSize = static_cast<size_t>(std::numeric_limits<MD_SIZE>::max());
        return inputSize > maxSize ? maxSize : inputSize;
    }
#endif
    
private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace NitroMarkdown
