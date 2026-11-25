import { parseMarkdownSession, type MarkdownNode } from "../headless";
import { MarkdownError, toMarkdownError } from "../errors";
import type { ParserOptions } from "../Markdown.nitro";
import type {
  MarkdownSession,
  StreamViewRequest,
} from "../specs/MarkdownSession.nitro";
import { freezeMarkdownNode } from "./freeze-ast";

export type StreamViewState =
  | { kind: "source" }
  | {
      kind: "view";
      /**
       * The unfinished tail holds no Markdown syntax and nothing is hidden,
       * so a plain-text append can extend the AST without a native call.
       */
      appendable: boolean;
      openCodeFence: boolean;
    };

export type StreamParse = { ast: MarkdownNode; view: StreamViewState };

export const SOURCE_VIEW: StreamViewState = { kind: "source" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalidView = (reason: string): MarkdownError =>
  new MarkdownError(
    "invalid_json",
    "parse",
    `[NitroMarkdown] native stream view is invalid: ${reason}`,
  );

/**
 * Parses the session buffer as it should show while it is still streaming.
 * A session without `parseStreamView` (an older native build or a custom
 * session object) is parsed as written.
 */
export function parseSessionView(
  session: MarkdownSession,
  options: ParserOptions | undefined,
  request: StreamViewRequest,
): StreamParse {
  if (typeof session.parseStreamView !== "function") {
    return { ast: parseMarkdownSession(session, options), view: SOURCE_VIEW };
  }

  try {
    const result: unknown = JSON.parse(
      session.parseStreamView(options ?? {}, request),
    );
    if (!isRecord(result)) throw invalidView("not an object");
    const { modified, plainTail, openCodeFence, document } = result;
    if (
      typeof modified !== "boolean" ||
      typeof plainTail !== "boolean" ||
      typeof openCodeFence !== "boolean"
    ) {
      throw invalidView("a flag is not a boolean");
    }
    if (!isRecord(document) || document.type !== "document") {
      throw invalidView("the document node is missing");
    }
    const ast = document as MarkdownNode;
    return {
      ast: options?.freezeAst === true ? freezeMarkdownNode(ast) : ast,
      view: { kind: "view", appendable: plainTail && !modified, openCodeFence },
    };
  } catch (error) {
    throw toMarkdownError(error, "parse");
  }
}
