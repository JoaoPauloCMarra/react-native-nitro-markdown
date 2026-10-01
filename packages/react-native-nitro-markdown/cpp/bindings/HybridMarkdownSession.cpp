#include "HybridMarkdownSession.hpp"

#include <algorithm>
#ifdef NITRO_MARKDOWN_TESTING
#include <atomic>
#endif
#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace margelo::nitro::Markdown {

namespace {

#ifdef NITRO_MARKDOWN_TESTING
std::atomic<size_t> utf8DecodeSteps{0};
#endif

size_t utf8SequenceLength(const unsigned char* bytes, size_t remaining) noexcept {
#ifdef NITRO_MARKDOWN_TESTING
    utf8DecodeSteps.fetch_add(1, std::memory_order_relaxed);
#endif
    if (remaining == 0) return 0;

    const unsigned char first = bytes[0];
    const auto isContinuation = [](unsigned char value) {
        return (value & 0xC0) == 0x80;
    };

    if (first <= 0x7F) return 1;
    if (first >= 0xC2 && first <= 0xDF && remaining >= 2 && isContinuation(bytes[1])) {
        return 2;
    }
    if (
        first >= 0xE0 && first <= 0xEF && remaining >= 3 &&
        isContinuation(bytes[1]) && isContinuation(bytes[2]) &&
        !(first == 0xE0 && bytes[1] < 0xA0) &&
        !(first == 0xED && bytes[1] >= 0xA0)
    ) {
        return 3;
    }
    if (
        first >= 0xF0 && first <= 0xF4 && remaining >= 4 &&
        isContinuation(bytes[1]) && isContinuation(bytes[2]) &&
        isContinuation(bytes[3]) && !(first == 0xF0 && bytes[1] < 0x90) &&
        !(first == 0xF4 && bytes[1] >= 0x90)
    ) {
        return 4;
    }
    return 1;
}

bool isIncompleteUtf8Prefix(const unsigned char* bytes, size_t remaining) noexcept {
    const unsigned char first = bytes[0];
    const auto isContinuation = [](unsigned char value) {
        return (value & 0xC0) == 0x80;
    };

    if (first >= 0xC2 && first <= 0xDF) return remaining < 2;
    if (first >= 0xE0 && first <= 0xEF) {
        if (remaining >= 3) return false;
        if (remaining == 1) return true;
        return isContinuation(bytes[1]) &&
            !(first == 0xE0 && bytes[1] < 0xA0) &&
            !(first == 0xED && bytes[1] >= 0xA0);
    }
    if (first >= 0xF0 && first <= 0xF4) {
        if (remaining >= 4) return false;
        if (remaining == 1) return true;
        if (
            !isContinuation(bytes[1]) ||
            (first == 0xF0 && bytes[1] < 0x90) ||
            (first == 0xF4 && bytes[1] >= 0x90)
        ) {
            return false;
        }
        return remaining == 2 || isContinuation(bytes[2]);
    }
    return false;
}

std::string numberString(double value) {
    if (std::isnan(value)) return "NaN";
    if (std::isinf(value)) return value < 0 ? "-Inf" : "Inf";
    return std::to_string(value);
}

} // namespace

HybridMarkdownSession::HybridMarkdownSession()
    : HybridObject(TAG), HybridMarkdownSessionSpec() {
    parser_ = std::make_unique<HybridMarkdownParser>();
}

HybridMarkdownSession::~HybridMarkdownSession() {
    dispose();
}

double HybridMarkdownSession::getHighlightPosition() {
    std::lock_guard<std::mutex> lock(mutex_);
    ensureActiveLocked();
    return highlightPosition_;
}

void HybridMarkdownSession::setHighlightPosition(double highlightPosition) {
    std::lock_guard<std::mutex> lock(mutex_);
    ensureActiveLocked();
    highlightPosition_ = highlightPosition;
}

