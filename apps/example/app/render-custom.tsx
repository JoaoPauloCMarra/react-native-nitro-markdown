import { useCallback, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image as RNImage,
  Platform,
} from "react-native";
import {
  Markdown,
  TableRenderer,
  CodeBlock,
  type MarkdownNode,
  type EnhancedRendererProps,
  type CustomRendererProps,
  type NodeStyleOverrides,
  type AstTransform,
} from "react-native-nitro-markdown";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import {
  COMPLEX_MARKDOWN,
  CUSTOM_RENDER_COMPONENTS,
  HTML_PARSER_MARKDOWN,
} from "../markdown-test-data";
import { EXAMPLE_COLORS } from "../theme";

/**
 * Custom heading using the pre-mapped `level` prop.
 * The EnhancedRendererProps includes optional `level` for headings.
 */
const CustomHeading = ({ level = 1, children }: EnhancedRendererProps) => {
  const fontSize = 32 - level * 4;
  return (
    <View style={customStyles.headingContainer}>
      <View style={customStyles.headingBar} />
      <Text style={[customStyles.headingText, { fontSize }]}>{children}</Text>
    </View>
  );
};

const CustomBlockquote = ({ children }: { children: ReactNode }) => (
  <View style={customStyles.blockquote}>
    <Text style={customStyles.blockquoteIcon}>Note</Text>
    <View style={customStyles.blockquoteContent}>{children}</View>
  </View>
);

/**
 * Custom image using pre-mapped `url`, `title` props.
 */
const CustomImage = ({ url = "", title }: EnhancedRendererProps) => (
  <View style={customStyles.imageCard}>
    <RNImage
      source={{ uri: url }}
      style={customStyles.image}
      resizeMode="cover"
    />
    {title ? <Text style={customStyles.imageCaption}>{title}</Text> : null}
  </View>
);

/**
 * Custom code block using pre-mapped `content` and `language` props.
 * No more getTextContent(node) needed!
 */
const CustomCodeBlock = ({ content = "", language }: EnhancedRendererProps) => (
  <CodeBlock
    content={content}
    language={language}
    style={{
      borderRadius: 14,
      borderWidth: 1,
      borderColor: EXAMPLE_COLORS.accent,
      backgroundColor: EXAMPLE_COLORS.surfaceMuted,
    }}
  />
);

const CustomTable = (props: CustomRendererProps) => (
  <TableRenderer node={props.node} Renderer={props.Renderer} />
);

