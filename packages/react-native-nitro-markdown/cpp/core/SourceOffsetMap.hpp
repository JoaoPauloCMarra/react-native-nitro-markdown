#pragma once

#include "MarkdownTypes.hpp"
#include <cstddef>
#include <cstdint>
#include <vector>

namespace NitroMarkdown {

// Maps UTF-8 byte offsets of a borrowed input buffer to UTF-16 code unit
// offsets. The input must outlive the map.
class SourceOffsetMap {
public:
    void reset(const char* text, std::size_t size, bool track);

    [[nodiscard]] bool tracked() const noexcept { return tracked_; }
    [[nodiscard]] OFF offsetOf(std::size_t byteOffset) const;
    [[nodiscard]] std::size_t byteIndexOf(const char* position) const noexcept;
    [[nodiscard]] std::size_t checkpointBytes() const noexcept;

private:
    const char* text_ = nullptr;
    std::size_t size_ = 0;
    std::vector<std::uint32_t> checkpoints_;
    mutable std::size_t cursorByte_ = 0;
    mutable std::size_t cursorUtf16_ = 0;
    bool tracked_ = false;
    bool identity_ = false;
};

} // namespace NitroMarkdown
