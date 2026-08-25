#include "HybridMarkdownParser.hpp"
#include "../core/flatten.hpp"
#include <algorithm>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <list>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <limits>
#include <unordered_map>
#include <utility>
#include <vector>

namespace margelo::nitro::Markdown {

namespace {

static constexpr size_t kMaxJsonSize = 64 * 1024 * 1024;

[[noreturn]] void throwJsonSizeError(size_t size) {
    throw std::runtime_error(
        "Markdown JSON output size " + std::to_string(size) +
        " bytes exceeds the maximum of " + std::to_string(kMaxJsonSize) +
        " bytes"
    );
}

template <bool EnforceLimit>
class JsonWriter final {
public:
    void reserve(size_t capacity) {
        output_.reserve(std::min(capacity, kMaxJsonSize));
    }

    void append(std::string_view value) {
        if constexpr (EnforceLimit) {
            const size_t currentSize = output_.size();
            const size_t remaining = kMaxJsonSize - currentSize;
            if (value.size() > remaining) {
                if (value.size() > std::numeric_limits<size_t>::max() - currentSize) {
                    throwJsonSizeError(kMaxJsonSize + 1);
                }
                throwJsonSizeError(currentSize + value.size());
            }
        }

        output_.append(value.data(), value.size());
    }

    void push(char value) {
        if constexpr (EnforceLimit) {
            if (output_.size() == kMaxJsonSize) {
                throwJsonSizeError(kMaxJsonSize + 1);
            }
        }

        output_.push_back(value);
    }

    [[nodiscard]] size_t size() const noexcept {
        return output_.size();
    }

    [[nodiscard]] std::string fragment(size_t start) const {
        return output_.substr(start, output_.size() - start);
    }

    [[nodiscard]] std::string take() && {
        return std::move(output_);
    }

private:
    std::string output_;
};

using BoundedJsonWriter = JsonWriter<true>;
using FastJsonWriter = JsonWriter<false>;

template <typename Writer, typename T>
inline void appendInteger(Writer& output, T value) {
    char buffer[std::numeric_limits<T>::digits10 + 3];
    const auto result = std::to_chars(buffer, buffer + sizeof(buffer), value);
    if (result.ec != std::errc()) {
        throw std::runtime_error("Markdown JSON integer serialization failed");
    }
    output.append(std::string_view(buffer, static_cast<size_t>(result.ptr - buffer)));
}

template <typename Writer>
inline void appendEscapedJsonString(Writer& output, std::string_view input) {
    static constexpr char kHex[] = "0123456789abcdef";
    size_t safeStart = 0;

    for (size_t index = 0; index < input.size(); index++) {
        const unsigned char c = static_cast<unsigned char>(input[index]);
        switch (c) {
            case '"':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\\"");
                safeStart = index + 1;
                break;
            case '\\':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\\\");
                safeStart = index + 1;
                break;
            case '\b':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\b");
                safeStart = index + 1;
                break;
            case '\f':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\f");
                safeStart = index + 1;
                break;
            case '\n':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\n");
                safeStart = index + 1;
                break;
            case '\r':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\r");
                safeStart = index + 1;
                break;
            case '\t':
                if (index > safeStart) {
                    output.append(std::string_view(input.data() + safeStart, index - safeStart));
                }
                output.append("\\t");
                safeStart = index + 1;
                break;
            default: {
                if (c <= 0x1f) {
                    if (index > safeStart) {
                        output.append(std::string_view(input.data() + safeStart, index - safeStart));
                    }
                    output.append("\\u00");
                    output.push(kHex[(c >> 4) & 0x0f]);
                    output.push(kHex[c & 0x0f]);
                    safeStart = index + 1;
                }
                break;
            }
        }
    }

