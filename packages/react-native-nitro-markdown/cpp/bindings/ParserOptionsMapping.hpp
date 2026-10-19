#pragma once

#include "ParserOptions.hpp"
#include "../core/NitroMD4CParser.hpp"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <optional>
#include <stdexcept>

namespace margelo::nitro::Markdown {

using InternalParserOptions = ::NitroMarkdown::ParserOptions;

// Converts the optional JS-side UTF-8 byte maxInputLength to the native size
// type before the parser applies its hard cap. Invalid numeric values are
// rejected before any narrowing conversion.
template <typename SizeT>
SizeT resolveMaxInputBytesAs(const std::optional<double>& maxInputLength) {
    if (!maxInputLength.has_value()) return 0;
    double value = maxInputLength.value();
    if (!std::isfinite(value) || value < 0 || std::floor(value) != value) {
        throw std::runtime_error(
            "maxInputLength must be a finite non-negative integer in bytes"
        );
    }
    if (value == 0) return 0;
    if (value >= 18446744073709551616.0) {
        throw std::runtime_error("maxInputLength cannot be represented as a native size");
    }
    const uint64_t wide = static_cast<uint64_t>(value);
    const uint64_t maxSize = static_cast<uint64_t>(std::numeric_limits<SizeT>::max());
    return static_cast<SizeT>(std::min(wide, maxSize));
}

InternalParserOptions toInternalParserOptions(const ParserOptions& options);

} // namespace margelo::nitro::Markdown
