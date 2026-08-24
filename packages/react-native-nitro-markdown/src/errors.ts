/**
 * Stable typed error contract for react-native-nitro-markdown.
 *
 * Where the JavaScript boundary can determine the failure itself it throws a
 * typed `MarkdownError` directly (input bounds in `headless.ts`; disposed
 * state, invalid ranges, and single-call buffer overflow in the session
 * adapter), so message text is never the source of truth for those codes.
 *
 * `toMarkdownError` remains for native-boundary failures that JavaScript
 * cannot pre-determine (cumulative session buffer overflow, native parse and
 * extraction errors). It classifies the stable, non-localized messages the
 * native sessions and C++ parser emit — these messages are part of the
 * compatibility contract; consumers should rely on `code`/`source` instead.
 */
export type MarkdownErrorCode =
  | "input_too_large"
  | "invalid_ast"
  | "parse_failed"
  | "invalid_json"
  | "native_unavailable"
  | "extraction_failed"
  | "buffer_limit"
  | "invalid_range"
  | "destroyed";

export type MarkdownErrorSource = "parse" | "extract" | "session" | "render";

/** JavaScript-side UTF-8 byte cap enforced before any call reaches the native parser. */
export const MAX_PARSE_INPUT_LENGTH = 10 * 1024 * 1024;

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export class MarkdownError extends Error {
  readonly code: MarkdownErrorCode;
  readonly source: MarkdownErrorSource;

  constructor(
    code: MarkdownErrorCode,
    source: MarkdownErrorSource,
    message: string,
  ) {
    super(message);
    this.name = "MarkdownError";
    this.code = code;
    this.source = source;
  }
}

const MESSAGE_CODE_RULES: readonly (readonly [RegExp, MarkdownErrorCode])[] =
  [
    // Native C++ parser: byte-cap rejection (JS-side char cap is typed
    // directly; the native byte cap is only reachable for multi-byte text).
    [/Markdown input size .* exceeds the maximum of/, "input_too_large"],
    [/Markdown AST depth exceeds the maximum of/, "invalid_ast"],
    // Native sessions (shared C++): stable, non-localized messages.
    [/Buffer size limit exceeded/, "buffer_limit"],
    [/Invalid range/, "invalid_range"],
    [/is destroyed/i, "destroyed"],
  ];

export function toMarkdownError(
  error: unknown,
  source: MarkdownErrorSource,
): MarkdownError {
  if (error instanceof MarkdownError) return error;

  const message = error instanceof Error ? error.message : String(error);
  for (const [pattern, code] of MESSAGE_CODE_RULES) {
    if (pattern.test(message)) {
      return new MarkdownError(code, source, message);
    }
  }
  return new MarkdownError("parse_failed", source, message);
}

export function inputTooLargeError(
  actualBytes: number,
  maxBytes: number,
): MarkdownError {
  return new MarkdownError(
    "input_too_large",
    "parse",
    `Input size ${actualBytes} bytes exceeds the maximum of ${maxBytes} bytes`,
  );
}

export function invalidInputLengthError(value: unknown): MarkdownError {
  return new MarkdownError(
    "input_too_large",
    "parse",
    `maxInputLength must be a finite non-negative integer in bytes; received ${String(value)}`,
  );
}

export function invalidAstError(reason: string): MarkdownError {
  return new MarkdownError(
    "invalid_ast",
    "render",
    `[NitroMarkdown] Invalid Markdown AST: ${reason}`,
  );
}