function extractElementText(source: string | undefined, tag: string): string {
  if (!source) return "";

  const openTagPattern = new RegExp(`<${tag}\\b[^>]*>`, "i");
  const openTagMatch = openTagPattern.exec(source);
  if (!openTagMatch) return "";

  const contentStart = openTagMatch.index + openTagMatch[0].length;
  const closeTagIndex = source
    .toLowerCase()
    .indexOf(`</${tag.toLowerCase()}>`, contentStart);
  if (closeTagIndex < 0) return "";

  return source
    .slice(contentStart, closeTagIndex)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NativeHtmlInline = ({ node }: EnhancedRendererProps) => (
  <Text style={customStyles.htmlInline}>
    {extractElementText(node.content, "span") || node.content}
  </Text>
);

const HtmlAwareParagraph = ({ node, Renderer }: CustomRendererProps) => {
  const children = node.children ?? [];
  if (!children.some((child) => child.type === "html_inline")) {
    return undefined;
  }

  let spanDepth = 0;
  const renderedChildren = children.map((child, index) => {
    if (child.type === "html_inline") {
      const content = child.content ?? "";
      if (/^<span\b/i.test(content)) {
        spanDepth += 1;
        return null;
      }
      if (/^<\/span>/i.test(content)) {
        spanDepth = Math.max(0, spanDepth - 1);
        return null;
      }
    }

    if (child.type === "text") {
      return (
        <Text
          key={`${child.type}-${index}`}
          style={spanDepth > 0 ? customStyles.htmlInline : undefined}
        >
          {child.content}
        </Text>
      );
    }

    return (
      <Renderer
        key={`${child.type}-${index}`}
        node={child}
        depth={0}
        inListItem={false}
        parentIsText={true}
      />
    );
  });

  return <Text style={customStyles.htmlParagraph}>{renderedChildren}</Text>;
};

const NativeHtmlBlock = ({ node }: EnhancedRendererProps) => {
  const title = extractElementText(node.content, "strong") || "HTML block";
  const body = extractElementText(node.content, "p") || node.content?.trim();

  return (
    <View style={customStyles.htmlBlock}>
      <Text style={customStyles.htmlLabel}>html_block parsed</Text>
      <Text style={customStyles.htmlBlockTitle}>{title}</Text>
      <Text style={customStyles.htmlBlockBody}>{body}</Text>
    </View>
  );
};

const CUSTOM_STYLE_OVERRIDES: NodeStyleOverrides = {
  text: {
    color: EXAMPLE_COLORS.text,
    lineHeight: 24,
  },
  link: {
    color: EXAMPLE_COLORS.accentDeep,
  },
  code_inline: {
    backgroundColor: EXAMPLE_COLORS.surfaceMuted,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
};

export default function RenderCustomScreen() {
  const tabHeight = useBottomTabHeight();
  const astTransform = useCallback<AstTransform>((ast) => {
    const transformNode = (node: MarkdownNode): MarkdownNode => {
      const children: MarkdownNode[] | undefined =
        node.children?.map(transformNode);

      if (node.type === "text") {
        return {
          ...node,
          content: (node.content ?? "").replace(/:wink:/g, "😉"),
          children,
        };
      }

      return {
        ...node,
        children,
      };
    };

    return transformNode(ast);
  }, []);

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingBottom: tabHeight + 20 }]}>
        <View style={styles.hero}>
          <Text style={styles.title}>Custom Components</Text>
          <Text style={styles.subtitle}>
            Replace built-in renderers and add AST transforms in one place.
          </Text>
        </View>
        <View style={styles.card}>
          <Markdown
            options={{ gfm: true, math: true, html: true }}
            astTransform={astTransform}
            styles={CUSTOM_STYLE_OVERRIDES}
            style={styles.markdown}
            virtualize={true}
            virtualization={{
              initialNumToRender: 10,
              maxToRenderPerBatch: 8,
              windowSize: 7,
            }}
            renderers={{
              // Using pre-mapped props - simpler custom renderers!
              paragraph: HtmlAwareParagraph,
              heading: CustomHeading,
              blockquote: CustomBlockquote,
              image: CustomImage,
              code_block: CustomCodeBlock,
              table: CustomTable,
              html_inline: NativeHtmlInline,
              html_block: NativeHtmlBlock,
              horizontal_rule: () => <View style={customStyles.hr} />,
            }}
          >
            {`${HTML_PARSER_MARKDOWN}\n\n${CUSTOM_RENDER_COMPONENTS}\n\nQuick emoticon transform demo: :wink:\n\n${COMPLEX_MARKDOWN}`}
          </Markdown>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.background,
  },
  content: {
    flex: 1,
    padding: 20,
    gap: 14,
  },
  hero: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
    boxShadow: `0px 8px 18px ${EXAMPLE_COLORS.text}1a`,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: EXAMPLE_COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: EXAMPLE_COLORS.textMuted,
    lineHeight: 20,
  },
  card: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
    boxShadow: `0px 8px 20px ${EXAMPLE_COLORS.text}14`,
  },
  markdown: {
    flex: 1,
  },
});

const customStyles = StyleSheet.create({
  headingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  headingBar: {
    width: 6,
    height: "100%",
    backgroundColor: EXAMPLE_COLORS.accent,
    marginRight: 12,
    borderRadius: 3,
  },
  headingText: {
    fontWeight: "800",
    color: EXAMPLE_COLORS.text,
    letterSpacing: -0.5,
  },
  blockquote: {
    flexDirection: "row",
    backgroundColor: EXAMPLE_COLORS.accentSoft,
    borderRadius: 14,
    padding: 16,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.accent,
  },
  blockquoteIcon: {
    fontSize: 11,
    fontWeight: "700",
    color: EXAMPLE_COLORS.accentDeep,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginRight: 12,
  },
  blockquoteContent: {
    flex: 1,
    justifyContent: "center",
  },
  imageCard: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 16,
    overflow: "hidden",
    marginVertical: 20,
    boxShadow: `0px 8px 16px ${EXAMPLE_COLORS.text}1f`,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
  },
  image: {
    width: "100%",
    height: 200,
  },
  imageCaption: {
    padding: 12,
    fontSize: 14,
    color: EXAMPLE_COLORS.textMuted,
    textAlign: "center",
    fontStyle: "italic",
    backgroundColor: EXAMPLE_COLORS.surface,
  },
  hr: {
    height: 2,
    backgroundColor: EXAMPLE_COLORS.border,
    marginVertical: 24,
    borderRadius: 1,
  },
  htmlInline: {
    color: EXAMPLE_COLORS.warning,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    fontSize: 14,
    backgroundColor: EXAMPLE_COLORS.surfaceMuted,
  },
  htmlParagraph: {
    color: EXAMPLE_COLORS.text,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 12,
    marginBottom: 10,
  },
  htmlBlock: {
    backgroundColor: EXAMPLE_COLORS.infoSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.info,
    padding: 16,
    marginVertical: 14,
  },
  htmlLabel: {
    color: EXAMPLE_COLORS.info,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  htmlBlockTitle: {
    color: EXAMPLE_COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  htmlBlockBody: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
});
