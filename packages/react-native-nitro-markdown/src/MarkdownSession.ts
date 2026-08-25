import { NitroModules } from "react-native-nitro-modules";
import type { MarkdownSession as MarkdownSessionSpec } from "./specs/MarkdownSession.nitro";
import {
  MAX_PARSE_INPUT_LENGTH,
  MarkdownError,
  toMarkdownError,
} from "./errors";

export type MarkdownSession = MarkdownSessionSpec;

const DESTROYED_MESSAGE = "HybridMarkdownSession is destroyed";
const BUFFER_LIMIT_MESSAGE = `Buffer size limit exceeded (max ${MAX_PARSE_INPUT_LENGTH} chars)`;

function assertValidReplaceRange(from: number, to: number): void {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    to < 0 ||
    from > to
  ) {
    throw new MarkdownError(
      "invalid_range",
      "session",
      `Invalid range: from=${from} and to=${to} must be finite, from must be >= 0, and to must be >= from`,
    );
  }
}

function assertWithinBufferLimit(size: number): void {
  if (size > MAX_PARSE_INPUT_LENGTH) {
    throw new MarkdownError("buffer_limit", "session", BUFFER_LIMIT_MESSAGE);
  }
}

/**
 * Wraps a native session so every method failure is rethrown as a typed
 * `MarkdownError` with a stable `code` and `source: "session"`.
 *
 * Conditions the wrapper can determine itself (disposed state, invalid
 * replace ranges, single-call buffer overflow) throw typed errors before the
 * native call. Failures only knowable natively (cumulative buffer overflow
 * across appends, unexpected native errors) fall back to `toMarkdownError`,
 * which maps stable native messages for compatibility.
 */
export function createMarkdownSession(initialText?: string): MarkdownSession {
  const session =
    NitroModules.createHybridObject<MarkdownSession>("MarkdownSession");

  let isDisposed = false;

  const wrapped = new Proxy(session, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;

      if (prop === "dispose") {
        return () => {
          isDisposed = true;
          try {
            return Reflect.apply(value, target, []);
          } catch (error) {
            throw toMarkdownError(error, "session");
          }
        };
      }

      return (...args: unknown[]) => {
        if (isDisposed) {
          throw new MarkdownError("destroyed", "session", DESTROYED_MESSAGE);
        }
        try {
          if (prop === "append" || prop === "reset") {
            assertWithinBufferLimit(String(args[0] ?? "").length);
          } else if (prop === "replace") {
            assertValidReplaceRange(Number(args[0]), Number(args[1]));
            assertWithinBufferLimit(String(args[2] ?? "").length);
          }
          return Reflect.apply(value, target, args);
        } catch (error) {
          const errorSource =
            prop === "parse" || prop === "parseWithOptions"
              ? "parse"
              : "session";
          throw toMarkdownError(error, errorSource);
        }
      };
    },
    set(target, prop, value) {
      try {
        return Reflect.set(target, prop, value, target);
      } catch (error) {
        throw toMarkdownError(error, "session");
      }
    },
  });

  if (initialText !== undefined) {
    wrapped.reset(initialText);
  }

  return wrapped;
}
