#include "SourceOffsetMap.hpp"

#include <algorithm>
#include <limits>

namespace NitroMarkdown {

namespace {

size_t utf8SequenceLength(
    const unsigned char* bytes,
    size_t remaining
) noexcept {
    const unsigned char first = bytes[0];
    const auto isContinuation = [](unsigned char value) {
        return (value & 0xC0) == 0x80;
    };

    if (first <= 0x7F) return 1;
    if (
        first >= 0xC2 &&
        first <= 0xDF &&
        remaining >= 2 &&
        isContinuation(bytes[1])
    ) {
        return 2;
    }
    if (
        first >= 0xE0 &&
        first <= 0xEF &&
        remaining >= 3 &&
        isContinuation(bytes[1]) &&
        isContinuation(bytes[2]) &&
        !(first == 0xE0 && bytes[1] < 0xA0) &&
        !(first == 0xED && bytes[1] >= 0xA0)
    ) {
        return 3;
    }
    if (
        first >= 0xF0 &&
        first <= 0xF4 &&
        remaining >= 4 &&
        isContinuation(bytes[1]) &&
        isContinuation(bytes[2]) &&
        isContinuation(bytes[3]) &&
        !(first == 0xF0 && bytes[1] < 0x90) &&
        !(first == 0xF4 && bytes[1] >= 0x90)
    ) {
        return 4;
    }
    return 1;
}

constexpr size_t kOffsetCheckpointStride = 64;
constexpr uint32_t kOffsetCheckpointBackShift = 28;
constexpr uint32_t kOffsetCheckpointUtf16Mask =
    (uint32_t{1} << kOffsetCheckpointBackShift) - 1;

static_assert(
    kMaxInputBytes <= kOffsetCheckpointUtf16Mask,
    "UTF-16 offset checkpoints store offsets in 28 bits"
);

std::vector<uint32_t> createUtf16OffsetCheckpoints(
    const char* text,
    size_t size
) {
    const auto* bytes = reinterpret_cast<const unsigned char*>(text);
    size_t firstHighByte = 0;
    while (firstHighByte < size && bytes[firstHighByte] < 0x80) firstHighByte++;
    if (firstHighByte == size) return {};

    std::vector<uint32_t> checkpoints;
    checkpoints.reserve(size / kOffsetCheckpointStride + 1);
    size_t byteIndex = 0;
    size_t utf16Index = 0;
    size_t nextCheckpoint = 0;
    while (byteIndex < size) {
        const size_t sequenceLength =
            utf8SequenceLength(bytes + byteIndex, size - byteIndex);
        const size_t sequenceEnd = byteIndex + sequenceLength;
        while (nextCheckpoint < sequenceEnd) {
            checkpoints.push_back(
                static_cast<uint32_t>(utf16Index) |
                (static_cast<uint32_t>(nextCheckpoint - byteIndex)
                    << kOffsetCheckpointBackShift)
            );
            nextCheckpoint += kOffsetCheckpointStride;
        }
        utf16Index += sequenceLength == 4 ? 2 : 1;
        byteIndex = sequenceEnd;
    }
    if (utf16Index == size) return {};
    return checkpoints;
}

} // namespace

void SourceOffsetMap::reset(const char* text, std::size_t size, bool track) {
    text_ = text;
    size_ = size;
    checkpoints_.clear();
    cursorByte_ = 0;
    cursorUtf16_ = 0;
    tracked_ = track;
    identity_ = false;
    if (!track) return;

    checkpoints_ = createUtf16OffsetCheckpoints(text, size);
    identity_ = checkpoints_.empty();
}

OFF SourceOffsetMap::offsetOf(std::size_t byteOffset) const {
    const std::size_t index = byteOffset > size_ ? size_ : byteOffset;
    if (!tracked_) return 0;
    if (identity_) return static_cast<OFF>(index);

    std::size_t byteIndex = cursorByte_;
    std::size_t utf16Index = cursorUtf16_;
    if (index < byteIndex || index - byteIndex >= kOffsetCheckpointStride) {
        const std::size_t checkpoint = std::min(
            index / kOffsetCheckpointStride,
            checkpoints_.size() - 1
        );
        const uint32_t packed = checkpoints_[checkpoint];
        byteIndex = checkpoint * kOffsetCheckpointStride -
            (packed >> kOffsetCheckpointBackShift);
        utf16Index = packed & kOffsetCheckpointUtf16Mask;
    }

    const auto* bytes = reinterpret_cast<const unsigned char*>(text_);
    while (byteIndex < size_) {
        const std::size_t sequenceLength =
            utf8SequenceLength(bytes + byteIndex, size_ - byteIndex);
        if (index < byteIndex + sequenceLength) break;
        byteIndex += sequenceLength;
        utf16Index += sequenceLength == 4 ? 2 : 1;
    }
    cursorByte_ = byteIndex;
    cursorUtf16_ = utf16Index;
    return static_cast<OFF>(utf16Index);
}

// md4c callbacks receive pointers into the input buffer, so the subtraction is
// valid while the input is stable. Positions outside the buffer map to 0.
std::size_t SourceOffsetMap::byteIndexOf(const char* position) const noexcept {
    if (position < text_) return 0;
    const std::ptrdiff_t diff = position - text_;
    if (diff < 0 || static_cast<std::size_t>(diff) > size_) return 0;
    if (static_cast<std::size_t>(diff) > static_cast<std::size_t>(std::numeric_limits<MD_OFFSET>::max())) return 0;
    return static_cast<std::size_t>(diff);
}

std::size_t SourceOffsetMap::checkpointBytes() const noexcept {
    return checkpoints_.capacity() * sizeof(uint32_t);
}

} // namespace NitroMarkdown