    if (safeStart < input.size()) {
        output.append(std::string_view(input.data() + safeStart, input.size() - safeStart));
    }
}

template <typename Writer>
inline void appendStringField(Writer& output, const char* key, std::string_view value) {
    output.push(',');
    output.push('"');
    output.append(key);
    output.append("\":\"");
    appendEscapedJsonString(output, value);
    output.push('"');
}

template <typename Writer>
inline void appendIntField(Writer& output, const char* key, int value) {
    output.push(',');
    output.push('"');
    output.append(key);
    output.append("\":");
    appendInteger(output, value);
}

template <typename Writer>
inline void appendOffsetField(Writer& output, const char* key, unsigned int value) {
    output.push(',');
    output.push('"');
    output.append(key);
    output.append("\":");
    appendInteger(output, value);
}

template <typename Writer>
inline void appendBoolField(Writer& output, const char* key, bool value) {
    output.push(',');
    output.push('"');
    output.append(key);
    output.append("\":");
    output.append(value ? "true" : "false");
}

// Converts the optional JS-side UTF-8 byte maxInputLength to the native size
// type before the parser applies its hard cap. Invalid numeric values are
// rejected before any narrowing conversion.
size_t resolveMaxInputBytes(const std::optional<double>& maxInputLength) {
    if (!maxInputLength.has_value()) return 0;
    double value = maxInputLength.value();
    if (!std::isfinite(value) || value < 0 || std::floor(value) != value) {
        throw std::runtime_error(
            "maxInputLength must be a finite non-negative integer in bytes"
        );
    }
    if (value == 0) return 0;
    const long double maxSize = static_cast<long double>(std::numeric_limits<size_t>::max());
    if (static_cast<long double>(value) > maxSize) {
        throw std::runtime_error("maxInputLength cannot be represented as a native size");
    }
    return static_cast<size_t>(value);
}

// A cached fragment is keyed by its absolute UTF-16 range, parser flags, and
// node type. Documents
// that may contain link reference definitions bypass the cache entirely
// because a definition anywhere can change how a link inside an unchanged
// block resolves.
struct BlockFragmentKey {
    uint32_t beg = 0;
    uint32_t end = 0;
    uint16_t nodeType = 0;
    uint8_t parserFlags = 0;

    bool operator==(const BlockFragmentKey& other) const noexcept {
        return beg == other.beg &&
            end == other.end &&
            nodeType == other.nodeType &&
            parserFlags == other.parserFlags;
    }

    struct Hash {
        size_t operator()(const BlockFragmentKey& key) const noexcept {
            uint64_t hash = 0xcbf29ce484222325ULL;
            hash ^= static_cast<uint64_t>(key.beg) * 0x9e3779b97f4a7c15ULL;
            hash ^= static_cast<uint64_t>(key.end) * 0xc2b2ae3d27d4eb4fULL;
            hash ^= static_cast<uint64_t>(key.nodeType) << 48;
            hash ^= static_cast<uint64_t>(key.parserFlags) << 56;
            return static_cast<size_t>(hash);
        }
    };
};

bool mayContainReferenceDefinitions(const std::string& source) noexcept {
    const size_t size = source.size();
    size_t index = 0;
    while (index < size) {
        const size_t lineStart = index;
        while (index < size && source[index] != '\n') index++;
        const size_t lineEnd = index;

        size_t position = lineStart;
        size_t leadingSpaces = 0;
        while (position < lineEnd && source[position] == ' ' && leadingSpaces < 3) {
            position++;
            leadingSpaces++;
        }
        if (position < lineEnd && source[position] == '[') {
            for (size_t scan = position + 1; scan + 1 < lineEnd; scan++) {
                if (source[scan] == ']' && source[scan + 1] == ':') return true;
            }
        }
        if (index < size) index++;
    }
    return false;
}

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

uint32_t utf16LengthForCache(const std::string& source) noexcept {
    const auto* bytes = reinterpret_cast<const unsigned char*>(source.data());
    size_t byteIndex = 0;
    uint32_t length = 0;
    while (byteIndex < source.size()) {
        const size_t sequenceLength = utf8SequenceLength(
            bytes + byteIndex,
            source.size() - byteIndex
        );
        byteIndex += sequenceLength;
        length += sequenceLength == 4 ? 2 : 1;
    }
    return length;
}

// Blocks that end at the end of the input are skipped: their extent may
// depend on EOF termination rather than on the slice itself. The cache
// validates the complete previous source prefix before these keys are used.
std::optional<BlockFragmentKey> makeFragmentKey(
    const InternalMarkdownNode* node,
    uint32_t utf16Length,
    uint8_t parserFlags
) {
    if (node == nullptr) return std::nullopt;
    if (node->end <= node->beg) return std::nullopt;
    if (node->end >= utf16Length) return std::nullopt;

    BlockFragmentKey key;
    key.beg = node->beg;
    key.end = node->end;
    key.nodeType = static_cast<uint16_t>(static_cast<int>(node->type));
    key.parserFlags = parserFlags;
    return key;
}

uint64_t mixCacheHashByte(uint64_t hash, unsigned char value) noexcept {
    hash ^= value;
    return hash * 0x100000001b3ULL;
}

uint8_t parserFlagBits(const InternalParserOptions& options) noexcept {
    uint8_t bits = 0;
    if (options.gfm) bits |= 0x01;
    if (options.math) bits |= 0x02;
    if (options.html) bits |= 0x04;
    if (options.sourceOffsets) bits |= 0x08;
    return bits;
}

} // namespace

