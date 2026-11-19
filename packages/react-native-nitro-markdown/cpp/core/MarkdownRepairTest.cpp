// Tests ported from enriched-markdown. Origin and licences: ../repair/MarkdownRepair.hpp.
#include "MarkdownRepairTest.hpp"

#include <exception>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

#include "../repair/MarkdownRepair.hpp"
#include "../repair/RepairInternal.hpp"
#include "RepairReferenceCasesTest.hpp"

namespace NitroMarkdownRepairTests {
namespace {

struct RequireAbort {};

struct TestCaseEntry {
  const char *name;
  void (*run)();
};

struct State {
  std::size_t checks = 0;
  std::size_t failures = 0;
  std::string firstFailure;
};

std::vector<TestCaseEntry> &registry() {
  static std::vector<TestCaseEntry> entries;
  return entries;
}

State &state() {
  static State current;
  return current;
}

struct Registrar {
  Registrar(const char *name, void (*run)()) {
    registry().push_back({name, run});
  }
};

void recordFailure(const char *file, int line, const char *kind, const char *expression, const std::string &message) {
  State &current = state();
  ++current.failures;
  if (current.firstFailure.empty()) {
    std::ostringstream out;
    out << file << ":" << line << ": " << kind << "(" << expression << ") failed";
    if (!message.empty()) {
      out << "\n" << message;
    }
    current.firstFailure = out.str();
  }
}

} // namespace
} // namespace NitroMarkdownRepairTests

#define NMR_CONCAT_INNER(a, b) a##b
#define NMR_CONCAT(a, b) NMR_CONCAT_INNER(a, b)

#define TEST_CASE(name)                                                                                              \
  static void NMR_CONCAT(nmrTestCase_, __LINE__)();                                                                  \
  static const Registrar NMR_CONCAT(nmrRegistrar_, __LINE__)(name, &NMR_CONCAT(nmrTestCase_, __LINE__));             \
  static void NMR_CONCAT(nmrTestCase_, __LINE__)()

