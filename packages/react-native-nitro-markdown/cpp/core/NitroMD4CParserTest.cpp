#define NITRO_MARKDOWN_TESTING
#include "NitroMD4CParser.hpp"
#include "MarkdownTypes.hpp"
#include "flatten.hpp"
#include "FlattenCorpus.hpp"
#include "ConformanceCorpus.hpp"
#include "../bindings/HybridMarkdownParser.hpp"
#include "../bindings/HybridMarkdownSession.hpp"
#include "../nitromd/nitromd.h"
#include <iostream>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <random>
#include <sstream>
#include <string>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <limits>
#include <vector>
#include <atomic>
#include <cstdlib>
#include <functional>
#include <mutex>
#include <new>
#include <thread>
#include <utility>
#ifndef _WIN32
#include <pthread.h>
#endif

namespace NitroMarkdownTestHeap {

constexpr std::size_t kHeaderBytes = 16;
std::atomic<std::size_t> liveBytes{0};
std::atomic<std::size_t> peakBytes{0};
std::atomic<long long> allocationsUntilFailure{-1};
std::atomic<bool> stickyFailure{false};
std::atomic<std::size_t> injectedFailures{0};

inline void* allocate(std::size_t size) {
    const long long remaining = allocationsUntilFailure.load(std::memory_order_relaxed);
    if (remaining == 0) {
        if (!stickyFailure.load(std::memory_order_relaxed)) {
            allocationsUntilFailure.store(-1, std::memory_order_relaxed);
        }
        injectedFailures.fetch_add(1, std::memory_order_relaxed);
        throw std::bad_alloc();
    }
    if (remaining > 0) {
        allocationsUntilFailure.store(remaining - 1, std::memory_order_relaxed);
    }
    void* block = std::malloc(size + kHeaderBytes);
    if (block == nullptr) throw std::bad_alloc();
    *static_cast<std::size_t*>(block) = size;
    const std::size_t live = liveBytes.fetch_add(size, std::memory_order_relaxed) + size;
    std::size_t peak = peakBytes.load(std::memory_order_relaxed);
    while (live > peak && !peakBytes.compare_exchange_weak(peak, live, std::memory_order_relaxed)) {
    }
    return static_cast<unsigned char*>(block) + kHeaderBytes;
}

inline void release(void* pointer) noexcept {
    if (pointer == nullptr) return;
    void* block = static_cast<unsigned char*>(pointer) - kHeaderBytes;
    liveBytes.fetch_sub(*static_cast<std::size_t*>(block), std::memory_order_relaxed);
    std::free(block);
}

} // namespace NitroMarkdownTestHeap

void* operator new(std::size_t size) {
    return NitroMarkdownTestHeap::allocate(size);
}

void operator delete(void* pointer) noexcept {
    NitroMarkdownTestHeap::release(pointer);
}

void operator delete(void* pointer, std::size_t) noexcept {
    NitroMarkdownTestHeap::release(pointer);
}

void* operator new[](std::size_t size) {
    return NitroMarkdownTestHeap::allocate(size);
}

void operator delete[](void* pointer) noexcept {
    NitroMarkdownTestHeap::release(pointer);
}

void operator delete[](void* pointer, std::size_t) noexcept {
    NitroMarkdownTestHeap::release(pointer);
}

void* operator new(std::size_t size, const std::nothrow_t&) noexcept {
    try {
        return NitroMarkdownTestHeap::allocate(size);
    } catch (...) {
        return nullptr;
    }
}

void* operator new[](std::size_t size, const std::nothrow_t&) noexcept {
    try {
        return NitroMarkdownTestHeap::allocate(size);
    } catch (...) {
        return nullptr;
    }
}

void operator delete(void* pointer, const std::nothrow_t&) noexcept {
    NitroMarkdownTestHeap::release(pointer);
}

void operator delete[](void* pointer, const std::nothrow_t&) noexcept {
    NitroMarkdownTestHeap::release(pointer);
}

namespace NitroMarkdown {

class TestRunner {
public:
    static int runCount;
    static int passCount;
    static int failCount;

    static void assertEqual(const std::string& expected, const std::string& actual, const std::string& testName) {
        runCount++;
        if (expected == actual) {
            passCount++;
            std::cout << "✓ PASS: " << testName << std::endl;
        } else {
            failCount++;
            std::cout << "✗ FAIL: " << testName << std::endl;
            std::cout << "  Expected: " << expected << std::endl;
            std::cout << "  Actual: " << actual << std::endl;
        }
    }

    static void assertTrue(bool condition, const std::string& testName) {
        runCount++;
        if (condition) {
            passCount++;
            std::cout << "✓ PASS: " << testName << std::endl;
        } else {
            failCount++;
            std::cout << "✗ FAIL: " << testName << std::endl;
        }
    }

    static void assertNotNull(void* ptr, const std::string& testName) {
        assertTrue(ptr != nullptr, testName);
    }

    static void printSummary() {
        std::cout << "\n=== Test Results ===" << std::endl;
        std::cout << "Total: " << runCount << std::endl;
        std::cout << "Passed: " << passCount << std::endl;
        std::cout << "Failed: " << failCount << std::endl;
        std::cout << "Success Rate: " << (runCount > 0 ? (passCount * 100.0 / runCount) : 0) << "%" << std::endl;
    }
};

int TestRunner::runCount = 0;
int TestRunner::passCount = 0;
int TestRunner::failCount = 0;

class MD4CParserTest {
public:
    // Canonical node serialization shared with the corpus generator
    // (scripts/test-cpp.js): field order, JSON-style string escaping, and
    // node type names must stay in sync with canonicalizeNode() there.
    static std::string jsonEscape(const std::string& value) {
        std::string out;
        for (unsigned char c : value) {
            switch (c) {
                case '"': out += "\\\""; break;
                case '\\': out += "\\\\"; break;
                case '\n': out += "\\n"; break;
                case '\r': out += "\\r"; break;
                case '\t': out += "\\t"; break;
                default:
                    if (c <= 0x1f || c == 0x7f) {
                        char buf[8];
                        snprintf(buf, sizeof(buf), "\\u%04x", c);
                        out += buf;
                    } else {
                        out.push_back(static_cast<char>(c));
                    }
                    break;
            }
        }
        return out;
    }

    static std::string canonicalizeNode(const std::shared_ptr<MarkdownNode>& node) {
        if (!node) return "null";
        std::string fields;
        if (node->content.has_value()) {
            fields += ",content=" + jsonEscape(node->content.value());
        }
        if (node->level.has_value()) {
            fields += ",level=" + std::to_string(node->level.value());
        }
        if (node->href.has_value()) {
            fields += ",href=" + jsonEscape(node->href.value());
        }
        if (node->title.has_value()) {
            fields += ",title=" + jsonEscape(node->title.value());
        }
        if (node->alt.has_value()) {
            fields += ",alt=" + jsonEscape(node->alt.value());
        }
        if (node->language.has_value()) {
            fields += ",language=" + jsonEscape(node->language.value());
        }
        if (node->ordered.has_value()) {
            fields += ",ordered=" + std::string(node->ordered.value() ? "true" : "false");
        }
        if (node->start.has_value()) {
            fields += ",start=" + std::to_string(node->start.value());
        }
        if (node->checked.has_value()) {
            fields += ",checked=" + std::string(node->checked.value() ? "true" : "false");
        }
        if (node->isHeader.has_value()) {
            fields += ",isHeader=" + std::string(node->isHeader.value() ? "true" : "false");
        }
        if (node->align.has_value() && node->align.value() != TextAlign::Default) {
            fields += ",align=" + jsonEscape(textAlignToString(node->align.value()));
        }
        if (!node->children.empty()) {
            fields += ",children=[";
            for (size_t i = 0; i < node->children.size(); i++) {
                if (i > 0) fields += ",";
                fields += canonicalizeNode(node->children[i]);
            }
            fields += "]";
        }
        return fields.empty()
            ? nodeTypeToString(node->type)
            : nodeTypeToString(node->type) + "{" + fields.substr(1) + "}";
    }

    static ParserOptions optionsFromJson(const char* json) {
        ParserOptions options;
        options.gfm = std::string(json).find("\"gfm\":false") == std::string::npos;
        options.math = std::string(json).find("\"math\":false") == std::string::npos;
        options.html = std::string(json).find("\"html\":true") != std::string::npos;
        return options;
    }

    static void testFlattenCorpus() {
        MD4CParser parser;
        ParserOptions options{true, true};
        for (const auto& entry : kFlattenCorpus) {
            std::string input(entry.markdown);
            auto ast = parser.parse(input, options);
            std::string actual = flattenNodeText(ast);
            std::string expected(entry.expected);
            std::string name = "FlattenCorpus: ";
            name += entry.name;
            TestRunner::assertEqual(expected, actual, name);
        }
    }

    static void testConformanceCorpus() {
        MD4CParser parser;
        for (const auto& entry : kConformanceCorpus) {
            std::string input(entry.markdown);
            ParserOptions options = optionsFromJson(entry.optionsJson);
            std::string name = "Conformance: ";
            name += entry.name;
            bool threw = false;
            std::shared_ptr<MarkdownNode> ast;
            try {
                ast = parser.parse(input, options);
            } catch (const std::exception& error) {
                threw = true;
                TestRunner::assertEqual("", std::string(error.what()), name + " (unexpected throw)");
            }
            if (!threw) {
                TestRunner::assertEqual(entry.expectedCanonical, canonicalizeNode(ast), name);
            }
        }
    }

    static void testSeededFuzz() {
        // Deterministic, seed-driven fuzz: the same seed reproduces the same
        // input sequence and the same result on every run.
        const char kAlphabet[] =
            "#*_`~[]()!<>|$\\\n\r\t-+.0123456789 abcdefghijklmnopqrstuvwxyz"
            "ABCDEFGHIJKLMNOPQRSTUVWXYZé🌍\0";
        std::mt19937 rng(0xC0FFEE);
        MD4CParser parser;
        ParserOptions options{true, true};
        unsigned int passed = 0;
        size_t offsetViolations = 0;
        std::string firstOffsetViolation;
        for (int i = 0; i < 2000; i++) {
            const size_t length = static_cast<size_t>(rng() % 512);
            std::string input;
            input.reserve(length);
            for (size_t j = 0; j < length; j++) {
                input.push_back(kAlphabet[rng() % (sizeof(kAlphabet) - 1)]);
            }
            options.gfm = (rng() % 2) == 0;
            options.math = (rng() % 2) == 0;
            options.html = (rng() % 2) == 0;
            try {
                auto ast = parser.parse(input, options);
                if (ast != nullptr) {
                    canonicalizeNode(ast);
                    const std::string violation = offsetViolation(ast, ast->end, "");
                    if (!violation.empty()) {
                        offsetViolations++;
                        if (firstOffsetViolation.empty()) {
                            firstOffsetViolation = "#" + std::to_string(i) + " " +
                                jsonEscape(input) + " " + violation;
                        }
                    }
                    passed++;
                }
            } catch (const std::exception& error) {
                std::string name = "Fuzz: input #";
                name += std::to_string(i);
                name += " threw: ";
                name += error.what();
                TestRunner::assertTrue(false, name);
                return;
            }
        }
        TestRunner::assertTrue(passed == 2000, "Fuzz: all 2000 seeded inputs parse deterministically");
        TestRunner::assertEqual(
            "",
            firstOffsetViolation,
            "Fuzz: seeded inputs keep contained, monotonic offsets (" +
                std::to_string(offsetViolations) + " violations)"
        );
    }

    static void runAllTests() {
        std::cout << "Running MD4C Parser Tests..." << std::endl;

        testEmptyInput();
        testSimpleParagraph();
        testHeading();
        testBoldText();
        testItalicText();
        testInlineCode();
        testLink();
        testImage();
        testCodeBlock();
        testList();
        testListWithInlineCode();
        testTaskListWithInlineCode();
        testTable();
        testNestedFormatting();

        // Regression and feature coverage tests
        testCodeBlockHasTextChildren();
        testStrikethrough();
        testMathInline();
        testMathBlock();
        testIssue74PublicDisplayMath();
        testIssue74StandaloneEqualsDisplayMath();
        testIssue74StandaloneDisplayMathContract();
        testParserOptionToggles();
        testHtmlDisabledByDefault();
        testHtmlEnabled();
        testHeadingLevels2Through6();
        testOrderedListWithCustomStart();
        testSoftBreakAndHardBreak();
        testBreakSourceOffsets();
        testTableCellAlignment();
        testNestedBlockquotes();
        testAstDepthLimit();
        testImageWithTitle();
        testHorizontalRule();
        testEntityText();
        testTestOnlyExtensionFlags();
        testCallbackNullUserdataGuards();
        testParserFailureThrows();
        testInputSizeCap();
        testSourceOffsetsTracking();
        testWikilinkNotMappedWithoutFlag();
        testFlattenCorpus();
        testConformanceCorpus();
        testSeededFuzz();

        // Safety and crash prevention tests
        testMemoryLeaks();
        testNullAndEmptyInputs();
        testMalformedMarkdown();
        testLargeInputs();
        testBufferOverflowProtection();
        testUnicodeHandling();
        testResourceCleanup();
        testConcurrentOptions();
        testNullCharOffsets();
        testLinkAttributes();
        testOversizedInputClamp();
        testOffsets();
        testUtf16Offsets();
        testParseLatencyBudgets();
        testHybridSerializationLatency();
        testLargeDocumentMemoryBudget();

        testSourceRangeContainment();
        testImageAltFlattensSubtree();
        testSessionStreamingMatchesColdParse();
        testBindingJsonEscapingAndPlainTextOptions();
        testHybridMarkdownSessionCorpus();
        testHybridMarkdownParserBinding();

        testProductionOutputGolden();
        testSourceOffsetMappingMatchesReference();
        testLeadingBomIsSkipped();
        testUnmappedExtensionNodesStayBalanced();
        testMaxInputLengthSaturatesOnEveryAbi();
        testSessionByteSplitsKeepExactLength();
        testParserFailureReasonIsPreserved();
        testWorkBoundAtInputCap();
        testHostileEncodings();
        testJsonNeverEmitsRawControlBytes();
        testOptionMatrixDifferential();
        testTableShapeAndHtmlToggle();
        testNestingAgainstDepthLimit();
        testSmallStackDeepNesting();
        testCallbackCountScalesLinearly();
        testBudgetErrorsSurfaceFromCallbacks();
        testFlattenBounds();
        testJsonOutputSizeCap();
        testBindingNumericOptionBoundaries();
        testSessionNumericRangeBoundaries();
        testSessionChunkSplitDifferential();
        testSessionStreamingStepsAreLinear();
        testSessionBufferGrowthIsBounded();
        testSessionListenerReentrancy();
        testSessionConcurrentCallers();
        testSessionDisposeRacesCallers();
        testAllocationFailureInjection();
        testPeakHeapBounds();

        TestRunner::printSummary();
    }

private:
    static std::shared_ptr<MarkdownNode> findFirstNode(
        const std::shared_ptr<MarkdownNode>& node,
        NodeType type
    ) {
        if (!node) return nullptr;
        if (node->type == type) return node;

        for (const auto& child : node->children) {
            auto found = findFirstNode(child, type);
            if (found) return found;
        }

        return nullptr;
    }

    static size_t countNodes(
        const std::shared_ptr<MarkdownNode>& node,
        NodeType type
    ) {
        if (!node) return 0;

        size_t count = node->type == type ? 1 : 0;
        for (const auto& child : node->children) {
            count += countNodes(child, type);
        }
        return count;
    }

    static bool hasValidMonotonicOffsets(
        const std::shared_ptr<MarkdownNode>& node,
        OFF maximumOffset
    ) {
        if (!node || node->beg > node->end || node->end > maximumOffset) {
            return false;
        }

        OFF previousBeg = 0;
        OFF previousEnd = 0;
        bool hasPrevious = false;
        for (const auto& child : node->children) {
            if (hasPrevious && (child->beg < previousBeg || child->end < previousEnd)) {
                return false;
            }
            if (!hasValidMonotonicOffsets(child, maximumOffset)) {
                return false;
            }
            previousBeg = child->beg;
            previousEnd = child->end;
            hasPrevious = true;
        }

        return true;
    }

    static double percentile(std::vector<double> values, double percentileValue) {
        if (values.empty()) return 0.0;

        std::sort(values.begin(), values.end());
        const double rank = percentileValue * static_cast<double>(values.size() - 1);
        const size_t lowerIndex = static_cast<size_t>(std::floor(rank));
        const size_t upperIndex = static_cast<size_t>(std::ceil(rank));

        if (lowerIndex == upperIndex) {
            return values[lowerIndex];
        }

        const double weight = rank - static_cast<double>(lowerIndex);
        return values[lowerIndex] * (1.0 - weight) + values[upperIndex] * weight;
    }

    static size_t estimateAstBytes(const std::shared_ptr<MarkdownNode>& node) {
        if (!node) return 0;

        size_t estimated = sizeof(MarkdownNode);
        estimated += node->children.capacity() * sizeof(std::shared_ptr<MarkdownNode>);

        if (node->content.has_value()) estimated += node->content->capacity();
        if (node->href.has_value()) estimated += node->href->capacity();
        if (node->title.has_value()) estimated += node->title->capacity();
        if (node->alt.has_value()) estimated += node->alt->capacity();
        if (node->language.has_value()) estimated += node->language->capacity();

        for (const auto& child : node->children) {
            estimated += estimateAstBytes(child);
        }

        return estimated;
    }

    static std::string makePerfPayload(size_t sections) {
        const std::string section =
            "# Perf Heading\n"
            "Streaming markdown performance section with **bold**, *italic*, and `code`.\n\n"
            "| Feature | Value |\n"
            "| --- | --- |\n"
            "| Parse | Fast |\n"
            "| Render | Stable |\n\n"
            "- item one\n"
            "- item two\n"
            "- item three\n\n";

        std::string payload;
        payload.reserve(section.size() * sections);
        for (size_t i = 0; i < sections; i++) {
            payload += section;
        }
        return payload;
    }

    static void testParseLatencyBudgets() {
        MD4CParser parser;
        ParserOptions options{true, true};
        const std::string payload = makePerfPayload(500);
        const int iterations = 25;

        std::vector<double> timingsMs;
        timingsMs.reserve(iterations);

        // Warmup for more stable timing.
        for (int i = 0; i < 5; i++) {
            parser.parse(payload, options);
        }

        for (int i = 0; i < iterations; i++) {
            const auto start = std::chrono::steady_clock::now();
            auto ast = parser.parse(payload, options);
            const auto end = std::chrono::steady_clock::now();
            const std::chrono::duration<double, std::milli> elapsed = end - start;
            timingsMs.push_back(elapsed.count());
            TestRunner::assertNotNull(ast.get(), "Perf latency parse result not null");
        }

        const double p50 = percentile(timingsMs, 0.50);
        const double p95 = percentile(timingsMs, 0.95);
        static constexpr double kP50BudgetMs = 15.0;
        static constexpr double kP95BudgetMs = 30.0;

        std::cout << "ℹ Perf budget parse p50=" << p50 << "ms p95=" << p95 << "ms" << std::endl;
#ifdef NITRO_MARKDOWN_PERF_ASSERTS
        TestRunner::assertTrue(p50 <= kP50BudgetMs, "Perf budget parse p50");
        TestRunner::assertTrue(p95 <= kP95BudgetMs, "Perf budget parse p95");
#else
        std::cout << "ℹ Perf budget parse asserts (p50<=" << kP50BudgetMs << "ms, p95<="
                  << kP95BudgetMs << "ms) run only in the perf build" << std::endl;
#endif
    }

    static void testHybridSerializationLatency() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using NativeParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        const std::string payload = "🚀 " + makePerfPayload(900);
        for (const bool includeOffsets : {false, true}) {
            NativeParserOptions options;
            options.sourceOffsets = includeOffsets;

            HybridMarkdownParser parser;
            for (int index = 0; index < 3; index++) {
                (void)parser.parseWithOptions(payload, options);
            }

            std::vector<double> timingsMs;
            timingsMs.reserve(10);
            for (int index = 0; index < 10; index++) {
                const auto start = std::chrono::steady_clock::now();
                const std::string json = parser.parseWithOptions(payload, options);
                const auto end = std::chrono::steady_clock::now();
                TestRunner::assertTrue(
                    !json.empty(),
                    includeOffsets
                        ? "Perf serialization with offsets result"
                        : "Perf serialization without offsets result"
                );
                timingsMs.push_back(
                    std::chrono::duration<double, std::milli>(end - start).count()
                );
            }

            std::cout << "ℹ Perf serialization sourceOffsets="
                      << (includeOffsets ? "true" : "false")
                      << " p50=" << percentile(timingsMs, 0.50)
                      << "ms p95=" << percentile(timingsMs, 0.95)
                      << "ms payloadBytes=" << payload.size() << std::endl;
        }
    }

    static void testLargeDocumentMemoryBudget() {
        MD4CParser parser;
        ParserOptions options{true, true};
        const std::string payload = makePerfPayload(900);
        auto ast = parser.parse(payload, options);
        TestRunner::assertNotNull(ast.get(), "Perf memory parse result not null");

        const size_t estimatedBytes = estimateAstBytes(ast);
        static constexpr size_t kEstimatedAstBytesBudget = 96 * 1024 * 1024; // 96 MB

        std::cout << "ℹ Perf budget estimated AST bytes=" << estimatedBytes << std::endl;
        TestRunner::assertTrue(
            estimatedBytes <= kEstimatedAstBytesBudget,
            "Perf budget large-document estimated AST memory"
        );
    }

    static std::string offsetViolation(
        const std::shared_ptr<MarkdownNode>& node,
        OFF maximumOffset,
        const std::string& path
    ) {
        if (!node) return path + ": null node";
        const std::string here = path + "/" + nodeTypeToString(node->type) +
            "[" + std::to_string(node->beg) + "," + std::to_string(node->end) + "]";
        if (node->beg > node->end) return here + ": beg > end";
        if (node->end > maximumOffset) return here + ": end past input";

        const MarkdownNode* previous = nullptr;
        for (const auto& child : node->children) {
            if (!child) return here + ": null child";
            if (child->beg < node->beg || child->end > node->end) {
                return here + ": child " + nodeTypeToString(child->type) + "[" +
                    std::to_string(child->beg) + "," + std::to_string(child->end) +
                    "] escapes parent";
            }
            if (previous && (child->beg < previous->beg || child->end < previous->end)) {
                return here + ": sibling " + nodeTypeToString(child->type) +
                    " moves backwards";
            }
            const std::string nested = offsetViolation(child, maximumOffset, here);
            if (!nested.empty()) return nested;
            previous = child.get();
        }
        return "";
    }

    static OFF utf16LengthForTest(const std::string& source) {
        OFF length = 0;
        size_t index = 0;
        while (index < source.size()) {
            const unsigned char lead = static_cast<unsigned char>(source[index]);
            const size_t bytes = lead < 0x80 ? 1 : (lead < 0xE0 ? 2 : (lead < 0xF0 ? 3 : 4));
            length += bytes == 4 ? 2 : 1;
            index += bytes;
        }
        return length;
    }

    static std::vector<std::string> makeFragmentCorpus(size_t count, uint32_t seed) {
        static const std::vector<std::string> fragments = {
            "- a\n", "- b\n", "* c\n", "1. d\n", "  - nested\n", "- [ ] task\n",
            "> q\n", "> [x]: /u\n", "- [x]: /u\n", "[x]: /v\n", "[x]\n", "lazy\n",
            "\n", "\n\n", "```\ncode\n```\n", "```js\n", "~~~\n", "    indented\n",
            "| a | b |\n| - | - |\n| 1 | 2 |\n", "| c |\n", "[l](/u)", "[a](\n/u)\n",
            "![**b** a](i)", "![a `c` b](i)", "*e*", "**s**", "`c`", "  \n", "\\\n",
            "# h\n", "text ", "word", "é", "\U0001F642", "\r\n", "$$\nm\n$$\n",
            "$x$", "<b>h</b>", "~~d~~", "---\n", "===\n", "&amp;", "<http://a.b>",
        };
        std::vector<std::string> corpus;
        corpus.reserve(count);
        uint32_t state = seed;
        const auto next = [&state]() {
            state = state * 1664525u + 1013904223u;
            return state >> 8;
        };
        for (size_t index = 0; index < count; index++) {
            const size_t pieces = 1 + next() % 24;
            std::string document;
            for (size_t piece = 0; piece < pieces; piece++) {
                document += fragments[next() % fragments.size()];
            }
            corpus.push_back(std::move(document));
        }
        return corpus;
    }

    static void testSourceRangeContainment() {
        MD4CParser parser;

        const std::vector<std::string> explicitCases = {
            "- a\n- b\n\nc",
            "> a\n> b\n\nc",
            "> a\nlazy\n\nc",
            "- a\n  - b\n\nc",
            "1. a\n2. b\n\n\nc",
            "| a |\n| - |\n| 1 |\n\nc",
        };
        for (const auto& markdown : explicitCases) {
            ParserOptions options;
            options.sourceOffsets = true;
            const auto ast = parser.parse(markdown, options);
            TestRunner::assertEqual(
                "",
                offsetViolation(ast, utf16LengthForTest(markdown), ""),
                "Offsets containment: " + jsonEscape(markdown)
            );
        }

        size_t corpusViolations = 0;
        std::string firstCorpusViolation;
        for (const auto& entry : kConformanceCorpus) {
            ParserOptions options = optionsFromJson(entry.optionsJson);
            options.sourceOffsets = true;
            const std::string markdown(entry.markdown);
            const auto ast = parser.parse(markdown, options);
            const std::string violation =
                offsetViolation(ast, utf16LengthForTest(markdown), "");
            if (!violation.empty()) {
                corpusViolations++;
                if (firstCorpusViolation.empty()) {
                    firstCorpusViolation = std::string(entry.name) + " " + violation;
                }
            }
        }
        TestRunner::assertEqual(
            "",
            firstCorpusViolation,
            "Offsets containment: every conformance corpus entry (" +
                std::to_string(corpusViolations) + " violations)"
        );

        size_t fuzzViolations = 0;
        std::string firstFuzzViolation;
        const auto documents = makeFragmentCorpus(2000, 0x5EEDu);
        for (size_t index = 0; index < documents.size(); index++) {
            ParserOptions options;
            options.sourceOffsets = true;
            options.html = (index % 2) == 0;
            const auto ast = parser.parse(documents[index], options);
            const std::string violation =
                offsetViolation(ast, utf16LengthForTest(documents[index]), "");
            if (!violation.empty()) {
                fuzzViolations++;
                if (firstFuzzViolation.empty()) {
                    firstFuzzViolation = "#" + std::to_string(index) + " " +
                        jsonEscape(documents[index]) + " " + violation;
                }
            }
        }
        TestRunner::assertEqual(
            "",
            firstFuzzViolation,
            "Offsets containment: 2000 seeded fragment documents (" +
                std::to_string(fuzzViolations) + " violations)"
        );
    }

