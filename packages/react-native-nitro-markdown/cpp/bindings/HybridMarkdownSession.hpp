#pragma once

#include "HybridMarkdownParser.hpp"
#include "HybridMarkdownSessionSpec.hpp"
#include <cstddef>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

namespace margelo::nitro::Markdown {

class HybridMarkdownSession final : public HybridMarkdownSessionSpec {
public:
    HybridMarkdownSession();
    ~HybridMarkdownSession() override;

    double getHighlightPosition() override;
    void setHighlightPosition(double highlightPosition) override;
    double append(const std::string& chunk) override;
    void clear() override;
    std::string getAllText() override;
    double getLength() override;
    std::string getTextRange(double from, double to) override;
    std::string parse() override;
    std::string parseWithOptions(const ParserOptions& options) override;
    std::function<void()> addListener(
        const std::function<void(double, double)>& listener
    ) override;
    void reset(const std::string& text) override;
    double replace(double from, double to, const std::string& text) override;
    void dispose() override;
    size_t getExternalMemorySize() noexcept override;

private:
    struct Listener {
        size_t id;
        std::function<void(double, double)> callback;
    };

    static constexpr size_t kMaxBufferSize = 10 * 1024 * 1024;

    mutable std::mutex mutex_;
    std::string buffer_;
    size_t bufferUtf16Length_ = 0;
    std::unique_ptr<HybridMarkdownParser> parser_;
    double highlightPosition_ = 0.0;
    bool disposed_ = false;
    size_t nextListenerId_ = 0;
    std::vector<Listener> listeners_;

    void ensureActiveLocked() const;
    void validateBufferSizeLocked(size_t size) const;
    static size_t utf16Length(const std::string& text) noexcept;
    static size_t byteOffsetForUtf16(
        const std::string& text,
        size_t utf16Offset
    );
    static std::pair<size_t, size_t> validateAndClampRange(
        double from,
        double to,
        size_t length
    );
    std::vector<std::function<void(double, double)>> snapshotListeners() const;
    static void notifyListeners(
        const std::vector<std::function<void(double, double)>>& listeners,
        double from,
        double to
    ) noexcept;
};

} // namespace margelo::nitro::Markdown