#define CHECK(...)                                                                                                   \
  do {                                                                                                               \
    ++state().checks;                                                                                                \
    if (!(__VA_ARGS__)) {                                                                                            \
      recordFailure(__FILE__, __LINE__, "CHECK", #__VA_ARGS__, std::string());                                       \
    }                                                                                                                \
  } while (false)

#define CHECK_FALSE(...)                                                                                             \
  do {                                                                                                               \
    ++state().checks;                                                                                                \
    if ((__VA_ARGS__)) {                                                                                             \
      recordFailure(__FILE__, __LINE__, "CHECK_FALSE", #__VA_ARGS__, std::string());                                 \
    }                                                                                                                \
  } while (false)

#define CHECK_MESSAGE(condition, message)                                                                            \
  do {                                                                                                               \
    ++state().checks;                                                                                                \
    if (!(condition)) {                                                                                              \
      std::ostringstream nmrStream;                                                                                  \
      nmrStream << message;                                                                                          \
      recordFailure(__FILE__, __LINE__, "CHECK_MESSAGE", #condition, nmrStream.str());                               \
    }                                                                                                                \
  } while (false)

#define REQUIRE(...)                                                                                                 \
  do {                                                                                                               \
    ++state().checks;                                                                                                \
    if (!(__VA_ARGS__)) {                                                                                            \
      recordFailure(__FILE__, __LINE__, "REQUIRE", #__VA_ARGS__, std::string());                                     \
      throw RequireAbort();                                                                                          \
    }                                                                                                                \
  } while (false)

#define MESSAGE(message)                                                                                             \
  do {                                                                                                               \
    std::ostringstream nmrStream;                                                                                    \
    nmrStream << message;                                                                                            \
  } while (false)

namespace NitroMarkdownRepairTests {
namespace referenceParity {

using namespace NitroMarkdownRepair;

namespace {

std::string show(std::string_view s) {
  std::string out;
  for (const char c : s) {
    if (c == '\n') {
      out += "\\n";
    } else if (c == '\t') {
      out += "\\t";
    } else {
      out.push_back(c);
    }
  }
  return out;
}

} // namespace

TEST_CASE("reference parity: recorded cases") {
  REQUIRE(ReferenceCases::kCaseCount > 100);
  for (size_t i = 0; i < ReferenceCases::kCaseCount; ++i) {
    const ReferenceCases::Case &c = ReferenceCases::kCases[i];
    const std::string actual = NitroMarkdownRepair::repairInlineMarkdown(c.input, c.options);
    CHECK_MESSAGE(actual == c.expected, "case " << i << "\ninput:    " << show(c.input) << "\nexpected: "
                                                << show(c.expected) << "\nactual:   " << show(actual));
  }
}

TEST_CASE("reference parity: exported helpers") {
  using ReferenceCases::Helper;
  REQUIRE(ReferenceCases::kHelperCallCount > 0);
  for (size_t i = 0; i < ReferenceCases::kHelperCallCount; ++i) {
    const ReferenceCases::HelperCall &h = ReferenceCases::kHelperCalls[i];
    bool actual = false;
    switch (h.fn) {
      case Helper::IsWordChar:
        actual = NitroMarkdownRepair::isWordChar(h.argument);
        break;
      case Helper::IsWithinCodeBlock:
        actual = NitroMarkdownRepair::isWithinCodeBlock(h.text, h.argument);
        break;
      case Helper::IsWithinMathBlock:
        actual = NitroMarkdownRepair::isWithinMathBlock(h.text, h.argument);
        break;
      case Helper::IsWithinLinkOrImageUrl:
        actual = NitroMarkdownRepair::isWithinLinkOrImageUrl(h.text, h.argument);
        break;
    }
    CHECK_MESSAGE(actual == h.expected, "helper call " << i << " (" << show(h.text) << ", " << h.argument << ")");
  }
}

// The forward-pass lookup must agree with the backward-walking public
// functions on every position of every recorded input, so the recorded cases
// double as an oracle for the fast path.
TEST_CASE("line-context lookup agrees with the reference helpers") {
  size_t positions = 0;
  for (size_t i = 0; i < ReferenceCases::kCaseCount; ++i) {
    const std::string_view text = ReferenceCases::kCases[i].input;
    const NitroMarkdownRepair::RepairInternal::LineContextLookup lookup(text);
    for (size_t p = 0; p <= text.size(); ++p, ++positions) {
      CHECK_MESSAGE(lookup.insideLinkUrl(p) == NitroMarkdownRepair::isWithinLinkOrImageUrl(text, p),
                    "insideLinkUrl(" << show(text) << ", " << p << ")");
      CHECK_MESSAGE(lookup.insideHtmlTag(p) == NitroMarkdownRepair::RepairInternal::isWithinHtmlTag(text, p),
                    "insideHtmlTag(" << show(text) << ", " << p << ")");
    }
  }
  // Shapes the recorded cases do not cover: an unclosed URL, a bare paren
  // after a link paren, nested link parens, a paren inside inline code.
  for (const std::string_view text : {"[a](url _x", "[a](b(c) d) e", "[a](b [c](d) e) f", "x (y) [a](z)",
                                      "<a href=\"_x\">_y</a> <b _c", "a\n(b) [c](d\ne)"}) {
    const NitroMarkdownRepair::RepairInternal::LineContextLookup lookup(text);
    for (size_t p = 0; p <= text.size(); ++p, ++positions) {
      CHECK_MESSAGE(lookup.insideLinkUrl(p) == NitroMarkdownRepair::isWithinLinkOrImageUrl(text, p),
                    "insideLinkUrl(" << show(text) << ", " << p << ")");
      CHECK_MESSAGE(lookup.insideHtmlTag(p) == NitroMarkdownRepair::RepairInternal::isWithinHtmlTag(text, p),
                    "insideHtmlTag(" << show(text) << ", " << p << ")");
    }
  }
  CHECK(positions > 10000);
}

namespace {

// isBracketNotALink() as it was before the per-line lookup: the same
// predicate, walking back to the line start for every query. It is the
// oracle here, so keep it as it was even if the fast path changes.
bool referenceIsBracketNotALink(std::string_view text, size_t idx) {
  using namespace NitroMarkdownRepair::RepairInternal;
  const char next = idx + 1 < text.size() ? text[idx + 1] : '\0';
  const char prev = idx > 0 ? text[idx - 1] : '\0';
  if (next == '^' || prev == ']' || isEscaped(text, idx)) {
    return true;
  }
  std::string_view line = jsTrimStart(lineBefore(text, idx));
  bool inBlockquote = false;
  while (!line.empty() && line[0] == '>') {
    line = jsTrimStart(line.substr(1));
    inBlockquote = true;
  }
  if (inBlockquote && line.empty() && next == '!') {
    return true;
  }
  const size_t marker = skipListMarker(line);
  if (marker == npos || marker >= line.size() || !jsTrimStart(line.substr(marker)).empty()) {
    return false;
  }
  const bool checkbox = (next == 'x' || next == 'X') && (idx + 2 >= text.size() || text[idx + 2] == ']');
  return next == '\0' || next == ' ' || next == ']' || checkbox;
}

// Only `[` positions, the predicate's contract.
void checkBracketPredicateAgrees(std::string_view text, size_t &brackets) {
  const NitroMarkdownRepair::RepairInternal::LineMarkerLookup markers(text);
  for (size_t p = 0; p < text.size(); ++p) {
    if (text[p] != '[') {
      continue;
    }
    ++brackets;
    CHECK_MESSAGE(NitroMarkdownRepair::RepairInternal::isBracketNotALink(text, p, markers) ==
                      referenceIsBracketNotALink(text, p),
                  "isBracketNotALink(" << show(text) << ", " << p << ")");
  }
}

} // namespace

// The per-line marker lookup must classify every position the way the
// backward walk did, on every recorded input plus the marker shapes the
// recorded cases are thin on.
TEST_CASE("line-marker lookup agrees with the backward-walking bracket predicate") {
  size_t brackets = 0;
  for (size_t i = 0; i < ReferenceCases::kCaseCount; ++i) {
    checkBracketPredicateAgrees(ReferenceCases::kCases[i].input, brackets);
  }
  for (const std::string_view text : {"- [ ] a",
                                      "- [x] b",
                                      "- [X]",
                                      "- [",
                                      "-[",
                                      "- x [",
                                      "1. [ ] c",
                                      "12. [",
                                      "1.[",
                                      "12[",
                                      "  * [ ]",
                                      "> [!NOTE] b",
                                      "> > [!",
                                      "> [x",
                                      ">[!",
                                      "> - [ ] y",
                                      "a > [",
                                      "a [^1] b",
                                      "[a][b]",
                                      "\\[x",
                                      "[a](b) [",
                                      "\u00a0- [ ] nbsp",
                                      "x\n- [ ] y\n> [!\n\n[",
                                      "\n",
                                      "a\n",
                                      "[",
                                      ""}) {
    checkBracketPredicateAgrees(text, brackets);
  }
  MESSAGE("bracket positions checked: " << brackets);
  CHECK(brackets > 150);
}

} // namespace referenceParity

namespace divergence {

using namespace NitroMarkdownRepair;

namespace {
std::string repair(std::string_view s, const RepairOptions &o = RepairOptions()) {
  return repairInlineMarkdown(s, o);
}
} // namespace

TEST_CASE("constructs opened before a placeholder link are still closed") {
  // The reference stops the pipeline after the placeholder (our divergence).
  CHECK(repair("**bold [link") == "**bold [link](streamdown:incomplete-link)**");
  CHECK(repair("*a [b](http://x") == "*a [b](streamdown:incomplete-link)*");
  CHECK(repair("[**bold link") == "[**bold link**](streamdown:incomplete-link)");
  CHECK(repair("see [a *b") == "see [a *b*](streamdown:incomplete-link)");
  CHECK(repair("`code [not a link") == "`code [not a link`");
  RepairOptions o;
  o.linkMode = LinkMode::TextOnly;
  CHECK(repair("**bold [link", o) == "**bold link**");
}

TEST_CASE("brackets that are not links") {
  CHECK(repair("- [") == "- [");
  CHECK(repair("- [ ") == "- ["); // trailing space trimmed as usual
  CHECK(repair("- [x") == "- [x");
  CHECK(repair("1. [ ] todo **b") == "1. [ ] todo **b**");
  CHECK(repair("- [link") == "- [link](streamdown:incomplete-link)");
  CHECK(repair("> [!NO") == "> [!NO");
  CHECK(repair("> [!NOTE]\n> text **b") == "> [!NOTE]\n> text **b**");
  CHECK(repair("note[^1") == "note[^1");
  CHECK(repair("[text][re") == "[text][re");
  CHECK(repair("see [x") == "see [x](streamdown:incomplete-link)");
}

TEST_CASE("md4c extensions") {
  CHECK(repair("||hidden") == "||hidden||");
  CHECK(repair("||a|| and ||b") == "||a|| and ||b||");
  CHECK(repair("| a | b") == "| a | b"); // single pipes are tables, not spoilers
  RepairOptions o;
  o.highlight = o.superscript = o.subscript = true;
  CHECK(repair("==mark", o) == "==mark==");
  CHECK(repair("x^2", o) == "x^2^");
  CHECK(repair("x^ 2", o) == "x^ 2"); // an opener before whitespace is literal
  CHECK(repair("H~2", o) == "H~2~");
  CHECK(repair("H~2~O and ~~s", o) == "H~2~O and ~~s~~");
  CHECK(repair("20~25", o) == "20~25~"); // subscript on: no single-tilde escape
  CHECK(repair("20~25") == "20\\~25");   // subscript off: reference behaviour
  CHECK(repair("`x^2`", o) == "`x^2`");
}

TEST_CASE("openers in an earlier block are left alone") {
  CHECK(repair("**Note\n\nNext paragraph") == "**Note\n\nNext paragraph");
  CHECK(repair("**a\n \n_b") == "**a\n \n_b_"); // a whitespace-only line is blank; only the last opener closes
  CHECK(repair("## **Setup\nSome text") == "## **Setup\nSome text");
  CHECK(repair("## **Setup") == "## **Setup**");
  CHECK(repair("[link\n\nmore") == "[link\n\nmore");
  CHECK(repair("$$\nx\n\ny") == "$$\nx\n\ny");
  CHECK(repair("**a\nb") == "**a\nb**"); // a soft break stays inside the paragraph
}

TEST_CASE("line endings") {
  CHECK(repair("**b\r\n") == "**b**\r\n");
  CHECK(repair("**b\r\n\r\n") == "**b**\r\n\r\n");
}

TEST_CASE("full pipeline: mixed") {
  CHECK(repair("This is **bold with *ital") == "This is **bold with *ital***");
  // Closers nest in reverse opening order (our divergence from the reference).
  CHECK(repair("Text **bold `code") == "Text **bold `code`**");
  CHECK(repair("**bold ~~strike") == "**bold ~~strike~~**");
  CHECK(repair("~~strike with **bold") == "~~strike with **bold**~~");
  CHECK(repair("$$\nx\n") == "$$\nx\n$$\n");
  CHECK(repair("$$a\nb$$ $$c") == "$$a\nb$$ $$c$$"); // only the open block decides single- vs multi-line
  CHECK(repair("**bold\n") == "**bold**\n");
  CHECK(repair("**a `b\n\n") == "**a `b`**\n\n");
  CHECK(repair("~~s **b *i\n") == "~~s **b *i***~~\n");
  CHECK(repair("`g **c") == "`g **c`"); // ** inside an open code span is code, not emphasis
  CHECK(repair("| a | b |\n|---|---|\n| **x") == "| a | b |\n|---|---|\n| **x**");
}

// The italic closer is anchored at the open marker, not the first `*`/`_` in
// the text, so an italic in an earlier paragraph does not disable repair later.
TEST_CASE("italic closer is anchored at the open marker") {
  CHECK(repair("This is *important*.\n\nNext *point") == "This is *important*.\n\nNext *point*");
  CHECK(repair("This is _important_.\n\nNext _point") == "This is _important_.\n\nNext _point_");
  CHECK(repair("# *Title*\nsome *text") == "# *Title*\nsome *text*");
  CHECK(repair("_ x **y _z") == "_ x **y _z_**");
}

// An escaped `\[` is not a link opener. LLMs stream `\[ … \]` for display math.
TEST_CASE("an escaped bracket is not a link") {
  CHECK(repair("Solve \\[ x^2 + y^2") == "Solve \\[ x^2 + y^2");
  CHECK(repair("see \\[a](http://x") == "see \\[a](http://x");
  RepairOptions o;
  o.linkMode = LinkMode::TextOnly;
  CHECK(repair("Solve \\[ x^2", o) == "Solve \\[ x^2");
}

// Math closers are anchored at the counted opener, never at half of a `$$`,
// an escaped `\$` or a `$$` inside inline code.
TEST_CASE("math closers are anchored at their opener") {
  RepairOptions o;
  o.inlineMath = true;
  CHECK(repair("It costs $5.\n\nThe formula $$x^2$$", o) == "It costs $5.\n\nThe formula $$x^2$$");
  CHECK(repair("$a **b \\$5", o) == "$a **b \\$5$"); // `**` inside math is not a delimiter
  CHECK(repair("$$a\n\n`$$` b") == "$$a\n\n`$$` b");
  CHECK(repair("$$a **b `$$`") == "$$a **b `$$`$$");
}

// A CRLF blank line is a block boundary, like an LF one.
TEST_CASE("a CRLF blank line is a block boundary") {
  CHECK(repair("**a\r\n\r\nb") == "**a\r\n\r\nb");
  CHECK(repair("[link\r\n\r\nmore") == "[link\r\n\r\nmore");
}

// The underscore counter applies the open/close flanking rule the reference
// does not have.
TEST_CASE("underscore flanking rule, pinned") {
  CHECK(repair("_a_ b_") == "_a_ b_"); // reference: _a_ b__
  CHECK(repair("_  b") == "_  b");     // reference: _  b_
}

// The task-list check matches a checkbox only, not any link text starting with x.
TEST_CASE("task-list check only matches a checkbox") {
  CHECK(repair("- [Xcode setup") == "- [Xcode setup](streamdown:incomplete-link)");
  CHECK(repair("- [x") == "- [x");
}

// A fence, heading or list item after the opener ends its paragraph like a
// blank line does. The reference has the same gap.
TEST_CASE("a fence or heading after the opener is a block boundary") {
  CHECK(repair("**a\n```\ncode") == "**a\n```\ncode");
  CHECK(repair("**a\n# heading") == "**a\n# heading");
}

// Handlers that erase rather than close apply the same block rule: a
// construct left open in an earlier block is literal, not a reason to drop
// everything after it.
TEST_CASE("erase paths stop at a block boundary") {
  CHECK(repair("[a](http://x\n\nmore") == "[a](http://x\n\nmore");
  CHECK(repair("![alt](http://x\n\nmore") == "![alt](http://x\n\nmore");
  CHECK(repair("pic ![alt\n\nmore") == "pic ![alt\n\nmore");
  CHECK(repair("<video src=\"x\n\nmore") == "<video src=\"x\n\nmore");
  CHECK(repair("<a\n\n<video src=\"x") == "<a");
  CHECK(repair("[a](http://x\n\n[b") == "[a](http://x\n\n[b](streamdown:incomplete-link)");
  CHECK(repair("[a](http://x\nmore") == "[a](http://x\nmore"); // text after the destination: prose, as parsed
  RepairOptions o;
  o.linkMode = LinkMode::TextOnly;
  CHECK(repair("[a\n\n[b", o) == "[a\n\nb");
  CHECK(repair("para [x\n<div>raw</div>", o) == "para [x\n<div>raw</div>"); // an HTML block ends the paragraph
  CHECK(repair("[a](http://x\n\nmore", o) == "[a](http://x\n\nmore");
}

TEST_CASE("tilde fences are code") {
  CHECK(repair("~~~\nx **b") == "~~~\nx **b");
  CHECK(repair("~~~js\nx `y") == "~~~js\nx `y");
  CHECK(repair("~~~\nx\n~~~\n**b") == "~~~\nx\n~~~\n**b**");
  CHECK(repair("  ~~~\n  x **b") == "  ~~~\n  x **b");
  CHECK(repair("```\n~~~\n```\n**b") == "```\n~~~\n```\n**b**"); // a tilde line inside a backtick fence is content
  CHECK(repair("~~~\n```\n~~~\n**b") == "~~~\n```\n~~~\n**b**");
  CHECK(repair("a~~~b ~~c") == "a~~~b ~~c"); // mid-line tildes are not a fence
}

TEST_CASE("double markers inside math or a fence are not delimiters") {
  CHECK(repair("$$ a ** b") == "$$ a ** b$$");
  CHECK(repair("$$ a __b") == "$$ a __b$$");
  CHECK(repair("$$ a ~~b") == "$$ a ~~b$$");
  CHECK(repair("**x** $$ a ** b") == "**x** $$ a ** b$$");
  CHECK(repair("```\n~~a\n```\n~~b") == "```\n~~a\n```\n~~b~~");
}

TEST_CASE("blocks that interrupt a paragraph") {
  CHECK(repair("**a\n> quote") == "**a\n> quote");
  CHECK(repair("> **a\n> b") == "> **a\n> b**");
  CHECK(repair("> **a\nb") == "> **a\nb**"); // lazy continuation
  CHECK(repair("> **a\n>\n> b") == "> **a\n>\n> b");
  CHECK(repair("**a\n---") == "**a\n---");
  CHECK(repair("**a\n* * *") == "**a\n* * *");
  CHECK(repair("**a\n2. b") == "**a\n2. b");
  CHECK(repair("**a\n-") == "**a\n-\xE2\x80\x8B**"); // a bare `-` is a setext underline, kept inside the paragraph
}

TEST_CASE("a lone dollar is currency unless inline math is on") {
  CHECK(repair("It costs $5 and **bold") == "It costs $5 and **bold**");
  CHECK(repair("It costs $5 and ~~gone") == "It costs $5 and ~~gone~~");
  CHECK(repair("It costs $5 and *it") == "It costs $5 and *it*"); // the reference left this open
  CHECK(repair("$$ a ** b") == "$$ a ** b$$");                    // display math is always math
  RepairOptions o;
  o.inlineMath = true;
  CHECK(repair("$a **b", o) == "$a **b$");
  CHECK(repair("costs $5 and **bold", o) == "costs $5 and **bold$"); // ambiguous by design: the `$` opened math
}

TEST_CASE("blockquote depth is the block's, not the previous line's") {
  CHECK(repair("> **a\nb\n> c") == "> **a\nb\n> c**"); // lazy continuation, then the quote resumes
  CHECK(repair("> **a\n> > c") == "> **a\n> > c");
  CHECK(repair("> ~~~\n> x **b") == "> ~~~\n> x **b");
}

TEST_CASE("text-only link repair skips brackets that can no longer close") {
  RepairOptions o;
  o.linkMode = LinkMode::TextOnly;
  CHECK(repair("# [a\n[b", o) == "# [a\nb");
}

TEST_CASE("inline code parity ignores backticks inside a closed fence") {
  CHECK(repair("~~~\n`\n~~~\n`b") == "~~~\n`\n~~~\n`b`");
  CHECK(repair("```\n`\n```\n`b") == "```\n`\n```\n`b`");
}

TEST_CASE("a setext `=` underline ends the paragraph") {
  CHECK(repair("**a\n===") == "**a\n===");
  CHECK(repair("**a\n=\nb") == "**a\n=\nb");
}

// A `[` left open far behind is a stray bracket in prose, not a link label.
TEST_CASE("an open label far from the end is prose") {
  RepairOptions o;
  o.linkMode = LinkMode::TextOnly;
  const std::string stray = "Note [1 " + std::string(600, 'x');
  CHECK(repair(stray, o) == stray);
  CHECK(repair(stray + " [docs", o) == stray + " docs");
  CHECK(repair("Note [1 " + std::string(100, 'x'), o) == "Note 1 " + std::string(100, 'x'));
}

} // namespace divergence

namespace handlers {

using namespace NitroMarkdownRepair;

namespace {

std::string repair(std::string_view s, const RepairOptions &o = RepairOptions()) {
  return repairInlineMarkdown(s, o);
}

using RepairInternal::RepairContext;

// Runs one handler on its own context and returns the resulting text.
template <class Handler> auto handler(Handler h) {
  return [h](std::string_view s) {
    std::string text(s);
    RepairContext ctx(text);
    h(ctx);
    return text;
  };
}

const auto linksProtocol = handler([](RepairContext &c) { RepairHandlers::links(c, LinkMode::Protocol); });
const auto linksTextOnly = handler([](RepairContext &c) { RepairHandlers::links(c, LinkMode::TextOnly); });

} // namespace

TEST_CASE("pipeline: trailing single space is dropped, double space kept") {
  CHECK(repair("hello ") == "hello");
  CHECK(repair("hello  ") == "hello  ");
  CHECK(repair("") == "");
}

TEST_CASE("bold") {
  auto bold = handler(RepairHandlers::bold);
  CHECK(bold("**bold") == "**bold**");
  CHECK(bold("**bold*") == "**bold**");
  CHECK(bold("**bold**") == "**bold**");
  CHECK(bold("**") == "**");
  CHECK(bold("` **bold`") == "` **bold`");
  CHECK(bold("```\n**bold\n") == "```\n**bold\n");
  CHECK(bold("- item\n**bold\nmore") == "- item\n**bold\nmore**");
  CHECK(bold("**bold\n\n") == "**bold**\n\n"); // closers go before trailing newlines
  // Bold closes even when an italic is nested inside (our divergence).
  CHECK(repair("**bold *ital") == "**bold *ital***");
  CHECK(repair("**a *b* c") == "**a *b* c**");
  CHECK(repair("**a *b* c*") == "**a *b* c**"); // trailing * is half of the closer
  CHECK(repair("2**3 = 8") == "2**3 = 8**");    // same as the reference: ** between digits can open
  CHECK(bold("***") == "***");                  // horizontal rule, not bold
}

TEST_CASE("italic") {
  auto asterisk = handler(RepairHandlers::italicSingleAsterisk);
  auto underscore = handler(RepairHandlers::italicSingleUnderscore);
  auto doubleUnderscore = handler(RepairHandlers::italicDoubleUnderscore);
  CHECK(asterisk("*it") == "*it*");
  CHECK(asterisk("hello*world") == "hello*world");
  CHECK(asterisk("* item") == "* item");
  CHECK(asterisk("2 * 3") == "2 * 3");
  CHECK(underscore("_it") == "_it_");
  CHECK(underscore("snake_case") == "snake_case");
  CHECK(underscore("_it\n\n") == "_it_\n\n");
  CHECK(repair("**bold _und") == "**bold _und_**");
  CHECK(underscore("**bold _und**") == "**bold _und**_"); // literal: nothing to nest into
  CHECK(doubleUnderscore("__it") == "__it__");
  CHECK(doubleUnderscore("__it_") == "__it__");
  CHECK(repair("__bold _ital") == "__bold _ital___"); // parity, like bold (our divergence)
  CHECK(repair("__b _i_") == "__b _i___");            // trailing _ closed the italic, so bold still needs __
  CHECK(repair("__b _i_ c_") == "__b _i_ c__");       // trailing _ is half of the closer
}

TEST_CASE("bold italic") {
  auto boldItalic = handler(RepairHandlers::boldItalic);
  CHECK(boldItalic("***x") == "***x***");
  CHECK(boldItalic("****") == "****");
  CHECK(boldItalic("**bold and *italic***") == "**bold and *italic***");
}

TEST_CASE("inline code") {
  auto inlineCode = handler(RepairHandlers::inlineCode);
  CHECK(inlineCode("`code") == "`code`");
  CHECK(inlineCode("`code`") == "`code`");
  CHECK(inlineCode("```js\ncode") == "```js\ncode");
  CHECK(inlineCode("```code``") == "```code```");
  CHECK(inlineCode("\\`not code") == "\\`not code");
}

TEST_CASE("strikethrough and single tilde") {
  auto strikethrough = handler(RepairHandlers::strikethrough);
  auto singleTilde = handler(RepairHandlers::singleTilde);
  CHECK(strikethrough("~~gone") == "~~gone~~");
  CHECK(strikethrough("~~gone~") == "~~gone~~");
  CHECK(singleTilde("20~25") == "20\\~25");
  CHECK(singleTilde("a~~b") == "a~~b");
  CHECK(singleTilde("`20~25`") == "`20~25`");
  CHECK(singleTilde("温~度") == "温\\~度"); // Unicode letters
  CHECK(singleTilde("a~b~c") == "a\\~b\\~c");
}

TEST_CASE("links and images") {
  CHECK(linksProtocol("[text](http://x") == "[text](streamdown:incomplete-link)");
  CHECK(linksTextOnly("[text](http://x") == "text");
  CHECK(linksProtocol("see [text") == "see [text](streamdown:incomplete-link)");
  CHECK(linksTextOnly("see [text") == "see text");
  CHECK(linksProtocol("![alt](http://x") == "");
  CHECK(linksProtocol("pic ![alt") == "pic ");
  CHECK(linksTextOnly("[a](b) and [c") == "[a](b) and c");
  CHECK(linksProtocol("`[not a link`") == "`[not a link`");
}

TEST_CASE("math") {
  auto displayMath = handler(RepairHandlers::displayMath);
  auto inlineMath = handler(RepairHandlers::inlineMath);
  CHECK(displayMath("$$x") == "$$x$$");
  CHECK(displayMath("$$\nx") == "$$\nx\n$$");
  CHECK(displayMath("$$x$") == "$$x$$");
  CHECK(displayMath("`$$x`") == "`$$x`");
  CHECK(inlineMath("$x") == "$x$");
  CHECK(inlineMath("costs $5 and $6") == "costs $5 and $6");
  CHECK(repair("$$ a * b") == "$$ a * b$$"); // asterisk inside math stays
}

TEST_CASE("html tags and comparison operators") {
  auto htmlTags = handler(RepairHandlers::htmlTags);
  auto comparison = handler(RepairHandlers::comparisonOperators);
  // Only a tag that starts a line is stripped; inline `<` is prose for our parser.
  CHECK(htmlTags("text <cus") == "text <cus");
  CHECK(htmlTags("if x<y then") == "if x<y then");
  CHECK(htmlTags("text\n<video src=\"http://x") == "text");
  CHECK(htmlTags("<div") == "");
  CHECK(htmlTags("a<b\n<video src=\"x") == "a<b"); // mid-line `<` must not hide a later line-start tag
  CHECK(htmlTags("a < b") == "a < b");
  CHECK(htmlTags("```\n<cus") == "```\n<cus");
  CHECK(htmlTags("<https://exa") == ""); // a line-start autolink is hidden until its > arrives
  CHECK(comparison("- > 25: costly") == "- \\> 25: costly");
  CHECK(comparison("1. >= $5") == "1. \\>= $5");
  CHECK(comparison("- > quote") == "- > quote");
  CHECK(comparison("> 5") == "> 5");
}

TEST_CASE("setext headings") {
  auto setext = handler(RepairHandlers::setextHeadings);
  CHECK(setext("Title\n-") == "Title\n-\xE2\x80\x8B");
  CHECK(setext("Title\n--") == "Title\n--\xE2\x80\x8B");
  CHECK(setext("Title\n---") == "Title\n---");
  CHECK(setext("Title\n- ") == "Title\n- ");
  CHECK(setext("\n-") == "\n-");
  CHECK(setext("Title\n=") == "Title\n=\xE2\x80\x8B");
}

TEST_CASE("options disable individual handlers") {
  RepairOptions o;
  o.bold = false;
  CHECK(repair("**x", o) == "**x");
  o = RepairOptions();
  o.links = false;
  o.images = false;
  CHECK(repair("[x](y", o) == "[x](y");
  o = RepairOptions();
  o.links = false; // images alone keeps the handler on, as upstream
  CHECK(repair("[x](y", o) == "[x](streamdown:incomplete-link)");
}

TEST_CASE("helpers") {
  CHECK(isWordChar('a'));
  CHECK(isWordChar('_'));
  CHECK(isWordChar(0x4E2D));  // 中
  CHECK(isWordChar(0x1D400)); // 𝐀 (full code point view)
  CHECK_FALSE(isWordChar(' '));
  CHECK_FALSE(isWordChar(0x1F600)); // 😀
  CHECK_FALSE(isWordChar(kNoCodePoint));
  CHECK(isWithinCodeBlock("```\nx", 4));
  CHECK_FALSE(isWithinCodeBlock("```\nx\n```\ny", 10));
  CHECK(isWithinMathBlock("$x$ $y", 5));
  CHECK_FALSE(isWithinMathBlock("$x$ y", 4));
  CHECK(isWithinMathBlock("\\(a_b\\)", 3));
  CHECK(isWithinLinkOrImageUrl("[a](b_c)", 5));
  CHECK_FALSE(isWithinLinkOrImageUrl("(b_c)", 2));
}

TEST_CASE("unicode neighbours of markers") {
  // Word-internal detection must decode code points, not bytes.
  CHECK(repair("naïve*word") == "naïve*word");
  CHECK(repair("naïve _x") == "naïve _x_");
  CHECK(repair("日本語_テスト") == "日本語_テスト");
  // Astral characters are not word characters in the reference (UTF-16 view).
  CHECK(repair("😀*wave") == "😀*wave*");
}

TEST_CASE("in-place entry point matches the copying one") {
  std::string text = "**bold [link](http://x";
  repairInlineMarkdownInPlace(text, RepairOptions());
  CHECK(text == repair("**bold [link](http://x"));
  text = "";
  repairInlineMarkdownInPlace(text, RepairOptions());
  CHECK(text.empty());
}

} // namespace handlers

namespace withhold {

using namespace NitroMarkdownRepair;

namespace {

RepairOptions withholding() {
  RepairOptions o;
  o.withholdIncomplete = true;
  return o;
}

RepairOptions withholdingMath() {
  RepairOptions o = withholding();
  o.withholdMath = true;
  o.inlineMath = true;
  return o;
}

std::string repair(std::string_view s, const RepairOptions &o = withholding()) {
  return repairInlineMarkdown(s, o);
}

} // namespace

TEST_CASE("withhold: a delimiter with nothing after it waits") {
  CHECK(repair("Hello **") == "Hello");
  CHECK(repair("Hello *") == "Hello");
  CHECK(repair("Hello `") == "Hello");
  CHECK(repair("Hello ||") == "Hello");
  CHECK(repair("Hello ==") == "Hello");
  CHECK(repair("**") == "");
  CHECK(repair("Para\n\n**") == "Para\n\n");
  CHECK(repair("a * b") == "a * b");
  CHECK(repair("**bold **") == "**bold**");
  CHECK(repair("`a` **") == "`a`");
  CHECK(repair("`co **") == "`co **`");
  CHECK(repair("Press `*`") == "Press `*`");
  CHECK(repair("use `=`") == "use `=`");
  CHECK(repair("Op `||`") == "Op `||`");
  CHECK(repair("| a |\n|---|\n| `|` |") == "| a |\n|---|\n| `|` |");
  CHECK(repair("x =") == "x =");
  CHECK(repair("Hello\xC2\xA0**") == "Hello");
  CHECK(repair("```\ncode\n```") == "```\ncode\n```");
  CHECK(repair("~~~\ncode\n~~~") == "~~~\ncode\n~~~");
  CHECK(repair("Hello **", RepairOptions()) == "Hello **");
}

TEST_CASE("withhold: a last line that is only a block marker") {
  CHECK(repair("Paragraph\n-") == "Paragraph\n");
  CHECK(repair("Paragraph\n--") == "Paragraph\n");
  CHECK(repair("Paragraph\n=") == "Paragraph\n");
  CHECK(repair("Paragraph\n---") == "Paragraph\n---");
  CHECK(repair("Intro\n\n***\n") == "Intro\n\n***\n");
  CHECK(repair("Intro\n\n___\n") == "Intro\n\n___\n");
  CHECK(repair("Intro\n\n* * *\n") == "Intro\n\n* * *\n");
  CHECK(repair("Intro\n\n***") == "Intro\n\n");
  CHECK(repair("Intro\n\n#") == "Intro\n\n");
  CHECK(repair("Intro\n\n## ") == "Intro\n\n");
  CHECK(repair("Intro\n\n#hashtag") == "Intro\n\n#hashtag");
  CHECK(repair("Intro\n\n``") == "Intro\n\n");
  CHECK(repair("- one\n- ") == "- one\n");
  CHECK(repair("- one\n* ") == "- one\n");
  CHECK(repair("1. one\n2.") == "1. one\n");
  CHECK(repair("-") == "");
  CHECK(repair("- **") == "");
  CHECK(repair("## **") == "");
  CHECK(repair("> quote\n>") == "> quote\n");
  CHECK(repair("> quote\n> ") == "> quote\n");
  CHECK(repair("| a |\n|") == "| a |\n");
  CHECK(repair("| a |\n| b |") == "| a |\n| b |");
  CHECK(repair("Price\n12") == "Price\n12");
  CHECK(repair("-foo") == "-foo");
  CHECK(repair("Paragraph\n-", RepairOptions()) == std::string("Paragraph\n-").append(RepairInternal::kZeroWidthSpace));
}

TEST_CASE("withhold: admonition titles and task checkboxes still being typed") {
  CHECK(repair("Intro\n\n> [!") == "Intro\n\n");
  CHECK(repair("Intro\n\n> [!NO") == "Intro\n\n");
  CHECK(repair("Intro\n\n> [!NOTE]") == "Intro\n\n> [!NOTE]");
  CHECK(repair("Intro\n\n> [!NOTE]\n> Body **b") == "Intro\n\n> [!NOTE]\n> Body **b**");
  CHECK(repair("See [!important") == "See [!important](streamdown:incomplete-link)");
  CHECK(repair("- [x] done\n- [") == "- [x] done\n");
  CHECK(repair("- [x] done\n- [x") == "- [x] done\n");
  CHECK(repair("- [x] done\n- [ ") == "- [x] done\n");
  CHECK(repair("- [ ]") == "- [ ]");
  CHECK(repair("- [x]") == "- [x]");
  CHECK(repair("- [x] **done") == "- [x] **done**");
  CHECK(repair("- [L") == "- [L](streamdown:incomplete-link)");
}

TEST_CASE("withhold: a closing fence still being typed") {
  const std::string open = "Intro\n\n```swift\nlet x = **y\n";
  CHECK(repair(open) == open);
  CHECK(repair(open + "``") == open);
  CHECK(repair(open + "`") == open);
  CHECK(repair("> ```\n> code\n> ``") == "> ```\n> code\n");
  CHECK(repair("```\ncode **x") == "```\ncode **x");
  CHECK(repair("````\ncode\n```") == "````\ncode\n");
  CHECK(repair("````\ncode\n````") == "````\ncode\n````");
}

TEST_CASE("a marker line inside an open fence is code") {
  CHECK(repair("```\ncode\n-") == "```\ncode\n-");
  CHECK(repair("```\ncode\n-", RepairOptions()) == "```\ncode\n-");
  CHECK(repair("```\ncode\n=", RepairOptions()) == "```\ncode\n=");
}

TEST_CASE("withhold: an image label without a source") {
  CHECK(repair("Text ![alt]") == "Text");
  CHECK(repair("- ![alt]") == "");
  CHECK(repair("`![alt]`") == "`![alt]`");
  CHECK(repair("![a]\n\nmore ![b]") == "![a]\n\nmore");
}

TEST_CASE("withhold: a link label at the very end waits for its `(`") {
  CHECK(repair("See [docs]") == "See docs");
  CHECK(repair("Text \\![alt]") == "Text \\!alt"); // an escaped `!` starts no image
  CHECK(repair("See [docs] ") == "See [docs]");    // a space: no `(` can follow
  CHECK(repair("`[docs]`") == "`[docs]`");
  CHECK(repair("- [ ]") == "- [ ]");
  CHECK(repair("Note[^1]") == "Note[^1]");
  CHECK(repair("See [a][b]") == "See [a][b]"); // a full reference link
  CHECK(repair("[docs]\n\nmore") == "[docs]\n\nmore");
}

TEST_CASE("an open title or nested parenthesis keeps a link incomplete") {
  RepairOptions o;
  o.linkMode = LinkMode::TextOnly;
  CHECK(repair("See [a](u \"t )", o) == "See a");
  CHECK(repair("See [a](u 't )", o) == "See a");
  CHECK(repair("See [docs](https://e.com/a(b)", o) == "See docs");
  CHECK(repair("See [docs](https://e.com/a(b)) now", o) == "See [docs](https://e.com/a(b)) now");
  CHECK(repair("See [a](<u v", o) == "See a");
  CHECK(repair("See [a](u \"t\")", o) == "See [a](u \"t\")");
  CHECK(repair("Use \\![a](https://e", o) == "Use \\!a");
}

TEST_CASE("withhold: unclosed math is cut at its opener") {
  const RepairOptions o = withholdingMath();
  CHECK(repair("The area is $\\pi r^", o) == "The area is");
  CHECK(repair("Closed $x^2$ and open $\\frac{1}", o) == "Closed $x^2$ and open");
  CHECK(repair("$a $b", o) == "$a");
  CHECK(repair("Prices in $USD or $EUR today", o) == "Prices in $USD or");
  CHECK(repair("Display $$\\sum_i", o) == "Display");
  CHECK(repair("$$\nx^2 +\n", o) == "");
  CHECK(repair("Intro\n\n$$\nx^2 +", o) == "Intro\n\n");
  CHECK(repair("Done: $a_1$.", o) == "Done: $a_1$.");
  CHECK(repair("Earlier $x in a finished paragraph\n\nNext **b", o) ==
        "Earlier $x in a finished paragraph\n\nNext **b**");
  CHECK(repair("| $x | y", o) == "| $x | y");
  CHECK(repair("| $x", o) == "");
  CHECK(repair("# Cost in $USD\nSome text", o) == "# Cost in $USD\nSome text");
  CHECK(repair("# Cost in $USD\n", o) == "# Cost in $USD\n");
  CHECK(repair("See \xC2\xAB$x", o) == "See \xC2\xAB");
}

TEST_CASE("withhold: a `$` that ends the text waits for the next character") {
  const RepairOptions o = withholdingMath();
  CHECK(repair("display math ($", o) == "display math (");
  CHECK(repair("Costs $", o) == "Costs");
  CHECK(repair("Block $$", o) == "Block");
  CHECK(repair("Sum $y + $", o) == "Sum"); // the opener before it is still unclosed
  CHECK(repair("Paid \\$", o) == "Paid \\$");
  CHECK(repair("Run `a $`", o) == "Run `a $`");
  CHECK(repair("Costs $", withholding()) == "Costs $"); // without withholdMath
}

TEST_CASE("withhold: a `$` that ends the text and closes math shows") {
  const RepairOptions o = withholdingMath();
  CHECK(repair("Complexity is $O(n)$", o) == "Complexity is $O(n)$");
  CHECK(repair("Let $x$", o) == "Let $x$");
  CHECK(repair("Sum $$x + y$$", o) == "Sum $$x + y$$");
  CHECK(repair("Intro\n\n$$\nx^2\n$$", o) == "Intro\n\n$$\nx^2\n$$");
  CHECK(repair("> $$\n> x^2\n> $$", o) == "> $$\n> x^2\n> $$");
  CHECK(repair("Costs 5$", o) == "Costs 5$");
  CHECK(repair("Costs 5$$", o) == "Costs 5$$");
  CHECK(repair("Sum $$x$", o) == "Sum");       // a single `$` does not close `$$`
  CHECK(repair("| $x | ($", o) == "| $x | ("); // a table cell is its own scope
}

TEST_CASE("withhold: a dollar next to a digit or space is currency") {
  const RepairOptions o = withholdingMath();
  CHECK(repair("Das kostet 5$ und mehr", o) == "Das kostet 5$ und mehr");
  CHECK(repair("Das kostet 5 $ pro Stück", o) == "Das kostet 5 $ pro Stück");
  CHECK(repair("It costs $5 and", o) == "It costs $5 and");
  CHECK(repair("Für 3$ bekommst du **viel", o) == "Für 3$ bekommst du **viel**");
  CHECK(repair("It costs $5 and **more", o) == "It costs $5 and **more**");
  RepairOptions closing;
  closing.inlineMath = true;
  CHECK(repair("It costs $5 and", closing) == "It costs $5 and$");
  CHECK(repair("It costs $5 and **more", closing) == "It costs $5 and **more$");
}

TEST_CASE("withhold: the handlers read dollars the way the parser does") {
  const RepairOptions o = withholdingMath();
  CHECK(repair("Let $a_1 + b_2$ be _small", o) == "Let $a_1 + b_2$ be _small_");
  CHECK(repair("$\\sum_{i=1}^n x_i$ and _y", o) == "$\\sum_{i=1}^n x_i$ and _y_");
  CHECK(repair("`$HOME` and **b", o) == "`$HOME` and **b**");
  CHECK(repair("```\n$ npm i\n```\n**b", o) == "```\n$ npm i\n```\n**b**");
  CHECK(repair("Open $x stays open **b", o) == "Open");
  CHECK(repair("$a $$b$$ _c", o) == "$a $$b$$ _c_");
  RepairOptions parserOnly;
  parserOnly.inlineMath = true;
  parserOnly.withholdMath = true;
  CHECK(repair("# Cost $USD\nsome _it", parserOnly) == "# Cost $USD\nsome _it_");
}

TEST_CASE("withhold: math follows the math options") {
  RepairOptions o = withholding();
  o.withholdMath = true;
  CHECK(repair("The area is $\\pi r^", o) == "The area is $\\pi r^");
  CHECK(repair("Display $$\\sum_i", o) == "Display");
  o.displayMath = false;
  CHECK(repair("Display $$\\sum_i", o) == "Display $$\\sum_i");
}

TEST_CASE("closers go before trailing whitespace") {
  CHECK(repair("**bold  ", RepairOptions()) == "**bold**  ");
  CHECK(repair("*italic  \n", RepairOptions()) == "*italic*  \n");
  CHECK(repair("**bold\t", RepairOptions()) == "**bold**\t");
  CHECK(repair("**bold\r\n", RepairOptions()) == "**bold**\r\n");
}

} // namespace withhold

Result runAll() {
  State &current = state();
  current = State();
  Result result;
  for (const TestCaseEntry &entry : registry()) {
    ++result.testCases;
    try {
      entry.run();
    } catch (const RequireAbort &) {
    } catch (const std::exception &error) {
      ++current.failures;
      if (current.firstFailure.empty()) {
        current.firstFailure = std::string(entry.name) + ": unexpected exception: " + error.what();
      }
    }
  }
  result.checks = current.checks;
  result.failures = current.failures;
  result.firstFailure = current.firstFailure;
  return result;
}

} // namespace NitroMarkdownRepairTests

#undef MESSAGE
#undef REQUIRE
#undef CHECK_MESSAGE
#undef CHECK_FALSE
#undef CHECK
#undef TEST_CASE
#undef NMR_CONCAT
#undef NMR_CONCAT_INNER