    static void testImageAltFlattensSubtree() {
        MD4CParser parser;
        ParserOptions options;
        const std::vector<std::pair<std::string, std::string>> cases = {
            {"![**bold** alt](u)", "bold alt"},
            {"![a `code` b](u)", "a code b"},
            {"![line1\nline2](u)", "line1 line2"},
            {"![a  \nb](u)", "a\nb"},
            {"![x ![y](v) z](u)", "x y z"},
            {"![*a* **b**](u)", "a b"},
            {"![](u)", ""},
        };
        for (const auto& [markdown, expected] : cases) {
            const auto ast = parser.parse(markdown, options);
            const auto image = findFirstNode(ast, NodeType::Image);
            TestRunner::assertEqual(
                expected,
                image ? image->alt.value_or("<none>") : "<no image>",
                "Image alt flattens subtree: " + jsonEscape(markdown)
            );
        }

        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        HybridMarkdownParser binding;
        TestRunner::assertEqual(
            "bold alt\n\n",
            binding.extractPlainText("![**bold** alt](u)"),
            "Image alt flattens subtree: extractPlainText"
        );

        std::string nested;
        for (int index = 0; index < 200; index++) nested += "![";
        nested += std::string(320000, 'x');
        for (int index = 0; index < 200; index++) nested += "](u)";
        std::string nestedError;
        try {
            parser.parse(nested, options);
        } catch (const std::exception& error) {
            nestedError = error.what();
        }
        TestRunner::assertTrue(
            nestedError.rfind("Markdown flattened text exceeds the maximum of", 0) == 0,
            "Image alt cap scales with input size for nested images: " + nestedError
        );

        std::string wide;
        for (int index = 0; index < 64; index++) {
            wide += "![" + std::string(512, 'a') + "](u) ";
        }
        const auto wideAst = parser.parse(wide, options);
        TestRunner::assertTrue(
            findFirstNode(wideAst, NodeType::Image) != nullptr,
            "Image alt cap accepts many sibling images within input size"
        );
        TestRunner::assertEqual(
            "x y z\n\n",
            binding.extractPlainText("![x ![y](v) z](u)"),
            "Image alt cap keeps modest nesting"
        );
    }

    static void testSessionStreamingMatchesColdParse() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using ::margelo::nitro::Markdown::HybridMarkdownSession;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        std::vector<std::string> documents = {
            "[x]\n\n> [x]: /u\n",
            "[x]\n\n- [x]: /u\n",
            "Use [x] here.\n\n> quote\n> [x]: /u\n\nand [x] again\n",
            "Use [x] here.\n\n- item\n- [x]: /u\n\nand [x] again\n",
            "[x]\n\n[x]: /u\n",
        };
        const auto fuzz = makeFragmentCorpus(300, 0xC0DEu);
        documents.insert(documents.end(), fuzz.begin(), fuzz.end());

        BindingParserOptions options;
        options.sourceOffsets = true;
        size_t mismatches = 0;
        std::string firstMismatch;
        for (size_t index = 0; index < documents.size(); index++) {
            const std::string& document = documents[index];
            auto session = std::make_shared<HybridMarkdownSession>();
            const size_t chunkSize = 1 + index % 12;
            for (size_t offset = 0; offset < document.size(); offset += chunkSize) {
                session->append(document.substr(offset, chunkSize));
                const std::string warm = session->parseWithOptions(options);
                HybridMarkdownParser cold;
                const std::string expected =
                    cold.parseWithOptions(session->getAllText(), options);
                if (warm != expected) {
                    mismatches++;
                    if (firstMismatch.empty()) {
                        firstMismatch = "#" + std::to_string(index) + " " + jsonEscape(document);
                    }
                    break;
                }
            }
        }
        TestRunner::assertEqual(
            "",
            firstMismatch,
            "Session streaming parse matches cold parse (" +
                std::to_string(mismatches) + " mismatches)"
        );

        auto quoted = std::make_shared<HybridMarkdownSession>();
        quoted->append("[x]\n\n");
        (void)quoted->parse();
        quoted->append("> [x]: /u\n");
        TestRunner::assertTrue(
            quoted->parse().find("\"href\":\"/u\"") != std::string::npos,
            "Session streaming resolves a blockquote reference definition"
        );

