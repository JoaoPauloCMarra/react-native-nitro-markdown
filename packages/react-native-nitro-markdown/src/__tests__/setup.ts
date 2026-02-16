import type { MarkdownNode } from "../index";

interface MockParserOptions {
  gfm?: boolean;
  math?: boolean;
}

function createTextNode(content: string): MarkdownNode {
  return { type: "text", content };
}

function createParagraph(children: MarkdownNode[]): MarkdownNode {
  return { type: "paragraph", children };
}

function parseMarkdownMock(
  text: string,
  options: MockParserOptions = { gfm: true, math: true },
): MarkdownNode {
  const root: MarkdownNode = { type: "document", children: [] };
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      root.children!.push({
        type: "heading",
        level,
        children: parseInline(content, options),
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      root.children!.push({ type: "horizontal_rule" });
      i++;
      continue;
    }

    // Code block
    const codeBlockMatch = trimmed.match(/^```(\w*)$/);
    if (codeBlockMatch) {
      const language = codeBlockMatch[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const codeContent = codeLines.join("\n");
      root.children!.push({
        type: "code_block",
        language,
        children: [createTextNode(codeContent)],
      });
      continue;
    }

    // Block math
    if (options.math && trimmed.startsWith("$$")) {
      if (trimmed.endsWith("$$") && trimmed.length > 4) {
        // Single line block math
        const mathContent = trimmed.slice(2, -2);
        root.children!.push({
          type: "paragraph",
          children: [
            {
              type: "math_block",
              children: [createTextNode(mathContent)],
            },
          ],
        });
        i++;
        continue;
      }
      // Multi-line block math
      const mathLines: string[] = [];
      const firstLine = trimmed.slice(2);
      if (firstLine) mathLines.push(firstLine);
      i++;
      while (i < lines.length && !lines[i].trim().endsWith("$$")) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        const lastLine = lines[i].trim().slice(0, -2);
        if (lastLine) mathLines.push(lastLine);
        i++;
      }
      root.children!.push({
        type: "paragraph",
        children: [
          {
            type: "math_block",
            children: [createTextNode(mathLines.join("\n"))],
          },
        ],
      });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      root.children!.push({
        type: "blockquote",
        children: [createParagraph(parseInline(quoteLines.join(" "), options))],
      });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      const items: MarkdownNode[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        const itemLine = lines[i].trim();
        const taskMatch = itemLine.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
        if (options.gfm && taskMatch) {
          items.push({
            type: "task_list_item",
            checked: taskMatch[1].toLowerCase() === "x",
            children: [createParagraph(parseInline(taskMatch[2], options))],
          });
        } else {
          const content = itemLine.replace(/^[-*+]\s+/, "");
          items.push({
            type: "list_item",
            children: [createParagraph(parseInline(content, options))],
          });
        }
        i++;
      }
      root.children!.push({
        type: "list",
        ordered: false,
        children: items,
      });
      continue;
    }

    // Ordered list
    const orderedMatch = trimmed.match(/^(\d+)\.\s/);
    if (orderedMatch) {
      const items: MarkdownNode[] = [];
      const start = parseInt(orderedMatch[1], 10);
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const content = lines[i].trim().replace(/^\d+\.\s+/, "");
        items.push({
          type: "list_item",
          children: [createParagraph(parseInline(content, options))],
        });
        i++;
      }
      root.children!.push({
        type: "list",
        ordered: true,
        start,
        children: items,
      });
      continue;
    }

    // Table (GFM)
    if (options.gfm && trimmed.includes("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const table = parseTable(tableLines, options);
        if (table) {
          root.children!.push(table);
          continue;
        }
      }
    }

    // Paragraph
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !isBlockStart(lines[i])
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      root.children!.push(
        createParagraph(parseInline(paragraphLines.join(" "), options)),
      );
    }
  }

  return root;
}

function isBlockStart(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^#{1,6}\s/.test(trimmed) ||
    /^[-*_]{3,}$/.test(trimmed) ||
    /^```/.test(trimmed) ||
    /^>/.test(trimmed) ||
    /^[-*+]\s/.test(trimmed) ||
    /^\d+\.\s/.test(trimmed) ||
    (trimmed.includes("|") && trimmed.startsWith("|"))
  );
}

function parseTable(
  lines: string[],
  options: MockParserOptions,
): MarkdownNode | null {
  if (lines.length < 2) return null;

  const parseRow = (line: string): string[] => {
    return line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
  };

  const headerCells = parseRow(lines[0]);
  const separatorLine = lines[1];

  if (!/^[\s|:-]+$/.test(separatorLine)) return null;

  const alignments = parseRow(separatorLine).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return undefined;
  });

  const headerRow: MarkdownNode = {
    type: "table_row",
    children: headerCells.map((cell, idx) => ({
      type: "table_cell",
      isHeader: true,
      align: alignments[idx],
      children: parseInline(cell, options),
    })),
  };

  const bodyRows: MarkdownNode[] = lines.slice(2).map((line) => ({
    type: "table_row",
    children: parseRow(line).map((cell, idx) => ({
      type: "table_cell",
      isHeader: false,
      align: alignments[idx],
      children: parseInline(cell, options),
    })),
  }));

  return {
    type: "table",
    children: [
      { type: "table_head", children: [headerRow] },
      { type: "table_body", children: bodyRows },
    ],
  };
}

