#pragma once

#include "MarkdownTypes.hpp"
#include <string>
#include <memory>
#include <cstddef>

#ifdef NITRO_MARKDOWN_TESTING
#include "../nitromd/nitromd.h"
#include <limits>
#include <vector>
#endif

namespace NitroMarkdown {

class MD4CParser {
public:
    MD4CParser();
    ~MD4CParser();
    std::shared_ptr<MarkdownNode> parse(const std::string& markdown, const ParserOptions& options);

#ifdef NITRO_MARKDOWN_TESTING
    std::shared_ptr<MarkdownNode> parseWithExtraFlagsForTest(
        const std::string& markdown,
        const ParserOptions& options,
        unsigned int extraFlags
    );
    std::shared_ptr<MarkdownNode> parseWithForcedFailureForTest(
        const std::string& markdown,
        const ParserOptions& options
    );
    static int enterBlockNullUserdataForTest();
    static int leaveBlockNullUserdataForTest();
    static int enterSpanNullUserdataForTest();
    static int leaveSpanNullUserdataForTest();
    static int textNullUserdataForTest();
    static std::string parseFailureMessageForTest(int result, const char* parserLog);
    bool lastParseTrackedOffsets = true;
#endif
    
private:
    class Impl;
    std::shared_ptr<MarkdownNode> parseWithFlags(
        const std::string& markdown,
        const ParserOptions& options,
        unsigned int extraFlags,
        bool forceCallbackFailure = false
    );
};

} // namespace NitroMarkdown
