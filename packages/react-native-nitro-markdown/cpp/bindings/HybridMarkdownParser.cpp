#include "HybridMarkdownParser.hpp"
#include "../core/flatten.hpp"
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

class BoundedJsonWriter final {
public:
    void append(std::string_view value) {
        const size_t remaining = kMaxJsonSize - size_;
        if (value.size() > remaining) {
            if (value.size() > std::numeric_limits<size_t>::max() - size_) {
                throwJsonSizeError(kMaxJsonSize + 1);
            }
            throwJsonSizeError(size_ + value.size());
        }

        output_.append(value.data(), value.size());
        size_ += value.size();
    }

    void push(char value) {
        if (size_ == kMaxJsonSize) {
            throwJsonSizeError(kMaxJsonSize + 1);
        }

        output_.push_back(value);
        size_++;
    }

    [[nodiscard]] size_t size() const noexcept {
        return size_;
    }

    [[nodiscard]] std::string fragment(size_t start) const {
        return output_.substr(start, size_ - start);
    }

    [[nodiscard]] std::string take() && {
        return std::move(output_);
    }

private:
    std::string output_;
    size_t size_ = 0;
};

inline void appendEscapedJsonString(BoundedJsonWriter& output, const std::string& input) {
    static constexpr char kHex[] = "0123456789abcdef";

    for (unsigned char c : input) {
        switch (c) {
            case '"':
                output.append("\\\"");
                break;
            case '\\':
                output.append("\\\\");
                break;
            case '\b':
                output.append("\\b");
                break;
            case '\f':
                output.append("\\f");
                break;
            case '\n':
                output.append("\\n");
                break;
            case '\r':
                output.append("\\r");
                break;
            case '\t':
                output.append("\\t");
                break;
            default: {
                if (c <= 0x1f) {
                    output.append("\\u00");
                    output.push(kHex[(c >> 4) & 0x0f]);
                    output.push(kHex[c & 0x0f]);
                } else {
                    output.push(static_cast<char>(c));
                }
                break;
            }
        }
    }
}

inline void appendStringField(BoundedJsonWriter& output, const char* key, const std::string& value) {
    output.push(',');
    output.push('"');
    output.append(key);
    output.append("\":\"");
    appendEscapedJsonString(output, value);
    output.push('"');
}

inline void appendIntField(BoundedJsonWriter& output, const char* key, int value) {
    output.push(',');
    output.push('"');
    output.append(key);
    output.append("\":");
    output.append(std::to_string(value));
}

inline void appendOffsetField(BoundedJsonWriter& output, const char* key, unsigned int value) {
    output.push(',');
    output.push('"');
    output.append(key);
    output.append("\":");
    output.append(std::to_string(value));
}