double HybridMarkdownSession::append(const std::string& chunk) try {
    size_t from;
    size_t to;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        ensureActiveLocked();
        if (chunk.size() > kMaxBufferSize - buffer_.size()) {
            validateBufferSizeLocked(kMaxBufferSize + 1);
        }
        const size_t settledByteLength = buffer_.size() - unsettledTailBytes_;
        from = bufferUtf16Length_ - unsettledTailBytes_;
        buffer_.append(chunk);
        const Utf16Scan scan = scanUtf16(buffer_, settledByteLength);
        to = from + scan.units;
        bufferUtf16Length_ = to;
        unsettledTailBytes_ = scan.unsettledTailBytes;
        rangeUtf16Offset_ = from;
        rangeByteOffset_ = settledByteLength;
    }

    notifyListeners(snapshotListeners(), static_cast<double>(from), static_cast<double>(to));
    return static_cast<double>(to);
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownSessionOutOfMemory();
}

void HybridMarkdownSession::clear() try {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        ensureActiveLocked();
        buffer_.clear();
        bufferUtf16Length_ = 0;
        unsettledTailBytes_ = 0;
        rangeUtf16Offset_ = 0;
        rangeByteOffset_ = 0;
        highlightPosition_ = 0.0;
    }

    notifyListeners(snapshotListeners(), 0.0, 0.0);
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownSessionOutOfMemory();
}

std::string HybridMarkdownSession::getAllText() try {
    std::lock_guard<std::mutex> lock(mutex_);
    ensureActiveLocked();
    return buffer_;
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownSessionOutOfMemory();
}

double HybridMarkdownSession::getLength() {
    std::lock_guard<std::mutex> lock(mutex_);
    ensureActiveLocked();
    return static_cast<double>(bufferUtf16Length_);
}

std::string HybridMarkdownSession::getTextRange(double from, double to) try {
    if (
        !std::isfinite(from) || !std::isfinite(to) || from < 0.0 || to < 0.0 ||
        from > to
    ) {
        return "";
    }

    std::lock_guard<std::mutex> lock(mutex_);
    ensureActiveLocked();
    const auto [start, end] = validateAndClampRange(from, to, bufferUtf16Length_);
    const size_t startByte = start >= rangeUtf16Offset_
        ? byteOffsetForUtf16(buffer_, start, rangeByteOffset_, rangeUtf16Offset_)
        : byteOffsetForUtf16(buffer_, start);
    const size_t endByte = byteOffsetForUtf16(buffer_, end, startByte, start);
    rangeUtf16Offset_ = start;
    rangeByteOffset_ = startByte;
    return buffer_.substr(startByte, endByte - startByte);
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownSessionOutOfMemory();
}

std::string HybridMarkdownSession::parse() {
    std::lock_guard<std::mutex> lock(mutex_);
    ensureActiveLocked();
    return parser_->parse(buffer_);
}

std::string HybridMarkdownSession::parseWithOptions(const ParserOptions& options) {
    std::lock_guard<std::mutex> lock(mutex_);
    ensureActiveLocked();
    return parser_->parseWithOptions(buffer_, options);
}

std::function<void()> HybridMarkdownSession::addListener(
    const std::function<void(double, double)>& listener
) try {
    size_t listenerId;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        ensureActiveLocked();
        listenerId = nextListenerId_++;
        listeners_.push_back({listenerId, listener});
    }

    std::weak_ptr<HybridObject> weakSelf = weak_from_this();
    return [weakSelf, listenerId]() {
        auto self = std::dynamic_pointer_cast<HybridMarkdownSession>(weakSelf.lock());
        if (!self) return;

        std::lock_guard<std::mutex> lock(self->mutex_);
        self->listeners_.erase(
            std::remove_if(
                self->listeners_.begin(),
                self->listeners_.end(),
                [listenerId](const Listener& listener) {
                    return listener.id == listenerId;
                }
            ),
            self->listeners_.end()
        );
    };
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownSessionOutOfMemory();
}