class MarkdownSerializationCache {
public:
    MarkdownSerializationCache() = default;
    ~MarkdownSerializationCache() = default;
    MarkdownSerializationCache(const MarkdownSerializationCache&) = delete;
    MarkdownSerializationCache& operator=(const MarkdownSerializationCache&) = delete;

    bool canReuseFor(std::string_view source, uint8_t parserFlags) const {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!hasPreviousSource_ || source.size() <= previousSourceSize_) return false;
        if (previousParserFlags_ != parserFlags) return false;
        return hashSource(source.substr(0, previousSourceSize_)) == previousSourceHash_;
    }

    void rememberSource(std::string_view source, uint8_t parserFlags) {
        std::lock_guard<std::mutex> lock(mutex_);
        const bool preservesPrefix = hasPreviousSource_ &&
            source.size() > previousSourceSize_ &&
            previousParserFlags_ == parserFlags &&
            hashSource(source.substr(0, previousSourceSize_)) == previousSourceHash_;
        if (!preservesPrefix) {
            lru_.clear();
            index_.clear();
            totalBytes_ = 0;
        }
        hasPreviousSource_ = true;
        previousSourceSize_ = source.size();
        previousSourceHash_ = hashSource(source);
        previousParserFlags_ = parserFlags;
    }

    std::shared_ptr<const std::string> get(const BlockFragmentKey& key) {
        std::lock_guard<std::mutex> lock(mutex_);
        const auto entry = index_.find(key);
        if (entry == index_.end()) return nullptr;
        lru_.splice(lru_.begin(), lru_, entry->second);
        return entry->second->fragment;
    }

    void put(const BlockFragmentKey& key, std::string&& fragment) {
        if (fragment.empty() || fragment.size() > kMaxCacheTotalBytes) return;

        auto stored = std::make_shared<const std::string>(std::move(fragment));
        std::lock_guard<std::mutex> lock(mutex_);

        const auto existing = index_.find(key);
        if (existing != index_.end()) {
            totalBytes_ -= existing->second->fragment->size();
            lru_.erase(existing->second);
            index_.erase(existing);
        }

        lru_.push_front(Entry{key, stored});
        index_.emplace(key, lru_.begin());
        totalBytes_ += stored->size();

        while (
            (lru_.size() > kMaxCacheEntries || totalBytes_ > kMaxCacheTotalBytes) &&
            !lru_.empty()
        ) {
            totalBytes_ -= lru_.back().fragment->size();
            index_.erase(lru_.back().key);
            lru_.pop_back();
        }
    }

