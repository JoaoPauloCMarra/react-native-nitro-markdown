#include "ParserOptionsMapping.hpp"

namespace margelo::nitro::Markdown {

InternalParserOptions toInternalParserOptions(const ParserOptions& options) {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    internalOpts.html = options.html.value_or(false);
    internalOpts.sourceOffsets = options.sourceOffsets.value_or(true);
    internalOpts.maxInputLength = resolveMaxInputBytesAs<size_t>(options.maxInputLength);
    return internalOpts;
}

} // namespace margelo::nitro::Markdown
