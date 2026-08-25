import {
  MarkdownParserModule,
  parseMarkdownWithOptions,
  type MarkdownNode,
} from "../headless";
import type { ParserOptions } from "../Markdown.nitro";
import { MarkdownError, toMarkdownError } from "../errors";
import { assertInputWithinBounds } from "./parse-input";

function parseTrustedRenderAst(jsonStr: string): MarkdownNode {
  try {
    const ast = JSON.parse(jsonStr) as unknown;
    if (
      typeof ast !== "object" ||
      ast === null ||
      Array.isArray(ast) ||
      typeof Reflect.get(ast, "type") !== "string"
    ) {
      throw new MarkdownError(
        "invalid_json",
        "parse",
        "[NitroMarkdown] native parser returned an invalid root node",
      );
    }
    return ast as MarkdownNode;
  } catch (error) {
    if (error instanceof MarkdownError) throw error;
    throw new MarkdownError(
      "invalid_json",
      "parse",
      `[NitroMarkdown] native parser returned invalid JSON: ${String(error)}`,
    );
  }
}

export function parseMarkdownForRender(
  text: string,
  options?: ParserOptions,
): MarkdownNode {
  assertInputWithinBounds(text, options);
  if (options?.freezeAst === true) {
    return parseMarkdownWithOptions(text, options);
  }
  if (MarkdownParserModule == null) {
    throw new MarkdownError(
      "native_unavailable",
      "parse",
      "[NitroMarkdown] Markdown render parser unavailable — check installation.",
    );
  }

  try {
    const jsonStr =
      options == null
        ? MarkdownParserModule.parse(text)
        : MarkdownParserModule.parseWithOptions(text, options);
    return parseTrustedRenderAst(jsonStr);
  } catch (error) {
    if (__DEV__) {
      console.error(
        "[NitroMarkdown] parseMarkdownForRender: native parser failed.",
        error,
      );
    }
    throw toMarkdownError(error, "parse");
  }
}
