// Complex markdown test data for benchmarking
export const COMPLEX_MARKDOWN = `# 🚀 Nitro Markdown

Welcome to the **high-performance** markdown parser powered by \`md4c\` and **Nitro Modules**.

## Features Showcase

This parser supports *all* the features you'd expect:

- **Bold text** with double asterisks
- *Italic text* with single asterisks
- ~~Strikethrough text~~ (GFM)
- \`Inline code\` snippets
- [Links](https://github.com)
- ![Landscape](https://fastly.picsum.photos/id/1/300/200.jpg?hmac=-NJkMeYPrdetftjjcJ9lbfAZcXVJhZy4rqGvbP0P8Hg "Person Typing")

**Bold text** and *italic text* and ***bold italic text***.

__Alternative bold__ and _alternative italic_ and ___alternative bold italic___.

~~Strikethrough text~~ and ~~**strikethrough bold**~~ and ~~*strikethrough italic*~~.

Regular text with **bold in the middle** and more text.

A sentence with *multiple* **formatting** ***options*** mixed ~~together~~.

## Some Lists / Tasks

**Quick actions:**

- [ ] Reply to Sarah's email about the \`Series A\` discussion
- [ ] Update your notes on the *TechCrunch* meeting
- [x] Review the [shared document](https://docs.example.com/pitch) before Thursday

**List:**

- Reply to Sarah's email about the \`Series A\` discussion
- Update your notes on the *TechCrunch* meeting
- Review the [shared document](https://docs.example.com/pitch) before Thursday

#### Images
![Landscape](https://fastly.picsum.photos/id/1/300/200.jpg?hmac=-NJkMeYPrdetftjjcJ9lbfAZcXVJhZy4rqGvbP0P8Hg "Person Typing")
![City](https://fastly.picsum.photos/id/691/300/150.jpg?hmac=ddUFtdPD2lBq38o0nYpoRwVpWRthoKAampnZogO8IFg "Coffee Bedroom")


## Advanced GFM Features

### Task Lists
- [x] Implement md4c parser
- [x] Create Nitro bindings
- [x] Build AST converter
- [ ] Add syntax highlighting
- [ ] Implement caching

### Tables with Complex Content
| Feature | Description | Status | Performance |
|:--------|:------------|:-------|:------------|
| JSI Binding | Direct JS ↔️ C++ communication | ✅ | Microseconds |
| Native Threading | Background processing | ✅ | Optimized |
| Zero-Copy | No data duplication | ✅ | Memory efficient |
| Math Support | LaTeX expressions | ✅ | Full featured |
| GFM Tables | Advanced table rendering | ✅ | Complete spec |

| Name | Email |
|------|-------|
| Alice | alice@example.com |
| Bob | bob@example.com |

## LaTeX Mathematics

### Inline Math
- Simple: $E = mc^2$ with more text after It. Simple: $E = mc^2$ with more text after It.
- Complex: $\\frac{d}{dx}[x^n] = nx^{n-1}$
- Greek letters: $\\alpha + \\beta = \\gamma$
- Subscripts: $x_1, x_2, \\dots, x_n$
- Superscripts: $x^2, y^{n+1}, e^{\\pi i}$

### Block Math (Display Mode)
The quadratic formula:

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

Pythagorean theorem:

$$a^2 + b^2 = c^2$$

Matrix operations:

$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\times \\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}$$

## Code Blocks with Syntax Highlighting

### TypeScript
\`\`\`typescript
import { parseMarkdown, parseMarkdownWithOptions } from 'react-native-nitro-markdown';

interface ParserOptions {
  gfm?: boolean;
  math?: boolean;
}

const parseWithGFM = (text: string): MarkdownNode => {
  return parseMarkdownWithOptions(text, {
    gfm: true,
    math: true
  });
};
\`\`\`

### C++ (Native Implementation)
\`\`\`cpp
#include "MD4CParser.hpp"

std::shared_ptr<MarkdownNode> parseMarkdown(
    const std::string& text,
    const ParserOptions& options
) {
    MD4CParser parser;
    return parser.parse(text, options);
}
\`\`\`

### Complex Nested Structures

#### Deeply Nested Lists
1. First level ordered item
   - Second level unordered
   - Another second level
     1. Third level ordered
     2. Another third level
        - Fourth level unordered
        - More fourth level items
   - Back to second level
2. Second first level item
   1. Nested ordered in second item
   2. Another nested ordered

#### Blockquotes Within Lists
1. First item with blockquote:
   > This is a blockquote inside a list item
   >
   > It can span multiple lines
   > And contain **formatting**

2. Second item
   - Nested bullet with blockquote:
     > Another blockquote
     > With multiple paragraphs
     >
     > And even more content

### Multi-line Blockquote

> This blockquote spans multiple lines.
> It continues here on the second line.
> And even a third line for good measure.

### Blockquote with Formatting

> **Important:** This blockquote contains *formatted* text.
> It also has \`inline code\` and a [link](https://example.com).

### Text After Blockquote

> A quote about something meaningful.

Regular paragraph text that follows the blockquote.

## Horizontal Rules and Separators

Content above first rule

---

Content between rules

***

More content between rules

___

Content below rules

## Unicode and International Content

### Multiple Languages
- English: Hello world! 🌍
- Español: ¡Hola mundo! 🌎
- Français: Bonjour le monde! 🌍
- Deutsch: Hallo Welt! 🌍
- 中文: 你好世界！ 🌏
- 日本語: こんにちは世界！ 🌸
- العربية: مرحبا بالعالم! 🌙

### Special Characters and Symbols
- Mathematical: ∫ ∑ ∏ √ ∞ ≠ ≈ ≤ ≥
- Arrows: ← → ↑ ↓ ↔ ↕ ⇄ ⇅
- Currency: $ € ¥ £ ₽ ₿ ¢ ₩ ₦ ₫
- Legal: © ® ™ § ¶ † ‡
- Fractions: ½ ⅓ ¼ ¾ ⅛ ⅜ ⅝ ⅞

## Performance Test Patterns

### Repeated Patterns
**Bold text** repeated for *performance testing* with \`code blocks\` and [links](url) to ensure the parser handles repetition efficiently without memory leaks or performance degradation.

### Large Content Sections
This section contains intentionally large blocks of content to test how well the parser scales with document size. The content includes various markdown elements mixed together in realistic patterns that would appear in actual documentation or blog posts.

By including diverse content types - headings, paragraphs, lists, tables, code blocks, math expressions, and international text - we create a comprehensive test that exercises all aspects of the markdown parsing engine.

The goal is to ensure that performance remains consistent regardless of content complexity or document length, providing users with reliable and fast markdown processing capabilities.

### Stress Testing Elements
- Multiple consecutive code blocks
- Tables with many columns and rows
- Deeply nested list structures
- Complex mathematical expressions
- Mixed inline formatting combinations
- Large blocks of plain text
- Unicode characters from multiple languages
- Special symbols and emoji combinations

This comprehensive test suite validates that the parser maintains high performance and accuracy across all supported markdown features and edge cases.`;

