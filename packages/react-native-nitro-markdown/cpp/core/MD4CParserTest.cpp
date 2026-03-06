#define NITRO_MARKDOWN_TESTING
#include "MD4CParser.hpp"
#include "MarkdownTypes.hpp"
#include "../md4c/md4c.h"
#include <iostream>
#include <cassert>
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
        testHeadingLevels2Through6();
        testOrderedListWithCustomStart();
        testSoftBreakAndHardBreak();
        testTableCellAlignment();
        testNestedBlockquotes();
        testImageWithTitle();

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
        testParseLatencyBudgets();
        testLargeDocumentMemoryBudget();

        TestRunner::printSummary();
    }

private:
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

        // Test different option combinations
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
        // MathInline content is stored via text callback as children
        // (similar to CodeInline which stores in content field)
        // Check that the math span exists and has text
        bool hasContent = !math->children.empty() || math->content.has_value();
        TestRunner::assertTrue(hasContent, "MathInline: has content or children");
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
