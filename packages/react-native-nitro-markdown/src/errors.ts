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
  | "parse_failed"
  | "invalid_json"
  | "native_unavailable"
  | "extraction_failed"
  | "buffer_limit"
  | "invalid_range"
  | "destroyed";

export type MarkdownErrorSource = "parse" | "extract" | "session" | "render";

/** JavaScript-side input cap enforced before any call reaches the native parser. */
export const MAX_PARSE_INPUT_LENGTH = 10 * 1024 * 1024;

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
    // Native sessions (Swift/Kotlin): stable, non-localized messages.
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
  actualLength: number,
  maxLength: number,
): MarkdownError {
  return new MarkdownError(
    "input_too_large",
    "parse",
    `Input length ${actualLength} exceeds the maximum of ${maxLength} characters`,
  );
}