// Per-renderer edge cases — rendered after COMPLEX_MARKDOWN on the Default tab
// to exercise tricky paths for every renderer (a visual regression surface).
export const EDGE_CASE_MARKDOWN = `## Renderer Edge Cases

### Headings — all levels
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

## Heading with **bold**, \`code\`, and a [link](https://example.com)

### Emphasis combinations
Nested ***bold italic***, **bold with \`code\` inside**, and *italic with a [link](https://example.com)*.

Adjacent **one****two**, mid-word un**believ**able, and ~~strikethrough with **bold**~~.

### Links
- Bare autolink: https://github.com/JoaoPauloCMarra/react-native-nitro-markdown
- Titled link: [hover for a title](https://example.com "A tooltip title")
- Long URL should not break layout: [reference](https://example.com/a/very/long/path/segment/that/keeps/going?query=value&another=thing#anchor)

### Inline HTML (html_inline)
The default renderer shows inline tags as literal text (safe): <strong>strong</strong>, <em>em</em>, and <code>inline()</code>. A custom \`html_inline\` renderer can map them to native components.

### HTML block (html_block)
<div class="callout">
  <strong>Raw HTML block</strong>
  <p>The default renderer prints it as escaped text. Provide a custom html_block renderer to map safe content into native UI.</p>
</div>

### Images
Broken image falls back to its alt text and error state:

![This image cannot load](https://invalid.example.invalid/missing.png "Broken image")

Image without alt text:

![](https://fastly.picsum.photos/id/237/240/140.jpg?hmac=Wd_Nm07W4nq1rTzG7n8a2yqXqkqRtq3y_AvqkY4kT1k)

### Inline code
A long inline token to test wrapping: \`const aLongIdentifierNameThatKeepsGoingToTestInlineCodeWrapping = true\` inside a sentence.

### Code blocks
Fenced block with no language:

\`\`\`
plain code, no syntax highlighting
second line
\`\`\`

Long line to test horizontal scroll (should not wrap):

\`\`\`ts
const message = "a deliberately long single line of code that exceeds the viewport width to verify horizontal scrolling instead of wrapping";
\`\`\`

### Blockquotes — nested
> Level one
>
> > Level two nested
> >
> > > Level three nested with **bold** and \`code\`

### Lists
Ordered list starting at 5:

5. fifth item
6. sixth item
7. seventh item

Mixed nesting:

1. Ordered parent
   - unordered child
   - another child
     1. deep ordered
2. Back to top level

Task list (checked + unchecked):

- [x] done item
- [ ] pending item with **bold** and \`code\`

### Tables — alignment and overflow
| Left | Center | Right |
| :--- | :----: | ----: |
| a | b | 1 |
| a longer left cell | centered text | 1234 |

Wide table (horizontal scroll):

| Col 1 | Col 2 | Col 3 | Col 4 | Col 5 | Col 6 |
| ----- | ----- | ----- | ----- | ----- | ----- |
| alpha | beta | gamma | delta | epsilon | zeta |

### Math — inline (simple to complex)
Simple inline: $a + b = c$, $x^2$, $\\pi r^2$, and $\\alpha\\beta\\gamma$.

Complex inline flows with the text: $\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$, $\\int_0^1 x^2\\,dx$, and $\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$.

### Math — block (single-line)
$$E = mc^2$$

$$\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}$$

### Math — block (multi-line)
Piecewise (cases):

$$f(x) = \\begin{cases} x & \\text{if } x \\ge 0 \\\\ -x & \\text{if } x < 0 \\end{cases}$$

Aligned derivation:

$$\\begin{aligned} (a+b)^2 &= a^2 + 2ab + b^2 \\\\ &= a^2 + b^2 + 2ab \\end{aligned}$$

### Math — tall and wide
Nested fraction (tall):

$$\\frac{1}{1 + \\frac{1}{1 + \\frac{1}{x}}}$$

Wave equation:

$$\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\frac{\\partial^2 u}{\\partial x^2}$$

Wide matrix (horizontal scroll):

$$\\begin{bmatrix} 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 \\\\ 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 \\end{bmatrix}$$

### Line breaks
First line with a hard break\\
second line after the hard break.
Soft-wrapped line continues on the next source line.

### Horizontal rule

---
`;

export const HTML_PARSER_MARKDOWN = `# HTML Parser Demo

Raw HTML parsing is opt-in with \`options={{ html: true }}\`.

Inline HTML maps to native styling: <span data-tone="accent">highlighted native text</span>.

<aside data-kind="release-note">
  <strong>Release note</strong>
  <p>The parser exposes this as an html_block node, and this demo maps the safe content into a native card.</p>
</aside>
`;

export const CUSTOM_RENDER_COMPONENTS = `# Custom Renderer Examples

> **Tip:** Use the bottom tabs to switch between rendering modes!
>
> - **Default:** Standard markdown rendering
> - **Styles:** Custom accents and retro typography
> - **Custom:** Completely replaced components (Cards, Alerts, etc.)

## Custom Components Demo

This image will look like a standard image in **Default**, but like a "Card" with shadow in **Custom**:

![Demo Image](https://picsum.photos/800/400 "A beautiful landscape to demonstrate custom image rendering")

This blockquote will look like a gray bar in **Default**, but like an "Alert Info" box in **Custom**:

> **Did you know?**
>
> The Custom renderer replaces the standard \`View\` with a specialized component that includes an icon and different layout logic!

---`;