private:
    struct Entry {
        BlockFragmentKey key;
        std::shared_ptr<const std::string> fragment;
    };

    static constexpr size_t kMaxCacheEntries = 512;
    static constexpr size_t kMaxCacheTotalBytes = 4 * 1024 * 1024;

    static uint64_t hashSource(std::string_view source) noexcept {
        uint64_t hash = 0xcbf29ce484222325ULL;
        for (const unsigned char value : source) {
            hash = mixCacheHashByte(hash, value);
        }
        return hash;
    }

    mutable std::mutex mutex_;
    std::list<Entry> lru_;
    std::unordered_map<BlockFragmentKey, std::list<Entry>::iterator, BlockFragmentKey::Hash> index_;
    size_t totalBytes_ = 0;
    bool hasPreviousSource_ = false;
    size_t previousSourceSize_ = 0;
    uint64_t previousSourceHash_ = 0;
    uint8_t previousParserFlags_ = 0;
};

namespace {

void appendNodeJson(
    BoundedJsonWriter& output,
    const std::shared_ptr<InternalMarkdownNode>& root,
    const std::string& source,
    const InternalParserOptions& options,
    MarkdownSerializationCache& cache,
    bool useSerializationCache
) {
    struct Frame {
        const InternalMarkdownNode* node = nullptr;
        size_t nextChild = 0;
        bool opened = false;
        bool hasChildren = false;
        size_t outputMark = 0;
        std::optional<BlockFragmentKey> captureKey;
    };

    const bool includeOffsets = options.sourceOffsets;
    const uint8_t parserFlags = parserFlagBits(options);
    const bool cacheable = useSerializationCache &&
        includeOffsets &&
        !mayContainReferenceDefinitions(source);
    const uint32_t utf16Length = cacheable ? utf16LengthForCache(source) : 0;

    std::vector<Frame> frames;
    Frame rootFrame{};
    rootFrame.node = root.get();
    frames.push_back(std::move(rootFrame));
    size_t nodeCount = 0;
    size_t childSlotCount = 0;
    size_t workCount = 0;
    while (!frames.empty()) {
        auto& frame = frames.back();
        if (!frame.opened) {
            const auto& node = frame.node;
            if (!node) throw std::runtime_error("Markdown AST contains a null node");
            if (++nodeCount > ::NitroMarkdown::kMaxAstNodes ||
                ++workCount > ::NitroMarkdown::kMaxAstWork) {
                throw std::runtime_error(
                    "Markdown AST node/work budget exceeds the maximum of " +
                    std::to_string(::NitroMarkdown::kMaxAstWork)
                );
            }

            output.push('{');
            output.append("\"type\":\"");
            output.append(::NitroMarkdown::nodeTypeToStringView(node->type));
            output.push('"');

            if (includeOffsets) {
                appendOffsetField(output, "beg", node->beg);
                appendOffsetField(output, "end", node->end);
            }
            if (node->content.has_value()) appendStringField(output, "content", node->content.value());
            if (node->level.has_value()) appendIntField(output, "level", node->level.value());
            if (node->href.has_value()) appendStringField(output, "href", node->href.value());
            if (node->title.has_value()) appendStringField(output, "title", node->title.value());
            if (node->alt.has_value()) appendStringField(output, "alt", node->alt.value());
            if (node->language.has_value()) appendStringField(output, "language", node->language.value());
            if (node->ordered.has_value()) appendBoolField(output, "ordered", node->ordered.value());
            if (node->start.has_value()) appendIntField(output, "start", node->start.value());
            if (node->checked.has_value()) appendBoolField(output, "checked", node->checked.value());
            if (node->isHeader.has_value()) appendBoolField(output, "isHeader", node->isHeader.value());
            if (node->align.has_value()) {
                const std::string_view alignStr = ::NitroMarkdown::textAlignToStringView(node->align.value());
                if (!alignStr.empty()) appendStringField(output, "align", alignStr);
            }
            frame.hasChildren = !node->children.empty();
            if (frame.hasChildren) output.append(",\"children\":[");
            frame.opened = true;
        }

        if (frame.nextChild < frame.node->children.size()) {
            if (++childSlotCount > ::NitroMarkdown::kMaxAstChildSlots ||
                ++workCount > ::NitroMarkdown::kMaxAstWork) {
                throw std::runtime_error(
                    "Markdown AST child/work budget exceeds the maximum of " +
                    std::to_string(::NitroMarkdown::kMaxAstWork)
                );
            }
            if (frames.size() >= ::NitroMarkdown::kMaxAstDepth) {
                throw std::runtime_error(
                    "Markdown AST depth exceeds the maximum of " +
                    std::to_string(::NitroMarkdown::kMaxAstDepth)
                );
            }
            if (frame.nextChild > 0) output.push(',');
            const auto* child = frame.node->children[frame.nextChild++].get();

            if (frames.size() == 1) {
                std::optional<BlockFragmentKey> key;
                if (cacheable) {
                    key = makeFragmentKey(
                        child,
                        utf16Length,
                        parserFlags
                    );
                }
                if (key.has_value()) {
                    const auto cached = cache.get(key.value());
                    if (cached) {
                        output.append(*cached);
                        continue;
                    }
                }
                Frame childFrame;
                childFrame.node = child;
                childFrame.outputMark = output.size();
                childFrame.captureKey = std::move(key);
                frames.push_back(std::move(childFrame));
                continue;
            }

            Frame nestedFrame{};
            nestedFrame.node = child;
            frames.push_back(std::move(nestedFrame));
            continue;
        }

        if (frame.hasChildren) output.push(']');
        output.push('}');
        if (frame.captureKey.has_value()) {
            cache.put(frame.captureKey.value(), output.fragment(frame.outputMark));
        }
        frames.pop_back();
    }
}

template <typename Writer>
void appendNodeJsonFast(
    Writer& output,
    const std::shared_ptr<InternalMarkdownNode>& node,
    bool includeOffsets
) {
    if (!node) throw std::runtime_error("Markdown AST contains a null node");

    output.push('{');
    output.append("\"type\":\"");
    output.append(::NitroMarkdown::nodeTypeToStringView(node->type));
    output.push('"');

    if (includeOffsets) {
        appendOffsetField(output, "beg", node->beg);
        appendOffsetField(output, "end", node->end);
    }
    if (node->content.has_value()) appendStringField(output, "content", node->content.value());
    if (node->level.has_value()) appendIntField(output, "level", node->level.value());
    if (node->href.has_value()) appendStringField(output, "href", node->href.value());
    if (node->title.has_value()) appendStringField(output, "title", node->title.value());
    if (node->alt.has_value()) appendStringField(output, "alt", node->alt.value());
    if (node->language.has_value()) appendStringField(output, "language", node->language.value());
    if (node->ordered.has_value()) appendBoolField(output, "ordered", node->ordered.value());
    if (node->start.has_value()) appendIntField(output, "start", node->start.value());
    if (node->checked.has_value()) appendBoolField(output, "checked", node->checked.value());
    if (node->isHeader.has_value()) appendBoolField(output, "isHeader", node->isHeader.value());
    if (node->align.has_value()) {
        const std::string_view alignStr = ::NitroMarkdown::textAlignToStringView(node->align.value());
        if (!alignStr.empty()) appendStringField(output, "align", alignStr);
    }

    if (!node->children.empty()) {
        output.append(",\"children\":[");
        for (size_t index = 0; index < node->children.size(); index++) {
            if (index > 0) output.push(',');
            appendNodeJsonFast(output, node->children[index], includeOffsets);
        }
        output.push(']');
    }

    output.push('}');
}

} // namespace

