import { NitroModules } from 'react-native-nitro-modules';

export interface MarkdownNode {
  type: string;
  content?: string;
  level?: number;
  href?: string;
  title?: string;
  alt?: string;
  language?: string;
  ordered?: boolean;
  start?: number;
  checked?: boolean;
  isHeader?: boolean;
  align?: string;
  children?: MarkdownNode[];
}

export interface ParserOptions {
  gfm?: boolean;
  math?: boolean;
}

// Pure JavaScript implementation using JSI
export class JSMarkdownParser {
  private parseImpl(text: string, options: ParserOptions): MarkdownNode {
    // Simple regex-based parser for comparison
    // This is much slower than the C++ version but demonstrates JSI usage
    const root: MarkdownNode = { type: 'document', children: [] };
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) {
        i++;
        continue;
      }

      // Headers
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        root.children!.push({
          type: 'heading',
          level: headerMatch[1].length,
          children: [{ type: 'text', content: headerMatch[2] }]
        });
        i++;
        continue;
      }

      // Bold
      const boldMatch = line.match(/\*\*(.+?)\*\*/);
      if (boldMatch) {
        root.children!.push({
          type: 'paragraph',
          children: [{
            type: 'bold',
            children: [{ type: 'text', content: boldMatch[1] }]
          }]
        });
        i++;
        continue;
      }

      // Default paragraph
      root.children!.push({
        type: 'paragraph',
        children: [{ type: 'text', content: line }]
      });
      i++;
    }

    return root;
  }

  parse(text: string, options: ParserOptions = { gfm: true, math: true }): MarkdownNode {
    return this.parseImpl(text, options);
  }
}

// JSI-enabled version using Nitro but with JS implementation
export class JSINitroMarkdownParser {
  parse(text: string, options: ParserOptions = { gfm: true, math: true }): MarkdownNode {
    // This would use JSI to call into JavaScriptCore
    // For now, we'll simulate it
    const parser = new JSMarkdownParser();
    return parser.parse(text, options);
  }
}

// Hybrid approach: C++ for complex parsing, JS for simple cases
export class HybridMarkdownParser {
  private cppParser: any;
  private jsParser: JSMarkdownParser;

  constructor() {
    // In real implementation, this would be the Nitro C++ parser
    this.cppParser = null;
    this.jsParser = new JSMarkdownParser();
  }

  parse(text: string, options: ParserOptions = { gfm: true, math: true }): MarkdownNode {
    // Use C++ parser for complex cases, JS for simple
    if (text.length > 1000 || options.gfm || options.math) {
      // Would call C++ parser via Nitro
      return this.jsParser.parse(text, options);
    } else {
      // Use JS parser for simple cases
      return this.jsParser.parse(text, options);
    }
  }
}