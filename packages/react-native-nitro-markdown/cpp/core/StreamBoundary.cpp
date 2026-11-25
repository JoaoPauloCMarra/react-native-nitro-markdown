// Ported from software-mansion/enriched-markdown (MIT, Copyright (c) 2025
// Software Mansion). See StreamBoundary.hpp for the source and the changes.
#include "StreamBoundary.hpp"

#include "StreamText.hpp"

#include <algorithm>
#include <cctype>

namespace NitroMarkdown {

namespace {

using namespace StreamText;

// HTML blocks that may hold blank lines (CommonMark types 1-5) end at a
// closing text, not at a blank line: the text that closes the one `body`
// opens, empty when it opens none.
std::string_view htmlBlockCloser(std::string_view body) {
    const std::string_view text = body.substr(std::min(leadingSpaces(body), body.size()));
    if (startsWith(text, "<!--")) return "-->";
    if (startsWith(text, "<![CDATA[")) return "]]>";
    if (startsWith(text, "<?")) return "?>";
    if (
        text.size() > 2 && startsWith(text, "<!") &&
        std::isalpha(static_cast<unsigned char>(text[2]))
    ) {
        return ">";
    }
    static const std::string_view kRawTags[][2] = {
        {"pre", "</pre>"},
        {"script", "</script>"},
        {"style", "</style>"},
        {"textarea", "</textarea>"},
    };
    for (const auto& tag : kRawTags) {
        const std::string_view name = tag[0];
        if (
            text.size() <= name.size() || text[0] != '<' ||
            !std::equal(name.begin(), name.end(), text.begin() + 1, equalsIgnoringCase)
        ) {
            continue;
        }
        const std::size_t after = name.size() + 1;
        if (after == text.size() || text[after] == ' ' || text[after] == '\t' || text[after] == '>') {
            return tag[1];
        }
    }
    return {};
}

} // namespace

bool startsTopLevelBlock(std::string_view line) {
    if (line.empty()) return false;
    const char ch = line[0];
    return !(
        isWhitespace(ch) || ch == '-' || ch == '*' || ch == '+' || ch == '[' || ch == '<' ||
        std::isdigit(static_cast<unsigned char>(ch))
    );
}

std::size_t finishedBlocksEnd(std::string_view markdown, const StreamBoundaryOptions& options) {
    Lines lines = splitLines(markdown);
    scanFences(lines);
    std::size_t end = 0;
    MathBlock math = MathBlock::Closed;
    // While an HTML block that may hold blank lines is open, what closes it.
    std::string_view htmlCloser;
    for (std::size_t i = 0; i < lines.size(); i++) {
        const Line& line = lines[i];
        if (line.code) continue;
        if (options.html) {
            const std::string_view body = stripQuotes(line.text).body;
            if (!htmlCloser.empty()) {
                if (containsIgnoringCase(body, htmlCloser)) htmlCloser = {};
                continue;
            }
            if (const std::string_view closer = htmlBlockCloser(body); !closer.empty()) {
                if (!containsIgnoringCase(body.substr(body.find('<') + 2), closer)) {
                    htmlCloser = closer;
                }
                continue;
            }
        }
        const bool startsBlock =
            i > 0 && math == MathBlock::Closed && isBlank(lines[i - 1].text) &&
            !lines[i - 1].code && startsTopLevelBlock(line.text);
        // A line still arriving can start the tail once its first character
        // rules out a fence and `$$`, the kinds a later character could
        // still make.
        const char first = startsBlock ? line.text[0] : 0;
        if (
            startsBlock &&
            (i + 1 < lines.size() ||
                (first != '`' && first != '~' && (first != '$' || !options.math)))
        ) {
            end = line.offset;
        }
        if (options.math) math = nextMathBlock(math, line.text);
    }
    return end;
}

} // namespace NitroMarkdown