        auto listed = std::make_shared<HybridMarkdownSession>();
        listed->append("[x]\n\n");
        (void)listed->parse();
        listed->append("- [x]: /u\n");
        TestRunner::assertTrue(
            listed->parse().find("\"href\":\"/u\"") != std::string::npos,
            "Session streaming resolves a list reference definition"
        );
    }

    static void testBindingJsonEscapingAndPlainTextOptions() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using ::margelo::nitro::Markdown::HybridMarkdownSession;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        HybridMarkdownParser parser;
        BindingParserOptions withoutOffsets;
        withoutOffsets.sourceOffsets = false;
        const std::string controlJson = parser.parseWithOptions(
            std::string("say \"hi\" a\x01" "b\bc\fd\x7f"),
            withoutOffsets
        );
        TestRunner::assertTrue(
            controlJson.find(R"(say \"hi\" a\u0001b\bc\fd)" "\x7f") != std::string::npos,
            "Parser binding JSON escapes quotes and C0 controls"
        );

        const std::string codeJson = parser.parseWithOptions(
            "```\n\"q\"\ta\\b\n```",
            withoutOffsets
        );
        TestRunner::assertTrue(
            codeJson.find(R"(\"q\"\ta\\b\n)") != std::string::npos,
            "Parser binding JSON escapes tabs and backslashes in code"
        );

        BindingParserOptions plainOptions;
        plainOptions.gfm = true;
        TestRunner::assertEqual(
            "one\ntwo\n\na | b | \n1 | 2 | \n",
            parser.extractPlainTextWithOptions(
                "- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |",
                plainOptions
            ),
            "Parser binding extractPlainTextWithOptions flattens lists and tables"
        );
        BindingParserOptions limitedPlain;
        limitedPlain.maxInputLength = 4.0;
        bool plainLimitThrew = false;
        try {
            (void)parser.extractPlainTextWithOptions("12345", limitedPlain);
        } catch (const std::runtime_error& error) {
            plainLimitThrew =
                std::string(error.what()).find("maximum of 4 bytes") != std::string::npos;
        }
        TestRunner::assertTrue(
            plainLimitThrew,
            "Parser binding extractPlainTextWithOptions honors maxInputLength"
        );

        auto session = std::make_shared<HybridMarkdownSession>();
        size_t laterCalls = 0;
        auto throwsStd = session->addListener([](double, double) {
            throw std::runtime_error("listener failure");
        });
        auto throwsOther = session->addListener([](double, double) {
            throw 42;
        });
        auto counts = session->addListener([&laterCalls](double, double) {
            laterCalls++;
        });
        TestRunner::assertTrue(
            session->append("abc") == 3.0 && laterCalls == 1,
            "Session listener exceptions do not block later listeners"
        );
        throwsStd();
        throwsOther();
        counts();
    }

    static void testHybridMarkdownSessionCorpus() {
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        const std::vector<std::string> corpus = {
            "append-extends-buffer",
            "append-notifies-range",
            "reset-replaces-buffer",
            "reset-notifies-full-range",
            "replace-inserts-in-place",
            "replace-notifies-insert-range",
            "replace-clamps-out-of-bounds",
            "replace-rejects-invalid-range",
            "getTextRange-clamps",
            "getTextRange-rejects-invalid",
            "clear-empties-buffer",
            "clear-notifies-zero-range",
            "dispose-rejects-all-operations",
            "unsubscribe-stops-notifications",
            "listeners-see-snapshot-ranges",
            "append-rejects-buffer-cap",
            "replace-rejects-buffer-cap",
        };
        TestRunner::assertTrue(corpus.size() == 17, "Session corpus has all scenarios");

        auto resetSession = std::make_shared<HybridMarkdownSession>();
        std::vector<std::pair<double, double>> resetRanges;
        auto resetUnsubscribe = resetSession->addListener([&resetRanges](double from, double to) {
            resetRanges.emplace_back(from, to);
        });
        resetSession->reset("new content");
        TestRunner::assertEqual(
            "new content",
            resetSession->getAllText(),
            "Session reset-replaces-buffer"
        );
        TestRunner::assertTrue(
            resetRanges.back() == std::pair<double, double>{0.0, 11.0},
            "Session reset-notifies-full-range"
        );
        resetUnsubscribe();

        auto session = std::make_shared<HybridMarkdownSession>();
        std::vector<std::pair<double, double>> ranges;
        session->reset("hello");
        auto unsubscribe = session->addListener([&ranges](double from, double to) {
            ranges.emplace_back(from, to);
        });
        TestRunner::assertEqual("hello world", [&session]() {
            session->append(" world");
            return session->getAllText();
        }(), "Session append extends buffer");
        TestRunner::assertTrue(
            ranges.back() == std::pair<double, double>{5.0, 11.0},
            "Session append notifies inserted range"
        );

        session->reset("hello world");
        ranges.clear();
        session->replace(5.0, 5.0, " brave");
        TestRunner::assertEqual(
            "hello brave world",
            session->getAllText(),
            "Session replace-inserts-in-place"
        );
        TestRunner::assertTrue(
            ranges.back() == std::pair<double, double>{5.0, 11.0},
            "Session replace-notifies-insert-range"
        );

        session->reset("hello");
        ranges.clear();
        session->replace(10.0, 10.0, "!");
        TestRunner::assertEqual("hello!", session->getAllText(), "Session replace clamps insertion");
        TestRunner::assertTrue(
            ranges.back() == std::pair<double, double>{5.0, 6.0},
            "Session replace reports clamped range"
        );

        session->reset("hello");
        TestRunner::assertEqual("ello", session->getTextRange(1.0, 100.0), "Session range clamps end");
        TestRunner::assertEqual("", session->getTextRange(100.0, 200.0), "Session range clamps empty tail");
        TestRunner::assertEqual("", session->getTextRange(2.0, 2.0), "Session ASCII empty range stays empty");
        TestRunner::assertEqual("", session->getTextRange(std::numeric_limits<double>::quiet_NaN(), 0.0), "Session invalid range is empty");

        auto unicodeSession = std::make_shared<HybridMarkdownSession>();
        unicodeSession->reset("A😀B");
        TestRunner::assertTrue(unicodeSession->getLength() == 4.0, "Session UTF-16 length counts emoji as two units");
        TestRunner::assertEqual("A", unicodeSession->getTextRange(0.0, 1.0), "Session range before emoji");
        TestRunner::assertEqual("😀", unicodeSession->getTextRange(1.0, 3.0), "Session range consumes complete emoji");
        TestRunner::assertEqual("B", unicodeSession->getTextRange(3.0, 4.0), "Session range after emoji");
        TestRunner::assertEqual("", unicodeSession->getTextRange(1.0, 1.0), "Session empty range before emoji");
        TestRunner::assertEqual("", unicodeSession->getTextRange(3.0, 3.0), "Session empty range after emoji");

        bool splitGetRangeThrew = false;
        try {
            (void)unicodeSession->getTextRange(2.0, 2.0);
        } catch (const std::runtime_error& error) {
            splitGetRangeThrew = std::string(error.what()).find("surrogate pair") != std::string::npos;
        }
        TestRunner::assertTrue(splitGetRangeThrew, "Session rejects a split-surrogate getTextRange boundary");

        bool splitGetRangeEndThrew = false;
        try {
            (void)unicodeSession->getTextRange(1.0, 2.0);
        } catch (const std::runtime_error& error) {
            splitGetRangeEndThrew = std::string(error.what()).find("surrogate pair") != std::string::npos;
        }
        TestRunner::assertTrue(splitGetRangeEndThrew, "Session rejects a split-surrogate getTextRange end");

        bool splitReplaceThrew = false;
        try {
            (void)unicodeSession->replace(2.0, 2.0, "X");
        } catch (const std::runtime_error& error) {
            splitReplaceThrew = std::string(error.what()).find("surrogate pair") != std::string::npos;
        }
        TestRunner::assertTrue(splitReplaceThrew, "Session rejects a split-surrogate replace boundary");

        bool splitReplaceEndThrew = false;
        try {
            (void)unicodeSession->replace(1.0, 2.0, "X");
        } catch (const std::runtime_error& error) {
            splitReplaceEndThrew = std::string(error.what()).find("surrogate pair") != std::string::npos;
        }
        TestRunner::assertTrue(splitReplaceEndThrew, "Session rejects a split-surrogate replace end");
        TestRunner::assertEqual("A😀B", unicodeSession->getAllText(), "Session split-surrogate rejection preserves text");
        TestRunner::assertTrue(unicodeSession->replace(1.0, 3.0, "X") == 3.0, "Session replaces a complete emoji range");
        TestRunner::assertEqual("AXB", unicodeSession->getAllText(), "Session complete emoji replacement preserves ASCII parity");

        auto rangeSession = std::make_shared<HybridMarkdownSession>();
        rangeSession->reset("A😀BéC");
        TestRunner::assertEqual("éC", rangeSession->getTextRange(4.0, 6.0), "Session reads Unicode tail");
        TestRunner::assertEqual("éC", rangeSession->getTextRange(4.0, 6.0), "Session repeats Unicode tail");
        TestRunner::assertEqual("😀", rangeSession->getTextRange(1.0, 3.0), "Session reads before prior range");
        rangeSession->append("😀fin");
        TestRunner::assertEqual("😀fin", rangeSession->getTextRange(6.0, 11.0), "Session reads appended Unicode chunk");
        rangeSession->replace(0.0, 1.0, "中文字");
        TestRunner::assertEqual("😀fin", rangeSession->getTextRange(8.0, 13.0), "Session range survives earlier replacement");
        rangeSession->reset("x😀y");
        TestRunner::assertEqual("😀y", rangeSession->getTextRange(1.0, 4.0), "Session range survives shorter reset");
        rangeSession->clear();
        rangeSession->append("é😀z");
        TestRunner::assertEqual("😀z", rangeSession->getTextRange(1.0, 4.0), "Session range survives clear and append");
        bool rangeAfterAppendThrew = false;
        try {
            (void)rangeSession->getTextRange(2.0, 3.0);
        } catch (const std::runtime_error& error) {
            rangeAfterAppendThrew = std::string(error.what()).find("surrogate pair") != std::string::npos;
        }
        TestRunner::assertTrue(rangeAfterAppendThrew, "Session range cursor never permits split surrogates");
        TestRunner::assertEqual("😀z", rangeSession->getTextRange(1.0, 4.0), "Session valid range survives rejected range");
        rangeSession->clear();
        for (size_t index = 0; index < 1000; ++index) {
            const double start = rangeSession->getLength();
            rangeSession->append("aé😀");
            TestRunner::assertEqual("aé😀", rangeSession->getTextRange(start, start + 4.0), "Session growing Unicode append range");
        }
        rangeSession->dispose();
        TestRunner::assertTrue(rangeSession->getExternalMemorySize() == 0, "Session range cursor retains no external memory after disposal");

        session->setHighlightPosition(12.0);
        TestRunner::assertTrue(
            session->getHighlightPosition() == 12.0,
            "Session highlight position round-trips"
        );
        session->clear();
        TestRunner::assertEqual("", session->getAllText(), "Session clear empties buffer");
        TestRunner::assertTrue(session->getHighlightPosition() == 0.0, "Session clear resets highlight");
        TestRunner::assertTrue(
            ranges.back() == std::pair<double, double>{0.0, 0.0},
            "Session clear notifies zero range"
        );

        unsubscribe();
        const auto rangeCount = ranges.size();
        session->append("after unsubscribe");
        TestRunner::assertTrue(ranges.size() == rangeCount, "Session unsubscribe stops notifications");

        bool invalidRangeThrew = false;
        try {
            session->replace(2.0, 1.0, "!");
        } catch (const std::runtime_error&) {
            invalidRangeThrew = true;
        }
        TestRunner::assertTrue(invalidRangeThrew, "Session replace rejects invalid range");

        auto snapshotSession = std::make_shared<HybridMarkdownSession>();
        std::vector<std::pair<double, double>> snapshotRanges;
        auto snapshotUnsubscribe = snapshotSession->addListener(
            [&snapshotRanges](double from, double to) {
                snapshotRanges.emplace_back(from, to);
            }
        );
        snapshotSession->append("one ");
        snapshotSession->append("two");
        TestRunner::assertTrue(
            snapshotRanges == std::vector<std::pair<double, double>>{
                {0.0, 4.0}, {4.0, 7.0}
            },
            "Session listeners-see-snapshot-ranges"
        );
        snapshotUnsubscribe();

        const auto isByteCapError = [](const std::runtime_error& error) {
            return std::string(error.what()) ==
                "Buffer size limit exceeded (max 10485760 bytes)";
        };
        auto capped = std::make_shared<HybridMarkdownSession>();
        capped->append(std::string(10 * 1024 * 1024, 'a'));
        TestRunner::assertTrue(
            capped->getLength() == 10.0 * 1024 * 1024,
            "Session append accepts ASCII exactly at the byte cap"
        );
        bool appendCapThrew = false;
        try {
            capped->append("!");
        } catch (const std::runtime_error& error) {
            appendCapThrew = isByteCapError(error);
        }
        TestRunner::assertTrue(appendCapThrew, "Session append enforces buffer cap");

        bool replaceCapThrew = false;
        try {
            capped->replace(0.0, 0.0, "!");
        } catch (const std::runtime_error& error) {
            replaceCapThrew = isByteCapError(error);
        }
        TestRunner::assertTrue(replaceCapThrew, "Session replace enforces buffer cap");
        TestRunner::assertTrue(
            capped->replace(0.0, 1.0, "!") == 10.0 * 1024 * 1024,
            "Session replace accepts a same-size edit at the byte cap"
        );

        std::string cjk;
        cjk.reserve(4'000'000 * 3);
        for (size_t index = 0; index < 4'000'000; index++) cjk += "\u4e2d";
        auto cjkAppend = std::make_shared<HybridMarkdownSession>();
        bool cjkAppendThrew = false;
        try {
            cjkAppend->append(cjk);
        } catch (const std::runtime_error& error) {
            cjkAppendThrew = isByteCapError(error);
        }
        TestRunner::assertTrue(
            cjkAppendThrew && cjkAppend->getLength() == 0.0,
            "Session append rejects 4,000,000 CJK chars (12,000,000 bytes)"
        );

        auto cjkReset = std::make_shared<HybridMarkdownSession>();
        bool cjkResetThrew = false;
        try {
            cjkReset->reset(cjk);
        } catch (const std::runtime_error& error) {
            cjkResetThrew = isByteCapError(error);
        }
        TestRunner::assertTrue(cjkResetThrew, "Session reset enforces the byte cap");

        auto cjkReplace = std::make_shared<HybridMarkdownSession>();
        cjkReplace->reset(std::string(3'500'000, 'a'));
        bool cjkReplaceThrew = false;
        try {
            (void)cjkReplace->replace(0.0, 0.0, std::string(cjk, 0, 2'400'000 * 3));
        } catch (const std::runtime_error& error) {
            cjkReplaceThrew = isByteCapError(error);
        }
        TestRunner::assertTrue(
            cjkReplaceThrew && cjkReplace->getLength() == 3'500'000.0,
            "Session replace counts inserted UTF-8 bytes against the cap"
        );

        auto cjkOffsets = std::make_shared<HybridMarkdownSession>();
        TestRunner::assertTrue(
            cjkOffsets->append("\u4e2d\u6587") == 2.0,
            "Session offsets stay UTF-16 units under the byte cap"
        );

        auto inspected = std::make_shared<HybridMarkdownSession>();
        const size_t emptyMemory = inspected->getExternalMemorySize();
        inspected->append(std::string(10 * 1024 * 1024, 'a'));
        const size_t appendedMemory = inspected->getExternalMemorySize();
        TestRunner::assertTrue(
            appendedMemory >= 10 * 1024 * 1024 && appendedMemory > emptyMemory,
            "Session external memory counts retained buffer capacity"
        );
        inspected->clear();
        const size_t clearedMemory = inspected->getExternalMemorySize();
        TestRunner::assertTrue(
            clearedMemory >= 10 * 1024 * 1024,
            "Session clear retains and reports buffer capacity"
        );
        auto inspectedUnsubscribe = inspected->addListener([](double, double) {});
        const size_t listenerMemory = inspected->getExternalMemorySize();
        TestRunner::assertTrue(
            listenerMemory > clearedMemory,
            "Session external memory counts listener container and callback storage"
        );
        inspectedUnsubscribe();
        const size_t removedListenerMemory = inspected->getExternalMemorySize();
        TestRunner::assertTrue(
            removedListenerMemory >= listenerMemory,
            "Session listener removal reports retained vector capacity"
        );
        inspected->dispose();
        TestRunner::assertEqual("0", std::to_string(inspected->getExternalMemorySize()), "Session dispose releases memory and capacity");

        auto disposed = std::make_shared<HybridMarkdownSession>();
        disposed->reset("hello");
        disposed->dispose();
        size_t disposedFailures = 0;
        try { disposed->append("!"); } catch (const std::runtime_error&) { disposedFailures++; }
        try { disposed->clear(); } catch (const std::runtime_error&) { disposedFailures++; }
        try { disposed->getAllText(); } catch (const std::runtime_error&) { disposedFailures++; }
        try { disposed->getLength(); } catch (const std::runtime_error&) { disposedFailures++; }
        try { disposed->getTextRange(0.0, 1.0); } catch (const std::runtime_error&) { disposedFailures++; }
        try { disposed->setHighlightPosition(1.0); } catch (const std::runtime_error&) { disposedFailures++; }
        try { disposed->getHighlightPosition(); } catch (const std::runtime_error&) { disposedFailures++; }
        try { disposed->reset("new"); } catch (const std::runtime_error&) { disposedFailures++; }
        try { disposed->replace(0.0, 0.0, "new"); } catch (const std::runtime_error&) { disposedFailures++; }
        try { disposed->addListener([](double, double) {}); } catch (const std::runtime_error&) { disposedFailures++; }
        TestRunner::assertTrue(
            disposedFailures == 10,
            "Session dispose-rejects-all-operations"
        );
    }

    static void testHybridMarkdownParserBinding() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        HybridMarkdownParser parser;
        const std::string json = parser.parse("# Title");
        TestRunner::assertTrue(
            json.find("\"type\":\"document\"") == 1,
            "Parser binding emits document JSON"
        );
        TestRunner::assertTrue(
            json.find("\"type\":\"heading\"") != std::string::npos &&
            json.find("\"content\":\"Title\"") != std::string::npos,
            "Parser binding emits structured heading JSON"
        );
        TestRunner::assertTrue(
            json.find("\"beg\":0") != std::string::npos &&
            json.find("\"end\":7") != std::string::npos,
            "Parser binding emits source offsets"
        );
        TestRunner::assertTrue(
            parser.extractPlainText("**plain**") == "plain\n\n",
            "Parser binding propagates plain text extraction"
        );

        BindingParserOptions limited;
        limited.maxInputLength = 8.0;
        bool limitedThrew = false;
        try {
            (void)parser.parseWithOptions("123456789", limited);
        } catch (const std::runtime_error& error) {
            limitedThrew = std::string(error.what()).find("maximum of 8 bytes") != std::string::npos;
        }
        TestRunner::assertTrue(limitedThrew, "Parser binding propagates max-input errors");

        BindingParserOptions multibyteLimit;
        multibyteLimit.maxInputLength = 3.0;
        bool multibyteThrew = false;
        try {
            (void)parser.parseWithOptions("éé", multibyteLimit);
        } catch (const std::runtime_error& error) {
            multibyteThrew = std::string(error.what()).find("maximum of 3 bytes") != std::string::npos;
        }
        TestRunner::assertTrue(multibyteThrew, "Parser binding counts max input in UTF-8 bytes");

        BindingParserOptions invalidMax;
        invalidMax.maxInputLength = std::numeric_limits<double>::quiet_NaN();
        bool invalidMaxThrew = false;
        try {
            (void)parser.parseWithOptions("valid", invalidMax);
        } catch (const std::runtime_error& error) {
            invalidMaxThrew = std::string(error.what()).find(
                "maxInputLength must be a finite non-negative integer"
            ) != std::string::npos;
        }
        TestRunner::assertTrue(
            invalidMaxThrew,
            "Parser binding rejects non-finite max input"
        );

        BindingParserOptions fractionalMax;
        fractionalMax.maxInputLength = 1.5;
        bool fractionalMaxThrew = false;
        try {
            (void)parser.parseWithOptions("valid", fractionalMax);
        } catch (const std::runtime_error& error) {
            fractionalMaxThrew = std::string(error.what()).find(
                "maxInputLength must be a finite non-negative integer"
            ) != std::string::npos;
        }
        TestRunner::assertTrue(fractionalMaxThrew, "Parser binding rejects fractional max input");

        BindingParserOptions unrepresentableMax;
        unrepresentableMax.maxInputLength = std::numeric_limits<double>::max();
        bool unrepresentableMaxThrew = false;
        try {
            (void)parser.parseWithOptions("valid", unrepresentableMax);
        } catch (const std::runtime_error& error) {
            unrepresentableMaxThrew = std::string(error.what()).find(
                "cannot be represented as a native size"
            ) != std::string::npos;
        }
        TestRunner::assertTrue(
            unrepresentableMaxThrew,
            "Parser binding rejects unrepresentable max input"
        );

        BindingParserOptions aboveHardCap;
        aboveHardCap.maxInputLength = 20 * 1024 * 1024;
        std::string aboveHardCapInput(10 * 1024 * 1024 + 1, 'x');
        bool hardCapThrew = false;
        try {
            (void)parser.parseWithOptions(aboveHardCapInput, aboveHardCap);
        } catch (const std::runtime_error& error) {
            hardCapThrew = std::string(error.what()).find("maximum of 10485760 bytes") != std::string::npos;
        }
        TestRunner::assertTrue(hardCapThrew, "Parser binding clamps max input to the native hard cap");

        bool corpusPassed = true;
        for (const auto& entry : kConformanceCorpus) {
            const ParserOptions internalOptions = optionsFromJson(entry.optionsJson);
            BindingParserOptions corpusOptions;
            corpusOptions.gfm = internalOptions.gfm;
            corpusOptions.math = internalOptions.math;
            corpusOptions.html = internalOptions.html;
            corpusOptions.sourceOffsets = internalOptions.sourceOffsets;
            try {
                const auto corpusJson = parser.parseWithOptions(entry.markdown, corpusOptions);
                corpusPassed = corpusPassed &&
                    corpusJson.find("\"type\":\"document\"") != std::string::npos;
            } catch (const std::exception&) {
                corpusPassed = false;
            }
        }
        TestRunner::assertTrue(corpusPassed, "Parser binding covers the conformance corpus");

        constexpr size_t maxJsonBytes = 64 * 1024 * 1024;
        const auto makeHorizontalRuleInput = [](size_t count) {
            std::string value;
            value.reserve(4 * count);
            for (size_t index = 0; index < count; ++index) {
                value += "---\n";
            }
            return value;
        };
        const std::string boundedInput = makeHorizontalRuleInput(10'000);
        const std::string boundedJson = parser.parse(boundedInput);
        TestRunner::assertTrue(
            boundedJson.size() <= maxJsonBytes,
            "Parser binding keeps bounded JSON output below the 64 MiB cap"
        );

        const std::string workBudgetInput = makeHorizontalRuleInput(1'200'000);
        bool workBudgetThrew = false;
        try {
            (void)parser.parse(workBudgetInput);
        } catch (const std::runtime_error& error) {
            const std::string message = error.what();
            workBudgetThrew =
                message.find("Markdown AST node/work budget") != std::string::npos ||
                message.find("Markdown AST child/work budget") != std::string::npos;
        }
        TestRunner::assertTrue(
            workBudgetThrew,
            "Parser binding rejects the 1.2M-rule input at the AST work budget"
        );

        bool parserErrorThrew = false;
        try {
            BindingParserOptions tiny;
            tiny.maxInputLength = 1.0;
            (void)parser.parseWithOptions("too large", tiny);
        } catch (const std::runtime_error&) {
            parserErrorThrew = true;
        }
        TestRunner::assertTrue(parserErrorThrew, "Parser binding preserves native error propagation");
    }

    static void testOffsets() {
        MD4CParser parser;
        ParserOptions options{true, true};
        
        // Basic text
        std::string text1 = "Hello";
        auto result1 = parser.parse(text1, options);
        
        // Document: 0-5
        TestRunner::assertEqual("0", std::to_string(result1->beg), "Document beg");
        TestRunner::assertEqual("5", std::to_string(result1->end), "Document end");
        
        if (!result1->children.empty()) {
            auto para1 = result1->children[0];
            TestRunner::assertEqual("0", std::to_string(para1->beg), "Para beg");
            TestRunner::assertEqual("5", std::to_string(para1->end), "Para end");
            
            if (!para1->children.empty()) {
                auto txt1 = para1->children[0];
                TestRunner::assertEqual("text", nodeTypeToString(txt1->type), "Text node type");
                TestRunner::assertEqual("0", std::to_string(txt1->beg), "Text beg");
                TestRunner::assertEqual("5", std::to_string(txt1->end), "Text end");
            }
        }
        
        // Bold
        // "Hello **bold**"
        // 01234567890123
        // Hello (text): 0-6 (Hello+space)
        // **bold**: 6-14 (8 chars)
        std::string text2 = "Hello **bold**";
        auto result2 = parser.parse(text2, options);
        if (!result2->children.empty()) {
            auto para2 = result2->children[0];
            if (para2->children.size() >= 2) {
                auto bold2 = para2->children[1];
                TestRunner::assertEqual("bold", nodeTypeToString(bold2->type), "Bold node type");
                TestRunner::assertEqual("6", std::to_string(bold2->beg), "Bold beg");
                TestRunner::assertEqual("14", std::to_string(bold2->end), "Bold end");
            }
        }
    }

    static void testUtf16Offsets() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("Olá 👋", options);
        auto paragraph = findFirstNode(result, NodeType::Paragraph);
        auto text = findFirstNode(result, NodeType::Text);

        TestRunner::assertEqual("6", std::to_string(result->end), "UTF16Offsets: document end");
        TestRunner::assertNotNull(paragraph.get(), "UTF16Offsets: paragraph");
        TestRunner::assertNotNull(text.get(), "UTF16Offsets: text");
        if (paragraph) {
            TestRunner::assertEqual("6", std::to_string(paragraph->end), "UTF16Offsets: paragraph end");
        }
        if (text) {
            TestRunner::assertEqual("0", std::to_string(text->beg), "UTF16Offsets: text beg");
            TestRunner::assertEqual("6", std::to_string(text->end), "UTF16Offsets: text end");
        }

        auto formattedResult = parser.parse("Olá 👋 **café**", options);
        auto bold = findFirstNode(formattedResult, NodeType::Bold);
        TestRunner::assertEqual("15", std::to_string(formattedResult->end), "UTF16Offsets: formatted document end");
        TestRunner::assertNotNull(bold.get(), "UTF16Offsets: bold");
        if (bold) {
            TestRunner::assertEqual("7", std::to_string(bold->beg), "UTF16Offsets: bold beg");
            TestRunner::assertEqual("15", std::to_string(bold->end), "UTF16Offsets: bold end");
            auto boldText = findFirstNode(bold, NodeType::Text);
            TestRunner::assertNotNull(boldText.get(), "UTF16Offsets: bold text");
            if (boldText) {
                TestRunner::assertEqual("9", std::to_string(boldText->beg), "UTF16Offsets: bold text beg");
                TestRunner::assertEqual("13", std::to_string(boldText->end), "UTF16Offsets: bold text end");
            }
        }
    }

    static void testParserFailureThrows() {
        MD4CParser parser;
        ParserOptions options{true, true};
        bool threw = false;

        try {
            parser.parseWithForcedFailureForTest("partial document", options);
        } catch (const std::runtime_error& error) {
            threw = std::string(error.what()).find("7") != std::string::npos;
        }

        TestRunner::assertTrue(threw, "ParserFailure: nonzero md_parse result throws");
    }

    static void testNullCharOffsets() {
        MD4CParser parser;
        ParserOptions options{true, true};

        std::string text;
        text.push_back('A');
        text.push_back('\0');
        text.push_back('B');

        auto result = parser.parse(text, options);
        TestRunner::assertEqual("3", std::to_string(result->end), "Null char doc end");

        if (!result->children.empty()) {
            auto para = result->children[0];
            TestRunner::assertEqual("0", std::to_string(para->beg), "Null char para beg");
            TestRunner::assertEqual("3", std::to_string(para->end), "Null char para end");

            if (!para->children.empty()) {
                auto txt = para->children[0];
                TestRunner::assertEqual("text", nodeTypeToString(txt->type), "Null char text node");
                TestRunner::assertEqual("0", std::to_string(txt->beg), "Null char text beg");
                TestRunner::assertEqual("3", std::to_string(txt->end), "Null char text end");
                TestRunner::assertEqual("3", std::to_string(txt->content.value_or("").size()), "Null char text size");
            }
        }
    }

    static void testLinkAttributes() {
        MD4CParser parser;
        ParserOptions options{true, true};

        auto result = parser.parse("[link](https://example.com \"hi&amp;bye\")", options);
        TestRunner::assertNotNull(result.get(), "Link attributes result not null");

        if (!result->children.empty()) {
            auto para = result->children[0];
            if (!para->children.empty()) {
                auto link = para->children[0];
                TestRunner::assertEqual("link", nodeTypeToString(link->type), "Link node");
                TestRunner::assertEqual("https://example.com", link->href.value_or(""), "Link href");
                TestRunner::assertEqual("hi&amp;bye", link->title.value_or(""), "Link title");
            }
        }

        std::string references = "[label0] [label2047]\n\n";
        for (size_t index = 0; index < 2048; ++index) {
            references += "[label" + std::to_string(index) + "]: https://example.com/" +
                std::to_string(index) + "\n";
        }
        const auto expanded = parser.parse(references, options);
        TestRunner::assertTrue(
            expanded->children.size() == 1 && expanded->children[0]->children.size() == 3,
            "Reference table growth preserves both links"
        );
        if (expanded->children.size() == 1 && expanded->children[0]->children.size() == 3) {
            const auto& links = expanded->children[0]->children;
            TestRunner::assertEqual("https://example.com/0", links.front()->href.value_or(""), "First grown reference target");
            TestRunner::assertEqual("https://example.com/2047", links.back()->href.value_or(""), "Last grown reference target");
        }
    }

    static void testOversizedInputClamp() {
        size_t maxSize = static_cast<size_t>(std::numeric_limits<MD_SIZE>::max());
        TestRunner::assertEqual(
            std::to_string(maxSize),
            std::to_string(MD4CParser::clampInputSizeForTest(maxSize)),
            "Clamp size at max"
        );

        if (maxSize < std::numeric_limits<size_t>::max()) {
            size_t over = maxSize + 1;
            TestRunner::assertEqual(
                std::to_string(maxSize),
                std::to_string(MD4CParser::clampInputSizeForTest(over)),
                "Clamp oversized input"
            );
        } else {
            TestRunner::assertTrue(true, "Clamp oversized input skipped");
        }
    }
    static void testEmptyInput() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("", options);

        TestRunner::assertEqual("document", nodeTypeToString(result->type), "Empty input creates document node");
        TestRunner::assertTrue(result->children.empty(), "Empty input has no children");
    }

    static void testSimpleParagraph() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("Hello world", options);

        TestRunner::assertEqual("document", nodeTypeToString(result->type), "Document root");
        TestRunner::assertTrue(result->children.size() == 1, "Has one child");

        auto paragraph = result->children[0];
        TestRunner::assertEqual("paragraph", nodeTypeToString(paragraph->type), "Paragraph node");

        if (!paragraph->children.empty()) {
            auto text = paragraph->children[0];
            TestRunner::assertEqual("text", nodeTypeToString(text->type), "Text node");
            TestRunner::assertEqual("Hello world", text->content.value_or(""), "Text content");
        }
    }

    static void testHeading() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("# Hello World", options);

        TestRunner::assertEqual("document", nodeTypeToString(result->type), "Document root");
        TestRunner::assertTrue(result->children.size() == 1, "Has one child");

        auto heading = result->children[0];
        TestRunner::assertEqual("heading", nodeTypeToString(heading->type), "Heading node");
        TestRunner::assertEqual("1", std::to_string(heading->level.value_or(0)), "Heading level 1");

        if (!heading->children.empty()) {
            auto text = heading->children[0];
            TestRunner::assertEqual("text", nodeTypeToString(text->type), "Heading text");
            TestRunner::assertEqual("Hello World", text->content.value_or(""), "Heading content");
        }
    }

    static void testBoldText() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("**bold text**", options);

        auto paragraph = result->children[0];
        TestRunner::assertEqual("paragraph", nodeTypeToString(paragraph->type), "Paragraph");

        if (!paragraph->children.empty()) {
            auto bold = paragraph->children[0];
            TestRunner::assertEqual("bold", nodeTypeToString(bold->type), "Bold node");

            if (!bold->children.empty()) {
                auto text = bold->children[0];
                TestRunner::assertEqual("text", nodeTypeToString(text->type), "Bold text");
                TestRunner::assertEqual("bold text", text->content.value_or(""), "Bold content");
            }
        }
    }

    static void testItalicText() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("*italic text*", options);

        auto paragraph = result->children[0];
        if (!paragraph->children.empty()) {
            auto italic = paragraph->children[0];
            TestRunner::assertEqual("italic", nodeTypeToString(italic->type), "Italic node");

            if (!italic->children.empty()) {
                auto text = italic->children[0];
                TestRunner::assertEqual("italic", nodeTypeToString(italic->type), "Italic node exists");
                TestRunner::assertEqual("text", nodeTypeToString(text->type), "Italic text");
                TestRunner::assertEqual("italic text", text->content.value_or(""), "Italic content");
            }
        }
    }

    static void testInlineCode() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("`code`", options);

        auto paragraph = result->children[0];
        if (!paragraph->children.empty()) {
            auto code = paragraph->children[0];
            TestRunner::assertEqual("code_inline", nodeTypeToString(code->type), "Code inline node");
            TestRunner::assertEqual("code", code->content.value_or(""), "Code content");
        }
    }

    static void testLink() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("[text](url)", options);

        auto paragraph = result->children[0];
        if (!paragraph->children.empty()) {
            auto link = paragraph->children[0];
            TestRunner::assertEqual("link", nodeTypeToString(link->type), "Link node");
            TestRunner::assertEqual("url", link->href.value_or(""), "Link href");

            if (!link->children.empty()) {
                auto text = link->children[0];
                TestRunner::assertEqual("text", nodeTypeToString(text->type), "Link text");
                TestRunner::assertEqual("text", text->content.value_or(""), "Link text content");
            }
        }
    }

    static void testImage() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("![alt](src)", options);

        auto paragraph = result->children[0];
        if (!paragraph->children.empty()) {
            auto image = paragraph->children[0];
            TestRunner::assertEqual("image", nodeTypeToString(image->type), "Image node");
            TestRunner::assertEqual("src", image->href.value_or(""), "Image src");
            TestRunner::assertEqual("alt", image->alt.value_or(""), "Image alt");
        }
    }

    static void testCodeBlock() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("```\ncode\n```", options);

        TestRunner::assertTrue(result->children.size() == 1, "Has code block");
        auto codeBlock = result->children[0];
        TestRunner::assertEqual("code_block", nodeTypeToString(codeBlock->type), "Code block node");

        if (!codeBlock->children.empty()) {
            auto text = codeBlock->children[0];
            TestRunner::assertEqual("text", nodeTypeToString(text->type), "Code block text");
            TestRunner::assertTrue(text->content.value_or("").find("code") != std::string::npos, "Code content");
        }
    }

    static void testList() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("- Item 1\n- Item 2", options);

        TestRunner::assertTrue(result->children.size() == 1, "Has list");
        auto list = result->children[0];
        TestRunner::assertEqual("list", nodeTypeToString(list->type), "List node");
        TestRunner::assertTrue(list->children.size() == 2, "Has 2 items");
    }

    static void testListWithInlineCode() {
        MD4CParser parser;
        ParserOptions options{true, true};
        std::string markdown = "- Reply to Sarah's email about the `Series A` discussion";
        auto result = parser.parse(markdown, options);

        TestRunner::assertTrue(result->children.size() == 1, "Has list");
        auto list = result->children[0];
        TestRunner::assertEqual("list", nodeTypeToString(list->type), "List node");
        TestRunner::assertTrue(list->children.size() == 1, "Has 1 item");

        auto listItem = list->children[0];
        TestRunner::assertEqual("list_item", nodeTypeToString(listItem->type), "List item node");
        TestRunner::assertTrue(!listItem->children.empty(), "List item has children");

        // Tight lists have content directly under list_item (no paragraph wrapper)
        // Check list item children: should have text, code_inline, text
        TestRunner::assertTrue(listItem->children.size() >= 3, "List item has at least 3 children (text, code, text)");

        // Find code_inline node
        auto codeNode = std::find_if(listItem->children.begin(), listItem->children.end(),
            [](const auto& child) { return nodeTypeToString(child->type) == "code_inline"; });
        TestRunner::assertTrue(codeNode != listItem->children.end(), "List item contains code_inline");
        TestRunner::assertEqual("Series A", (*codeNode)->content.value_or(""), "Code content is 'Series A'");

        // Verify no line breaks or soft breaks between text and code
        bool hasUnwantedBreaks = false;
        for (size_t i = 1; i < listItem->children.size(); i++) {
            auto prevType = nodeTypeToString(listItem->children[i-1]->type);
            auto currType = nodeTypeToString(listItem->children[i]->type);
            if ((currType == "line_break" || currType == "soft_break") &&
                (prevType == "text" || prevType == "code_inline")) {
                hasUnwantedBreaks = true;
                break;
            }
        }
        TestRunner::assertTrue(!hasUnwantedBreaks, "No unwanted line breaks between text and inline code");
    }

    static void testTaskListWithInlineCode() {
        MD4CParser parser;
        ParserOptions options{true, true};
        std::string markdown = "- [ ] Reply to Sarah's email about the `Series A` discussion";
        auto result = parser.parse(markdown, options);

        TestRunner::assertTrue(result->children.size() == 1, "Has list");
        auto list = result->children[0];
        TestRunner::assertEqual("list", nodeTypeToString(list->type), "List node");
        TestRunner::assertTrue(list->children.size() == 1, "Has 1 item");

        auto taskItem = list->children[0];
        TestRunner::assertEqual("task_list_item", nodeTypeToString(taskItem->type), "Task list item node");
        TestRunner::assertTrue(taskItem->checked.value_or(true) == false, "Task item is unchecked");
        TestRunner::assertTrue(!taskItem->children.empty(), "Task item has children");

        // Tight lists have content directly under task_list_item (no paragraph wrapper)
        // Check task item children: should have text, code_inline, text
        TestRunner::assertTrue(taskItem->children.size() >= 3, "Task item has at least 3 children (text, code, text)");

        // Find code_inline node
        auto codeNode = std::find_if(taskItem->children.begin(), taskItem->children.end(),
            [](const auto& child) { return nodeTypeToString(child->type) == "code_inline"; });
        TestRunner::assertTrue(codeNode != taskItem->children.end(), "Task item contains code_inline");
        TestRunner::assertEqual("Series A", (*codeNode)->content.value_or(""), "Code content is 'Series A'");

        // Verify no line breaks or soft breaks between text and code
        bool hasUnwantedBreaks = false;
        for (size_t i = 1; i < taskItem->children.size(); i++) {
            auto prevType = nodeTypeToString(taskItem->children[i-1]->type);
            auto currType = nodeTypeToString(taskItem->children[i]->type);
            if ((currType == "line_break" || currType == "soft_break") &&
                (prevType == "text" || prevType == "code_inline")) {
                hasUnwantedBreaks = true;
                break;
            }
        }
        TestRunner::assertTrue(!hasUnwantedBreaks, "No unwanted line breaks between text and inline code in task list");
    }

    static void testTable() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("| A | B |\n|---|---|\n| 1 | 2 |", options);

        TestRunner::assertTrue(result->children.size() == 1, "Has table");
        auto table = result->children[0];
        TestRunner::assertEqual("table", nodeTypeToString(table->type), "Table node");
    }

    static void testNestedFormatting() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("**bold *italic* bold**", options);

        auto paragraph = result->children[0];
        if (!paragraph->children.empty()) {
            auto bold = paragraph->children[0];
            TestRunner::assertEqual("bold", nodeTypeToString(bold->type), "Outer bold");

            if (!bold->children.empty()) {
                // Should have text, italic, text
                TestRunner::assertTrue(bold->children.size() >= 3, "Has nested content");
            }
        }
    }

    static void testMemoryLeaks() {
        MD4CParser parser;
        ParserOptions options{true, true};

        for (int i = 0; i < 1000; i++) {
            auto result = parser.parse("# Test " + std::to_string(i), options);
            TestRunner::assertNotNull(result.get(), "Parse result not null");
            TestRunner::assertEqual("document", nodeTypeToString(result->type), "Document type");
        }
        TestRunner::assertTrue(true, "Memory leak test completed");
    }

    static void testNullAndEmptyInputs() {
        MD4CParser parser;
        ParserOptions options{true, true};

        auto result1 = parser.parse("", options);
        TestRunner::assertNotNull(result1.get(), "Empty string result not null");
        TestRunner::assertEqual("document", nodeTypeToString(result1->type), "Empty string creates document");

        auto result2 = parser.parse("   \n\t  \r\n  ", options);
        TestRunner::assertNotNull(result2.get(), "Whitespace result not null");
        TestRunner::assertEqual("document", nodeTypeToString(result2->type), "Whitespace creates document");
    }

    static void testMalformedMarkdown() {
        MD4CParser parser;
        ParserOptions options{true, true};

        auto result1 = parser.parse("[unclosed link", options);
        TestRunner::assertNotNull(result1.get(), "Unclosed bracket result not null");

        auto result2 = parser.parse("[text](unclosed", options);
        TestRunner::assertNotNull(result2.get(), "Unclosed paren result not null");

        auto result3 = parser.parse("[text](url[extra]", options);
        TestRunner::assertNotNull(result3.get(), "Mismatched brackets result not null");

        std::string deeplyNested = std::string(100, '[') + "text" + std::string(100, ']');
        auto result4 = parser.parse(deeplyNested, options);
        TestRunner::assertNotNull(result4.get(), "Deeply nested brackets result not null");

        auto result5 = parser.parse("text\x00null\x00text", options);
        TestRunner::assertNotNull(result5.get(), "Null characters result not null");
    }

    static void testLargeInputs() {
        MD4CParser parser;
        ParserOptions options{true, true};

        std::string largeInput(50000, 'a');
        auto result1 = parser.parse(largeInput, options);
        TestRunner::assertNotNull(result1.get(), "Large input result not null");

        std::string manyHeadings;
        for (int i = 0; i < 1000; i++) {
            manyHeadings += "# Heading " + std::to_string(i) + "\n\n";
        }
        auto result2 = parser.parse(manyHeadings, options);
        TestRunner::assertNotNull(result2.get(), "Many headings result not null");

        std::string nestedLists = "- item\n";
        for (int i = 0; i < 50; i++) {
            nestedLists += std::string(i * 2, ' ') + "- nested\n";
        }
        auto result3 = parser.parse(nestedLists, options);
        TestRunner::assertNotNull(result3.get(), "Nested lists result not null");
    }

    static void testBufferOverflowProtection() {
        MD4CParser parser;
        ParserOptions options{true, true};

        // Test extremely long words
        std::string longWord(100000, 'a');
        auto result1 = parser.parse(longWord, options);
        TestRunner::assertNotNull(result1.get(), "Long word result not null");

        // Test many inline elements
        std::string manyInlines;
        for (int i = 0; i < 1000; i++) {
            manyInlines += "`code" + std::to_string(i) + "` ";
        }
        auto result2 = parser.parse(manyInlines, options);
        TestRunner::assertNotNull(result2.get(), "Many inlines result not null");

        // Test very long URLs
        std::string longUrl = "[text](http://example.com/" + std::string(10000, 'a') + ")";
        auto result3 = parser.parse(longUrl, options);
        TestRunner::assertNotNull(result3.get(), "Long URL result not null");
    }

    static void testUnicodeHandling() {
        MD4CParser parser;
        ParserOptions options{true, true};

        // Test UTF-8 characters
        auto result1 = parser.parse("Hello 世界 🌍", options);
        TestRunner::assertNotNull(result1.get(), "Unicode result not null");

        // Test emoji
        auto result2 = parser.parse("🚀 Rocket 🚀", options);
        TestRunner::assertNotNull(result2.get(), "Emoji result not null");

        // Test combining characters
        auto result3 = parser.parse("café", options);
        TestRunner::assertNotNull(result3.get(), "Combining chars result not null");

        // Test zero-width characters
        auto result4 = parser.parse("text\u200B\u200C\u200Dtext", options);
        TestRunner::assertNotNull(result4.get(), "Zero-width chars result not null");
    }

    static void testResourceCleanup() {
        // Test that parser cleans up properly after multiple uses
        {
            MD4CParser parser;
            ParserOptions options{true, true};

            for (int i = 0; i < 100; i++) {
                auto result = parser.parse("# Test " + std::to_string(i), options);
                TestRunner::assertNotNull(result.get(), "Resource cleanup test iteration");
            }
        }
        TestRunner::assertTrue(true, "Resource cleanup completed without issues");
    }

    static void testConcurrentOptions() {
        MD4CParser parser;

        ParserOptions options1{true, true};
        ParserOptions options2{false, false};
        ParserOptions options3{true, false};
        ParserOptions options4{false, true};

        auto result1 = parser.parse("**bold** `code` |table|", options1);
        auto result2 = parser.parse("**bold** `code` |table|", options2);
        auto result3 = parser.parse("**bold** `code` |table|", options3);
        auto result4 = parser.parse("**bold** `code` |table|", options4);

        TestRunner::assertNotNull(result1.get(), "Options {true, true} result not null");
        TestRunner::assertNotNull(result2.get(), "Options {false, false} result not null");
        TestRunner::assertNotNull(result3.get(), "Options {true, false} result not null");
        TestRunner::assertNotNull(result4.get(), "Options {false, true} result not null");
    }

    static void testParserOptionToggles() {
        MD4CParser parser;

        const std::string tableMarkdown = "| A |\n|---|\n| B |";
        ParserOptions gfmEnabled{true, false};
        ParserOptions gfmDisabled{false, false};
        auto gfmResult = parser.parse(tableMarkdown, gfmEnabled);
        auto noGfmResult = parser.parse(tableMarkdown, gfmDisabled);
        TestRunner::assertNotNull(
            findFirstNode(gfmResult, NodeType::Table).get(),
            "ParserOptions.gfm true: table node"
        );
        TestRunner::assertTrue(
            findFirstNode(noGfmResult, NodeType::Table) == nullptr,
            "ParserOptions.gfm false: no table node"
        );

        ParserOptions mathEnabled{false, true};
        ParserOptions mathDisabled{false, false};
        auto mathResult = parser.parse("$x^2$", mathEnabled);
        auto noMathResult = parser.parse("$x^2$", mathDisabled);
        TestRunner::assertNotNull(
            findFirstNode(mathResult, NodeType::MathInline).get(),
            "ParserOptions.math true: math_inline node"
        );
        TestRunner::assertTrue(
            findFirstNode(noMathResult, NodeType::MathInline) == nullptr,
            "ParserOptions.math false: no math_inline node"
        );

        ParserOptions htmlDefault{true, true};
        ParserOptions htmlEnabled{true, true, true};
        auto htmlDefaultResult = parser.parse("<div>block</div>\n", htmlDefault);
        auto htmlEnabledResult = parser.parse("<div>block</div>\n", htmlEnabled);
        TestRunner::assertTrue(
            findFirstNode(htmlDefaultResult, NodeType::HtmlBlock) == nullptr,
            "ParserOptions.html default: no html_block node"
        );
        TestRunner::assertNotNull(
            findFirstNode(htmlEnabledResult, NodeType::HtmlBlock).get(),
            "ParserOptions.html true: html_block node"
        );
    }

    // Regression test: CodeBlock children contain text (used by extractPlainText/flattenNodeText)
    static void testCodeBlockHasTextChildren() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("```python\nprint('hello')\n```", options);

        TestRunner::assertTrue(result->children.size() == 1, "CodeBlock: has one child");
        auto codeBlock = result->children[0];
        TestRunner::assertEqual("code_block", nodeTypeToString(codeBlock->type), "CodeBlock: node type");
        TestRunner::assertEqual("python", codeBlock->language.value_or(""), "CodeBlock: language is python");
        TestRunner::assertTrue(!codeBlock->children.empty(), "CodeBlock: has text children");

        // Collect all text content from children
        std::string allText;
        for (const auto& child : codeBlock->children) {
            if (child->type == NodeType::Text && child->content.has_value()) {
                allText += child->content.value();
            }
        }
        TestRunner::assertTrue(allText.find("print('hello')") != std::string::npos,
            "CodeBlock: text children contain code content");
    }

    static void testStrikethrough() {
        MD4CParser parser;
        ParserOptions options{true, true}; // gfm enabled
        auto result = parser.parse("~~deleted~~", options);

        TestRunner::assertTrue(result->children.size() == 1, "Strikethrough: has paragraph");
        auto para = result->children[0];
        TestRunner::assertEqual("paragraph", nodeTypeToString(para->type), "Strikethrough: paragraph type");
        TestRunner::assertTrue(!para->children.empty(), "Strikethrough: paragraph has children");

        auto strike = para->children[0];
        TestRunner::assertEqual("strikethrough", nodeTypeToString(strike->type), "Strikethrough: node type");
        TestRunner::assertTrue(!strike->children.empty(), "Strikethrough: has text child");

        auto text = strike->children[0];
        TestRunner::assertEqual("text", nodeTypeToString(text->type), "Strikethrough: text node type");
        TestRunner::assertEqual("deleted", text->content.value_or(""), "Strikethrough: text content");
    }

    static void testMathInline() {
        MD4CParser parser;
        ParserOptions options{true, true}; // math enabled
        auto result = parser.parse("$x$", options);

        TestRunner::assertTrue(result->children.size() == 1, "MathInline: has paragraph");
        auto para = result->children[0];
        TestRunner::assertTrue(!para->children.empty(), "MathInline: paragraph has children");

        auto math = para->children[0];
        TestRunner::assertEqual("math_inline", nodeTypeToString(math->type), "MathInline: node type");

        // Native math content excludes the dollar delimiters.
        auto textNode = findFirstNode(math, NodeType::Text);
        TestRunner::assertNotNull(textNode.get(), "MathInline: has text node");
        TestRunner::assertEqual("x", textNode->content.value_or(""), "MathInline: exact native content");

        auto squared = parser.parse("$x^2$", options);
        auto squaredText = findFirstNode(squared, NodeType::Text);
        TestRunner::assertNotNull(squaredText.get(), "MathInline squared: has text node");
        TestRunner::assertEqual("x^2", squaredText->content.value_or(""),
            "MathInline squared: exact native content without dollars");

        // An empty "$$" pair is NOT a math span; it stays literal text.
        auto empty = parser.parse("$$", options);
        auto emptyText = findFirstNode(empty, NodeType::Text);
        TestRunner::assertNotNull(emptyText.get(), "MathInline empty: literal text node");
        TestRunner::assertEqual("$$", emptyText->content.value_or(""),
            "MathInline empty: bare dollars stay literal");
    }

    static void testMathBlock() {
        MD4CParser parser;
        ParserOptions options{true, true}; // math enabled
        auto result = parser.parse("$$x^2 + y^2$$", options);

        TestRunner::assertTrue(!result->children.empty(), "MathBlock: has children");

        // Find the math_block or paragraph containing math_block span
        // md4c with LATEXMATHSPANS treats $$ as MD_SPAN_LATEXMATH_DISPLAY inside a paragraph
        auto para = result->children[0];
        bool foundMathBlock = false;
        if (nodeTypeToString(para->type) == "paragraph") {
            for (const auto& child : para->children) {
                if (child->type == NodeType::MathBlock) {
                    foundMathBlock = true;
                    break;
                }
            }
        } else if (para->type == NodeType::MathBlock) {
            foundMathBlock = true;
        }
        TestRunner::assertTrue(foundMathBlock, "MathBlock: found math_block node");

        // Exact block content: the display delimiters are not part of the content.
        auto textNode = findFirstNode(result, NodeType::Text);
        TestRunner::assertNotNull(textNode.get(), "MathBlock: has text node");
        TestRunner::assertEqual("x^2 + y^2", textNode->content.value_or(""),
            "MathBlock: exact native content without dollars");
    }

    static void testIssue74PublicDisplayMath() {
        const std::string markdown =
            "$$\n"
            "x_{n+1}-x_n\n"
            "= \\frac 12\\left(x_n+\\frac{2}{x_n}\\right)-x_n\n"
            "= \\frac{2-x_n^2}{2x_n}.\n"
            "$$";
        ParserOptions options{true, true};

        MD4CParser parser;
        const auto result = parser.parse(markdown, options);
        const auto mathBlock = findFirstNode(result, NodeType::MathBlock);
        TestRunner::assertNotNull(
            mathBlock.get(),
            "Issue #74 body: standalone delimiters produce a math_block"
        );
    }

    static void testIssue74StandaloneEqualsDisplayMath() {
        const std::string markdown =
            "$$\n"
            "x_{n+1}-x_n\n"
            "=\n"
            "\\frac 12\\left(x_n+\\frac{2}{x_n}\\right)-x_n\n"
            "=\n"
            "\\frac{2-x_n^2}{2x_n}.\n"
            "$$";
        const std::string expectedContent =
            "x_{n+1}-x_n = \\frac 12\\left(x_n+\\frac{2}{x_n}\\right)-x_n = \\frac{2-x_n^2}{2x_n}.";
        ParserOptions options{true, true};

        const auto removeWhitespace = [](const std::string& value) {
            std::string compact;
            for (unsigned char character : value) {
                if (character != ' ' && character != '\n' && character != '\r' && character != '\t') {
                    compact.push_back(static_cast<char>(character));
                }
            }
            return compact;
        };

        MD4CParser parser;
        const auto result = parser.parse(markdown, options);
        const auto mathBlock = findFirstNode(result, NodeType::MathBlock);
        TestRunner::assertEqual(
            "1",
            std::to_string(countNodes(result, NodeType::MathBlock)),
            "Issue #74: standalone equals produce exactly one math_block"
        );

        TestRunner::assertEqual(
            removeWhitespace(expectedContent),
            mathBlock ? removeWhitespace(flattenNodeText(mathBlock)) : "",
            "Issue #74: standalone equals math_block contains the full expression"
        );

        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        HybridMarkdownParser publicParser;
        BindingParserOptions bindingOptions;
        bindingOptions.math = true;
        const auto staticJson = publicParser.parseWithOptions(markdown, bindingOptions);
        auto streamingSession =
            std::make_shared<::margelo::nitro::Markdown::HybridMarkdownSession>();
        streamingSession->reset(markdown);
        const auto streamingJson = streamingSession->parseWithOptions(bindingOptions);
        const auto countOccurrences = [](const std::string& value, const std::string& needle) {
            size_t count = 0;
            size_t offset = 0;
            while ((offset = value.find(needle, offset)) != std::string::npos) {
                count += 1;
                offset += needle.size();
            }
            return count;
        };
        const auto assertPublicMathBlock = [&](const std::string& json, const std::string& mode) {
            TestRunner::assertEqual(
                "1",
                std::to_string(countOccurrences(json, "\"type\":\"math_block\"")),
                "Issue #74: public parser " + mode + " output has one math_block"
            );
            TestRunner::assertTrue(
                json.find("x_{n+1}-x_n") != std::string::npos &&
                json.find("\\\\frac 12\\\\left") != std::string::npos &&
                json.find("\\\\frac{2-x_n^2}{2x_n}.") != std::string::npos,
                "Issue #74: public parser " + mode + " math_block contains the full expression"
            );
        };
        assertPublicMathBlock(staticJson, "static");
        assertPublicMathBlock(streamingJson, "streaming");
    }

    static void testIssue74StandaloneDisplayMathContract() {
        MD4CParser parser;
        ParserOptions options{true, true, true, true};

        const auto parseMath = [&](const std::string& markdown, const std::string& name) {
            const auto result = parser.parse(markdown, options);
            TestRunner::assertEqual(
                "1",
                std::to_string(countNodes(result, NodeType::MathBlock)),
                name + ": one math_block"
            );
            return result;
        };

        const std::string opaqueContent =
            "$$\n"
            "\n"
            "= standalone equals\n"
            "- standalone minus\n"
            "# heading text\n"
            "> blockquote text\n"
            "- list text\n"
            "``` code-like text\n"
            "<tag>html-like text</tag>\n"
            "$$x$$\n"
            "$$$\n"
            "$$ not a close\n"
            "$$\n";
        const auto opaqueResult = parseMath(opaqueContent, "Issue #74 opaque content");
        TestRunner::assertEqual(
            "math_block",
            nodeTypeToString(opaqueResult->children[0]->type),
            "Issue #74 opaque content: root block"
        );
        for (const auto type : {
            NodeType::Heading,
            NodeType::Paragraph,
            NodeType::HorizontalRule,
            NodeType::Blockquote,
            NodeType::List,
            NodeType::CodeBlock,
            NodeType::HtmlBlock,
        }) {
            TestRunner::assertTrue(
                countNodes(opaqueResult, type) == 0,
                "Issue #74 opaque content: no nested Markdown block"
            );
        }
        const std::string opaqueText = flattenNodeText(opaqueResult->children[0]);
        TestRunner::assertTrue(
            opaqueText.find("= standalone equals") != std::string::npos &&
            opaqueText.find("- standalone minus") != std::string::npos &&
            opaqueText.find("# heading text") != std::string::npos &&
            opaqueText.find("$$ not a close") != std::string::npos,
            "Issue #74 opaque content: Markdown-looking lines stay text"
        );

        for (size_t leadingSpaces = 0; leadingSpaces <= 3; leadingSpaces++) {
            std::string markdown(leadingSpaces, ' ');
            markdown += "$$ \t\nx + y\n";
            markdown += std::string(leadingSpaces, ' ');
            markdown += "$$\t\n";

            const auto result = parser.parse(markdown, options);
            const auto math = findFirstNode(result, NodeType::MathBlock);
            const auto text = findFirstNode(math, NodeType::Text);
            TestRunner::assertTrue(
                countNodes(result, NodeType::MathBlock) == 1 &&
                text && text->content.value_or("") == "x + y\n",
                "Issue #74 leading spaces " + std::to_string(leadingSpaces) +
                    ": opener and closer accepted"
            );
        }

        const auto fourSpaceOpener = parser.parse("    $$\nx + y\n", options);
        TestRunner::assertEqual(
            "0",
            std::to_string(countNodes(fourSpaceOpener, NodeType::MathBlock)),
            "Issue #74 leading spaces 4: opener rejected"
        );

        const auto fourSpaceCloser = parser.parse("$$\nx + y\n    $$\n", options);
        const auto fourSpaceCloserMath = findFirstNode(fourSpaceCloser, NodeType::MathBlock);
        TestRunner::assertTrue(
            countNodes(fourSpaceCloser, NodeType::MathBlock) == 1 &&
            fourSpaceCloserMath &&
            flattenNodeText(fourSpaceCloserMath).find("    $$") != std::string::npos,
            "Issue #74 leading spaces 4: closer remains math content"
        );

        parseMath("$$ \t\ncontent\n$$\t", "Issue #74 exact whitespace fences");
        parseMath("> $$\n> x = y\n> $$", "Issue #74 blockquote fence");
        parseMath("- $$\n  x = y\n  $$\n", "Issue #74 tight-list fence");
        parseMath(
            "- before\n\n- $$\n  x = y\n  $$\n",
            "Issue #74 loose-list fence"
        );

        const std::vector<std::pair<std::string, bool>> delimiterCases = {
            {"$$x\ny\n$$", true},
            {"$$$\nx\n$$", false},
            {"\\$$\nx\n$$", false},
            {"$$ other\nx\n", false},
            {"    $$\nx\n$$", false},
            {"$$", false},
            {"$$x$$", true},
            {"$$\nx\n$$$\n$$ other\n$$\n", true},
            {"$$\nx\n", true},
        };
        for (size_t index = 0; index < delimiterCases.size(); index++) {
            const auto& [markdown, hasMath] = delimiterCases[index];
            const auto result = parser.parse(markdown, options);
            TestRunner::assertTrue(
                (countNodes(result, NodeType::MathBlock) == (hasMath ? 1u : 0u)),
                "Issue #74 delimiters: case " + std::to_string(index)
            );
        }

        for (const auto& [ending, name] : std::vector<std::pair<std::string, std::string>>{
            {"\n", "LF"},
            {"\r\n", "CRLF"},
            {"\r", "CR"},
        }) {
            const auto result = parseMath("$$" + ending + "π" + ending + "$$", "Issue #74 " + name);
            const auto math = findFirstNode(result, NodeType::MathBlock);
            TestRunner::assertTrue(
                math && flattenNodeText(math).find("π") != std::string::npos,
                "Issue #74 " + name + ": Unicode content"
            );
        }

        std::string nulMarkdown = "$$\nπ";
        nulMarkdown.push_back('\0');
        nulMarkdown += "x\n$$";
        const auto nulResult = parseMath(nulMarkdown, "Issue #74 embedded NUL");
        const auto nulText = flattenNodeText(findFirstNode(nulResult, NodeType::MathBlock));
        TestRunner::assertTrue(
            nulText.find(std::string("π\0x", 4)) != std::string::npos,
            "Issue #74 embedded NUL: content preserved"
        );
        TestRunner::assertTrue(
            nulText.find('\0') != std::string::npos,
            "Issue #74 embedded NUL: flattened NUL preserved"
        );
        TestRunner::assertTrue(
            canonicalizeNode(nulResult).find("\\u0000") != std::string::npos,
            "Issue #74 embedded NUL: canonical content contains NUL"
        );

        const std::string offsetMarkdown = "prefix\n\n$$\nπ\n$$\ntrailing";
        const auto offsetResult = parser.parse(offsetMarkdown, options);
        const auto offsetMath = findFirstNode(offsetResult, NodeType::MathBlock);
        TestRunner::assertEqual(
            "8",
            offsetMath ? std::to_string(offsetMath->beg) : "",
            "Issue #74 offsets: exact math beginning"
        );
        TestRunner::assertTrue(
            offsetResult &&
            offsetResult->end == 24 &&
            hasValidMonotonicOffsets(offsetResult, offsetResult->end),
            "Issue #74 offsets: monotonic UTF-16 ranges"
        );

        ParserOptions disabled = options;
        disabled.math = false;
        const auto disabledResult = parser.parse(opaqueContent, disabled);
        TestRunner::assertTrue(
            countNodes(disabledResult, NodeType::MathBlock) == 0,
            "Issue #74 math=false: no math_block"
        );
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;
        BindingParserOptions disabledBinding;
        disabledBinding.math = false;
        HybridMarkdownParser disabledParser;
        const auto disabledStatic = disabledParser.parseWithOptions(opaqueContent, disabledBinding);
        auto disabledSession =
            std::make_shared<::margelo::nitro::Markdown::HybridMarkdownSession>();
        disabledSession->reset(opaqueContent);
        const auto disabledStreaming = disabledSession->parseWithOptions(disabledBinding);
        TestRunner::assertEqual(
            disabledStatic,
            disabledStreaming,
            "Issue #74 math=false: static and streaming bytes stay identical"
        );

        BindingParserOptions bindingOptions;
        bindingOptions.math = true;
        const std::string streamingMarkdown = "$$\nπ + 1\n$$\n\ntrailing";
        const std::string streamingPrefix = streamingMarkdown.substr(0, 8);
        auto warmSession =
            std::make_shared<::margelo::nitro::Markdown::HybridMarkdownSession>();
        warmSession->append(streamingPrefix);
        const auto warmPrefix = warmSession->parseWithOptions(bindingOptions);
        warmSession->append(streamingMarkdown.substr(streamingPrefix.size()));
        const auto warmFull = warmSession->parseWithOptions(bindingOptions);
        HybridMarkdownParser coldParser;
        const auto coldFull = coldParser.parseWithOptions(streamingMarkdown, bindingOptions);
        TestRunner::assertTrue(
            warmPrefix.find("math_block") != std::string::npos &&
            warmFull == coldFull,
            "Issue #74 streaming: session prefix and appended bytes match a cold parse"
        );

        const std::vector<std::string> structuredTokens = {
            "$$", "$$ ", "$$\t", "$$$", "$$x", "=", "-", "# h", "> q",
            "```", "\\$$", "text", "<tag>", std::string("\0", 1),
        };
        std::mt19937 rng(74);
        bool fuzzPassed = true;
        for (size_t documentIndex = 0; documentIndex < 256; documentIndex++) {
            std::string document;
            const size_t lineCount = 1 + (rng() % 24);
            for (size_t lineIndex = 0; lineIndex < lineCount; lineIndex++) {
                const auto& token = structuredTokens[rng() % structuredTokens.size()];
                document.append(token);
                document.append((lineIndex % 3 == 0) ? "\r\n" : (lineIndex % 3 == 1 ? "\r" : "\n"));
            }
            try {
                const auto first = parser.parse(document, options);
                const auto second = parser.parse(document, options);
                fuzzPassed = fuzzPassed && first && second &&
                    canonicalizeNode(first) == canonicalizeNode(second);
            } catch (const std::exception&) {
                fuzzPassed = false;
                break;
            }
        }
        TestRunner::assertTrue(fuzzPassed, "Issue #74 structured dollar-fence fuzz is deterministic");

        std::string adversarial = "$$\n";
        adversarial.reserve(700'000);
        for (size_t index = 0; index < 50'000; index++) {
            adversarial += "$$$ delimiter-looking content\n";
        }
        const auto adversarialResult = parser.parse(adversarial, options);
        TestRunner::assertEqual(
            "1",
            std::to_string(countNodes(adversarialResult, NodeType::MathBlock)),
            "Issue #74 bounded delimiter scan parses one unclosed block"
        );
    }

    static void testHtmlDisabledByDefault() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("before <span>hi</span> after\n\n<div>block</div>", options);

        TestRunner::assertTrue(
            findFirstNode(result, NodeType::HtmlInline) == nullptr,
            "HTML disabled: no html_inline node"
        );
        TestRunner::assertTrue(
            findFirstNode(result, NodeType::HtmlBlock) == nullptr,
            "HTML disabled: no html_block node"
        );
    }

    static void testHtmlEnabled() {
        MD4CParser parser;
        ParserOptions options{true, true, true};

        auto inlineResult = parser.parse("before <span>hi</span> after", options);
        auto htmlInline = findFirstNode(inlineResult, NodeType::HtmlInline);
        TestRunner::assertNotNull(htmlInline.get(), "HTML enabled: found html_inline node");
        if (htmlInline) {
            TestRunner::assertEqual(
                "<span>",
                htmlInline->content.value_or(""),
                "HTML enabled: inline content"
            );
        }

        auto blockResult = parser.parse("<div>block</div>\n", options);
        auto htmlBlock = findFirstNode(blockResult, NodeType::HtmlBlock);
        TestRunner::assertNotNull(htmlBlock.get(), "HTML enabled: found html_block node");
        if (htmlBlock) {
            TestRunner::assertTrue(
                htmlBlock->content.value_or("").find("<div>block</div>") != std::string::npos,
                "HTML enabled: block content"
            );
        }
    }

    static void testHeadingLevels2Through6() {
        MD4CParser parser;
        ParserOptions options{true, true};

        for (int level = 2; level <= 6; level++) {
            std::string markdown = std::string(level, '#') + " Heading " + std::to_string(level);
            auto result = parser.parse(markdown, options);

            TestRunner::assertTrue(result->children.size() == 1,
                "Heading L" + std::to_string(level) + ": has one child");
            auto heading = result->children[0];
            TestRunner::assertEqual("heading", nodeTypeToString(heading->type),
                "Heading L" + std::to_string(level) + ": node type");
            TestRunner::assertEqual(std::to_string(level),
                std::to_string(heading->level.value_or(0)),
                "Heading L" + std::to_string(level) + ": level value");

            if (!heading->children.empty()) {
                auto text = heading->children[0];
                TestRunner::assertEqual("Heading " + std::to_string(level),
                    text->content.value_or(""),
                    "Heading L" + std::to_string(level) + ": text content");
            }
        }
    }

    static void testOrderedListWithCustomStart() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("5. First\n6. Second\n7. Third", options);

        TestRunner::assertTrue(result->children.size() == 1, "OL custom start: has list");
        auto list = result->children[0];
        TestRunner::assertEqual("list", nodeTypeToString(list->type), "OL custom start: list type");
        TestRunner::assertTrue(list->ordered.value_or(false), "OL custom start: is ordered");
        TestRunner::assertEqual("5", std::to_string(list->start.value_or(0)),
            "OL custom start: starts at 5");
        TestRunner::assertTrue(list->children.size() == 3, "OL custom start: has 3 items");
    }

    static void testSoftBreakAndHardBreak() {
        MD4CParser parser;
        ParserOptions options{true, true};

        // Soft break: single newline within a paragraph
        auto result1 = parser.parse("line1\nline2", options);
        auto para1 = result1->children[0];
        TestRunner::assertEqual("paragraph", nodeTypeToString(para1->type), "SoftBreak: paragraph type");
        bool foundSoftBreak = false;
        for (const auto& child : para1->children) {
            if (child->type == NodeType::SoftBreak) {
                foundSoftBreak = true;
                break;
            }
        }
        TestRunner::assertTrue(foundSoftBreak, "SoftBreak: found soft_break node");

        // Hard break: two trailing spaces + newline
        auto result2 = parser.parse("line1  \nline2", options);
        auto para2 = result2->children[0];
        TestRunner::assertEqual("paragraph", nodeTypeToString(para2->type), "HardBreak: paragraph type");
        bool foundHardBreak = false;
        for (const auto& child : para2->children) {
            if (child->type == NodeType::LineBreak) {
                foundHardBreak = true;
                break;
            }
        }
        TestRunner::assertTrue(foundHardBreak, "HardBreak: found line_break node");
    }

    static void testBreakSourceOffsets() {
        struct BreakCase {
            const char* name;
            std::string markdown;
            NodeType type;
            OFF beg;
            OFF end;
            std::string sourceSlice;
        };

        const std::vector<BreakCase> cases = {
            {
                "LF soft break", "one\ntwo", NodeType::SoftBreak, 3, 4, "\n"
            },
            {
                "CRLF soft break", "one\r\ntwo", NodeType::SoftBreak, 3, 5,
                "\r\n"
            },
            {
                "Unicode soft break", "🙂é\nnext", NodeType::SoftBreak, 3, 4,
                "\n"
            },
            {
                "Unicode CRLF soft break", "🙂a\r\nb", NodeType::SoftBreak, 3,
                5, "\r\n"
            },
            {
                "two-space hard break", "a  \nb", NodeType::LineBreak, 1, 4,
                "  \n"
            },
            {
                "two-space CRLF hard break", "a  \r\nb", NodeType::LineBreak,
                1, 5, "  \r\n"
            },
            {
                "backslash hard break", "a\\\nb", NodeType::LineBreak, 1, 3,
                "\\\n"
            },
            {
                "Unicode backslash CRLF hard break", "🙂a\\\r\nb",
                NodeType::LineBreak, 3, 6, "\\\r\n"
            },
            {
                "soft break after multi-line link destination", "[a](\n/u)\nb",
                NodeType::SoftBreak, 8, 9, "\n"
            },
            {
                "soft break after multi-line link title", "[a](/u\n\"t\")\nb",
                NodeType::SoftBreak, 11, 12, "\n"
            },
            {
                "hard break after closed span", "**a**  \nb", NodeType::LineBreak,
                5, 8, "  \n"
            },
        };

        const auto sourceSliceForOffsets = [](
            const std::string& source,
            OFF beg,
            OFF end
        ) {
            const auto byteOffsetForUtf16 = [&source](OFF target) {
                size_t byteOffset = 0;
                OFF utf16Offset = 0;
                while (byteOffset < source.size() && utf16Offset < target) {
                    const unsigned char lead = static_cast<unsigned char>(source[byteOffset]);
                    const size_t characterBytes =
                        lead < 0x80 ? 1 : (lead < 0xE0 ? 2 : (lead < 0xF0 ? 3 : 4));
                    utf16Offset += characterBytes == 4 ? 2 : 1;
                    byteOffset += characterBytes;
                }
                return byteOffset;
            };
            const size_t byteBeg = byteOffsetForUtf16(beg);
            const size_t byteEnd = byteOffsetForUtf16(end);
            return source.substr(byteBeg, byteEnd - byteBeg);
        };

        MD4CParser parser;
        ParserOptions options;
        options.sourceOffsets = true;
        for (const auto& testCase : cases) {
            const auto result = parser.parse(testCase.markdown, options);
            const auto paragraph = findFirstNode(result, NodeType::Paragraph);
            std::shared_ptr<MarkdownNode> breakNode;
            if (paragraph) {
                for (const auto& child : paragraph->children) {
                    if (child->type == testCase.type) {
                        breakNode = child;
                        break;
                    }
                }
            }

            TestRunner::assertTrue(
                breakNode &&
                    breakNode->beg == testCase.beg && breakNode->end == testCase.end,
                std::string("Break offsets: ") + testCase.name
            );
            TestRunner::assertEqual(
                testCase.sourceSlice,
                breakNode
                    ? sourceSliceForOffsets(
                          testCase.markdown, breakNode->beg, breakNode->end
                      )
                    : std::string(),
                std::string("Break offsets select original source: ") +
                    testCase.name
            );
        }

        const std::string consecutiveMarkdown = "a\nb\nc";
        const auto consecutive = parser.parse(consecutiveMarkdown, options);
        const auto paragraph = findFirstNode(consecutive, NodeType::Paragraph);
        std::vector<std::shared_ptr<MarkdownNode>> breaks;
        if (paragraph) {
            for (const auto& child : paragraph->children) {
                if (child->type == NodeType::SoftBreak) breaks.push_back(child);
            }
        }
        TestRunner::assertTrue(
            breaks.size() == 2 &&
                breaks[0]->beg == 1 && breaks[0]->end == 2 &&
                breaks[1]->beg == 3 && breaks[1]->end == 4,
            "Break offsets: consecutive line breaks stay ordered"
        );

        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        const std::string serializedMarkdown = "🙂a\nb";
        BindingParserOptions bindingOptions;
        bindingOptions.sourceOffsets = true;
        HybridMarkdownParser serializer;
        const std::string normalJson = serializer.parseWithOptions(
            serializedMarkdown,
            bindingOptions
        );
        const std::string serializedBreak =
            "\"type\":\"soft_break\",\"beg\":3,\"end\":4";
        TestRunner::assertTrue(
            normalJson.find(serializedBreak) != std::string::npos,
            "Break offsets: serializer preserves UTF-16 range"
        );

        BindingParserOptions withoutOffsets;
        withoutOffsets.sourceOffsets = false;
        HybridMarkdownParser noOffsetSerializer;
        const std::string normalWithoutOffsets = noOffsetSerializer.parseWithOptions(
            "a\nb",
            withoutOffsets
        );
        TestRunner::assertTrue(
            normalWithoutOffsets.find("\"beg\":") == std::string::npos &&
                normalWithoutOffsets.find("\"end\":") == std::string::npos &&
                normalWithoutOffsets.find("\"type\":\"soft_break\"") != std::string::npos,
            "Break offsets: serializer omits offsets when disabled"
        );

        using ::margelo::nitro::Markdown::HybridMarkdownSession;
        auto session = std::make_shared<HybridMarkdownSession>();
        session->append("🙂a\n");
        session->append("b");
        const std::string appendedJson = session->parseWithOptions(bindingOptions);
        TestRunner::assertTrue(
            appendedJson.find(serializedBreak) != std::string::npos,
            "Break offsets: incremental append keeps source range"
        );
        session->replace(0, 0, "X");
        TestRunner::assertTrue(
            session->parseWithOptions(bindingOptions).find(
                "\"type\":\"soft_break\",\"beg\":4,\"end\":5"
            ) != std::string::npos,
            "Break offsets: incremental replace shifts source range"
        );
        session->reset("a\r\nb");
        TestRunner::assertTrue(
            session->parseWithOptions(bindingOptions).find(
                "\"type\":\"soft_break\",\"beg\":1,\"end\":3"
            ) != std::string::npos,
            "Break offsets: incremental reset replaces source range"
        );
    }

    static void testHorizontalRule() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("before\n\n---\n\nafter", options);

        auto rule = findFirstNode(result, NodeType::HorizontalRule);
        TestRunner::assertNotNull(rule.get(), "HorizontalRule: found node");
        if (rule) {
            TestRunner::assertEqual("horizontal_rule", nodeTypeToString(rule->type), "HorizontalRule: node type");
        }
    }

    static void testEntityText() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("Tom &amp; Jerry &#x21;", options);

        TestRunner::assertNotNull(result.get(), "EntityText: parse result");
        auto paragraph = findFirstNode(result, NodeType::Paragraph);
        TestRunner::assertNotNull(paragraph.get(), "EntityText: paragraph");
        if (paragraph) {
            std::string text;
            for (const auto& child : paragraph->children) {
                if (child->content.has_value()) {
                    text += child->content.value();
                }
            }
            TestRunner::assertTrue(text.find("&amp;") != std::string::npos, "EntityText: named entity retained");
            TestRunner::assertTrue(text.find("&#x21;") != std::string::npos, "EntityText: numeric entity retained");
        }
    }

    static void testTestOnlyExtensionFlags() {
        MD4CParser parser;
        ParserOptions options{false, false};

        auto underlineResult = parser.parseWithExtraFlagsForTest(
            "__underlined__",
            options,
            MD_FLAG_UNDERLINE
        );
        auto underline = findFirstNode(underlineResult, NodeType::Italic);
        TestRunner::assertNotNull(underline.get(), "TestFlags: underline maps to italic");
    }

    static void testInputSizeCap() {
        MD4CParser parser;
        ParserOptions options;
        options.maxInputLength = 8;
        bool threw = false;
        try {
            parser.parse("123456789", options);
        } catch (const std::runtime_error& error) {
            threw = std::string(error.what()).find("exceeds the maximum of 8 bytes") != std::string::npos;
        }
        TestRunner::assertTrue(threw, "Bounds: oversized input fails deterministically");

        bool ok = false;
        try {
            auto ast = parser.parse("1234567", options);
            ok = ast != nullptr;
        } catch (const std::runtime_error&) {
            ok = false;
        }
        TestRunner::assertTrue(ok, "Bounds: input within configured limit parses");

        // Values above the hard cap are clamped to the hard cap (the JS
        // boundary enforces the same clamp via Math.min).
        bool clamped = false;
        ParserOptions huge;
        huge.maxInputLength = 20 * 1024 * 1024;
        try {
            parser.parse(std::string(11 * 1024 * 1024, 'a'), huge);
        } catch (const std::runtime_error& error) {
            clamped = std::string(error.what()).find(
                "exceeds the maximum of 10485760 bytes"
            ) != std::string::npos;
        }
        TestRunner::assertTrue(clamped,
            "Bounds: maxInputLength above the hard cap is clamped to the hard cap");
    }

    static void testSourceOffsetsTracking() {
        MD4CParser parser;
        ParserOptions withOffsets;
        withOffsets.sourceOffsets = true;
        ParserOptions withoutOffsets;
        withoutOffsets.sourceOffsets = false;

        parser.parse("# Title", withOffsets);
        TestRunner::assertTrue(parser.lastParseTrackedOffsets,
            "Offsets: map tracked when sourceOffsets enabled");

        const std::string asciiMarkdown = "# ASCII\n\nplain text";
        auto asciiAst = parser.parse(asciiMarkdown, withOffsets);
        TestRunner::assertEqual(
            std::to_string(asciiMarkdown.size()),
            std::to_string(asciiAst->end),
            "Offsets: ASCII input keeps identity UTF-16 offsets"
        );

        parser.parse("# Title", withoutOffsets);
        TestRunner::assertTrue(!parser.lastParseTrackedOffsets,
            "Offsets: map skipped when sourceOffsets disabled");

        auto ast = parser.parse("# Title", withoutOffsets);
        auto heading = findFirstNode(ast, NodeType::Heading);
        TestRunner::assertNotNull(heading.get(), "Offsets: disabled parse still produces nodes");
    }

    static void testWikilinkNotMappedWithoutFlag() {
        MD4CParser parser;
        ParserOptions options;
        auto result = parser.parse("[[Wiki Page]]", options);
        auto wikiLink = findFirstNode(result, NodeType::Link);
        TestRunner::assertTrue(wikiLink == nullptr,
            "Wikilink: no incomplete link node without MD_FLAG_WIKILINKS");
    }

    static void testCallbackNullUserdataGuards() {
        TestRunner::assertEqual("1", std::to_string(MD4CParser::enterBlockNullUserdataForTest()),
            "CallbackGuards: enterBlock null userdata");
        TestRunner::assertEqual("1", std::to_string(MD4CParser::leaveBlockNullUserdataForTest()),
            "CallbackGuards: leaveBlock null userdata");
        TestRunner::assertEqual("1", std::to_string(MD4CParser::enterSpanNullUserdataForTest()),
            "CallbackGuards: enterSpan null userdata");
        TestRunner::assertEqual("1", std::to_string(MD4CParser::leaveSpanNullUserdataForTest()),
            "CallbackGuards: leaveSpan null userdata");
        TestRunner::assertEqual("1", std::to_string(MD4CParser::textNullUserdataForTest()),
            "CallbackGuards: text null userdata");
        TestRunner::assertEqual("0", std::to_string(MD4CParser::offsetBeforeBaseForTest()),
            "CallbackGuards: offset before base");
        TestRunner::assertEqual("0", std::to_string(MD4CParser::offsetPastBaseForTest()),
            "CallbackGuards: offset past base");
    }

    static void testTableCellAlignment() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse(
            "| Left | Center | Right |\n"
            "|:-----|:------:|------:|\n"
            "| a    | b      | c     |",
            options);

        TestRunner::assertTrue(result->children.size() == 1, "TableAlign: has table");
        auto table = result->children[0];
        TestRunner::assertEqual("table", nodeTypeToString(table->type), "TableAlign: table type");

        // Find header row (inside thead)
        std::shared_ptr<MarkdownNode> headerRow;
        for (const auto& child : table->children) {
            if (child->type == NodeType::TableHead && !child->children.empty()) {
                headerRow = child->children[0]; // first TR
                break;
            }
        }
        TestRunner::assertTrue(headerRow != nullptr, "TableAlign: found header row");
        TestRunner::assertTrue(headerRow->children.size() == 3, "TableAlign: header has 3 cells");

        if (headerRow && headerRow->children.size() == 3) {
            TestRunner::assertEqual("left",
                textAlignToString(headerRow->children[0]->align.value_or(TextAlign::Default)),
                "TableAlign: first cell is left-aligned");
            TestRunner::assertEqual("center",
                textAlignToString(headerRow->children[1]->align.value_or(TextAlign::Default)),
                "TableAlign: second cell is center-aligned");
            TestRunner::assertEqual("right",
                textAlignToString(headerRow->children[2]->align.value_or(TextAlign::Default)),
                "TableAlign: third cell is right-aligned");

            // Header cells should have isHeader=true
            TestRunner::assertTrue(headerRow->children[0]->isHeader.value_or(false),
                "TableAlign: first cell isHeader");
        }

        // Find body row and verify alignment propagates to body cells
        std::shared_ptr<MarkdownNode> bodyRow;
        for (const auto& child : table->children) {
            if (child->type == NodeType::TableBody && !child->children.empty()) {
                bodyRow = child->children[0]; // first TR in tbody
                break;
            }
        }
        TestRunner::assertTrue(bodyRow != nullptr, "TableAlign: found body row");
        if (bodyRow && bodyRow->children.size() == 3) {
            TestRunner::assertEqual("left",
                textAlignToString(bodyRow->children[0]->align.value_or(TextAlign::Default)),
                "TableAlign: body cell 1 is left-aligned");
            TestRunner::assertTrue(!bodyRow->children[0]->isHeader.value_or(true),
                "TableAlign: body cell isHeader is false");
        }
    }

    static void testNestedBlockquotes() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("> > nested quote", options);

        TestRunner::assertTrue(!result->children.empty(), "NestedBlockquote: has children");
        auto outer = result->children[0];
        TestRunner::assertEqual("blockquote", nodeTypeToString(outer->type),
            "NestedBlockquote: outer is blockquote");

        // Find inner blockquote
        std::shared_ptr<MarkdownNode> inner;
        for (const auto& child : outer->children) {
            if (child->type == NodeType::Blockquote) {
                inner = child;
                break;
            }
        }
        TestRunner::assertTrue(inner != nullptr, "NestedBlockquote: found inner blockquote");

        // Inner blockquote should contain a paragraph with text
        if (inner && !inner->children.empty()) {
            auto para = inner->children[0];
            TestRunner::assertEqual("paragraph", nodeTypeToString(para->type),
                "NestedBlockquote: inner has paragraph");
            if (!para->children.empty()) {
                TestRunner::assertEqual("nested quote",
                    para->children[0]->content.value_or(""),
                    "NestedBlockquote: text content");
            }
        }
    }

    static void testAstDepthLimit() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto makeNestedQuote = [](size_t depth) {
            std::string markdown;
            markdown.reserve(depth * 2 + 5);
            for (size_t index = 0; index < depth; index += 1) {
                markdown += "> ";
            }
            markdown += "text";
            return markdown;
        };

        bool boundaryParsed = false;
        try {
            boundaryParsed = parser.parse(
                makeNestedQuote(kMaxAstDepth - 4), options
            ) != nullptr;
        } catch (const std::exception&) {
            boundaryParsed = false;
        }
        TestRunner::assertTrue(
            boundaryParsed,
            "AST depth: nested blocks below the limit parse"
        );

        bool rejected = false;
        try {
            parser.parse(makeNestedQuote(kMaxAstDepth + 4), options);
        } catch (const std::runtime_error& error) {
            rejected = std::string(error.what()).find(
                "Markdown AST depth exceeds the maximum of"
            ) != std::string::npos;
        }
        TestRunner::assertTrue(
            rejected,
            "AST depth: nested blocks above the limit fail deterministically"
        );

        auto deepRoot = std::make_shared<MarkdownNode>(NodeType::Document);
        auto deepCurrent = deepRoot;
        for (size_t index = 0; index < kMaxAstDepth; ++index) {
            auto child = std::make_shared<MarkdownNode>(NodeType::Paragraph);
            deepCurrent->addChild(child);
            deepCurrent = std::move(child);
        }
        bool flattenRejected = false;
        try {
            (void)flattenNodeText(deepRoot);
        } catch (const std::runtime_error& error) {
            flattenRejected = std::string(error.what()).find(
                "Markdown AST depth exceeds the maximum of"
            ) != std::string::npos;
        }
        TestRunner::assertTrue(
            flattenRejected,
            "AST depth: iterative flatten rejects deep untrusted trees"
        );
    }

    static void testImageWithTitle() {
        MD4CParser parser;
        ParserOptions options{true, true};
        auto result = parser.parse("![alt text](image.png \"my title\")", options);

        TestRunner::assertTrue(!result->children.empty(), "ImageTitle: has children");
        auto para = result->children[0];
        TestRunner::assertTrue(!para->children.empty(), "ImageTitle: paragraph has children");

        auto image = para->children[0];
        TestRunner::assertEqual("image", nodeTypeToString(image->type), "ImageTitle: node type");
        TestRunner::assertEqual("image.png", image->href.value_or(""), "ImageTitle: src");
        TestRunner::assertEqual("alt text", image->alt.value_or(""), "ImageTitle: alt");
        TestRunner::assertEqual("my title", image->title.value_or(""), "ImageTitle: title");
    }

    static std::string repeatToSize(const std::string& unit, size_t bytes) {
        std::string value;
        value.reserve(bytes + unit.size());
        while (value.size() < bytes) value += unit;
        return value;
    }

    static size_t countAllNodes(const std::shared_ptr<MarkdownNode>& node) {
        if (!node) return 0;
        size_t count = 1;
        for (const auto& child : node->children) count += countAllNodes(child);
        return count;
    }

    static size_t maxNodeDepth(const std::shared_ptr<MarkdownNode>& node) {
        if (!node) return 0;
        size_t deepest = 0;
        for (const auto& child : node->children) {
            deepest = std::max(deepest, maxNodeDepth(child));
        }
        return deepest + 1;
    }

    static bool anyContentContains(const std::shared_ptr<MarkdownNode>& node, char value) {
        if (!node) return false;
        if (node->content.has_value() && node->content->find(value) != std::string::npos) {
            return true;
        }
        for (const auto& child : node->children) {
            if (anyContentContains(child, value)) return true;
        }
        return false;
    }

    template <typename Fn>
    static std::string errorOf(Fn&& fn) {
        try {
            fn();
        } catch (const std::bad_alloc&) {
            return "std::bad_alloc";
        } catch (const std::exception& error) {
            return error.what();
        } catch (...) {
            return "unknown exception";
        }
        return "";
    }

    static std::string stripOffsetFields(const std::string& json) {
        static const std::string begKey = ",\"beg\":";
        static const std::string endKey = ",\"end\":";
        const auto skipDigits = [&json](size_t index) {
            while (index < json.size() && json[index] >= '0' && json[index] <= '9') index++;
            return index;
        };
        std::string out;
        out.reserve(json.size());
        size_t index = 0;
        while (index < json.size()) {
            if (json.compare(index, begKey.size(), begKey) == 0) {
                const size_t afterBeg = skipDigits(index + begKey.size());
                if (json.compare(afterBeg, endKey.size(), endKey) == 0) {
                    index = skipDigits(afterBeg + endKey.size());
                    continue;
                }
            }
            out.push_back(json[index++]);
        }
        return out;
    }

    static std::vector<std::string> hostileDocuments() {
        return {
            std::string("a\xC0\xAF" "b"),
            std::string("a\xE0\x80\xAF" "b"),
            std::string("a\xED\xA0\x80" "b"),
            std::string("a\xF4\x90\x80\x80" "b"),
            std::string("**a\xC3"),
            std::string("a\xE4\xB8"),
            std::string("a\xF0\x9F\x98"),
            std::string("\x80\xBF"),
            std::string("\xFF\xFE\xF8 x"),
            std::string("a\0*b*\0", 7),
            std::string("\xEF\xBB\xBF# h"),
            "a\r\nb\r\n\r\n# h\r\n",
            "a\rb\r\r# h\r",
            std::string("\xF0\x9F\x98\x80\xF0\x9F"),
            "[a](u \"t\r\nx\")",
            std::string("\x01\x02\x1f\x7f `\x03` [l](</\x04> \"\x05\") ![\x06](\x07)"),
            "<div \x0b>\r\n\x0c</div>\r\n\r\n<!-- c -->\r\n<script>x</script>",
            "```\r\na\r\nb\r\n```\r\n",
            "| a | b | c |\n|---|---|\n| 1 | 2 | 3 | 4 |\n| 5 |\n",
            "| a | b |\n|:--|--:|\n| 1 |\n| 1 | 2 | 3 |\n|\n",
            "$$\n\\frac{a}{b}\n$$ and $x$ and $$y$$ ~~s~~ - [ ] t\n- [x] u\nwww.example.com a@b.co",
            "<div>\n<b>unterminated",
            "<![CDATA[x]]> <?php ?> <!DOCTYPE html> <a href='x'>l</a>",
            "",
            "\n",
            std::string(1, '\0'),
        };
    }

    static void testHostileEncodings() {
        MD4CParser parser;
        struct Case {
            const char* name;
            std::string input;
            OFF utf16Length;
            bool expectEndAtLength;
        };
        const std::vector<Case> cases = {
            {"overlong two-byte", std::string("a\xC0\xAF" "b"), 4, true},
            {"overlong three-byte", std::string("a\xE0\x80\xAF" "b"), 5, true},
            {"encoded surrogate", std::string("a\xED\xA0\x80" "b"), 5, true},
            {"above U+10FFFF", std::string("a\xF4\x90\x80\x80" "b"), 6, true},
            {"truncated two-byte tail", std::string("**a\xC3"), 4, true},
            {"truncated three-byte tail", std::string("a\xE4\xB8"), 3, true},
            {"truncated four-byte tail", std::string("a\xF0\x9F\x98"), 4, true},
            {"lone continuation bytes", std::string("\x80\xBF"), 2, true},
            {"invalid lead bytes", std::string("\xFF\xFE\xF8 x"), 5, true},
            {"NUL inside emphasis", std::string("a\0*b*\0", 7), 7, true},
            {"BOM prefix", std::string("\xEF\xBB\xBF# h"), 4, true},
            {"CRLF line endings", "a\r\nb\r\n\r\n# h\r\n", 13, true},
            {"CR-only line endings", "a\rb\r\r# h\r", 9, true},
            {"emoji then truncated emoji", std::string("\xF0\x9F\x98\x80\xF0\x9F"), 4, true},
        };

        for (const auto& entry : cases) {
            const std::string name = std::string("Hostile encoding: ") + entry.name;
            for (const bool html : {false, true}) {
                ParserOptions withOffsets{true, true, html};
                withOffsets.sourceOffsets = true;
                ParserOptions withoutOffsets = withOffsets;
                withoutOffsets.sourceOffsets = false;

                std::shared_ptr<MarkdownNode> tracked;
                std::shared_ptr<MarkdownNode> untracked;
                const std::string error = errorOf([&]() {
                    tracked = parser.parse(entry.input, withOffsets);
                    untracked = parser.parse(entry.input, withoutOffsets);
                });
                TestRunner::assertEqual("", error, name + " parses without error");
                if (!tracked || !untracked) continue;
                TestRunner::assertEqual(
                    "",
                    offsetViolation(tracked, entry.utf16Length, ""),
                    name + " keeps contained offsets"
                );
                if (entry.expectEndAtLength) {
                    TestRunner::assertEqual(
                        std::to_string(entry.utf16Length),
                        std::to_string(tracked->end),
                        name + " document end counts each invalid byte as one unit"
                    );
                }
                TestRunner::assertEqual(
                    canonicalizeNode(tracked),
                    canonicalizeNode(untracked),
                    name + " yields the same tree with and without offsets"
                );
            }
        }

        ParserOptions options{true, true};
        const std::string overlong("a\xC0\xAF" "b");
        const auto overlongText = findFirstNode(parser.parse(overlong, options), NodeType::Text);
        TestRunner::assertEqual(
            overlong,
            overlongText ? overlongText->content.value_or("") : "",
            "Hostile encoding: invalid bytes pass through unmodified"
        );

        const auto bomAst = parser.parse(std::string("\xEF\xBB\xBF# h"), options);
        TestRunner::assertTrue(
            findFirstNode(bomAst, NodeType::Heading) != nullptr &&
                !anyContentContains(bomAst, '\xEF'),
            "Hostile encoding: a leading BOM is skipped for block recognition"
        );

        for (const std::string& document : {
            std::string("a\r\nb\r\n\r\n# h\r\n"),
            std::string("a\rb\r\r# h\r"),
            std::string("```\r\na\r\nb\r\n```\r\n"),
            std::string("```\ra\rb\r```\r"),
            std::string("<div>\r\nx\r\n</div>\r\n"),
        }) {
            ParserOptions htmlOptions{true, true, true};
            const auto ast = parser.parse(document, htmlOptions);
            TestRunner::assertTrue(
                !anyContentContains(ast, '\r'),
                "Hostile encoding: carriage returns never reach node content (" +
                    jsonEscape(document) + ")"
            );
        }

        const auto crlfBreak = findFirstNode(parser.parse("a\r\nb", options), NodeType::SoftBreak);
        TestRunner::assertTrue(
            crlfBreak && crlfBreak->beg == 1 && crlfBreak->end == 3,
            "Hostile encoding: CRLF soft break spans both bytes"
        );
        const auto crBreak = findFirstNode(parser.parse("a\rb", options), NodeType::SoftBreak);
        TestRunner::assertTrue(
            crBreak && crBreak->beg == 1 && crBreak->end == 2,
            "Hostile encoding: CR-only soft break spans one byte"
        );
        const auto crlfCode = findFirstNode(
            parser.parse("```\r\na\r\nb\r\n```\r\n", options),
            NodeType::CodeBlock
        );
        TestRunner::assertEqual(
            "a\nb\n",
            crlfCode ? flattenNodeTextRaw(crlfCode) : "",
            "Hostile encoding: CRLF code block lines normalize to LF"
        );

        const auto wiki = parser.parseWithExtraFlagsForTest(
            "[[Wiki Page]] x",
            ParserOptions{false, false},
            MD_FLAG_WIKILINKS
        );
        TestRunner::assertTrue(
            findFirstNode(wiki, NodeType::Link) == nullptr &&
                flattenNodeText(wiki) == "Wiki Page x\n\n",
            "Hostile encoding: wikilink spans keep their text without a link node"
        );
    }

    static std::string flattenNodeTextRaw(const std::shared_ptr<MarkdownNode>& node) {
        if (!node) return "";
        std::string value = node->content.value_or("");
        for (const auto& child : node->children) value += flattenNodeTextRaw(child);
        return value;
    }

    static void testJsonNeverEmitsRawControlBytes() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        HybridMarkdownParser parser;
        size_t rawControlDocuments = 0;
        size_t unbalancedDocuments = 0;
        std::string firstFailure;
        const auto documents = hostileDocuments();
        for (const auto& document : documents) {
            for (const bool html : {false, true}) {
                BindingParserOptions options;
                options.html = html;
                std::string json;
                const std::string error = errorOf([&]() {
                    json = parser.parseWithOptions(document, options);
                });
                if (!error.empty()) {
                    if (firstFailure.empty()) firstFailure = error;
                    continue;
                }
                bool rawControl = false;
                bool inString = false;
                bool escaped = false;
                long long depth = 0;
                for (const char raw : json) {
                    const unsigned char c = static_cast<unsigned char>(raw);
                    if (c < 0x20) rawControl = true;
                    if (inString) {
                        if (escaped) escaped = false;
                        else if (c == '\\') escaped = true;
                        else if (c == '"') inString = false;
                        continue;
                    }
                    if (c == '"') inString = true;
                    else if (c == '{' || c == '[') depth++;
                    else if (c == '}' || c == ']') depth--;
                }
                if (rawControl) rawControlDocuments++;
                if (inString || depth != 0) unbalancedDocuments++;
                if ((rawControl || inString || depth != 0) && firstFailure.empty()) {
                    firstFailure = jsonEscape(document);
                }
            }
        }
        TestRunner::assertEqual(
            "",
            firstFailure,
            "JSON writer: hostile documents serialize without raw C0 bytes (" +
                std::to_string(rawControlDocuments) + " raw, " +
                std::to_string(unbalancedDocuments) + " unbalanced)"
        );

        BindingParserOptions noOffsets;
        noOffsets.sourceOffsets = false;
        TestRunner::assertTrue(
            parser.parseWithOptions("[a](u \"t\r\nx\")", noOffsets).find("\"title\":\"t\\nx\"") !=
                std::string::npos,
            "JSON writer: a CRLF link title is normalized and escaped"
        );
    }

    static void testOptionMatrixDifferential() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        std::vector<std::string> documents = hostileDocuments();
        const auto fragments = makeFragmentCorpus(150, 0xBADC0DEu);
        documents.insert(documents.end(), fragments.begin(), fragments.end());

        HybridMarkdownParser binding;
        MD4CParser core;
        size_t offsetMismatches = 0;
        size_t plainMismatches = 0;
        size_t failures = 0;
        std::string firstProblem;
        for (unsigned combo = 0; combo < 8; combo++) {
            const bool gfm = (combo & 1u) != 0;
            const bool math = (combo & 2u) != 0;
            const bool html = (combo & 4u) != 0;
            for (const auto& document : documents) {
                BindingParserOptions tracked;
                tracked.gfm = gfm;
                tracked.math = math;
                tracked.html = html;
                tracked.sourceOffsets = true;
                BindingParserOptions untracked = tracked;
                untracked.sourceOffsets = false;
                ParserOptions internal{gfm, math, html};
                internal.sourceOffsets = false;

                const std::string error = errorOf([&]() {
                    const std::string withOffsets = binding.parseWithOptions(document, tracked);
                    const std::string withoutOffsets = binding.parseWithOptions(document, untracked);
                    if (stripOffsetFields(withOffsets) != withoutOffsets) {
                        offsetMismatches++;
                        if (firstProblem.empty()) firstProblem = "offsets: " + jsonEscape(document);
                    }
                    if (withoutOffsets.find("\"beg\":") != std::string::npos) {
                        offsetMismatches++;
                        if (firstProblem.empty()) firstProblem = "beg leaked: " + jsonEscape(document);
                    }
                    const std::string plain = binding.extractPlainTextWithOptions(document, tracked);
                    if (plain != flattenNodeText(core.parse(document, internal))) {
                        plainMismatches++;
                        if (firstProblem.empty()) firstProblem = "plain: " + jsonEscape(document);
                    }
                });
                if (!error.empty()) {
                    failures++;
                    if (firstProblem.empty()) firstProblem = error + ": " + jsonEscape(document);
                }
            }
        }
        TestRunner::assertEqual(
            "",
            firstProblem,
            "Option matrix: every gfm/math/html/sourceOffsets combination agrees (" +
                std::to_string(offsetMismatches) + " offset, " +
                std::to_string(plainMismatches) + " plain-text, " +
                std::to_string(failures) + " thrown)"
        );

        BindingParserOptions defaults;
        const std::string sample = "# T\n\n| a |\n|---|\n| $x$ <b>h</b> |\n";
        BindingParserOptions explicitDefaults;
        explicitDefaults.gfm = true;
        explicitDefaults.math = true;
        explicitDefaults.html = false;
        explicitDefaults.sourceOffsets = true;
        explicitDefaults.maxInputLength = 0.0;
        explicitDefaults.freezeAst = true;
        TestRunner::assertEqual(
            binding.parse(sample),
            binding.parseWithOptions(sample, defaults),
            "Option matrix: empty options equal parse()"
        );
        TestRunner::assertEqual(
            binding.parse(sample),
            binding.parseWithOptions(sample, explicitDefaults),
            "Option matrix: explicit defaults equal parse()"
        );
        TestRunner::assertEqual(
            binding.extractPlainText(sample),
            binding.extractPlainTextWithOptions(sample, defaults),
            "Option matrix: empty options equal extractPlainText()"
        );
    }

    static void testTableShapeAndHtmlToggle() {
        MD4CParser parser;
        ParserOptions options{true, true};
        for (const std::string& document : {
            std::string("| a | b | c |\n|---|---|\n| 1 | 2 | 3 | 4 |\n| 5 |\n"),
            std::string("| a | b |\n|---|---|\n| 1 | 2 | 3 | 4 | 5 |\n| 6 |\n|\n"),
            std::string("| a |\n|---|\n| 1 | 2 |\n||\n"),
            std::string("a | b\n-|-\n1\n1 | 2 | 3\n"),
        }) {
            const auto ast = parser.parse(document, options);
            const auto table = findFirstNode(ast, NodeType::Table);
            const auto head = findFirstNode(ast, NodeType::TableHead);
            bool uniform = table != nullptr && head != nullptr && !head->children.empty();
            size_t rows = 0;
            if (uniform) {
                const size_t columns = head->children[0]->children.size();
                const auto body = findFirstNode(ast, NodeType::TableBody);
                if (body) {
                    for (const auto& row : body->children) {
                        rows++;
                        if (row->children.size() != columns) uniform = false;
                    }
                }
            }
            TestRunner::assertTrue(
                uniform,
                "Table shape: " + std::to_string(rows) +
                    " body rows match the header column count (" + jsonEscape(document) + ")"
            );
            TestRunner::assertEqual(
                "",
                offsetViolation(ast, utf16LengthForTest(document), ""),
                "Table shape: mismatched rows keep contained offsets (" + jsonEscape(document) + ")"
            );
        }

        const std::vector<std::string> htmlDocuments = {
            "<div>\n<b>unterminated",
            "<script>alert(1)</script>\n\ntext <i>inline</i> <!-- c -->",
            "<![CDATA[x]]>\n\n<?php x ?>\n\n<!DOCTYPE html>",
            "<div\n\n<p",
            "<a href=\"x\" onclick='y'>l</a><",
        };
        for (const auto& document : htmlDocuments) {
            ParserOptions htmlOff{true, true, false};
            ParserOptions htmlOn{true, true, true};
            const auto off = parser.parse(document, htmlOff);
            const auto on = parser.parse(document, htmlOn);
            TestRunner::assertTrue(
                countNodes(off, NodeType::HtmlBlock) == 0 &&
                    countNodes(off, NodeType::HtmlInline) == 0,
                "HTML toggle: html=false never emits HTML nodes (" + jsonEscape(document) + ")"
            );
            TestRunner::assertEqual(
                "",
                offsetViolation(on, utf16LengthForTest(document), ""),
                "HTML toggle: html=true keeps contained offsets (" + jsonEscape(document) + ")"
            );
        }
        ParserOptions htmlOn{true, true, true};
        const auto unterminated = findFirstNode(
            parser.parse("<div>\n<b>unterminated", htmlOn),
            NodeType::HtmlBlock
        );
        TestRunner::assertEqual(
            "<div>\n<b>unterminated\n",
            unterminated ? unterminated->content.value_or("") : "",
            "HTML toggle: an unterminated HTML block keeps its content to end of input"
        );
    }

    struct NestingCase {
        const char* name;
        std::string below;
        std::string above;
    };

    static std::vector<NestingCase> nestingCases() {
        const auto nestedList = [](size_t levels, const char* marker, size_t indent) {
            std::string value;
            for (size_t level = 0; level < levels; level++) {
                value += std::string(level * indent, ' ') + marker + " x\n";
            }
            return value;
        };
        const auto wrapped = [](size_t levels, const std::string& open, const std::string& close) {
            std::string value;
            for (size_t level = 0; level < levels; level++) value += open;
            value += "a";
            for (size_t level = 0; level < levels; level++) value += close;
            return value;
        };
        return {
            {"blockquotes", repeatToSize("> ", 200) + "x", repeatToSize("> ", 2000) + "x"},
            {"blockquotes far above the limit", repeatToSize("> ", 200) + "x", repeatToSize("> ", 400000) + "x"},
            {"bullet lists", nestedList(100, "-", 2), nestedList(400, "-", 2)},
            {"ordered lists", nestedList(80, "1.", 3), nestedList(400, "1.", 3)},
            {"inline list markers", repeatToSize("- ", 200) + "x", repeatToSize("- ", 100000) + "x"},
            {"emphasis", wrapped(100, "*", "*"), wrapped(4000, "*", "*")},
            {"strong emphasis", wrapped(100, "**", "**"), wrapped(4000, "**", "**")},
            {"images", wrapped(100, "![", "](u)"), wrapped(2000, "![", "](u)")},
            {"quotes in lists", repeatToSize("- > ", 240) + "x", repeatToSize("- > ", 4000) + "x"},
        };
    }

    static void testNestingAgainstDepthLimit() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        MD4CParser parser;
        HybridMarkdownParser binding;
        ParserOptions options{true, true};
        const std::string depthError =
            "Markdown AST depth exceeds the maximum of " + std::to_string(kMaxAstDepth);
        for (const auto& entry : nestingCases()) {
            const std::string name = std::string("Nesting: ") + entry.name;
            std::shared_ptr<MarkdownNode> ast;
            const std::string belowError = errorOf([&]() { ast = parser.parse(entry.below, options); });
            TestRunner::assertEqual("", belowError, name + " below the limit parses");
            if (ast) {
                TestRunner::assertTrue(
                    maxNodeDepth(ast) <= kMaxAstDepth,
                    name + " stays within the AST depth limit (depth " +
                        std::to_string(maxNodeDepth(ast)) + ")"
                );
                TestRunner::assertEqual(
                    "",
                    errorOf([&]() {
                        (void)binding.parse(entry.below);
                        (void)binding.extractPlainText(entry.below);
                    }),
                    name + " below the limit serializes and flattens"
                );
            }

            TestRunner::assertEqual(
                depthError,
                errorOf([&]() { (void)parser.parse(entry.above, options); }),
                name + " above the limit fails with the depth error"
            );
            TestRunner::assertEqual(
                depthError,
                errorOf([&]() { (void)binding.parse(entry.above); }),
                name + " above the limit reaches the binding with the same error"
            );
            TestRunner::assertEqual(
                depthError,
                errorOf([&]() { (void)binding.extractPlainText(entry.above); }),
                name + " above the limit fails plain-text extraction with the same error"
            );
            auto session = std::make_shared<HybridMarkdownSession>();
            session->reset(entry.above);
            TestRunner::assertEqual(
                depthError,
                errorOf([&]() { (void)session->parse(); }),
                name + " above the limit reaches the session with the same error"
            );
            session->reset("ok");
            TestRunner::assertTrue(
                session->parse().find("\"content\":\"ok\"") != std::string::npos,
                name + " leaves the session usable after the depth error"
            );
        }

        for (const std::string& document : {
            std::string(repeatToSize("*_", 4000) + "a" + repeatToSize("_*", 4000)),
            std::string(repeatToSize("~~*", 6000) + "a" + repeatToSize("*~~", 6000)),
        }) {
            std::shared_ptr<MarkdownNode> alternating;
            const std::string error = errorOf([&]() { alternating = parser.parse(document, options); });
            TestRunner::assertTrue(
                error.empty() && alternating && maxNodeDepth(alternating) <= kMaxAstDepth,
                "Nesting: alternating delimiter runs resolve to a shallow tree"
            );
        }

        const std::string brackets = std::string(100000, '[') + "a" + std::string(100000, ']');
        TestRunner::assertEqual(
            "",
            errorOf([&]() { (void)parser.parse(brackets, options); }),
            "Nesting: 100,000 unresolved brackets stay flat text"
        );
        const std::string links = repeatToSize("[", 3000) + "a" + repeatToSize("](u)", 12000);
        std::shared_ptr<MarkdownNode> linkAst;
        TestRunner::assertEqual(
            "",
            errorOf([&]() { linkAst = parser.parse(links, options); }),
            "Nesting: nested link syntax parses"
        );
        TestRunner::assertTrue(
            linkAst && countNodes(linkAst, NodeType::Link) == 1,
            "Nesting: links never nest inside links"
        );
    }

