import {
  defaultMarkdownTheme,
  minimalMarkdownTheme,
  mergeThemes,
  type MarkdownTheme,
  type PartialMarkdownTheme,
  type NodeStyleOverrides,
  type StylingStrategy,
} from "./theme";
import { useMemo, type ReactNode, type FC, Fragment } from "react";
import {
  StyleSheet,
  View,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  parseMarkdown,
  parseMarkdownWithOptions,
  getTextContent,
  type MarkdownNode,
} from "./headless";
import type { ParserOptions } from "./Markdown.nitro";
import {
  MarkdownContext,
  useMarkdownContext,
  type CustomRenderers,
  type NodeRendererProps,
} from "./MarkdownContext";

import { Heading } from "./renderers/heading";
import { Paragraph } from "./renderers/paragraph";
import { Link } from "./renderers/link";
import { Blockquote } from "./renderers/blockquote";
import { HorizontalRule } from "./renderers/horizontal-rule";
import { CodeBlock, InlineCode } from "./renderers/code";
import { List, ListItem, TaskListItem } from "./renderers/list";
import { TableRenderer } from "./renderers/table";
import { Image } from "./renderers/image";
import { MathInline, MathBlock } from "./renderers/math";

export interface MarkdownProps {
  /**
   * The markdown string to parse and render.
   */
  children: string;
  /**
   * Parser options to enable GFM or Math support.
   */
  options?: ParserOptions;
  /**
   * Custom renderers for specific markdown node types.
   * Each renderer receives { node, children, Renderer } plus type-specific props.
   */
  renderers?: CustomRenderers;
  /**
   * Custom theme to override default styles.
   */
  theme?: PartialMarkdownTheme;
  /**
   * Style overrides for specific node types.
   * Applied after internal styles, allowing fine-grained customization.
   * @example
   * ```tsx
   * <Markdown styles={{ heading: { color: 'red' }, code_block: { borderRadius: 0 } }}>
   *   {content}
   * </Markdown>
   * ```
   */
  styles?: NodeStyleOverrides;
  /**
   * Styling strategy for the component.
   * - "opinionated": Full styling with colors, spacing, and visual effects (default)
   * - "minimal": Bare minimum styling for a clean slate
   */
  stylingStrategy?: StylingStrategy;
  /**
   * Optional style for the container view.
   */
  style?: StyleProp<ViewStyle>;
}

export const Markdown: FC<MarkdownProps> = ({
  children,
  options,
  renderers = {},
  theme: userTheme,
  styles: nodeStyles,
  stylingStrategy = "opinionated",
  style,
}) => {
  const ast = useMemo(() => {
    try {
      if (options) {
        return parseMarkdownWithOptions(children, options);
      }
      return parseMarkdown(children);
    } catch (error) {
      console.error("Failed to parse markdown:", error);
      return null;
    }
  }, [children, options]);

  const theme = useMemo(() => {
    const base =
      stylingStrategy === "minimal"
        ? minimalMarkdownTheme
        : defaultMarkdownTheme;
    return mergeThemes(base, userTheme);
  }, [userTheme, stylingStrategy]);

  const baseStyles = useMemo(() => createBaseStyles(theme), [theme]);

  if (!ast) {
    return (
      <View style={[baseStyles.container, style]}>
        <Text style={baseStyles.errorText}>Error parsing markdown</Text>
      </View>
    );
  }

  return (
    <MarkdownContext.Provider
      value={{ renderers, theme, styles: nodeStyles, stylingStrategy }}
    >
      <View style={[baseStyles.container, style]}>
        <NodeRenderer node={ast} depth={0} inListItem={false} />
      </View>
    </MarkdownContext.Provider>
  );
};

const isInline = (type: MarkdownNode["type"]): boolean => {
  return (
    type === "text" ||
    type === "bold" ||
    type === "italic" ||
    type === "strikethrough" ||
    type === "link" ||
    type === "code_inline" ||
    type === "soft_break" ||
    type === "line_break" ||
    type === "html_inline" ||
    type === "math_inline"
  );
};