HybridMarkdownParser::HybridMarkdownParser()
    : HybridObject(TAG), HybridMarkdownParserSpec() {
    parser_ = std::make_unique<::NitroMarkdown::MD4CParser>();
    cache_ = std::make_unique<MarkdownSerializationCache>();
}

HybridMarkdownParser::~HybridMarkdownParser() = default;

std::string HybridMarkdownParser::parse(const std::string& text) {
    InternalParserOptions opts{.gfm = true, .math = true, .html = false};

    auto ast = parser_->parse(text, opts);
    return nodeToJson(ast, text, opts, false);
}

std::string HybridMarkdownParser::parseWithOptions(const std::string& text, const ParserOptions& options) {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    internalOpts.html = options.html.value_or(false);
    internalOpts.sourceOffsets = options.sourceOffsets.value_or(true);
    internalOpts.maxInputLength = resolveMaxInputBytes(options.maxInputLength);

    auto ast = parser_->parse(text, internalOpts);
    return nodeToJson(ast, text, internalOpts, false);
}

std::string HybridMarkdownParser::parseForStreaming(const std::string& text) {
    InternalParserOptions opts{.gfm = true, .math = true, .html = false};

    auto ast = parser_->parse(text, opts);
    return nodeToJson(ast, text, opts, true);
}

