#include "HybridMarkdownSession.hpp"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace margelo::nitro::Markdown {

namespace {

size_t utf8SequenceLength(const unsigned char* bytes, size_t remaining) noexcept {
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

std::string numberString(double value) {
    if (std::isnan(value)) return "NaN";
    if (std::isinf(value)) return value < 0 ? "-Inf" : "Inf";
    return std::to_string(value);
}

} // namespace

HybridMarkdownSession::HybridMarkdownSession()
    : HybridObject(TAG), HybridMarkdownSessionSpec() {}

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

double HybridMarkdownSession::append(const std::string& chunk) {
    size_t from;
    size_t to;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        ensureActiveLocked();
        from = utf16Length(buffer_);
        validateBufferSizeLocked(from + utf16Length(chunk));
        buffer_.append(chunk);
        to = utf16Length(buffer_);
    }

    notifyListeners(snapshotListeners(), static_cast<double>(from), static_cast<double>(to));
    return static_cast<double>(to);
}

void HybridMarkdownSession::clear() {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        ensureActiveLocked();
        buffer_.clear();
        highlightPosition_ = 0.0;
    }

    notifyListeners(snapshotListeners(), 0.0, 0.0);
}

std::string HybridMarkdownSession::getAllText() {
    std::lock_guard<std::mutex> lock(mutex_);
    ensureActiveLocked();
    return buffer_;
}

double HybridMarkdownSession::getLength() {
    std::lock_guard<std::mutex> lock(mutex_);
    ensureActiveLocked();
    return static_cast<double>(utf16Length(buffer_));
}

std::string HybridMarkdownSession::getTextRange(double from, double to) {
    if (
        !std::isfinite(from) || !std::isfinite(to) || from < 0.0 || to < 0.0 ||
        from > to
    ) {
        return "";
    }

    std::lock_guard<std::mutex> lock(mutex_);
    ensureActiveLocked();
    const auto [start, end] = validateAndClampRange(from, to, utf16Length(buffer_));
    const size_t startByte = byteOffsetForUtf16(buffer_, start);
    const size_t endByte = byteOffsetForUtf16(buffer_, end);
    return buffer_.substr(startByte, endByte - startByte);
}

std::function<void()> HybridMarkdownSession::addListener(
    const std::function<void(double, double)>& listener
) {
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
}

void HybridMarkdownSession::reset(const std::string& text) {
    const size_t newLength = utf16Length(text);
    {
        std::lock_guard<std::mutex> lock(mutex_);
        ensureActiveLocked();
        validateBufferSizeLocked(newLength);
        buffer_ = text;
        highlightPosition_ = 0.0;
    }

    notifyListeners(snapshotListeners(), 0.0, static_cast<double>(newLength));
}

double HybridMarkdownSession::replace(
    double from,
    double to,
    const std::string& text
) {
    size_t start;
    size_t end;
    size_t newLength;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        ensureActiveLocked();
        const auto range = validateAndClampRange(from, to, utf16Length(buffer_));
        start = range.first;
        end = range.second;
        const size_t insertedLength = utf16Length(text);
        const size_t oldLength = utf16Length(buffer_);
        newLength = oldLength - (end - start) + insertedLength;
        validateBufferSizeLocked(newLength);

        const size_t startByte = byteOffsetForUtf16(buffer_, start);
        const size_t endByte = byteOffsetForUtf16(buffer_, end);
        buffer_.replace(startByte, endByte - startByte, text);
    }

    notifyListeners(
        snapshotListeners(),
        static_cast<double>(start),
        static_cast<double>(start + utf16Length(text))
    );
    return static_cast<double>(newLength);
}

void HybridMarkdownSession::dispose() {
    std::lock_guard<std::mutex> lock(mutex_);
    disposed_ = true;
    std::vector<Listener>().swap(listeners_);
    std::string().swap(buffer_);
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

void HybridMarkdownSession::ensureActiveLocked() const {
    if (disposed_) {
        throw std::runtime_error("HybridMarkdownSession is destroyed");
    }
}

void HybridMarkdownSession::validateBufferSizeLocked(size_t size) const {
    if (size > kMaxBufferSize) {
        throw std::runtime_error(
            "Buffer size limit exceeded (max " + std::to_string(kMaxBufferSize) + " chars)"
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

size_t HybridMarkdownSession::byteOffsetForUtf16(
    const std::string& text,
    size_t utf16Offset
) {
    const auto* bytes = reinterpret_cast<const unsigned char*>(text.data());
    size_t byteIndex = 0;
    size_t currentOffset = 0;
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
