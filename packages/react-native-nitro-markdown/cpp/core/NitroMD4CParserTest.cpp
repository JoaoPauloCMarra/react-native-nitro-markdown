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
#include <cstring>
#include <random>
#include <sstream>
#include <string>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <limits>
#include <vector>

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
                    if (c <= 0x1f) {
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
        testSerializationCacheEquivalence();
        testSerializationCacheFlushBudget();

        testHybridMarkdownSessionCorpus();
        testHybridMarkdownParserBinding();

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
        static constexpr double kP50BudgetMs = 40.0;
        static constexpr double kP95BudgetMs = 90.0;

        std::cout << "ℹ Perf budget parse p50=" << p50 << "ms p95=" << p95 << "ms" << std::endl;
        TestRunner::assertTrue(p50 <= kP50BudgetMs, "Perf budget parse p50");
        TestRunner::assertTrue(p95 <= kP95BudgetMs, "Perf budget parse p95");
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

    static void testSerializationCacheEquivalence() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;

        HybridMarkdownParser warm;
        const std::vector<std::string> documents = {
            "# Cache Heading\n\nParagraph with **bold**, *italic*, `code`, and a [link](https://example.com).\n\n- item one\n- item two\n- item three\n\n",
            "## Título com acentos\n\nParágrafo com **negrito** e `código` — e emoji 🎉 no fim.\n\n| Coluna A | Coluna B |\n| --- | --- |\n| um | dois |\n| três | quatro |\n\n",
            "Setext title\n=============\n\nParagraph after setext.\n\n> quote with **bold**\n\n```ts\nconst value = 1;\n```\n",
            "[ref]: https://example.com/defined\n\nUses [ref] and [undefined] links.\n",
            "Open paragraph that still continues",
        };

        bool allEquivalent = true;
        for (size_t round = 0; round < 2; round++) {
            for (const auto& document : documents) {
                HybridMarkdownParser fresh;
                allEquivalent = allEquivalent &&
                    fresh.parseForStreaming(document) == warm.parseForStreaming(document);
            }
        }
        TestRunner::assertTrue(
            allEquivalent,
            "Serialization cache outputs stay byte-identical across repeated parses"
        );

        HybridMarkdownParser freshExtended;
        const std::string extended =
            documents[0] + "Appended **tail** paragraph with `code`.\n\n- appended item\n";
        TestRunner::assertEqual(
            freshExtended.parseForStreaming(extended),
            warm.parseForStreaming(extended),
            "Serialization cache outputs stay byte-identical for appended documents"
        );

        HybridMarkdownParser freshContinued;
        const std::string continued = documents[4] + " and keeps going with **bold**";
        TestRunner::assertEqual(
            freshContinued.parseForStreaming(continued),
            warm.parseForStreaming(continued),
            "Serialization cache skips blocks terminated at end of input"
        );

        std::string evictionInput;
        evictionInput.reserve(600 * 48);
        for (size_t index = 0; index < 600; index++) {
            evictionInput +=
                "Eviction paragraph " + std::to_string(index) +
                " with **bold " + std::to_string(index) + "** content.\n\n";
        }
        HybridMarkdownParser freshEviction;
        TestRunner::assertEqual(
            freshEviction.parseForStreaming(evictionInput),
            warm.parseForStreaming(evictionInput),
            "Serialization cache outputs stay byte-identical under entry eviction"
        );
        TestRunner::assertEqual(
            freshEviction.parseForStreaming(evictionInput),
            warm.parseForStreaming(evictionInput),
            "Serialization cache outputs stay byte-identical when fully warm"
        );
    }

    static std::string makeStreamingFlushPayload(size_t sections) {
        std::string payload;
        for (size_t index = 0; index < sections; index++) {
            payload += "## Streaming heading " + std::to_string(index) + "\n\n";
            for (size_t repeat = 0; repeat < 3; repeat++) {
                payload +=
                    "Span paragraph " + std::to_string(index) + "." + std::to_string(repeat) +
                    " mixes **bold *with `code " + std::to_string(repeat) +
                    "\" quotes` inside* bold**,"\
                    " *italic **with `more \"code\"` nested** italic*,"\
                    " **star *deep `span` deep* star**,"\
                    " and [a **bold** link](https://example.com/s" + std::to_string(index) + ").\n\n";
            }
            payload +=
                "| Column A | Column B | Column C | Column D |\n"
                "| --- | --- | --- | --- |\n"
                "| **b *i `c" + std::to_string(index) + "` i* b** | [link **bold**](https://example.com/t" +
                std::to_string(index) + ") | `code \"x\"` | *i **b `c` b** i* |\n"
                "| \"a \\\"q\\\"\" | **b *i `c` i* b** | [read](https://example.com/r" +
                std::to_string(index) + ") | *i **b** i* |\n\n";
            payload +=
                "- list item one with **bold *nested `code`* bold**\n"
                "- list item two with *italic **with `code`** italic*\n"
                "- list item three with [a **bold** link](https://example.com/i" +
                std::to_string(index) + ")\n\n";
        }
        return payload;
    }

    static void testSerializationCacheFlushBudget() {
        using ::margelo::nitro::Markdown::HybridMarkdownParser;

        const std::string base = makeStreamingFlushPayload(48);
        static constexpr int kWarmRuns = 24;
        static constexpr double kMaxWarmToFreshRatio = 1.1;

        HybridMarkdownParser warm;
        (void)warm.parseForStreaming(base);

        std::string grown = base;
        double warmTotalMs = 0.0;
        double freshTotalMs = 0.0;
        bool outputsMatchFresh = true;
        for (int run = 0; run < kWarmRuns; run++) {
            grown +=
                "Warm tail paragraph " + std::to_string(run) +
                " with **bold**, `code`, and [a link](https://example.com/warm-" +
                std::to_string(run) + ").\n\n- warm item one " + std::to_string(run) +
                "\n- warm item two\n\n";

            const auto start = std::chrono::steady_clock::now();
            const std::string warmJson = warm.parseForStreaming(grown);
            const auto end = std::chrono::steady_clock::now();
            warmTotalMs += std::chrono::duration<double, std::milli>(end - start).count();

            HybridMarkdownParser fresh;
            const auto freshStart = std::chrono::steady_clock::now();
            const std::string freshJson = fresh.parseForStreaming(grown);
            const auto freshEnd = std::chrono::steady_clock::now();
            freshTotalMs +=
                std::chrono::duration<double, std::milli>(freshEnd - freshStart).count();
            outputsMatchFresh = outputsMatchFresh && freshJson == warmJson;
        }
        const double warmAvgMs = warmTotalMs / kWarmRuns;
        const double freshAvgMs = freshTotalMs / kWarmRuns;
        const double ratio = freshAvgMs > 0.0 ? warmAvgMs / freshAvgMs : 0.0;

        std::cout << "ℹ Perf budget serialization cache fresh=" << freshAvgMs
                  << "ms warm=" << warmAvgMs << "ms ratio=" << ratio << std::endl;

        TestRunner::assertTrue(
            outputsMatchFresh,
            "Serialization cache warm outputs stay byte-identical to cold outputs"
        );
        TestRunner::assertTrue(
            warmAvgMs <= kMaxWarmToFreshRatio * freshAvgMs,
            "Serialization cache keeps warm flush cost within 1.1x of equivalent fresh parses"
        );
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

        auto capped = std::make_shared<HybridMarkdownSession>();
        capped->append(std::string(10 * 1024 * 1024, 'a'));
        bool appendCapThrew = false;
        try {
            capped->append("!");
        } catch (const std::runtime_error&) {
            appendCapThrew = true;
        }
        TestRunner::assertTrue(appendCapThrew, "Session append enforces buffer cap");

        bool replaceCapThrew = false;
        try {
            capped->replace(0.0, 0.0, "!");
        } catch (const std::runtime_error&) {
            replaceCapThrew = true;
        }
        TestRunner::assertTrue(replaceCapThrew, "Session replace enforces buffer cap");

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
        const auto streamingJson = publicParser.parseWithOptionsForStreaming(
            markdown,
            bindingOptions
        );
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
        const auto disabledStreaming = disabledParser.parseWithOptionsForStreaming(
            opaqueContent,
            disabledBinding
        );
        TestRunner::assertEqual(
            disabledStatic,
            disabledStreaming,
            "Issue #74 math=false: static and streaming bytes stay identical"
        );

        BindingParserOptions bindingOptions;
        bindingOptions.math = true;
        const std::string streamingMarkdown = "$$\nπ + 1\n$$\n\ntrailing";
        const std::string streamingPrefix = streamingMarkdown.substr(0, 8);
        HybridMarkdownParser warmParser;
        const auto warmPrefix = warmParser.parseWithOptionsForStreaming(
            streamingPrefix,
            bindingOptions
        );
        const auto warmFull = warmParser.parseWithOptionsForStreaming(
            streamingMarkdown,
            bindingOptions
        );
        HybridMarkdownParser coldParser;
        const auto coldFull = coldParser.parseWithOptionsForStreaming(
            streamingMarkdown,
            bindingOptions
        );
        const auto staticFull = coldParser.parseWithOptions(streamingMarkdown, bindingOptions);
        TestRunner::assertTrue(
            warmPrefix.find("math_block") != std::string::npos &&
            warmFull == coldFull &&
            warmFull == staticFull,
            "Issue #74 streaming: prefixes and warm/cold bytes stay equivalent"
        );

        const std::string cachedMathPrefix = "$$\nπ + 1\n$$\n\n";
        const std::string cachedMathDocument = cachedMathPrefix + "trailing paragraph";
        HybridMarkdownParser cachedWarmParser;
        const auto cachedBase = cachedWarmParser.parseWithOptionsForStreaming(
            cachedMathPrefix,
            bindingOptions
        );
        const auto cachedWarm = cachedWarmParser.parseWithOptionsForStreaming(
            cachedMathDocument,
            bindingOptions
        );
        HybridMarkdownParser cachedColdParser;
        const auto cachedCold = cachedColdParser.parseWithOptionsForStreaming(
            cachedMathDocument,
            bindingOptions
        );
        const auto cachedStatic = cachedColdParser.parseWithOptions(
            cachedMathDocument,
            bindingOptions
        );
        TestRunner::assertTrue(
            cachedBase.find("math_block") != std::string::npos &&
            cachedWarm == cachedCold &&
            cachedWarm == cachedStatic,
            "Issue #74 serialization cache: math block bytes stay static/streaming equivalent"
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
};

} // namespace NitroMarkdown

int main() {
    NitroMarkdown::MD4CParserTest::runAllTests();
    return NitroMarkdown::TestRunner::failCount > 0 ? 1 : 0;
}
