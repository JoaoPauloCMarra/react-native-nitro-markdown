import type { ParserOptions } from "../Markdown.nitro";
import {
  MAX_PARSE_INPUT_LENGTH,
  inputTooLargeError,
  invalidInputLengthError,
  utf8ByteLength,
} from "../errors";

export function resolveMaxInputLength(options?: ParserOptions): number {
  const value = options?.maxInputLength;
  if (value === undefined || value === 0) return MAX_PARSE_INPUT_LENGTH;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalidInputLengthError(value);
  }
  return Math.min(value, MAX_PARSE_INPUT_LENGTH);
}

export function assertInputWithinBounds(
  text: string,
  options?: ParserOptions,
): void {
  const maxBytes = resolveMaxInputLength(options);
  const actualBytes = utf8ByteLength(text);
  if (actualBytes > maxBytes) {
    throw inputTooLargeError(actualBytes, maxBytes);
  }
}