const NodeRenderer: FC<NodeRendererProps> = ({
  node,
  depth,
  inListItem,
  parentIsText = false,
}) => {
  const { renderers, theme, styles: nodeStyles } = useMarkdownContext();
  const baseStyles = useMemo(() => createBaseStyles(theme), [theme]);

  const renderChildren = (
    children?: MarkdownNode[],
    childInListItem = false,
    childParentIsText = false
  ): ReactNode => {
    if (!children || children.length === 0) return null;

    const elements: ReactNode[] = [];
    let currentInlineGroup: MarkdownNode[] = [];

    const flushInlineGroup = () => {
      if (currentInlineGroup.length > 0) {
        const hasMath = currentInlineGroup.some(
          (child) => child.type === "math_inline"
        );

        if (hasMath && !childParentIsText) {
          elements.push(
            <View
              key={`inline-group-${elements.length}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                flexShrink: 1,
              }}
            >
              {currentInlineGroup.map((n, idx) => (
                <NodeRenderer
                  key={`${n.type}-${idx}`}
                  node={n}
                  depth={depth + 1}
                  inListItem={childInListItem}
                  parentIsText={false}
                />
              ))}
            </View>
          );
        } else {
          const Wrapper = childParentIsText ? Fragment : Text;
          const wrapperProps = childParentIsText
            ? {}
            : { style: baseStyles.text };

          elements.push(
            <Wrapper key={`inline-group-${elements.length}`} {...wrapperProps}>
              {currentInlineGroup.map((n, idx) => (
                <NodeRenderer
                  key={`${n.type}-${idx}`}
                  node={n}
                  depth={depth + 1}
                  inListItem={childInListItem}
                  parentIsText={true}
                />
              ))}
            </Wrapper>
          );
        }
        currentInlineGroup = [];
      }
    };

    children.forEach((child, index) => {
      if (isInline(child.type)) {
        currentInlineGroup.push(child);
      } else {
        flushInlineGroup();
        elements.push(
          <NodeRenderer
            key={`${child.type}-${index}`}
            node={child}
            depth={depth + 1}
            inListItem={childInListItem}
            parentIsText={childParentIsText}
          />
        );
      }
    });

    flushInlineGroup();
    return elements;
  };

  const customRenderer = renderers[node.type];
  if (customRenderer) {
    const childrenRendered = renderChildren(
      node.children,
      inListItem,
      parentIsText
    );

    const baseProps = {
      node,
      children: childrenRendered,
      Renderer: NodeRenderer,
    };

    const enhancedProps = {
      ...baseProps,
      // Heading
      ...(node.type === "heading" && {
        level: (node.level ?? 1) as 1 | 2 | 3 | 4 | 5 | 6,
      }),
      // Link
      ...(node.type === "link" && { href: node.href ?? "", title: node.title }),
      // Image
      ...(node.type === "image" && {
        url: node.href ?? "",
        alt: node.alt,
        title: node.title,
      }),
      // Code block
      ...(node.type === "code_block" && {
        content: getTextContent(node),
        language: node.language,
      }),
      // Inline code
      ...(node.type === "code_inline" && { content: node.content ?? "" }),
      // List
      ...(node.type === "list" && {
        ordered: node.ordered ?? false,
        start: node.start,
      }),
      // Task list item
      ...(node.type === "task_list_item" && { checked: node.checked ?? false }),
    };

    const result = customRenderer(enhancedProps);
    if (result !== undefined) return <>{result}</>;
  }

  const nodeStyleOverride = nodeStyles?.[node.type];

  switch (node.type) {
    case "document":
      return (
        <View style={[baseStyles.document, nodeStyleOverride]}>
          {renderChildren(node.children, false, false)}
        </View>
      );

    case "heading":
      return (
        <Heading level={node.level ?? 1} style={nodeStyleOverride}>
          {renderChildren(node.children, inListItem, true)}
        </Heading>
      );

    case "paragraph":
      return (
        <Paragraph inListItem={inListItem} style={nodeStyleOverride}>
          {renderChildren(node.children, inListItem, false)}
        </Paragraph>
      );

    case "text":
      if (parentIsText) {
        return <Text>{node.content}</Text>;
      }
      return (
        <Text style={[baseStyles.text, nodeStyleOverride]}>{node.content}</Text>
      );

    case "bold":
      return (
        <Text style={[baseStyles.bold, nodeStyleOverride]}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "italic":
      return (
        <Text style={[baseStyles.italic, nodeStyleOverride]}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "strikethrough":
      return (
        <Text style={[baseStyles.strikethrough, nodeStyleOverride]}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "link":
      return (
        <Link href={node.href ?? ""} style={nodeStyleOverride}>
          {renderChildren(node.children, inListItem, true)}
        </Link>
      );

    case "image":
      return (
        <Image
          url={node.href ?? ""}
          title={node.title}
          alt={node.alt}
          Renderer={NodeRenderer}
          style={nodeStyleOverride}
        />
      );

    case "code_inline":
      return <InlineCode style={nodeStyleOverride}>{node.content}</InlineCode>;

    case "code_block":
      return (
        <CodeBlock
          language={node.language}
          content={getTextContent(node)}
          style={nodeStyleOverride}
        />
      );

    case "blockquote":
      return (
        <Blockquote style={nodeStyleOverride}>
          {renderChildren(node.children, inListItem, false)}
        </Blockquote>
      );

    case "horizontal_rule":
      return <HorizontalRule style={nodeStyleOverride} />;

    case "line_break":
      return <Text>{"\n"}</Text>;

    case "soft_break":
      return <Text> </Text>;

    case "math_inline": {
      let mathContent = getTextContent(node);
      if (!mathContent) return null;
      mathContent = mathContent.replace(/^\$+|\$+$/g, "").trim();
      return <MathInline content={mathContent} style={nodeStyleOverride} />;
    }

    case "math_block":
      return (
        <MathBlock content={getTextContent(node)} style={nodeStyleOverride} />
      );

    case "list":
      return (
        <List
          ordered={node.ordered ?? false}
          start={node.start}
          depth={depth}
          style={nodeStyleOverride}
        >
          {node.children?.map((child, index) => {
            if (child.type === "task_list_item") {
              return (
                <NodeRenderer
                  key={index}
                  node={child}
                  depth={depth + 1}
                  inListItem={true}
                  parentIsText={false}
                />
              );
            }
            return (
              <ListItem
                key={index}
                index={index}
                ordered={node.ordered ?? false}
                start={node.start ?? 1}
              >
                <NodeRenderer
                  node={child}
                  depth={depth + 1}
                  inListItem={true}
                  parentIsText={false}
                />
              </ListItem>
            );
          })}
        </List>
      );

    case "list_item":
      return <>{renderChildren(node.children, true, false)}</>;

    case "task_list_item":
      return (
        <TaskListItem checked={node.checked ?? false} style={nodeStyleOverride}>
          {renderChildren(node.children, true, false)}
        </TaskListItem>
      );

    case "table":
      return (
        <TableRenderer
          node={node}
          Renderer={NodeRenderer}
          style={nodeStyleOverride}
        />
      );

    case "table_head":
    case "table_body":
    case "table_row":
    case "table_cell":
      return null;

    default:
      return null;
  }
};

const createBaseStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    document: {
      flex: 1,
    },
    errorText: {
      color: "#f87171",
      fontSize: 14,
      fontFamily: theme.fontFamilies.mono ?? "monospace",
    },
    text: {
      color: theme.colors.text,
      fontSize: theme.fontSizes.m,
      lineHeight: theme.fontSizes.m * 1.6,
      fontFamily: theme.fontFamilies.regular,
    },
    bold: {
      fontWeight: "700",
    },
    italic: {
      fontStyle: "italic",
    },
    strikethrough: {
      textDecorationLine: "line-through",
    },
  });