std::string HybridMarkdownParser::parseWithOptionsForStreaming(
    const std::string& text,
    const ParserOptions& options
) {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    internalOpts.html = options.html.value_or(false);
    internalOpts.sourceOffsets = options.sourceOffsets.value_or(true);
    internalOpts.maxInputLength = resolveMaxInputBytes(options.maxInputLength);

    auto ast = parser_->parse(text, internalOpts);
    return nodeToJson(ast, text, internalOpts, true);
}

std::string HybridMarkdownParser::extractPlainText(const std::string& text) {
    InternalParserOptions opts{.gfm = true, .math = true, .html = false};

    auto ast = parser_->parse(text, opts);
    return flattenNodeText(ast);
}

std::string HybridMarkdownParser::extractPlainTextWithOptions(const std::string& text, const ParserOptions& options) {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    internalOpts.html = options.html.value_or(false);
    internalOpts.sourceOffsets = options.sourceOffsets.value_or(true);
    internalOpts.maxInputLength = resolveMaxInputBytes(options.maxInputLength);

    auto ast = parser_->parse(text, internalOpts);
    return flattenNodeText(ast);
}

std::string HybridMarkdownParser::nodeToJson(
    const std::shared_ptr<InternalMarkdownNode>& node,
    const std::string& source,
    const InternalParserOptions& options,
    bool allowSerializationCache
) {
    const uint8_t parserFlags = parserFlagBits(options);
    const bool useSerializationCache = allowSerializationCache &&
        options.sourceOffsets &&
        cache_->canReuseFor(source, parserFlags);

    if (!allowSerializationCache || !useSerializationCache) {
        FastJsonWriter writer;
        const size_t reserveSize = source.size() > (kMaxJsonSize - 256) / 2
            ? kMaxJsonSize
            : std::max<size_t>(4096, source.size() * 2 + 256);
        writer.reserve(reserveSize);
        appendNodeJsonFast(writer, node, options.sourceOffsets);
        if (writer.size() > kMaxJsonSize) throwJsonSizeError(writer.size());
        if (allowSerializationCache && options.sourceOffsets) {
            cache_->rememberSource(source, parserFlags);
        }
        return std::move(writer).take();
    }

    BoundedJsonWriter writer;
    const size_t reserveSize = source.size() > (kMaxJsonSize - 256) / 2
        ? kMaxJsonSize
        : std::max<size_t>(4096, source.size() * 2 + 256);
    writer.reserve(reserveSize);
    appendNodeJson(
        writer,
        node,
        source,
        options,
        *cache_,
        useSerializationCache
    );
    cache_->rememberSource(source, parserFlags);
    return std::move(writer).take();
}

} // namespace margelo::nitro::Markdown
