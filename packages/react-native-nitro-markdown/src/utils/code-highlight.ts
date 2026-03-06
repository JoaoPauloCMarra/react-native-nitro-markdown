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

function getKeywords(language: string): Set<string> {
  const lang = language.toLowerCase();
  if (lang === "python" || lang === "py") return PYTHON_KEYWORDS;
  if (lang === "bash" || lang === "sh" || lang === "shell" || lang === "zsh")
    return SHELL_KEYWORDS;
  return JS_KEYWORDS; // default for js/ts/jsx/tsx/java/c/cpp etc.
}

function tokenizeLine(line: string, language: string): HighlightedToken[] {
  const keywords = getKeywords(language);
  const tokens: HighlightedToken[] = [];

  // Full-line comment detection
  const trimmed = line.trimStart();
  const lang = language.toLowerCase();
  const isPythonLike = lang === "python" || lang === "py";
  const isShellLike =
    lang === "bash" || lang === "sh" || lang === "shell" || lang === "zsh";

  if (
    trimmed.startsWith("//") ||
    (trimmed.startsWith("#") && (isShellLike || isPythonLike))
  ) {
    return [{ text: line, type: "comment" }];
  }

  // Only include # as comment for shell/python languages
  const commentPattern =
    isShellLike || isPythonLike ? "\/\/[^\\n]*|#[^\\n]*" : "\/\/[^\\n]*";
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

  // Process line by line, re-inserting newlines as default tokens
  const lines = code.split("\n");
  const result: HighlightedToken[] = [];
  for (let i = 0; i < lines.length; i++) {
    result.push(...tokenizeLine(lines[i], language));
    if (i < lines.length - 1) {
      result.push({ text: "\n", type: "default" });
    }
  }
  return result;
}