function parseInline(text: string, options: MockParserOptions): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Inline math
    if (options.math) {
      const mathMatch = remaining.match(/^\$([^$]+)\$/);
      if (mathMatch) {
        nodes.push({
          type: "math_inline",
          children: [createTextNode(mathMatch[1])],
        });
        remaining = remaining.slice(mathMatch[0].length);
        continue;
      }
    }

    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push({ type: "code_inline", content: codeMatch[1] });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch =
      remaining.match(/^\*\*(.+?)\*\*/) || remaining.match(/^__(.+?)__/);
    if (boldMatch) {
      nodes.push({
        type: "bold",
        children: parseInline(boldMatch[1], options),
      });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch =
      remaining.match(/^\*([^*]+)\*/) || remaining.match(/^_([^_]+)_/);
    if (italicMatch) {
      nodes.push({
        type: "italic",
        children: parseInline(italicMatch[1], options),
      });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Strikethrough (GFM)
    if (options.gfm) {
      const strikeMatch = remaining.match(/^~~(.+?)~~/);
      if (strikeMatch) {
        nodes.push({
          type: "strikethrough",
          children: parseInline(strikeMatch[1], options),
        });
        remaining = remaining.slice(strikeMatch[0].length);
        continue;
      }
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const [full, linkText, href] = linkMatch;
      const titleMatch = href.match(/^([^\s]+)\s+"([^"]+)"$/);
      if (titleMatch) {
        nodes.push({
          type: "link",
          href: titleMatch[1],
          title: titleMatch[2],
          children: parseInline(linkText, options),
        });
      } else {
        nodes.push({
          type: "link",
          href,
          children: parseInline(linkText, options),
        });
      }
      remaining = remaining.slice(full.length);
      continue;
    }

    // Image
    const imageMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      const [full, alt, src] = imageMatch;
      const titleMatch = src.match(/^([^\s]+)\s+"([^"]+)"$/);
      if (titleMatch) {
        nodes.push({
          type: "image",
          href: titleMatch[1],
          title: titleMatch[2],
          alt,
        });
      } else {
        nodes.push({
          type: "image",
          href: src,
          alt,
        });
      }
      remaining = remaining.slice(full.length);
      continue;
    }

    // Line break (two trailing spaces)
    if (remaining.startsWith("  \n") || remaining.startsWith("  ")) {
      nodes.push({ type: "line_break" });
      remaining = remaining.slice(remaining.startsWith("  \n") ? 3 : 2);
      continue;
    }

    // Plain text - consume until next special char
    const nextSpecial = remaining.search(/[*_`~\[$!\\]/);
    if (nextSpecial === -1) {
      nodes.push(createTextNode(remaining));
      break;
    } else if (nextSpecial === 0) {
      nodes.push(createTextNode(remaining[0]));
      remaining = remaining.slice(1);
    } else {
      nodes.push(createTextNode(remaining.slice(0, nextSpecial)));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return nodes;
}

const createMockAST = (text: string): MarkdownNode => {
  const root: MarkdownNode = { type: "document", children: [] };
  if (text.length > 1000) {
    root.children = [
      {
        type: "paragraph",
        children: [{ type: "text", content: text.slice(0, 100) }],
      },
    ];
    return root;
  }
  return parseMarkdownMock(text);
};

const createMockASTWithOptions = (
  text: string,
  options: MockParserOptions,
): MarkdownNode => {
  const root: MarkdownNode = { type: "document", children: [] };
  if (text.length > 1000) {
    root.children = [
      {
        type: "paragraph",
        children: [{ type: "text", content: text.slice(0, 100) }],
      },
    ];
    return root;
  }
  return parseMarkdownMock(text, options);
};

const mockParser = {
  parse: jest.fn((text: string) => JSON.stringify(createMockAST(text))),
  parseWithOptions: jest.fn((text: string, options: MockParserOptions) =>
    JSON.stringify(createMockASTWithOptions(text, options)),
  ),
};

jest.mock("react-native-nitro-modules", () => ({
  NitroModules: {
    createHybridObject: jest.fn(() => mockParser),
  },
}));

jest.mock("react-native", () => {
  return {
    StyleSheet: {
      create: (obj: Record<string, unknown>) => obj,
      flatten: (obj: Record<string, unknown>) => obj,
    },
    View: "View",
    Text: "Text",
    Image: "Image",
    ScrollView: "ScrollView",
    Linking: {
      openURL: jest.fn(),
    },
    Platform: {
      OS: "ios",
      select: (obj: Record<string, unknown>) => obj.ios,
    },
    Dimensions: {
      get: jest.fn().mockReturnValue({ width: 375, height: 812 }),
    },
  };
});

jest.mock("react-native-mathjax-svg", () => "MathJax");

export { mockParser };