#ifndef _WIN32
    template <typename Fn>
    static bool runOnSmallStack(size_t stackBytes, Fn fn) {
        struct Context {
            Fn* fn;
            bool completed;
        };
        Context context{&fn, false};
        pthread_attr_t attributes;
        if (pthread_attr_init(&attributes) != 0) return false;
        if (pthread_attr_setstacksize(&attributes, stackBytes) != 0) {
            pthread_attr_destroy(&attributes);
            return false;
        }
        pthread_t thread;
        const int created = pthread_create(
            &thread,
            &attributes,
            +[](void* raw) -> void* {
                auto* target = static_cast<Context*>(raw);
                (*target->fn)();
                target->completed = true;
                return nullptr;
            },
            &context
        );
        pthread_attr_destroy(&attributes);
        if (created != 0) return false;
        pthread_join(thread, nullptr);
        return context.completed;
    }
#endif

    static void testSmallStackDeepNesting() {
#ifndef _WIN32
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        constexpr size_t kSmallStackBytes = 512 * 1024;
        size_t parsed = 0;
        size_t rejected = 0;
        size_t unexpected = 0;
        const auto cases = nestingCases();
        const bool completed = runOnSmallStack(kSmallStackBytes, [&]() {
            HybridMarkdownParser binding;
            auto session = std::make_shared<HybridMarkdownSession>();
            for (const auto& entry : cases) {
                for (const std::string* document : {&entry.below, &entry.above}) {
                    try {
                        (void)binding.parse(*document);
                        (void)binding.extractPlainText(*document);
                        session->reset(*document);
                        (void)session->parse();
                        parsed++;
                    } catch (const std::runtime_error&) {
                        rejected++;
                    } catch (...) {
                        unexpected++;
                    }
                }
            }
            auto deepRoot = std::make_shared<MarkdownNode>(NodeType::Document);
            auto current = deepRoot;
            for (size_t index = 0; index + 1 < kMaxAstDepth; index++) {
                auto child = std::make_shared<MarkdownNode>(NodeType::Blockquote);
                current->addChild(child);
                current = std::move(child);
            }
            try {
                (void)flattenNodeText(deepRoot);
            } catch (...) {
                unexpected++;
            }
        });
        TestRunner::assertTrue(
            completed && unexpected == 0 && parsed == cases.size() && rejected == cases.size(),
            "Small stack: deepest allowed and over-limit nesting complete on a 512 KiB thread (" +
                std::to_string(parsed) + " parsed, " + std::to_string(rejected) + " rejected)"
        );
#else
        std::cout << "ℹ Small stack: skipped on Windows" << std::endl;
#endif
    }

    struct CallbackCounter {
        size_t calls = 0;
        size_t textBytes = 0;
    };

    static CallbackCounter countMd4cCallbacks(const std::string& input) {
        CallbackCounter counter;
        const auto block = +[](MD_BLOCKTYPE, void*, MD_OFFSET, void* userdata) -> int {
            static_cast<CallbackCounter*>(userdata)->calls++;
            return 0;
        };
        const auto span = +[](MD_SPANTYPE, void*, MD_OFFSET, void* userdata) -> int {
            static_cast<CallbackCounter*>(userdata)->calls++;
            return 0;
        };
        const auto text = +[](MD_TEXTTYPE, const MD_CHAR*, MD_SIZE size, void* userdata) -> int {
            auto* target = static_cast<CallbackCounter*>(userdata);
            target->calls++;
            target->textBytes += size;
            return 0;
        };
        MD_PARSER parser = {
            0,
            MD_FLAG_TABLES | MD_FLAG_STRIKETHROUGH | MD_FLAG_TASKLISTS |
                MD_FLAG_PERMISSIVEAUTOLINKS | MD_FLAG_LATEXMATHSPANS,
            block,
            block,
            span,
            span,
            text,
            nullptr,
            nullptr
        };
        md_parse(input.data(), static_cast<MD_SIZE>(input.size()), &parser, &counter);
        return counter;
    }

    static void testCallbackCountScalesLinearly() {
        struct Generator {
            const char* name;
            std::function<std::string(size_t)> make;
        };
        const std::vector<Generator> generators = {
            {"open brackets", [](size_t n) { return std::string(n, '['); }},
            {"stars", [](size_t n) { return std::string(n, '*'); }},
            {"backticks", [](size_t n) { return std::string(n, '`'); }},
            {"bracket pairs", [](size_t n) { return repeatToSize("[]", n); }},
            {"mixed emphasis openers", [](size_t n) { return repeatToSize("*a_ ", n); }},
            {"unclosed code spans", [](size_t n) { return repeatToSize("`a ", n); }},
            {"unclosed inline links", [](size_t n) { return repeatToSize("[a](", n); }},
            {"unclosed images", [](size_t n) { return repeatToSize("![a](", n); }},
            {"angle brackets", [](size_t n) { return std::string(n, '<'); }},
            {"entities", [](size_t n) { return repeatToSize("&a", n); }},
            {"math openers", [](size_t n) { return repeatToSize("$a ", n); }},
            {"strikethrough openers", [](size_t n) { return repeatToSize("~~a ", n); }},
            {"table pipes", [](size_t n) { return "|a|\n|-|\n" + repeatToSize("|a", n); }},
            {"nested quote markers", [](size_t n) { return repeatToSize("> ", n) + "x"; }},
            {"reference uses", [](size_t n) { return "[r]: /u\n\n" + repeatToSize("[r] ", n); }},
            {"reference label openers", [](size_t n) { return repeatToSize("[a][", n); }},
            {"autolinks", [](size_t n) { return repeatToSize("www.a.b ", n); }},
            {"short lines", [](size_t n) { return repeatToSize("a\n", n); }},
            {"list items", [](size_t n) { return repeatToSize("- a\n", n); }},
            {"intraword underscores", [](size_t n) { return repeatToSize("a_b_", n); }},
            {"two-byte text", [](size_t n) { return repeatToSize("\xC3\xA9", n); }},
        };

        constexpr size_t kSmall = 16 * 1024;
        constexpr size_t kLarge = 4 * kSmall;
        MD4CParser parser;
        ParserOptions options{true, true};
        for (const auto& generator : generators) {
            const std::string small = generator.make(kSmall);
            const std::string large = generator.make(kLarge);
            const CallbackCounter smallCount = countMd4cCallbacks(small);
            const CallbackCounter largeCount = countMd4cCallbacks(large);
            const std::string name = std::string("Complexity: ") + generator.name;
            TestRunner::assertTrue(
                largeCount.calls <= 4 * smallCount.calls + 64,
                name + " callback count grows at most linearly (" +
                    std::to_string(smallCount.calls) + " -> " +
                    std::to_string(largeCount.calls) + ")"
            );
            TestRunner::assertTrue(
                largeCount.textBytes <= large.size() + 64 &&
                    smallCount.textBytes <= small.size() + 64,
                name + " text callbacks never deliver more bytes than the input"
            );

            std::shared_ptr<MarkdownNode> ast;
            const std::string error = errorOf([&]() { ast = parser.parse(large, options); });
            const bool bounded = ast
                ? countAllNodes(ast) <= kMaxAstNodes && maxNodeDepth(ast) <= kMaxAstDepth
                : error.find("Markdown AST depth exceeds the maximum of") == 0 ||
                    error.find("Markdown AST node/work budget exceeds the maximum of") == 0;
            TestRunner::assertTrue(
                bounded,
                name + " ends in a bounded tree or a budget error (" +
                    (ast ? std::to_string(countAllNodes(ast)) + " nodes" : error) + ")"
            );
        }
    }

    static void testBudgetErrorsSurfaceFromCallbacks() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        MD4CParser parser;
        HybridMarkdownParser binding;
        ParserOptions options{true, true};
        const std::string nodeBudgetError =
            "Markdown AST node/work budget exceeds the maximum of " + std::to_string(kMaxAstWork);

        const std::string softBreaks = repeatToSize("a\n", 120000);
        TestRunner::assertEqual(
            nodeBudgetError,
            errorOf([&]() { (void)parser.parse(softBreaks, options); }),
            "Budgets: node budget hit inside the text callback keeps its message"
        );
        const std::string paragraphs = repeatToSize("a\n\n", 300000);
        TestRunner::assertEqual(
            nodeBudgetError,
            errorOf([&]() { (void)parser.parse(paragraphs, options); }),
            "Budgets: node budget hit inside block callbacks keeps its message"
        );
        const std::string spans = repeatToSize("*a* ", 300000);
        TestRunner::assertEqual(
            nodeBudgetError,
            errorOf([&]() { (void)parser.parse(spans, options); }),
            "Budgets: node budget hit inside span callbacks keeps its message"
        );
        TestRunner::assertEqual(
            nodeBudgetError,
            errorOf([&]() { (void)binding.extractPlainText(softBreaks); }),
            "Budgets: node budget error reaches plain-text extraction"
        );
        auto session = std::make_shared<HybridMarkdownSession>();
        session->reset(softBreaks);
        TestRunner::assertEqual(
            nodeBudgetError,
            errorOf([&]() { (void)session->parse(); }),
            "Budgets: node budget error reaches the session"
        );

        const std::string underBudget = repeatToSize("a\n", 2 * 40000);
        std::shared_ptr<MarkdownNode> ast;
        TestRunner::assertEqual(
            "",
            errorOf([&]() { ast = parser.parse(underBudget, options); }),
            "Budgets: 80,000 lines stay under the node budget"
        );
        TestRunner::assertTrue(
            ast && countAllNodes(ast) <= kMaxAstNodes,
            "Budgets: an accepted tree never exceeds the node budget"
        );

        std::string nestedImages = "![![![";
        nestedImages += std::string(6000, 'a');
        nestedImages += "](u)](u)](u)";
        TestRunner::assertEqual(
            "Markdown flattened text exceeds the maximum of " +
                std::to_string(nestedImages.size() * 2) + " bytes",
            errorOf([&]() { (void)parser.parse(nestedImages, options); }),
            "Budgets: nested image alt text is bounded by twice the input"
        );
        TestRunner::assertEqual(
            "",
            errorOf([&]() { (void)parser.parse("![![![alt](u)](u)](u)", options); }),
            "Budgets: small nested images parse and the parser stays reusable"
        );
    }

    static void testFlattenBounds() {
        TestRunner::assertEqual("", flattenNodeText(nullptr), "Flatten: null root is empty text");

        auto withNull = std::make_shared<MarkdownNode>(NodeType::Paragraph);
        auto text = std::make_shared<MarkdownNode>(NodeType::Text);
        text->content = "kept";
        withNull->children.push_back(nullptr);
        withNull->children.push_back(text);
        withNull->children.push_back(nullptr);
        TestRunner::assertEqual(
            "kept\n\n",
            flattenNodeText(withNull),
            "Flatten: null children are skipped"
        );

        auto leaf = std::make_shared<MarkdownNode>(NodeType::Text);
        leaf->content = "x";
        auto atBudget = std::make_shared<MarkdownNode>(NodeType::Document);
        atBudget->children.assign(kMaxAstNodes - 1, leaf);
        std::string flattened;
        TestRunner::assertEqual(
            "",
            errorOf([&]() { flattened = flattenNodeText(atBudget); }),
            "Flatten: a tree at the node budget flattens"
        );
        TestRunner::assertTrue(
            flattened.size() == kMaxAstNodes - 1,
            "Flatten: a tree at the node budget keeps every leaf"
        );
        auto overBudget = std::make_shared<MarkdownNode>(NodeType::Document);
        overBudget->children.assign(kMaxAstNodes, leaf);
        TestRunner::assertEqual(
            "Markdown AST node/work budget exceeds the maximum of " + std::to_string(kMaxAstWork),
            errorOf([&]() { (void)flattenNodeText(overBudget); }),
            "Flatten: a tree above the node budget fails deterministically"
        );

        constexpr size_t kMaxFlattenedBytes = 64 * 1024 * 1024;
        const std::string sizeError =
            "Markdown flattened text exceeds the maximum of " +
            std::to_string(kMaxFlattenedBytes) + " bytes";
        {
            auto huge = std::make_shared<MarkdownNode>(NodeType::Text);
            huge->content = std::string(kMaxFlattenedBytes + 1, 'a');
            TestRunner::assertEqual(
                sizeError,
                errorOf([&]() { (void)flattenNodeText(huge); }),
                "Flatten: a single node above 64 MiB fails deterministically"
            );
        }
        {
            auto half = std::make_shared<MarkdownNode>(NodeType::Text);
            half->content = std::string(kMaxFlattenedBytes / 2 + 1, 'a');
            auto parent = std::make_shared<MarkdownNode>(NodeType::Document);
            parent->children.assign(2, half);
            TestRunner::assertEqual(
                sizeError,
                errorOf([&]() { (void)flattenNodeText(parent); }),
                "Flatten: accumulated text above 64 MiB fails deterministically"
            );
        }
    }

    static void testJsonOutputSizeCap() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        HybridMarkdownParser parser;
        std::string document = "![![";
        document += std::string(5'700'000, '\x01');
        document += "](u)](u)";
        for (const bool offsets : {true, false}) {
            BindingParserOptions options;
            options.sourceOffsets = offsets;
            const std::string error = errorOf([&]() {
                (void)parser.parseWithOptions(document, options);
            });
            TestRunner::assertTrue(
                error.find("Markdown JSON output size ") == 0 &&
                    error.find(" bytes exceeds the maximum of 67108864 bytes") != std::string::npos,
                std::string("JSON cap: output above 64 MiB fails with the size error (offsets ") +
                    (offsets ? "on" : "off") + "): " + error.substr(0, 96)
            );
        }
        BindingParserOptions capOptions;
        const size_t capPeak = peakHeapDuring([&]() {
            (void)errorOf([&]() { (void)parser.parseWithOptions(document, capOptions); });
        });
        std::cout << "ℹ Peak heap JSON cap rejection: " << capPeak << std::endl;
        TestRunner::assertTrue(
            capPeak <= 130u * 1024u * 1024u,
            "JSON cap: the writer stops at the cap instead of growing past it"
        );
        std::string plain;
        TestRunner::assertEqual(
            "",
            errorOf([&]() { plain = parser.extractPlainText(document); }),
            "JSON cap: the same document still flattens to plain text"
        );
        TestRunner::assertTrue(
            plain.size() == 5'700'000 + 2,
            "JSON cap: plain text keeps the image alt bytes"
        );
        TestRunner::assertTrue(
            parser.parse("ok").find("\"content\":\"ok\"") != std::string::npos,
            "JSON cap: the parser stays usable after the size error"
        );
    }

    static void testBindingNumericOptionBoundaries() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        HybridMarkdownParser parser;
        const std::string invalid = "maxInputLength must be a finite non-negative integer in bytes";
        const std::string unrepresentable = "maxInputLength cannot be represented as a native size";
        struct Case {
            const char* name;
            double value;
            std::string expectedError;
        };
        const std::vector<Case> cases = {
            {"-1", -1.0, invalid},
            {"-0.5", -0.5, invalid},
            {"0.5", 0.5, invalid},
            {"smallest subnormal", std::numeric_limits<double>::denorm_min(), invalid},
            {"+Inf", std::numeric_limits<double>::infinity(), invalid},
            {"-Inf", -std::numeric_limits<double>::infinity(), invalid},
            {"signaling NaN", std::numeric_limits<double>::signaling_NaN(), invalid},
            {"-DBL_MAX", std::numeric_limits<double>::lowest(), invalid},
            {"0", 0.0, ""},
            {"-0", -0.0, ""},
            {"exact input size", 5.0, ""},
            {"2^31 - 1", 2147483647.0, ""},
            {"2^31", 2147483648.0, ""},
            {"2^32 - 1", 4294967295.0, ""},
            {"2^32", 4294967296.0, ""},
            {"2^53", 9007199254740992.0, ""},
            {"2^63", 9223372036854775808.0, ""},
            {"2^64", 18446744073709551616.0, unrepresentable},
            {"2^65", 36893488147419103232.0, unrepresentable},
        };
        for (const auto& entry : cases) {
            BindingParserOptions options;
            options.maxInputLength = entry.value;
            TestRunner::assertEqual(
                entry.expectedError,
                errorOf([&]() { (void)parser.parseWithOptions("valid", options); }),
                std::string("Numeric options: parseWithOptions maxInputLength ") + entry.name
            );
            TestRunner::assertEqual(
                entry.expectedError,
                errorOf([&]() { (void)parser.extractPlainTextWithOptions("valid", options); }),
                std::string("Numeric options: extractPlainTextWithOptions maxInputLength ") + entry.name
            );
        }

        BindingParserOptions tooSmall;
        tooSmall.maxInputLength = 4.0;
        TestRunner::assertEqual(
            "Markdown input size 5 bytes exceeds the maximum of 4 bytes",
            errorOf([&]() { (void)parser.parseWithOptions("valid", tooSmall); }),
            "Numeric options: one byte above maxInputLength fails with the size error"
        );
        BindingParserOptions zero;
        zero.maxInputLength = 0.0;
        TestRunner::assertEqual(
            "Markdown input size 10485761 bytes exceeds the maximum of 10485760 bytes",
            errorOf([&]() {
                (void)parser.parseWithOptions(std::string(10 * 1024 * 1024 + 1, 'a'), zero);
            }),
            "Numeric options: maxInputLength 0 means the hard cap"
        );
        TestRunner::assertEqual(
            "",
            errorOf([&]() { (void)parser.extractPlainText(std::string(10 * 1024 * 1024, 'a')); }),
            "Numeric options: input exactly at the hard cap is accepted"
        );
    }

    static void testSessionNumericRangeBoundaries() {
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        const double nan = std::numeric_limits<double>::quiet_NaN();
        const double inf = std::numeric_limits<double>::infinity();
        auto session = std::make_shared<HybridMarkdownSession>();
        session->reset("hello");

        TestRunner::assertEqual("he", session->getTextRange(0.5, 2.9), "Session numerics: fractional range truncates toward zero");
        TestRunner::assertEqual("hello", session->getTextRange(-0.0, 1e300), "Session numerics: negative zero and huge end clamp");
        TestRunner::assertEqual("", session->getTextRange(0.0, inf), "Session numerics: infinite getTextRange end is empty");
        TestRunner::assertEqual("", session->getTextRange(-1.0, 3.0), "Session numerics: negative getTextRange start is empty");
        TestRunner::assertEqual("", session->getTextRange(3.0, 1.0), "Session numerics: inverted getTextRange is empty");
        TestRunner::assertEqual("", session->getTextRange(1e300, 1e301), "Session numerics: range past the end is empty");
        TestRunner::assertEqual("hello", session->getTextRange(0.0, 4294967296.0), "Session numerics: end above 2^32 clamps");

        const std::string suffix = " must be finite, from must be >= 0, and to must be >= from";
        TestRunner::assertEqual(
            "Invalid range: from=NaN and to=" + std::to_string(1.0) + suffix,
            errorOf([&]() { (void)session->replace(nan, 1.0, "x"); }),
            "Session numerics: replace rejects NaN start"
        );
        TestRunner::assertEqual(
            "Invalid range: from=" + std::to_string(0.0) + " and to=Inf" + suffix,
            errorOf([&]() { (void)session->replace(0.0, inf, "x"); }),
            "Session numerics: replace rejects infinite end"
        );
        TestRunner::assertEqual(
            "Invalid range: from=-Inf and to=" + std::to_string(1.0) + suffix,
            errorOf([&]() { (void)session->replace(-inf, 1.0, "x"); }),
            "Session numerics: replace rejects negative infinite start"
        );
        TestRunner::assertEqual(
            "Invalid range: from=" + std::to_string(-1.0) + " and to=" + std::to_string(1.0) + suffix,
            errorOf([&]() { (void)session->replace(-1.0, 1.0, "x"); }),
            "Session numerics: replace rejects negative start"
        );
        TestRunner::assertEqual("hello", session->getAllText(), "Session numerics: rejected replaces leave the buffer unchanged");
        TestRunner::assertTrue(
            session->replace(1.9, 3.2, "EY") == 5.0 && session->getAllText() == "hEYlo",
            "Session numerics: fractional replace truncates toward zero"
        );
        TestRunner::assertTrue(
            session->replace(-0.0, 1e300, "") == 0.0 && session->getAllText().empty(),
            "Session numerics: replace clamps a huge end to the buffer length"
        );

        for (const double value : {nan, inf, -inf, -1.0, 1e300, 0.5}) {
            TestRunner::assertEqual(
                "",
                errorOf([&]() {
                    session->setHighlightPosition(value);
                    (void)session->getHighlightPosition();
                    (void)session->append("x");
                }),
                "Session numerics: highlight position " + std::to_string(value) + " never throws natively"
            );
        }
    }

    static std::vector<std::string> splitByCodePoint(const std::string& text) {
        std::vector<std::string> pieces;
        size_t index = 0;
        while (index < text.size()) {
            const unsigned char lead = static_cast<unsigned char>(text[index]);
            const size_t bytes = lead < 0x80 ? 1 : (lead < 0xE0 ? 2 : (lead < 0xF0 ? 3 : 4));
            pieces.push_back(text.substr(index, bytes));
            index += bytes;
        }
        return pieces;
    }

    static void testSessionChunkSplitDifferential() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        const std::vector<std::string> documents = {
            "# Título 😀\n\nTexto **negrito** e `código` com 中文字 e [link](https://e.x/ü \"tí\").\n",
            "```ts\nconst a = \"😀\";\n// é\n```\n\ntail",
            "| a | b |\n|:--|--:|\n| 😀 | é |\n| 中 | `x` |\n\n- [ ] tarefa\n- [x] feita\n",
            "> citação\n> - item 😀\n>   continuação\n\n$$\nx^2\n$$\n\n~~fim~~",
            "line one  \nline two\\\nline three\r\nline four\rline five",
        };
        HybridMarkdownParser cold;
        size_t byteSplitMismatches = 0;
        size_t codePointMismatches = 0;
        size_t lengthMismatches = 0;
        size_t rangeMismatches = 0;
        size_t prefixFailures = 0;
        for (const auto& document : documents) {
            const std::string expected = cold.parse(document);
            auto whole = std::make_shared<HybridMarkdownSession>();
            const double expectedLength = whole->append(document);

            for (const size_t chunkBytes : {size_t{1}, size_t{2}, size_t{3}, size_t{5}, size_t{7}, size_t{64}}) {
                auto session = std::make_shared<HybridMarkdownSession>();
                for (size_t offset = 0; offset < document.size(); offset += chunkBytes) {
                    session->append(document.substr(offset, chunkBytes));
                    if (chunkBytes == 1) {
                        const std::string error = errorOf([&]() { (void)session->parse(); });
                        if (!error.empty()) prefixFailures++;
                    }
                }
                if (session->getAllText() != document || session->parse() != expected) {
                    byteSplitMismatches++;
                }
            }

            auto session = std::make_shared<HybridMarkdownSession>();
            std::vector<std::pair<double, double>> ranges;
            auto unsubscribe = session->addListener([&ranges](double from, double to) {
                ranges.emplace_back(from, to);
            });
            double cursor = 0.0;
            std::string reassembled;
            for (const auto& piece : splitByCodePoint(document)) {
                const double end = session->append(piece);
                reassembled += session->getTextRange(cursor, end);
                cursor = end;
            }
            unsubscribe();
            if (session->parse() != expected || reassembled != document) codePointMismatches++;
            if (session->getLength() != expectedLength) lengthMismatches++;
            double expectedFrom = 0.0;
            for (const auto& range : ranges) {
                if (range.first != expectedFrom || range.second <= range.first) rangeMismatches++;
                expectedFrom = range.second;
            }
            if (expectedFrom != expectedLength) rangeMismatches++;
        }
        TestRunner::assertTrue(
            byteSplitMismatches == 0,
            "Session chunks: byte-level splits rebuild the same buffer and parse (" +
                std::to_string(byteSplitMismatches) + " mismatches)"
        );
        TestRunner::assertTrue(
            prefixFailures == 0,
            "Session chunks: every byte prefix parses without error (" +
                std::to_string(prefixFailures) + " failures)"
        );
        TestRunner::assertTrue(
            codePointMismatches == 0,
            "Session chunks: code-point chunks match the one-shot parse and delta reads"
        );
        TestRunner::assertTrue(
            lengthMismatches == 0,
            "Session chunks: code-point chunks keep the one-shot UTF-16 length"
        );
        TestRunner::assertTrue(
            rangeMismatches == 0,
            "Session chunks: listener ranges tile the buffer without gaps"
        );

        auto session = std::make_shared<HybridMarkdownSession>();
        std::vector<std::pair<double, double>> ranges;
        auto unsubscribe = session->addListener([&ranges](double from, double to) {
            ranges.emplace_back(from, to);
        });
        session->append("first 😀");
        session->reset("é");
        TestRunner::assertTrue(
            session->append("😀") == 3.0 &&
                ranges.back() == std::pair<double, double>{1.0, 3.0} &&
                session->getAllText() == "é😀",
            "Session chunks: append after reset continues from the new length"
        );
        session->reset("");
        TestRunner::assertTrue(
            session->append("") == 0.0 &&
                ranges.back() == std::pair<double, double>{0.0, 0.0} &&
                session->parse() == cold.parse(""),
            "Session chunks: empty append after empty reset is a zero range"
        );
        session->clear();
        TestRunner::assertTrue(
            session->append("z") == 1.0 && ranges.back() == std::pair<double, double>{0.0, 1.0},
            "Session chunks: append after clear starts at zero"
        );
        const size_t notifications = ranges.size();
        TestRunner::assertEqual(
            "Buffer size limit exceeded (max 10485760 bytes)",
            errorOf([&]() { (void)session->append(std::string(10 * 1024 * 1024, 'a')); }),
            "Session chunks: an append that would exceed the cap is rejected"
        );
        TestRunner::assertTrue(
            session->getAllText() == "z" && session->getLength() == 1.0 &&
                ranges.size() == notifications,
            "Session chunks: a rejected append changes nothing and notifies nobody"
        );
        TestRunner::assertTrue(
            session->append("y") == 2.0 && session->getTextRange(1.0, 2.0) == "y",
            "Session chunks: the session keeps streaming after a rejected append"
        );
        unsubscribe();
    }

    static void testSessionStreamingStepsAreLinear() {
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        const std::string chunk = "aé😀 ";
        constexpr size_t kChunkCodePoints = 4;
        constexpr size_t kChunkUnits = 5;
        const auto streamSteps = [&chunk](size_t chunks) {
            auto session = std::make_shared<HybridMarkdownSession>();
            auto unsubscribe = session->addListener([](double, double) {});
            HybridMarkdownSession::resetUtf8DecodeStepsForTest();
            double cursor = 0.0;
            size_t deltaBytes = 0;
            for (size_t index = 0; index < chunks; index++) {
                const double end = session->append(chunk);
                deltaBytes += session->getTextRange(cursor, end).size();
                cursor = end;
            }
            const size_t steps = HybridMarkdownSession::utf8DecodeStepsForTest();
            unsubscribe();
            return std::pair<size_t, size_t>{steps, deltaBytes};
        };

        constexpr size_t kSmall = 5000;
        constexpr size_t kLarge = 20000;
        const auto small = streamSteps(kSmall);
        const auto large = streamSteps(kLarge);
        TestRunner::assertTrue(
            small.second == kSmall * chunk.size() && large.second == kLarge * chunk.size(),
            "Session streaming: delta reads return every appended byte"
        );
        TestRunner::assertTrue(
            large.first <= kLarge * (2 * kChunkCodePoints + 4),
            "Session streaming: 20,000 tiny chunks cost a bounded number of decode steps per chunk (" +
                std::to_string(large.first) + " steps)"
        );
        TestRunner::assertTrue(
            large.first <= 4 * small.first + 64,
            "Session streaming: decode steps grow linearly with the chunk count (" +
                std::to_string(small.first) + " -> " + std::to_string(large.first) + ")"
        );

        auto session = std::make_shared<HybridMarkdownSession>();
        for (size_t index = 0; index < kLarge; index++) session->append(chunk);
        HybridMarkdownSession::resetUtf8DecodeStepsForTest();
        const double total = session->getLength();
        (void)session->getTextRange(total - kChunkUnits, total);
        const size_t tailSteps = HybridMarkdownSession::utf8DecodeStepsForTest();
        TestRunner::assertTrue(
            tailSteps <= 2 * kChunkCodePoints + 4,
            "Session streaming: reading the last chunk does not rescan the buffer (" +
                std::to_string(tailSteps) + " steps)"
        );
        HybridMarkdownSession::resetUtf8DecodeStepsForTest();
        (void)session->replace(total, total, chunk);
        TestRunner::assertTrue(
            HybridMarkdownSession::utf8DecodeStepsForTest() <= 2 * kLarge * kChunkCodePoints + 64,
            "Session streaming: a tail replace scans the buffer at most twice"
        );
    }

    static void testSessionBufferGrowthIsBounded() {
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        constexpr size_t kCap = 10 * 1024 * 1024;
        constexpr size_t kChunkBytes = 1024;
        auto session = std::make_shared<HybridMarkdownSession>();
        const std::string chunk(kChunkBytes, 'a');
        size_t maxReported = 0;
        for (size_t index = 0; index < kCap / kChunkBytes; index++) {
            session->append(chunk);
            maxReported = std::max(maxReported, session->getExternalMemorySize());
        }
        TestRunner::assertTrue(
            session->getLength() == static_cast<double>(kCap),
            "Session growth: 10,240 chunks of 1 KiB fill the buffer to the cap"
        );
        TestRunner::assertTrue(
            maxReported >= kCap && maxReported <= 2 * kCap + 4096,
            "Session growth: retained capacity never exceeds twice the cap (" +
                std::to_string(maxReported) + " bytes)"
        );
        TestRunner::assertEqual(
            "Buffer size limit exceeded (max 10485760 bytes)",
            errorOf([&]() { (void)session->append("a"); }),
            "Session growth: the next byte after the cap is rejected"
        );
        TestRunner::assertEqual(
            "Buffer size limit exceeded (max 10485760 bytes)",
            errorOf([&]() { session->reset(std::string(kCap + 1, 'a')); }),
            "Session growth: reset above the cap is rejected"
        );
        TestRunner::assertTrue(
            session->getLength() == static_cast<double>(kCap),
            "Session growth: rejected writes leave the full buffer intact"
        );
        session->clear();
        TestRunner::assertTrue(
            session->append("again") == 5.0,
            "Session growth: the session streams again after clear"
        );
    }

    static void testSessionListenerReentrancy() {
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        {
            auto session = std::make_shared<HybridMarkdownSession>();
            std::vector<std::pair<double, double>> ranges;
            bool reentered = false;
            auto unsubscribe = session->addListener([&](double from, double to) {
                ranges.emplace_back(from, to);
                if (!reentered) {
                    reentered = true;
                    session->append("def");
                    (void)session->getTextRange(0.0, session->getLength());
                    (void)session->parse();
                }
            });
            const double length = session->append("abc");
            TestRunner::assertTrue(
                length == 3.0 && session->getAllText() == "abcdef" &&
                    ranges == std::vector<std::pair<double, double>>{{0.0, 3.0}, {3.0, 6.0}},
                "Session re-entrancy: a listener may append and read without deadlock"
            );
            unsubscribe();
        }
        {
            auto session = std::make_shared<HybridMarkdownSession>();
            size_t selfCalls = 0;
            size_t lateCalls = 0;
            std::function<void()> unsubscribeSelf;
            std::function<void()> unsubscribeLate;
            unsubscribeSelf = session->addListener([&](double, double) {
                selfCalls++;
                unsubscribeSelf();
                if (!unsubscribeLate) {
                    unsubscribeLate = session->addListener([&](double, double) { lateCalls++; });
                }
            });
            session->append("a");
            TestRunner::assertTrue(
                selfCalls == 1 && lateCalls == 0,
                "Session re-entrancy: a listener added during notify waits for the next event"
            );
            session->append("b");
            TestRunner::assertTrue(
                selfCalls == 1 && lateCalls == 1,
                "Session re-entrancy: a listener removed during notify is not called again"
            );
            unsubscribeSelf();
            unsubscribeLate();
            unsubscribeLate();
            session->append("c");
            TestRunner::assertTrue(lateCalls == 1, "Session re-entrancy: double unsubscribe is a no-op");
        }
        {
            auto session = std::make_shared<HybridMarkdownSession>();
            size_t afterDispose = 0;
            auto first = session->addListener([&](double, double) { session->dispose(); });
            auto second = session->addListener([&](double, double) { afterDispose++; });
            TestRunner::assertEqual(
                "",
                errorOf([&]() { (void)session->append("abc"); }),
                "Session re-entrancy: a listener may dispose the session during notify"
            );
            TestRunner::assertTrue(
                afterDispose == 1,
                "Session re-entrancy: listeners snapshotted before dispose still run once"
            );
            TestRunner::assertEqual(
                "HybridMarkdownSession is destroyed",
                errorOf([&]() { (void)session->append("x"); }),
                "Session re-entrancy: appends after dispose fail with the destroyed error"
            );
            TestRunner::assertEqual(
                "HybridMarkdownSession is destroyed",
                errorOf([&]() { (void)session->parse(); }),
                "Session re-entrancy: parse after dispose fails with the destroyed error"
            );
            TestRunner::assertEqual(
                "",
                errorOf([&]() {
                    first();
                    second();
                    session->dispose();
                    session->dispose();
                }),
                "Session re-entrancy: unsubscribe and dispose after dispose are no-ops"
            );
        }
        {
            std::function<void()> orphan;
            {
                auto session = std::make_shared<HybridMarkdownSession>();
                orphan = session->addListener([](double, double) {});
            }
            TestRunner::assertEqual(
                "",
                errorOf([&]() { orphan(); }),
                "Session re-entrancy: unsubscribe after the session is destroyed is a no-op"
            );
        }
    }

    static void testSessionConcurrentCallers() {
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        constexpr size_t kAppenders = 4;
        constexpr size_t kAppendsPerThread = 300;
        constexpr double kChunkUnits = 5.0;
        const std::string chunk = "ab😀\n";

        auto session = std::make_shared<HybridMarkdownSession>();
        std::mutex rangesMutex;
        std::vector<std::pair<double, double>> ranges;
        auto unsubscribe = session->addListener([&](double from, double to) {
            std::lock_guard<std::mutex> lock(rangesMutex);
            ranges.emplace_back(from, to);
        });
        std::atomic<size_t> unexpected{0};
        std::vector<std::thread> threads;
        for (size_t thread = 0; thread < kAppenders; thread++) {
            threads.emplace_back([&]() {
                for (size_t index = 0; index < kAppendsPerThread; index++) {
                    try {
                        (void)session->append(chunk);
                    } catch (...) {
                        unexpected.fetch_add(1);
                    }
                }
            });
        }
        threads.emplace_back([&]() {
            for (size_t index = 0; index < 200; index++) {
                try {
                    const double length = session->getLength();
                    const std::string text = session->getTextRange(0.0, length);
                    if (text.size() % chunk.size() != 0) unexpected.fetch_add(1);
                    (void)session->getAllText();
                    (void)session->getExternalMemorySize();
                    session->setHighlightPosition(length);
                    (void)session->getHighlightPosition();
                } catch (...) {
                    unexpected.fetch_add(1);
                }
            }
        });
        threads.emplace_back([&]() {
            for (size_t index = 0; index < 20; index++) {
                try {
                    if (session->parse().find("\"type\":\"document\"") != 1) unexpected.fetch_add(1);
                } catch (...) {
                    unexpected.fetch_add(1);
                }
            }
        });
        threads.emplace_back([&]() {
            for (size_t index = 0; index < 200; index++) {
                try {
                    auto remove = session->addListener([](double, double) {});
                    remove();
                } catch (...) {
                    unexpected.fetch_add(1);
                }
            }
        });
        for (auto& thread : threads) thread.join();

        const double total = static_cast<double>(kAppenders * kAppendsPerThread) * kChunkUnits;
        TestRunner::assertTrue(unexpected.load() == 0, "Session concurrency: no caller observed an error or a torn chunk");
        TestRunner::assertTrue(session->getLength() == total, "Session concurrency: final length equals the sum of all appends");
        TestRunner::assertTrue(
            session->getAllText() == repeatToSize(chunk, kAppenders * kAppendsPerThread * chunk.size()),
            "Session concurrency: the buffer holds every chunk intact"
        );
        std::sort(ranges.begin(), ranges.end());
        bool tiled = ranges.size() == kAppenders * kAppendsPerThread;
        for (size_t index = 0; tiled && index < ranges.size(); index++) {
            tiled = ranges[index].first == static_cast<double>(index) * kChunkUnits &&
                ranges[index].second == ranges[index].first + kChunkUnits;
        }
        TestRunner::assertTrue(tiled, "Session concurrency: notified ranges tile the buffer exactly once");
        unsubscribe();
    }

    static void testSessionDisposeRacesCallers() {
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        constexpr size_t kThreads = 4;
        constexpr size_t kOperations = 300;
        auto session = std::make_shared<HybridMarkdownSession>();
        std::atomic<size_t> succeeded{0};
        std::atomic<size_t> destroyed{0};
        std::atomic<size_t> unexpected{0};
        std::vector<std::thread> threads;
        for (size_t thread = 0; thread < kThreads; thread++) {
            threads.emplace_back([&]() {
                for (size_t index = 0; index < kOperations; index++) {
                    try {
                        auto remove = session->addListener([](double, double) {});
                        (void)session->append("chunk\n");
                        (void)session->getTextRange(0.0, 5.0);
                        (void)session->parse();
                        remove();
                        succeeded.fetch_add(1);
                    } catch (const std::runtime_error& error) {
                        if (std::string(error.what()) == "HybridMarkdownSession is destroyed") {
                            destroyed.fetch_add(1);
                        } else {
                            unexpected.fetch_add(1);
                        }
                    } catch (...) {
                        unexpected.fetch_add(1);
                    }
                }
            });
        }
        while (succeeded.load() + destroyed.load() + unexpected.load() < kThreads * 8) {
            std::this_thread::yield();
        }
        session->dispose();
        for (auto& thread : threads) thread.join();

        TestRunner::assertTrue(
            unexpected.load() == 0 &&
                succeeded.load() + destroyed.load() == kThreads * kOperations,
            "Session dispose race: every operation either completes or fails with the destroyed error (" +
                std::to_string(succeeded.load()) + " ok, " + std::to_string(destroyed.load()) + " destroyed)"
        );
        TestRunner::assertTrue(
            session->getExternalMemorySize() == 0,
            "Session dispose race: a disposed session retains no memory"
        );
    }

    enum class InjectionOutcome { Completed, BadAlloc, RuntimeError, Other };

    static std::string& lastInjectionMessage() {
        static std::string message;
        return message;
    }

    template <typename Fn>
    static InjectionOutcome runWithAllocationFailure(long long allocations, bool sticky, bool& fired, Fn&& fn) {
        namespace Heap = ::NitroMarkdownTestHeap;
        const size_t before = Heap::injectedFailures.load();
        const auto disarm = [&]() {
            Heap::allocationsUntilFailure.store(-1);
            Heap::stickyFailure.store(false);
            fired = Heap::injectedFailures.load() != before;
        };
        Heap::stickyFailure.store(sticky);
        Heap::allocationsUntilFailure.store(allocations);
        try {
            fn();
            disarm();
            return InjectionOutcome::Completed;
        } catch (const std::bad_alloc& error) {
            disarm();
            lastInjectionMessage() = error.what();
            return InjectionOutcome::BadAlloc;
        } catch (const std::runtime_error& error) {
            disarm();
            lastInjectionMessage() = error.what();
            return InjectionOutcome::RuntimeError;
        } catch (...) {
            disarm();
            return InjectionOutcome::Other;
        }
    }

    struct InjectionSummary {
        size_t points = 0;
        size_t badAlloc = 0;
        size_t runtimeError = 0;
        size_t swallowed = 0;
        size_t other = 0;
        size_t brokenInvariant = 0;
        size_t mappedOutOfMemory = 0;
        size_t sessionOutOfMemory = 0;
        size_t lostReason = 0;
    };

    template <typename Fn, typename Check>
    static InjectionSummary sweepAllocationFailures(bool sticky, Fn&& fn, Check&& check) {
        InjectionSummary summary;
        for (long long allocations = 0; allocations < 20000; allocations++) {
            bool fired = false;
            const InjectionOutcome outcome = runWithAllocationFailure(allocations, sticky, fired, fn);
            if (!fired) break;
            summary.points++;
            if (outcome == InjectionOutcome::BadAlloc) {
                summary.badAlloc++;
                if (lastInjectionMessage() == "Markdown parser ran out of memory") {
                    summary.mappedOutOfMemory++;
                } else if (lastInjectionMessage() == "Markdown session ran out of memory") {
                    summary.sessionOutOfMemory++;
                }
            } else if (outcome == InjectionOutcome::RuntimeError) {
                summary.runtimeError++;
                if (lastInjectionMessage().find("Markdown parsing failed with code") == 0) {
                    summary.lostReason++;
                }
            }
            else if (outcome == InjectionOutcome::Completed) summary.swallowed++;
            else summary.other++;
            if (!check()) summary.brokenInvariant++;
        }
        return summary;
    }

    static std::string describe(const InjectionSummary& summary) {
        return std::to_string(summary.points) + " points, " +
            std::to_string(summary.badAlloc) + " bad_alloc, " +
            std::to_string(summary.mappedOutOfMemory) + " reported as parser out of memory, " +
            std::to_string(summary.sessionOutOfMemory) + " reported as session out of memory, " +
            std::to_string(summary.runtimeError) + " runtime_error, " +
            std::to_string(summary.lostReason) + " lost reasons, " +
            std::to_string(summary.swallowed) + " swallowed, " +
            std::to_string(summary.other) + " other, " +
            std::to_string(summary.brokenInvariant) + " broken invariants";
    }

    static void testAllocationFailureInjection() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using ::margelo::nitro::Markdown::HybridMarkdownSession;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        const std::string document =
            "# Título é\n\n- a *b* `c`\n- [l](/u \"t\")\n\n| a | b |\n|---|---|\n| 1 | 😀 |\n\n"
            "![alt **x**](i)\n\n> q\n> r\n\n```js\ncode\n```\n\n[ref]\n\n[ref]: /r \"rt\"\n";

        for (const bool sticky : {false, true}) {
            const std::string mode = sticky ? "persistent" : "single";
            MD4CParser parser;
            ParserOptions options{true, true};
            const std::string expectedTree = canonicalizeNode(parser.parse(document, options));
            const InjectionSummary core = sweepAllocationFailures(
                sticky,
                [&]() { (void)parser.parse(document, options); },
                [&]() { return canonicalizeNode(parser.parse(document, options)) == expectedTree; }
            );
            TestRunner::assertTrue(
                core.points > 20 && core.swallowed == 0 && core.other == 0 &&
                    core.brokenInvariant == 0 && core.runtimeError == 0 &&
                    core.mappedOutOfMemory == core.points && core.sessionOutOfMemory == 0,
                "Allocation failure (" + mode + "): core parse reports out of memory at every point and stays reusable (" +
                    describe(core) + ")"
            );

            HybridMarkdownParser binding;
            BindingParserOptions bindingOptions;
            const std::string expectedJson = binding.parseWithOptions(document, bindingOptions);
            const std::string expectedPlain = binding.extractPlainText(document);
            const InjectionSummary json = sweepAllocationFailures(
                sticky,
                [&]() {
                    (void)binding.parseWithOptions(document, bindingOptions);
                    (void)binding.extractPlainText(document);
                },
                [&]() {
                    return binding.parseWithOptions(document, bindingOptions) == expectedJson &&
                        binding.extractPlainText(document) == expectedPlain;
                }
            );
            TestRunner::assertTrue(
                json.points > 20 && json.swallowed == 0 && json.other == 0 &&
                    json.brokenInvariant == 0 && json.runtimeError == 0 &&
                    json.mappedOutOfMemory == json.points && json.sessionOutOfMemory == 0,
                "Allocation failure (" + mode + "): binding parse and flatten report out of memory at every point (" +
                    describe(json) + ")"
            );

            auto session = std::make_shared<HybridMarkdownSession>();
            session->reset("início 😀 ");
            auto keep = session->addListener([](double, double) {});
            const std::string chunk = std::string(200, 'x') + "é😀\n";
            const auto consistent = [&]() {
                const std::string text = session->getAllText();
                return session->getLength() == static_cast<double>(utf16LengthForTest(text)) &&
                    session->getTextRange(0.0, session->getLength()) == text;
            };
            const InjectionSummary stream = sweepAllocationFailures(
                sticky,
                [&]() {
                    auto remove = session->addListener([](double, double) {});
                    (void)session->append(chunk);
                    (void)session->replace(0.0, 1.0, chunk);
                    session->reset(chunk + chunk);
                    (void)session->getTextRange(0.0, 4.0);
                    (void)session->getAllText();
                    (void)session->parse();
                    remove();
                },
                consistent
            );
            TestRunner::assertTrue(
                stream.points > 5 && stream.swallowed == 0 && stream.other == 0 &&
                    stream.brokenInvariant == 0 && stream.lostReason == 0 &&
                    stream.runtimeError == 0 && stream.mappedOutOfMemory > 0 &&
                    stream.sessionOutOfMemory > 0 &&
                    stream.mappedOutOfMemory + stream.sessionOutOfMemory == stream.points,
                "Allocation failure (" + mode + "): session operations report out of memory at every point and keep length and buffer consistent (" +
                    describe(stream) + ")"
            );
            keep();
        }
    }

    template <typename Fn>
    static size_t peakHeapDuring(Fn&& fn) {
        namespace Heap = ::NitroMarkdownTestHeap;
        const size_t base = Heap::liveBytes.load();
        Heap::peakBytes.store(base);
        fn();
        return Heap::peakBytes.load() - base;
    }

    static void testPeakHeapBounds() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        constexpr size_t kCap = 10 * 1024 * 1024;
        constexpr size_t kSlack = 1024 * 1024;
        MD4CParser parser;
        ParserOptions tracked{true, true};
        tracked.sourceOffsets = true;
        ParserOptions untracked = tracked;
        untracked.sourceOffsets = false;

        struct Case {
            const char* name;
            std::string input;
        };
        std::vector<Case> cases;
        cases.push_back({"ASCII at the cap", std::string(kCap, 'a')});
        cases.push_back({"two-byte text at the cap", repeatToSize("\xC3\xA9", kCap - 1)});
        cases.push_back({"three-byte text at the cap", repeatToSize("\xE4\xB8\xAD", kCap - 2)});
        cases.push_back({"four-byte text at the cap", repeatToSize("\xF0\x9F\x98\x80", kCap - 3)});
        cases.push_back({"invalid lead bytes at the cap", std::string(kCap, '\xFF')});
        cases.push_back({"lone two-byte leads at the cap", std::string(kCap, '\xC3')});
        cases.push_back({"alternating ASCII and two-byte text at the cap", repeatToSize("a\xC3\xA9", kCap - 2)});
        cases.push_back({"alternating ASCII and three-byte text at the cap", repeatToSize("a\xE4\xB8\xAD", kCap - 3)});
        cases.push_back({"alternating ASCII and four-byte text at the cap", repeatToSize("a\xF0\x9F\x98\x80", kCap - 4)});
        for (auto& entry : cases) {
            if (entry.input.size() > kCap) entry.input.resize(kCap - kCap % 12);
            const size_t trackedPeak = peakHeapDuring([&]() { (void)parser.parse(entry.input, tracked); });
            const size_t untrackedPeak = peakHeapDuring([&]() { (void)parser.parse(entry.input, untracked); });
            std::cout << "ℹ Peak heap " << entry.name << ": tracked=" << trackedPeak
                      << " untracked=" << untrackedPeak << " input=" << entry.input.size() << std::endl;
            TestRunner::assertTrue(
                trackedPeak <= entry.input.size() + entry.input.size() / 8 + kSlack,
                std::string("Peak heap: ") + entry.name + " with offsets stays within 1.125x input"
            );
            TestRunner::assertTrue(
                untrackedPeak <= entry.input.size() + kSlack,
                std::string("Peak heap: ") + entry.name + " without offsets stays within 1x input"
            );
        }

        const std::string dense = repeatToSize("a\n", 2 * 49000);
        const size_t densePeak = peakHeapDuring([&]() { (void)parser.parse(dense, tracked); });
        std::cout << "ℹ Peak heap node-dense: " << densePeak << " input=" << dense.size() << std::endl;
        TestRunner::assertTrue(
            densePeak <= 64 * 1024 * 1024,
            "Peak heap: a tree at the node budget stays under 64 MiB regardless of input size"
        );

        HybridMarkdownParser binding;
        BindingParserOptions bindingOptions;
        const std::string ascii(kCap, 'a');
        const size_t jsonPeak = peakHeapDuring([&]() { (void)binding.parseWithOptions(ascii, bindingOptions); });
        std::cout << "ℹ Peak heap binding ASCII at the cap: " << jsonPeak << std::endl;
        TestRunner::assertTrue(
            jsonPeak <= 4 * kCap + kSlack,
            "Peak heap: binding JSON for ASCII at the cap stays within 4x input"
        );
    }

    static std::vector<std::string> unicodeDocuments() {
        return {
            "# 标题\n\n中文段落，带有**加粗**和`代码`。\n\n- 列表项一\n- 列表项二\n",
            "😀😀😀 **😀** _é😀_ `😀` [😀](https://e.x/😀 \"😀\")\n",
            "aé aé aé **aé** aé\naé  \naé\\\naé",
            "Olá, mundo! Ação, coração, pão — “aspas” … ½ ±\n\n> Citação é ótima\n",
            "| 中 | é | 😀 |\n|:--|:-:|--:|\n| a中 | bé | c😀 |\n| 中中中 | ééé | 😀😀 |\n",
            "```日本語\nコード 😀\n```\n\n$$\nα + β = γ\n$$\n\n$δ$ ~~削除~~\n",
            "- [ ] tâche é\n- [x] 完了 😀\n\n1. Ünïcödé\n2. Ελληνικά\n3. Кириллица\n4. עברית\n5. العربية\n",
            "mixed \xC3\xA9\xE4\xB8\xAD\xF0\x9F\x98\x80\xC3\xA9\xC3\xA9\xE4\xB8\xAD\xE4\xB8\xAD\xF0\x9F\x98\x80\xF0\x9F\x98\x80 a \xC3\xA9 b \xE4\xB8\xAD c \xF0\x9F\x98\x80 d",
            "![é😀 **中**](i.png \"tí\") <b>é</b> &amp; &eacute; &#x4e2d; \\* é\n",
            "é\r\n中\r😀\n\n***\n\nSetext é\n===\n\nSetext 中\n---\n",
        };
    }

    static std::vector<std::string> goldenDocuments() {
        std::vector<std::string> documents;
        for (auto& document : hostileDocuments()) {
            if (document.compare(0, 3, "\xEF\xBB\xBF") != 0) documents.push_back(std::move(document));
        }
        for (auto& document : unicodeDocuments()) documents.push_back(std::move(document));
        for (auto& document : makeFragmentCorpus(600, 0x60D1E5u)) documents.push_back(std::move(document));
        return documents;
    }

    static void testProductionOutputGolden() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using BindingParserOptions = ::margelo::nitro::Markdown::ParserOptions;

        HybridMarkdownParser parser;
        uint64_t hash = 14695981039346656037ull;
        const auto mix = [&hash](const std::string& value) {
            for (const char raw : value) {
                hash ^= static_cast<unsigned char>(raw);
                hash *= 1099511628211ull;
            }
            hash ^= 0xFFu;
            hash *= 1099511628211ull;
        };
        for (const auto& document : goldenDocuments()) {
            for (unsigned combo = 0; combo < 8; combo++) {
                BindingParserOptions options;
                options.gfm = (combo & 1u) != 0;
                options.math = (combo & 2u) != 0;
                options.html = (combo & 4u) != 0;
                options.sourceOffsets = true;
                std::string json;
                std::string plain;
                const std::string error = errorOf([&]() {
                    json = parser.parseWithOptions(document, options);
                    plain = parser.extractPlainTextWithOptions(document, options);
                });
                mix(json);
                mix(plain);
                mix(error);
            }
        }
        TestRunner::assertEqual(
            "14084455836454379281",
            std::to_string(hash),
            "Golden: production-flag JSON, offsets and plain text are byte-identical to the 0.13.0 output"
        );
    }

    static size_t strictUtf8SequenceLength(const std::string& text, size_t index) {
        const auto byteAt = [&text](size_t position) {
            return static_cast<unsigned char>(text[position]);
        };
        const auto continuation = [&](size_t position) {
            return position < text.size() && (byteAt(position) & 0xC0) == 0x80;
        };
        const unsigned char first = byteAt(index);
        if (first >= 0xC2 && first <= 0xDF && continuation(index + 1)) return 2;
        if (
            first >= 0xE0 && first <= 0xEF && continuation(index + 1) && continuation(index + 2) &&
            !(first == 0xE0 && byteAt(index + 1) < 0xA0) &&
            !(first == 0xED && byteAt(index + 1) >= 0xA0)
        ) {
            return 3;
        }
        if (
            first >= 0xF0 && first <= 0xF4 && continuation(index + 1) && continuation(index + 2) &&
            continuation(index + 3) && !(first == 0xF0 && byteAt(index + 1) < 0x90) &&
            !(first == 0xF4 && byteAt(index + 1) >= 0x90)
        ) {
            return 4;
        }
        return 1;
    }

    static std::vector<OFF> referenceSourceOffsets(const std::string& text) {
        std::vector<OFF> offsets;
        offsets.reserve(text.size() + 2);
        OFF utf16 = 0;
        size_t index = 0;
        while (index < text.size()) {
            const size_t length = strictUtf8SequenceLength(text, index);
            for (size_t step = 0; step < length; step++) offsets.push_back(utf16);
            utf16 += length == 4 ? 2 : 1;
            index += length;
        }
        offsets.push_back(utf16);
        offsets.push_back(utf16);
        return offsets;
    }

    static void testSourceOffsetMappingMatchesReference() {
        std::vector<std::string> documents = hostileDocuments();
        for (auto& document : unicodeDocuments()) documents.push_back(std::move(document));
        documents.push_back(repeatToSize("\xE4\xB8\xAD", 30000));
        documents.push_back(repeatToSize("a\xC3\xA9", 30000));
        documents.push_back(repeatToSize("\xC3\xA9\xE4\xB8\xAD\xF0\x9F\x98\x80", 30000));
        documents.push_back(repeatToSize("\xF0\x9F\x98\x80\xF0\x9F", 3000));
        documents.push_back(repeatToSize("\xC3\xA9\xC3", 3000));
        documents.push_back(std::string(4096, '\xFF'));
        documents.push_back(std::string(4096, '\xC3'));
        std::mt19937 rng(0x0FF5E7u);
        const char kBytes[] = "a\n\xC3\xA9\xE4\xB8\xAD\xF0\x9F\x98\x80\xED\xA0\x80\xC0\xFF\x80";
        for (int index = 0; index < 400; index++) {
            std::string document;
            const size_t length = rng() % 200;
            for (size_t position = 0; position < length; position++) {
                document.push_back(kBytes[rng() % (sizeof(kBytes) - 1)]);
            }
            documents.push_back(std::move(document));
        }

        size_t mismatches = 0;
        size_t checkedOffsets = 0;
        std::string firstMismatch;
        for (const auto& document : documents) {
            const std::vector<OFF> actual = MD4CParser::sourceOffsetsForTest(document);
            const std::vector<OFF> expected = referenceSourceOffsets(document);
            checkedOffsets += expected.size();
            if (actual != expected) {
                mismatches++;
                if (firstMismatch.empty()) firstMismatch = jsonEscape(document.substr(0, 64));
            }
        }
        TestRunner::assertEqual(
            "",
            firstMismatch,
            "Offset runs: every byte offset maps to the per-sequence reference (" +
                std::to_string(checkedOffsets) + " offsets, " +
                std::to_string(mismatches) + " mismatching documents)"
        );

        size_t shuffledMismatches = 0;
        size_t oversizedMaps = 0;
        for (const auto& document : documents) {
            const std::vector<OFF> expected = referenceSourceOffsets(document);
            std::vector<size_t> order(expected.size());
            for (size_t index = 0; index < order.size(); index++) order[index] = index;
            std::shuffle(order.begin(), order.end(), rng);
            const std::vector<OFF> actual = MD4CParser::sourceOffsetsForTest(document, order);
            for (size_t index = 0; index < order.size(); index++) {
                if (actual[index] != expected[order[index]]) {
                    shuffledMismatches++;
                    break;
                }
            }
            if (MD4CParser::sourceOffsetMapBytesForTest(document) > document.size() / 8 + 16) {
                oversizedMaps++;
            }
        }
        TestRunner::assertTrue(
            shuffledMismatches == 0,
            "Offset map: lookups in any order match the per-sequence reference (" +
                std::to_string(shuffledMismatches) + " mismatching documents)"
        );
        TestRunner::assertTrue(
            oversizedMaps == 0,
            "Offset map: the table never exceeds one eighth of the input for any content shape (" +
                std::to_string(oversizedMaps) + " oversized)"
        );
        TestRunner::assertEqual(
            "0",
            std::to_string(MD4CParser::sourceOffsetMapBytesForTest(std::string(4096, 'a'))),
            "Offset map: ASCII needs no table"
        );
        TestRunner::assertEqual(
            "0",
            std::to_string(MD4CParser::sourceOffsetMapBytesForTest(std::string(4096, '\xFF'))),
            "Offset map: input without valid multibyte sequences needs no table"
        );
        constexpr size_t kMapProbeBytes = 3 * 1024 * 1024;
        for (const std::string& unit : {
            std::string("\xC3\xA9"),
            std::string("\xE4\xB8\xAD"),
            std::string("\xF0\x9F\x98\x80"),
            std::string("a\xC3\xA9"),
            std::string("a\xE4\xB8\xAD"),
            std::string("a\xF0\x9F\x98\x80"),
        }) {
            const std::string text = repeatToSize(unit, kMapProbeBytes);
            const size_t mapBytes = MD4CParser::sourceOffsetMapBytesForTest(text);
            TestRunner::assertTrue(
                mapBytes > 0 && mapBytes <= text.size() / 16 + 16,
                "Offset map: " + jsonEscape(unit) + " text uses at most one sixteenth of the input (" +
                    std::to_string(mapBytes) + " bytes for " + std::to_string(text.size()) + ")"
            );
        }
    }

    static std::string dumpWithOffsets(const std::shared_ptr<MarkdownNode>& node, OFF shift, bool isRoot) {
        if (!node) return "null";
        const OFF beg = isRoot ? node->beg : node->beg + shift;
        std::string out = nodeTypeToString(node->type) + "[" + std::to_string(beg) + "," +
            std::to_string(node->end + shift) + "]";
        if (node->content.has_value()) out += "{" + jsonEscape(node->content.value()) + "}";
        if (node->href.has_value()) out += "<" + jsonEscape(node->href.value()) + ">";
        if (node->alt.has_value()) out += "~" + jsonEscape(node->alt.value()) + "~";
        out += "(";
        for (const auto& child : node->children) out += dumpWithOffsets(child, shift, false) + " ";
        out += ")";
        return out;
    }

    static void testLeadingBomIsSkipped() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        const std::string bom = "\xEF\xBB\xBF";
        MD4CParser parser;
        ParserOptions options{true, true, true};

        const auto heading = findFirstNode(parser.parse(bom + "# h", options), NodeType::Heading);
        const auto plainHeading = findFirstNode(parser.parse("# h", options), NodeType::Heading);
        TestRunner::assertTrue(
            heading && plainHeading && heading->beg == plainHeading->beg + 1 &&
                heading->end == plainHeading->end + 1 && heading->end == 4,
            "BOM: a leading BOM no longer hides a heading and offsets count it as one unit"
        );

        std::vector<std::string> documents = unicodeDocuments();
        for (const std::string& extra : {
            std::string(""),
            std::string("\n"),
            std::string("# h"),
            std::string("plain"),
            std::string("- a\n- b\n\n> q\n\n```\ncode\n```\n"),
            std::string("| a |\n|---|\n| 1 |\n"),
            std::string("a\r\nb  \r\nc\\\nd"),
            std::string("<div>\nx\n</div>\n\n[r]\n\n[r]: /u \"t\"\n"),
        }) {
            documents.push_back(extra);
        }
        const auto fragments = makeFragmentCorpus(200, 0xB0B0u);
        documents.insert(documents.end(), fragments.begin(), fragments.end());

        size_t mismatches = 0;
        size_t plainMismatches = 0;
        std::string firstMismatch;
        for (const auto& document : documents) {
            for (const bool offsets : {true, false}) {
                ParserOptions current = options;
                current.sourceOffsets = offsets;
                const auto plain = parser.parse(document, current);
                const auto prefixed = parser.parse(bom + document, current);
                const OFF shift = offsets ? 1 : 0;
                if (dumpWithOffsets(plain, shift, true) != dumpWithOffsets(prefixed, 0, true)) {
                    mismatches++;
                    if (firstMismatch.empty()) firstMismatch = jsonEscape(document);
                }
                if (flattenNodeText(plain) != flattenNodeText(prefixed)) plainMismatches++;
            }
        }
        TestRunner::assertEqual(
            "",
            firstMismatch,
            "BOM: a prefixed document parses to the same tree with every offset shifted by one (" +
                std::to_string(mismatches) + " mismatches)"
        );
        TestRunner::assertTrue(
            plainMismatches == 0,
            "BOM: plain text is the same with and without a leading BOM"
        );

        const auto bomOnly = parser.parse(bom, options);
        TestRunner::assertTrue(
            bomOnly && bomOnly->children.empty() && bomOnly->beg == 0 && bomOnly->end == 1,
            "BOM: a BOM-only document is empty and spans one unit"
        );
        const auto secondBom = findFirstNode(parser.parse(bom + bom + "x", options), NodeType::Text);
        TestRunner::assertTrue(
            secondBom && secondBom->content.value_or("") == bom + "x" && secondBom->beg == 1 &&
                secondBom->end == 3,
            "BOM: only the first BOM is skipped"
        );
        const auto midBom = findFirstNode(parser.parse("a" + bom + "# h", options), NodeType::Text);
        TestRunner::assertEqual(
            "a" + bom + "# h",
            midBom ? midBom->content.value_or("") : "",
            "BOM: a BOM that is not at the start stays in the text"
        );

        HybridMarkdownParser binding;
        TestRunner::assertEqual(
            "{\"type\":\"document\",\"beg\":0,\"end\":4,\"children\":[{\"type\":\"heading\",\"beg\":3,\"end\":4,"
            "\"level\":1,\"children\":[{\"type\":\"text\",\"beg\":3,\"end\":4,\"content\":\"h\"}]}]}",
            binding.parse(bom + "# h"),
            "BOM: binding JSON keeps offsets relative to the original string"
        );
        TestRunner::assertEqual("h\n\n", binding.extractPlainText(bom + "# h"), "BOM: plain text drops the BOM");

        auto session = std::make_shared<HybridMarkdownSession>();
        for (const char byte : bom + "# h") session->append(std::string(1, byte));
        TestRunner::assertEqual(
            binding.parse(bom + "# h"),
            session->parse(),
            "BOM: a streamed BOM parses like the one-shot document"
        );
        TestRunner::assertTrue(
            session->getLength() >= 4.0 && session->getAllText() == bom + "# h",
            "BOM: the session buffer keeps the BOM bytes"
        );
    }

    static void testUnmappedExtensionNodesStayBalanced() {
        MD4CParser parser;
        ParserOptions options{false, false};
        const std::string document =
            "> q ==hi== ^s^ ~b~ ||sp|| [[w]] x[^1]\n\n\n[^1]: note\n\n> [!NOTE]\n> body\n\nafter";
        struct Case {
            const char* name;
            unsigned int flags;
            bool sourceOrdered;
        };
        const std::vector<Case> cases = {
            {"spoilers", MD_FLAG_SPOILERS, true},
            {"superscripts", MD_FLAG_SUPERSCRIPTS, true},
            {"subscripts", MD_FLAG_SUBSCRIPTS, true},
            {"highlight", MD_FLAG_HIGHLIGHT, true},
            {"wikilinks", MD_FLAG_WIKILINKS, true},
            {"footnotes", MD_FLAG_FOOTNOTES, false},
            {"admonitions", MD_FLAG_ADMONITIONS, true},
            {"blank lines", MD_FLAG_PRESERVEBLANKLINES, true},
            {"all extensions", MD_FLAG_SPOILERS | MD_FLAG_SUPERSCRIPTS | MD_FLAG_SUBSCRIPTS |
                MD_FLAG_HIGHLIGHT | MD_FLAG_WIKILINKS | MD_FLAG_FOOTNOTES | MD_FLAG_ADMONITIONS |
                MD_FLAG_PRESERVEBLANKLINES, false},
        };
        for (const auto& entry : cases) {
            std::shared_ptr<MarkdownNode> ast;
            const std::string error = errorOf([&]() {
                ast = parser.parseWithExtraFlagsForTest(document, options, entry.flags);
            });
            bool wellFormed = error.empty() && ast != nullptr;
            if (wellFormed) {
                for (const auto& child : ast->children) {
                    if (child->type == NodeType::Text) wellFormed = false;
                }
                bool afterIsRootParagraph = false;
                for (const auto& child : ast->children) {
                    if (child->type == NodeType::Paragraph && flattenNodeText(child) == "after\n\n") {
                        afterIsRootParagraph = true;
                    }
                }
                wellFormed = wellFormed && afterIsRootParagraph;
                const auto quote = findFirstNode(ast, NodeType::Blockquote);
                if (quote) {
                    for (const auto& child : quote->children) {
                        if (child->type == NodeType::Text || child->type == NodeType::Link) {
                            wellFormed = false;
                        }
                    }
                }
                const auto last = ast->children.empty() ? nullptr : ast->children.back();
                wellFormed = wellFormed && last != nullptr && flattenNodeText(ast).find("after") != std::string::npos;
            }
            TestRunner::assertTrue(
                wellFormed,
                std::string("Unmapped nodes: ") + entry.name +
                    " keep inline text inside its paragraph (" + error + ")"
            );
            if (entry.sourceOrdered) {
                TestRunner::assertEqual(
                    "",
                    ast ? offsetViolation(ast, utf16LengthForTest(document), "") : "no tree",
                    std::string("Unmapped nodes: ") + entry.name + " keep contained offsets"
                );
            }
        }

        const auto spoiler = parser.parseWithExtraFlagsForTest("> q ||sp|| x", options, MD_FLAG_SPOILERS);
        TestRunner::assertEqual(
            "document{children=[blockquote{children=[paragraph{children=[text{content=q sp x}]}]}]}",
            canonicalizeNode(spoiler),
            "Unmapped nodes: an unmapped span is transparent inside its paragraph"
        );
        const auto footnote = parser.parseWithExtraFlagsForTest(
            "x[^1]\n\n[^1]: note\n\nafter",
            options,
            MD_FLAG_FOOTNOTES
        );
        TestRunner::assertEqual(
            "document{children=[paragraph{children=[text{content=x}]},paragraph{children=[text{content=after}]},paragraph{children=[text{content=note}]}]}",
            canonicalizeNode(footnote),
            "Unmapped nodes: a footnote definition gets its own paragraph"
        );
    }

    static void testMaxInputLengthSaturatesOnEveryAbi() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;

        struct Case {
            const char* name;
            double value;
            uint64_t narrow;
            uint64_t wide;
        };
        const std::vector<Case> cases = {
            {"0", 0.0, 0, 0},
            {"1", 1.0, 1, 1},
            {"hard cap", 10485760.0, 10485760, 10485760},
            {"2^31", 2147483648.0, 2147483648ull, 2147483648ull},
            {"2^32 - 1", 4294967295.0, 4294967295ull, 4294967295ull},
            {"2^32", 4294967296.0, 4294967295ull, 4294967296ull},
            {"2^32 + 1", 4294967297.0, 4294967295ull, 4294967297ull},
            {"2^53", 9007199254740992.0, 4294967295ull, 9007199254740992ull},
            {"2^63", 9223372036854775808.0, 4294967295ull, 9223372036854775808ull},
            {"largest double below 2^64", 18446744073709549568.0, 4294967295ull, 18446744073709549568ull},
        };
        for (const auto& entry : cases) {
            uint64_t narrow = 1;
            uint64_t wide = 1;
            const std::string error = errorOf([&]() {
                narrow = HybridMarkdownParser::resolveMaxInputBytesForTest(entry.value, true);
                wide = HybridMarkdownParser::resolveMaxInputBytesForTest(entry.value, false);
            });
            TestRunner::assertTrue(
                error.empty() && narrow == entry.narrow && wide == entry.wide,
                std::string("Max input ABI: ") + entry.name +
                    " resolves the same way with a 32-bit and a 64-bit size (" +
                    std::to_string(narrow) + ", " + std::to_string(wide) + ") " + error
            );
        }
        for (const bool narrowSize : {true, false}) {
            const std::string width = narrowSize ? "32-bit" : "64-bit";
            TestRunner::assertEqual(
                "maxInputLength cannot be represented as a native size",
                errorOf([&]() {
                    (void)HybridMarkdownParser::resolveMaxInputBytesForTest(18446744073709551616.0, narrowSize);
                }),
                "Max input ABI: 2^64 is rejected with a " + width + " size"
            );
            TestRunner::assertEqual(
                "maxInputLength must be a finite non-negative integer in bytes",
                errorOf([&]() {
                    (void)HybridMarkdownParser::resolveMaxInputBytesForTest(-1.0, narrowSize);
                }),
                "Max input ABI: -1 is rejected with a " + width + " size"
            );
            TestRunner::assertEqual(
                "maxInputLength must be a finite non-negative integer in bytes",
                errorOf([&]() {
                    (void)HybridMarkdownParser::resolveMaxInputBytesForTest(
                        std::numeric_limits<double>::quiet_NaN(),
                        narrowSize
                    );
                }),
                "Max input ABI: NaN is rejected with a " + width + " size"
            );
        }
    }

    static void testSessionByteSplitsKeepExactLength() {
        using ::margelo::nitro::Markdown::HybridMarkdownSession;

        std::vector<std::string> documents = unicodeDocuments();
        for (auto& document : hostileDocuments()) documents.push_back(std::move(document));
        documents.push_back("\xF0\x9F\x98\x80");
        documents.push_back("\xE4\xB8\xAD\xC3\xA9\xF0\x9F\x98\x80" "a");
        documents.push_back("\xF0\x9F\x98");
        documents.push_back("\xE4\xB8\xE4\xB8\xAD\xF0\x9F\xC3\xA9\xC3");
        documents.push_back("\xED\xA0\x80\xF4\x90\x80\x80\xE0\x80\x80\xF0\x80\x80\x80");
        std::mt19937 rng(0x5E55101u);
        const char kBytes[] = "a\n\xC3\xA9\xE4\xB8\xAD\xF0\x9F\x98\x80\xED\xA0\x80\xC0\xFF\x80\xF4\xE0";
        for (int index = 0; index < 300; index++) {
            std::string document;
            const size_t length = 1 + rng() % 120;
            for (size_t position = 0; position < length; position++) {
                document.push_back(kBytes[rng() % (sizeof(kBytes) - 1)]);
            }
            documents.push_back(std::move(document));
        }

        size_t lengthDrift = 0;
        size_t finalMismatches = 0;
        size_t rangeGaps = 0;
        size_t staleNotifications = 0;
        size_t chunkings = 0;
        std::string firstProblem;
        for (const auto& document : documents) {
            auto whole = std::make_shared<HybridMarkdownSession>();
            const double expectedLength = whole->append(document);
            const std::string expectedRange = whole->getTextRange(0.0, expectedLength);
            const std::string expectedJson = whole->parse();

            std::vector<std::vector<size_t>> cutSets;
            for (const size_t width : {size_t{1}, size_t{2}, size_t{3}, size_t{4}, size_t{5}, size_t{7}}) {
                std::vector<size_t> cuts;
                for (size_t cut = width; cut < document.size(); cut += width) cuts.push_back(cut);
                cutSets.push_back(std::move(cuts));
            }
            for (int round = 0; round < 4; round++) {
                std::vector<size_t> cuts;
                for (size_t cut = 1; cut < document.size(); cut++) {
                    if (rng() % 3 == 0) cuts.push_back(cut);
                }
                cutSets.push_back(std::move(cuts));
            }

            for (const auto& cuts : cutSets) {
                chunkings++;
                auto session = std::make_shared<HybridMarkdownSession>();
                double lastTo = 0.0;
                bool problem = false;
                auto unsubscribe = session->addListener([&](double from, double to) {
                    if (from > lastTo) {
                        rangeGaps++;
                        problem = true;
                    }
                    if (to != session->getLength()) {
                        staleNotifications++;
                        problem = true;
                    }
                    lastTo = to;
                });
                size_t previous = 0;
                std::vector<size_t> bounds = cuts;
                bounds.push_back(document.size());
                for (const size_t bound : bounds) {
                    const double returned = session->append(document.substr(previous, bound - previous));
                    previous = bound;
                    const std::string prefix = session->getAllText();
                    auto reference = std::make_shared<HybridMarkdownSession>();
                    if (returned != reference->append(prefix) || returned != session->getLength()) {
                        lengthDrift++;
                        problem = true;
                    }
                }
                unsubscribe();
                if (
                    session->getLength() != expectedLength ||
                    session->getAllText() != document ||
                    session->getTextRange(0.0, session->getLength()) != expectedRange ||
                    session->parse() != expectedJson ||
                    lastTo != expectedLength
                ) {
                    finalMismatches++;
                    problem = true;
                }
                if (problem && firstProblem.empty()) firstProblem = jsonEscape(document.substr(0, 48));
            }
        }
        TestRunner::assertEqual(
            "",
            firstProblem,
            "Session byte splits: every chunking matches one append (" +
                std::to_string(chunkings) + " chunkings, " +
                std::to_string(lengthDrift) + " length drifts, " +
                std::to_string(finalMismatches) + " final mismatches, " +
                std::to_string(rangeGaps) + " range gaps, " +
                std::to_string(staleNotifications) + " stale notifications)"
        );

        auto session = std::make_shared<HybridMarkdownSession>();
        std::vector<std::pair<double, double>> ranges;
        auto unsubscribe = session->addListener([&ranges](double from, double to) {
            ranges.emplace_back(from, to);
        });
        TestRunner::assertTrue(
            session->append("a\xF0\x9F") == 3.0 && session->append("\x98") == 4.0,
            "Session byte splits: an incomplete sequence counts one unit per byte until it completes"
        );
        TestRunner::assertTrue(
            session->append("\x80" "b") == 4.0 && session->getAllText() == "a\xF0\x9F\x98\x80" "b",
            "Session byte splits: completing a split emoji settles to two units"
        );
        TestRunner::assertTrue(
            ranges == std::vector<std::pair<double, double>>{{0.0, 3.0}, {1.0, 4.0}, {1.0, 4.0}},
            "Session byte splits: notifications restart at the unsettled sequence"
        );
        TestRunner::assertEqual(
            "\xF0\x9F\x98\x80",
            session->getTextRange(1.0, 3.0),
            "Session byte splits: the completed emoji is readable as one range"
        );
        session->reset("\xE4\xB8");
        TestRunner::assertTrue(
            session->getLength() == 2.0 && session->append("\xAD") == 1.0,
            "Session byte splits: reset keeps an unsettled tail that a later append completes"
        );
        session->reset("x\xC3");
        TestRunner::assertTrue(
            session->replace(2.0, 2.0, "\xA9") == 2.0 && session->getAllText() == "x\xC3\xA9" &&
                session->getLength() == 2.0,
            "Session byte splits: replace recounts the whole buffer"
        );
        session->reset("\xC3");
        session->clear();
        TestRunner::assertTrue(
            session->append("\xA9") == 1.0,
            "Session byte splits: clear drops the unsettled tail"
        );
        unsubscribe();
    }

    static void testParserFailureReasonIsPreserved() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;

        TestRunner::assertEqual(
            "Markdown parser ran out of memory",
            MD4CParser::parseFailureMessageForTest(-1, "malloc() failed."),
            "Failure reason: an md4c malloc failure maps to the out-of-memory error"
        );
        TestRunner::assertEqual(
            "Markdown parser ran out of memory",
            MD4CParser::parseFailureMessageForTest(-1, "realloc() failed."),
            "Failure reason: an md4c realloc failure maps to the out-of-memory error"
        );
        TestRunner::assertEqual(
            "Markdown parsing failed with code -1: Too many link reference definition instantiations.",
            MD4CParser::parseFailureMessageForTest(-1, "Too many link reference definition instantiations."),
            "Failure reason: other md4c failures keep the md4c message"
        );
        TestRunner::assertEqual(
            "Markdown parsing failed with code 3",
            MD4CParser::parseFailureMessageForTest(3, ""),
            "Failure reason: a failure without an md4c message keeps the legacy text"
        );

        MD4CParser parser;
        ParserOptions options{true, true};
        TestRunner::assertEqual(
            "Markdown parsing failed with code 7: Aborted from enter_block() callback.",
            errorOf([&]() { (void)parser.parseWithForcedFailureForTest("partial document", options); }),
            "Failure reason: a callback abort reports the md4c reason"
        );

        bool isBadAlloc = false;
        std::string message;
        try {
            throw MarkdownOutOfMemory();
        } catch (const std::bad_alloc& error) {
            isBadAlloc = true;
            message = error.what();
        }
        TestRunner::assertTrue(
            isBadAlloc && message == "Markdown parser ran out of memory",
            "Failure reason: the out-of-memory error is a bad_alloc with a stable message"
        );
    }

    static void testWorkBoundAtInputCap() {
        constexpr size_t kCap = 10 * 1024 * 1024;
        constexpr size_t kOneMiB = 1024 * 1024;
        struct Generator {
            const char* name;
            bool atCap;
            std::function<std::string(size_t)> make;
        };
        const auto sized = [](const std::string& unit, size_t bytes) {
            std::string value = repeatToSize(unit, bytes);
            value.resize(bytes);
            return value;
        };
        const std::vector<Generator> generators = {
            {"table rows", true, [&](size_t n) { return "|a|b|\n|-|-|\n" + sized("|a|b|\n", n - 12); }},
            {"short lines", true, [&](size_t n) { return sized("a\n", n); }},
            {"nested quote markers", true, [&](size_t n) { return sized("> ", n - 1) + "x"; }},
            {"one-character paragraphs", true, [&](size_t n) { return sized("a\n\n", n); }},
            {"emphasis pairs", true, [&](size_t n) { return sized("*a* ", n); }},
            {"NUL bytes", true, [&](size_t n) { return std::string(n, '\0'); }},
            {"list items", false, [&](size_t n) { return sized("- a\n", n); }},
            {"hard breaks", false, [&](size_t n) { return sized("a\\\n", n); }},
            {"unclosed code spans", false, [&](size_t n) { return sized("`a ", n); }},
            {"autolinks", false, [&](size_t n) { return sized("www.a.b ", n); }},
            {"reference uses", false, [&](size_t n) { return "[r]: /u\n\n" + sized("[r] ", n - 9); }},
            {"open brackets", false, [&](size_t n) { return std::string(n, '['); }},
            {"unclosed inline links", false, [&](size_t n) { return sized("[a](", n); }},
            {"unclosed images", false, [&](size_t n) { return sized("![a](", n); }},
            {"bracket pairs", false, [&](size_t n) { return sized("[]", n); }},
            {"table pipes", false, [&](size_t n) { return "|a|\n|-|\n" + sized("|a", n - 8); }},
        };

        MD4CParser parser;
        ParserOptions options{true, true};
        for (const auto& generator : generators) {
            const size_t bytes = generator.atCap ? kCap : kOneMiB;
            const std::string input = generator.make(bytes);
            const CallbackCounter counter = countMd4cCallbacks(input);
            const std::string name = std::string("Work bound: ") + generator.name + " at " +
                std::to_string(input.size()) + " bytes";
            TestRunner::assertTrue(
                counter.calls <= 2 * input.size() + 64 && counter.textBytes <= input.size() + 64,
                name + " stays under two callbacks per input byte (" +
                    std::to_string(counter.calls) + " callbacks, " +
                    std::to_string(counter.textBytes) + " text bytes)"
            );

            std::shared_ptr<MarkdownNode> ast;
            const std::string error = errorOf([&]() { ast = parser.parse(input, options); });
            const bool bounded = ast
                ? countAllNodes(ast) <= kMaxAstNodes && maxNodeDepth(ast) <= kMaxAstDepth
                : error.find("Markdown AST depth exceeds the maximum of") == 0 ||
                    error.find("Markdown AST node/work budget exceeds the maximum of") == 0;
            TestRunner::assertTrue(
                bounded,
                name + " ends in a bounded tree or a budget error (" +
                    (ast ? std::to_string(countAllNodes(ast)) + " nodes" : error) + ")"
            );
        }
    }
};

} // namespace NitroMarkdown

int main() {
    NitroMarkdown::MD4CParserTest::runAllTests();
    return NitroMarkdown::TestRunner::failCount > 0 ? 1 : 0;
}