inline void appendBoolField(BoundedJsonWriter& output, const char* key, bool value) {
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

// A cached fragment is keyed by the exact source bytes of the block, its
// absolute UTF-16 start offset, the parser flags, and the node type. Documents
// that may contain link reference definitions bypass the cache entirely
// because a definition anywhere can change how a link inside an unchanged
// block resolves.
struct BlockFragmentKey {
    uint64_t sliceHash = 0;
    uint32_t beg = 0;
    uint32_t end = 0;
    uint16_t nodeType = 0;
    uint8_t parserFlags = 0;

    bool operator==(const BlockFragmentKey& other) const noexcept {
        return sliceHash == other.sliceHash &&
            beg == other.beg &&
            end == other.end &&
            nodeType == other.nodeType &&
            parserFlags == other.parserFlags;
    }

    struct Hash {
        size_t operator()(const BlockFragmentKey& key) const noexcept {
            uint64_t hash = key.sliceHash;
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

// Maps the parser's UTF-16 node offsets back to byte offsets so cache keys
// can hash the exact source slice of a block. ASCII inputs are identity.
class SourceUtf16ByteIndex {
public:
    explicit SourceUtf16ByteIndex(const std::string& source) : sourceSize_(source.size()) {
        const auto* bytes = reinterpret_cast<const unsigned char*>(source.data());
        const size_t size = source.size();

        size_t asciiEnd = 0;
        while (asciiEnd < size && bytes[asciiEnd] < 0x80) asciiEnd++;
        if (asciiEnd == size) {
            asciiOnly_ = true;
            utf16Length_ = static_cast<uint32_t>(size);
            return;
        }

        uint32_t utf16Length = 0;
        size_t byteIndex = 0;
        while (byteIndex < size) {
            const size_t sequenceLength = utf8SequenceLength(bytes + byteIndex, size - byteIndex);
            if (sequenceLength == 0) break;
            byteIndex += sequenceLength;
            utf16Length += sequenceLength == 4 ? 2 : 1;
        }

        utf16ToByte_.assign(static_cast<size_t>(utf16Length) + 1, 0);
        uint32_t utf16Index = 0;
        byteIndex = 0;
        while (byteIndex < size) {
            const size_t sequenceLength = utf8SequenceLength(bytes + byteIndex, size - byteIndex);
            if (sequenceLength == 0) break;
            const uint32_t units = sequenceLength == 4 ? 2 : 1;
            for (uint32_t unit = 0; unit < units && utf16Index <= utf16Length; unit++) {
                utf16ToByte_[utf16Index] = static_cast<uint32_t>(byteIndex);
                utf16Index++;
            }
            byteIndex += sequenceLength;
        }
        utf16ToByte_[utf16Length] = static_cast<uint32_t>(size);
        utf16Length_ = utf16Length;
    }

    [[nodiscard]] uint32_t utf16Length() const noexcept {
        return utf16Length_;
    }

    [[nodiscard]] size_t byteOffset(uint32_t utf16Offset) const noexcept {
        if (asciiOnly_) {
            return utf16Offset > sourceSize_ ? sourceSize_ : static_cast<size_t>(utf16Offset);
        }
        if (utf16Offset >= utf16ToByte_.size()) return sourceSize_;
        return utf16ToByte_[utf16Offset];
    }

private:
    std::vector<uint32_t> utf16ToByte_;
    size_t sourceSize_ = 0;
    uint32_t utf16Length_ = 0;
    bool asciiOnly_ = false;
};

uint64_t mixCacheHashByte(uint64_t hash, unsigned char value) noexcept {
    hash ^= value;
    return hash * 0x100000001b3ULL;
}

// Blocks that end at the end of the input are skipped: their extent may
// depend on EOF termination rather than on the slice itself.
std::optional<BlockFragmentKey> makeFragmentKey(
    const std::shared_ptr<InternalMarkdownNode>& node,
    const std::string& source,
    const SourceUtf16ByteIndex& byteIndex,
    uint32_t utf16Length,
    uint8_t parserFlags
) {
    if (node->end <= node->beg) return std::nullopt;
    if (node->end >= utf16Length) return std::nullopt;

    const size_t byteBeg = byteIndex.byteOffset(node->beg);
    const size_t byteEnd = byteIndex.byteOffset(node->end);
    if (byteEnd <= byteBeg || byteEnd > source.size()) return std::nullopt;

    const auto* bytes = reinterpret_cast<const unsigned char*>(source.data()) + byteBeg;
    uint64_t hash = 0xcbf29ce484222325ULL;
    for (size_t index = 0; index < byteEnd - byteBeg; index++) {
        hash = mixCacheHashByte(hash, bytes[index]);
    }

    BlockFragmentKey key;
    key.sliceHash = hash;
    key.beg = node->beg;
    key.end = node->end;
    key.nodeType = static_cast<uint16_t>(static_cast<int>(node->type));
    key.parserFlags = parserFlags;
    return key;
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

    std::mutex mutex_;
    std::list<Entry> lru_;
    std::unordered_map<BlockFragmentKey, std::list<Entry>::iterator, BlockFragmentKey::Hash> index_;
    size_t totalBytes_ = 0;
};

namespace {

void appendNodeJson(
    BoundedJsonWriter& output,
    const std::shared_ptr<InternalMarkdownNode>& root,
    const std::string& source,
    const InternalParserOptions& options,
    MarkdownSerializationCache& cache
) {
    struct Frame {
        std::shared_ptr<InternalMarkdownNode> node;
        size_t nextChild = 0;
        bool opened = false;
        bool hasChildren = false;
        size_t outputMark = 0;
        std::optional<BlockFragmentKey> captureKey;
    };

    const bool includeOffsets = options.sourceOffsets;
    const uint8_t parserFlags = parserFlagBits(options);
    const bool cacheable = includeOffsets && !mayContainReferenceDefinitions(source);
    const SourceUtf16ByteIndex byteIndex(source);
    const uint32_t utf16Length = byteIndex.utf16Length();

    std::vector<Frame> frames;
    frames.push_back({root});
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
            output.append(::NitroMarkdown::nodeTypeToString(node->type));
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
                const std::string alignStr = ::NitroMarkdown::textAlignToString(node->align.value());
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
            auto child = frame.node->children[frame.nextChild++];

            if (frames.size() == 1) {
                std::optional<BlockFragmentKey> key;
                if (cacheable) {
                    key = makeFragmentKey(child, source, byteIndex, utf16Length, parserFlags);
                }
                if (key.has_value()) {
                    const auto cached = cache.get(key.value());
                    if (cached) {
                        output.append(*cached);
                        continue;
                    }
                }
                Frame childFrame;
                childFrame.node = std::move(child);
                childFrame.outputMark = output.size();
                childFrame.captureKey = std::move(key);
                frames.push_back(std::move(childFrame));
                continue;
            }

            frames.push_back({std::move(child)});
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
    return nodeToJson(ast, text, opts);
}

std::string HybridMarkdownParser::parseWithOptions(const std::string& text, const ParserOptions& options) {
    InternalParserOptions internalOpts;
    internalOpts.gfm = options.gfm.value_or(true);
    internalOpts.math = options.math.value_or(true);
    internalOpts.html = options.html.value_or(false);
    internalOpts.sourceOffsets = options.sourceOffsets.value_or(true);
    internalOpts.maxInputLength = resolveMaxInputBytes(options.maxInputLength);

    auto ast = parser_->parse(text, internalOpts);
    return nodeToJson(ast, text, internalOpts);
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
    const InternalParserOptions& options
) {
    BoundedJsonWriter writer;
    appendNodeJson(writer, node, source, options, *cache_);
    return std::move(writer).take();
}

} // namespace margelo::nitro::Markdown