void HybridMarkdownSession::reset(const std::string& text) try {
    const Utf16Scan scan = scanUtf16(text, 0);
    const size_t newLength = scan.units;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        ensureActiveLocked();
        validateBufferSizeLocked(text.size());
        buffer_ = text;
        bufferUtf16Length_ = newLength;
        unsettledTailBytes_ = scan.unsettledTailBytes;
        rangeUtf16Offset_ = 0;
        rangeByteOffset_ = 0;
        highlightPosition_ = 0.0;
    }

    notifyListeners(snapshotListeners(), 0.0, static_cast<double>(newLength));
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownSessionOutOfMemory();
}

double HybridMarkdownSession::replace(
    double from,
    double to,
    const std::string& text
) try {
    size_t start;
    size_t end;
    size_t newLength;
    size_t insertedLength;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        ensureActiveLocked();
        const auto range = validateAndClampRange(from, to, bufferUtf16Length_);
        start = range.first;
        end = range.second;
        const size_t startByte = byteOffsetForUtf16(buffer_, start);
        const size_t endByte = byteOffsetForUtf16(buffer_, end, startByte, start);
        const size_t retainedBytes = buffer_.size() - (endByte - startByte);
        if (text.size() > kMaxBufferSize - retainedBytes) {
            validateBufferSizeLocked(kMaxBufferSize + 1);
        }
        buffer_.replace(startByte, endByte - startByte, text);
        const Utf16Scan scan = scanUtf16(buffer_, 0);
        newLength = scan.units;
        insertedLength = std::min(utf16Length(text), newLength - std::min(start, newLength));
        bufferUtf16Length_ = newLength;
        unsettledTailBytes_ = scan.unsettledTailBytes;
        rangeUtf16Offset_ = start;
        rangeByteOffset_ = startByte;
    }

    notifyListeners(
        snapshotListeners(),
        static_cast<double>(start),
        static_cast<double>(start + insertedLength)
    );
    return static_cast<double>(newLength);
} catch (const std::bad_alloc&) {
    throw ::NitroMarkdown::MarkdownSessionOutOfMemory();
}

void HybridMarkdownSession::dispose() {
    std::lock_guard<std::mutex> lock(mutex_);
    disposed_ = true;
    std::vector<Listener>().swap(listeners_);
    std::string().swap(buffer_);
    bufferUtf16Length_ = 0;
    unsettledTailBytes_ = 0;
    rangeUtf16Offset_ = 0;
    rangeByteOffset_ = 0;
    parser_.reset();
    highlightPosition_ = 0.0;
}

size_t HybridMarkdownSession::getExternalMemorySize() noexcept {
    std::lock_guard<std::mutex> lock(mutex_);
    const size_t inlineBufferCapacity = std::string().capacity();
    const size_t retainedBufferCapacity =
        buffer_.capacity() > inlineBufferCapacity ? buffer_.capacity() : 0;
    const size_t listenerCapacity = listeners_.capacity();
    constexpr size_t listenerBytes = sizeof(Listener);
    if (
        listenerCapacity >
        (std::numeric_limits<size_t>::max() - retainedBufferCapacity) / listenerBytes
    ) {
        return std::numeric_limits<size_t>::max();
    }
    return retainedBufferCapacity + listenerCapacity * listenerBytes;
}

#ifdef NITRO_MARKDOWN_TESTING
size_t HybridMarkdownSession::utf8DecodeStepsForTest() noexcept {
    return utf8DecodeSteps.load(std::memory_order_relaxed);
}

void HybridMarkdownSession::resetUtf8DecodeStepsForTest() noexcept {
    utf8DecodeSteps.store(0, std::memory_order_relaxed);
}
#endif

void HybridMarkdownSession::ensureActiveLocked() const {
    if (disposed_) {
        throw std::runtime_error("HybridMarkdownSession is destroyed");
    }
}

void HybridMarkdownSession::validateBufferSizeLocked(size_t size) const {
    if (size > kMaxBufferSize) {
        throw std::runtime_error(
            "Buffer size limit exceeded (max " + std::to_string(kMaxBufferSize) + " bytes)"
        );
    }
}

