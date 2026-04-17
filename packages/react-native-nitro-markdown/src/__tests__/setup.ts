import type { MarkdownNode } from "../headless";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

type MockParserOptions = {
  gfm?: boolean;
  math?: boolean;
  html?: boolean;
};

function createMockAst(text: string): MarkdownNode {
  if (text.length === 0) {
    return { type: "document", children: [] };
  }

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

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      root.children!.push({
        type: "heading",
        level: headingMatch[1].length,
        children: [{ type: "text", content: headingMatch[2] }],
      });
      i++;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      root.children!.push({ type: "horizontal_rule" });
      i++;
      continue;
    }

    const codeBlockMatch = trimmed.match(/^```(\w*)$/);
    if (codeBlockMatch) {
      const language = codeBlockMatch[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      root.children!.push({
        type: "code_block",
        language,
        children: [{ type: "text", content: codeLines.join("\n") }],
      });
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      root.children!.push({
        type: "blockquote",
        children: [{ type: "paragraph", children: [{ type: "text", content: quoteLines.join(" ") }] }],
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      root.children!.push({
        type: "paragraph",
        children: [{ type: "text", content: paragraphLines.join(" ") }],
      });
    }
  }

  return root;
}

const mockParser = {
  parse: jest.fn((text: string) => JSON.stringify(createMockAst(text))),
  parseWithOptions: jest.fn((text: string, _options: MockParserOptions) =>
    JSON.stringify(createMockAst(text)),
  ),
  extractPlainText: jest.fn((text: string) => text),
  extractPlainTextWithOptions: jest.fn((text: string, _options: MockParserOptions) => text),
};

jest.mock("react-native-nitro-modules", () => ({
  NitroModules: {
    createHybridObject: jest.fn(() => mockParser),
  },
}));

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  FlatList: "FlatList",
  ScrollView: "ScrollView",
  Image: {
    getSize: jest.fn(),
  },
  Linking: {
    canOpenURL: jest.fn(),
    openURL: jest.fn(),
  },
  StyleSheet: {
    create: (obj: Record<string, unknown>) => obj,
    flatten: (obj: unknown) => obj,
  },
  Platform: {
    OS: "ios",
    select: (obj: Record<string, unknown>) => obj.ios,
  },
}));

export { mockParser };
