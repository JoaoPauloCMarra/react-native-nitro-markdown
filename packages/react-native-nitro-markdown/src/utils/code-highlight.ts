export type TokenType =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "operator"
  | "punctuation"
  | "type"
  | "default";

export type HighlightedToken = { text: string; type: TokenType };
export type CodeHighlighter = (
  language: string,
  code: string,
) => HighlightedToken[];

const JS_KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "class",
  "extends",
  "import",
  "export",
  "from",
  "default",
  "new",
  "this",
  "typeof",
  "instanceof",
  "null",
  "undefined",
  "true",
  "false",
  "async",
  "await",
  "try",
  "catch",
  "throw",
  "switch",
  "case",
  "break",
  "continue",
  "type",
  "interface",
  "enum",
  "as",
  "in",
  "of",
  "void",
]);

const PYTHON_KEYWORDS = new Set([
  "def",
  "class",
  "import",
  "from",
  "return",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "try",
  "except",
  "finally",
  "with",
  "as",
  "pass",
  "break",
  "continue",
  "and",
  "or",
  "not",
  "in",
  "is",
  "None",
  "True",
  "False",
  "lambda",
  "yield",
  "async",
  "await",
]);

const SHELL_KEYWORDS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "for",
  "do",
  "done",
  "while",
  "case",
  "esac",
  "function",
  "return",
  "exit",
  "echo",
  "export",
]);

type LanguageProfile = {
  keywords: Set<string>;
  lineComment: "//" | "#";
};

const JS_PROFILE: LanguageProfile = { keywords: JS_KEYWORDS, lineComment: "//" };
const PYTHON_PROFILE: LanguageProfile = {
  keywords: PYTHON_KEYWORDS,
  lineComment: "#",
};
const SHELL_PROFILE: LanguageProfile = {
  keywords: SHELL_KEYWORDS,
  lineComment: "#",
};

const LANGUAGE_PROFILES: ReadonlyMap<string, LanguageProfile> = new Map([
  ["javascript", JS_PROFILE],
  ["js", JS_PROFILE],
  ["jsx", JS_PROFILE],
  ["typescript", JS_PROFILE],
  ["ts", JS_PROFILE],
  ["tsx", JS_PROFILE],
  ["python", PYTHON_PROFILE],
  ["py", PYTHON_PROFILE],
  ["bash", SHELL_PROFILE],
  ["sh", SHELL_PROFILE],
  ["shell", SHELL_PROFILE],
  ["zsh", SHELL_PROFILE],
]);

/**
 * Languages with fixture-backed keyword tables in `defaultHighlighter`.
 * Any other language falls back to a single default token — the built-in
 * highlighter does not pretend to understand it.
 */
export const SUPPORTED_HIGHLIGHT_LANGUAGES: readonly string[] = [
  ...LANGUAGE_PROFILES.keys(),
];

function tokenizeLine(
  line: string,
  profile: LanguageProfile,
): HighlightedToken[] {
  const { keywords, lineComment } = profile;
  const tokens: HighlightedToken[] = [];

  // Full-line comment detection
  const trimmed = line.trimStart();

  if (trimmed.startsWith(lineComment)) {
    return [{ text: line, type: "comment" }];
  }

  const commentPattern = `${lineComment}[^\\n]*`;
  const tokenRegex = new RegExp(
    `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|(${commentPattern})|([a-zA-Z_$][a-zA-Z0-9_$]*)|([+\\-*/%=<>!&|^~?:]+)|([(\\)\\[\\]{},;.])|(\\s+)|(.)`,
    "g",
  );

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(line)) !== null) {
    const [full, str, num, comment, ident, op, punct] = match;
    if (str) {
      tokens.push({ text: full, type: "string" });
    } else if (num) {
      tokens.push({ text: full, type: "number" });
    } else if (comment) {
      tokens.push({ text: full, type: "comment" });
    } else if (ident) {
      const type: TokenType = keywords.has(ident)
        ? "keyword"
        : /^[A-Z][A-Za-z0-9]*$/.test(ident)
          ? "type"
          : "default";
      tokens.push({ text: full, type });
    } else if (op) {
      tokens.push({ text: full, type: "operator" });
    } else if (punct) {
      tokens.push({ text: full, type: "punctuation" });
    } else {
      tokens.push({ text: full, type: "default" });
    }
  }

  return tokens;
}

export function defaultHighlighter(
  language: string,
  code: string,
): HighlightedToken[] {
  if (!language || language === "text" || language === "plain") {
    return [{ text: code, type: "default" }];
  }

  const profile = LANGUAGE_PROFILES.get(language.toLowerCase());
  if (!profile) {
    return [{ text: code, type: "default" }];
  }

  // Process line by line, re-inserting newlines as default tokens
  const lines = code.split("\n");
  const result: HighlightedToken[] = [];
  for (let i = 0; i < lines.length; i++) {
    result.push(...tokenizeLine(lines[i] ?? "", profile));
    if (i < lines.length - 1) {
      result.push({ text: "\n", type: "default" });
    }
  }
  return result;
}