size_t HybridMarkdownSession::utf16Length(const std::string& text) noexcept {
    const auto* bytes = reinterpret_cast<const unsigned char*>(text.data());
    size_t byteIndex = 0;
    size_t length = 0;
    while (byteIndex < text.size()) {
        const size_t sequenceLength = utf8SequenceLength(bytes + byteIndex, text.size() - byteIndex);
        byteIndex += sequenceLength;
        length += sequenceLength == 4 ? 2 : 1;
    }
    return length;
}

HybridMarkdownSession::Utf16Scan HybridMarkdownSession::scanUtf16(
    const std::string& text,
    size_t fromByte
) noexcept {
    const auto* bytes = reinterpret_cast<const unsigned char*>(text.data());
    size_t byteIndex = fromByte;
    size_t units = 0;
    while (byteIndex < text.size()) {
        const size_t remaining = text.size() - byteIndex;
        const size_t sequenceLength = utf8SequenceLength(bytes + byteIndex, remaining);
        if (sequenceLength == 1 && isIncompleteUtf8Prefix(bytes + byteIndex, remaining)) {
            return {units + remaining, remaining};
        }
        byteIndex += sequenceLength;
        units += sequenceLength == 4 ? 2 : 1;
    }
    return {units, 0};
}

size_t HybridMarkdownSession::byteOffsetForUtf16(
    const std::string& text,
    size_t utf16Offset,
    size_t byteIndex,
    size_t currentOffset
) {
    const auto* bytes = reinterpret_cast<const unsigned char*>(text.data());
    while (byteIndex < text.size()) {
        const size_t sequenceLength = utf8SequenceLength(bytes + byteIndex, text.size() - byteIndex);
        const size_t sequenceUnits = sequenceLength == 4 ? 2 : 1;
        if (utf16Offset == currentOffset) return byteIndex;
        if (
            utf16Offset > currentOffset &&
            utf16Offset < currentOffset + sequenceUnits
        ) {
            if (sequenceUnits == 2) {
                throw std::runtime_error(
                    "Invalid range: UTF-16 index " + std::to_string(utf16Offset) +
                    " splits a surrogate pair"
                );
            }
            return byteIndex;
        }
        byteIndex += sequenceLength;
        currentOffset += sequenceUnits;
        if (utf16Offset == currentOffset) return byteIndex;
    }
    return text.size();
}

std::pair<size_t, size_t> HybridMarkdownSession::validateAndClampRange(
    double from,
    double to,
    size_t length
) {
    if (
        !std::isfinite(from) || !std::isfinite(to) || from < 0.0 || to < 0.0 ||
        from > to
    ) {
        throw std::runtime_error(
            "Invalid range: from=" + numberString(from) + " and to=" + numberString(to) +
            " must be finite, from must be >= 0, and to must be >= from"
        );
    }

    const double upperBound = static_cast<double>(length);
    const auto clamp = [upperBound, length](double value) {
        if (value <= 0.0) return static_cast<size_t>(0);
        if (value >= upperBound) return length;
        return static_cast<size_t>(value);
    };
    return {clamp(from), clamp(to)};
}

std::vector<std::function<void(double, double)>> HybridMarkdownSession::snapshotListeners() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::function<void(double, double)>> callbacks;
    callbacks.reserve(listeners_.size());
    for (const auto& listener : listeners_) {
        callbacks.push_back(listener.callback);
    }
    return callbacks;
}

void HybridMarkdownSession::notifyListeners(
    const std::vector<std::function<void(double, double)>>& listeners,
    double from,
    double to
) noexcept {
    for (const auto& listener : listeners) {
        try {
            listener(from, to);
        } catch (const std::exception& error) {
            std::cerr << "[NitroMarkdown] Listener callback threw an exception: "
                      << error.what() << std::endl;
        } catch (...) {
            std::cerr << "[NitroMarkdown] Listener callback threw an unknown exception" << std::endl;
        }
    }
}

} // namespace margelo::nitro::Markdown
