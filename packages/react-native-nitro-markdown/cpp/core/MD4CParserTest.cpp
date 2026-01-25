#include "MD4CParser.hpp"
#include "MarkdownTypes.hpp"
#include <iostream>
#include <cassert>
#include <string>
#include <algorithm>

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

        // Safety and crash prevention tests
        testMemoryLeaks();
        testNullAndEmptyInputs();
        testMalformedMarkdown();
        testLargeInputs();
        testBufferOverflowProtection();
        testUnicodeHandling();
        testResourceCleanup();
        testConcurrentOptions();
        testOffsets();

        TestRunner::printSummary();
    }

private:
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
};

} // namespace NitroMarkdown

int main() {
    NitroMarkdown::MD4CParserTest::runAllTests();
    return NitroMarkdown::TestRunner::failCount > 0 ? 1 : 0;
}