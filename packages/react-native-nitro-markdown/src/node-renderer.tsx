import {
  memo,
  type FC,
  Fragment,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  Text,
  View,
  Platform,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { getTextContent, type MarkdownNode } from "./headless";
import {
  useMarkdownContext,
  type CustomRenderer,
  type NodeRendererProps,
} from "./MarkdownContext";
import { Blockquote } from "./renderers/blockquote";
import { CodeBlock, InlineCode } from "./renderers/code";
import { Heading } from "./renderers/heading";
import { HorizontalRule } from "./renderers/horizontal-rule";
import { HtmlBlock, HtmlInline } from "./renderers/html";
import { Image } from "./renderers/image";
import { Link } from "./renderers/link";
import { List, ListItem, TaskListItem } from "./renderers/list";
import { MathInline, MathBlock } from "./renderers/math";
import { Paragraph } from "./renderers/paragraph";
import { TableRenderer } from "./renderers/table";
import type { MarkdownTheme } from "./theme";

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

const containsInlineMath = (nodes?: MarkdownNode[]): boolean =>
  nodes?.some(
    (node) => node.type === "math_inline" || containsInlineMath(node.children),
  ) ?? false;

const NodeRendererComponent: FC<NodeRendererProps> = ({
  node,
  depth,
  inListItem,
  parentIsText = false,
}) => {
  const { renderers, theme, styles: nodeStyles } = useMarkdownContext();
  const baseStyles = getBaseStyles(theme);

  const renderChildren = (
    children?: MarkdownNode[],
    childInListItem = false,
    childParentIsText = false,
  ): ReactNode => {
    if (!children || children.length === 0) return null;

    const elements: ReactNode[] = [];
    let currentInlineGroup: MarkdownNode[] = [];

    const flushInlineGroup = () => {
      if (currentInlineGroup.length > 0) {
        const hasMath = currentInlineGroup.some(
          (child) => child.type === "math_inline",
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
            </View>,
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
            </Wrapper>,
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
          />,
        );
      }
    });

    flushInlineGroup();
    return elements;
  };

  const customRenderer = renderers[node.type] as CustomRenderer | undefined;
  if (customRenderer) {
    const childrenRendered = renderChildren(
      node.children,
      inListItem,
      parentIsText,
    );

    const baseProps = {
      node,
      children: childrenRendered,
      Renderer: NodeRenderer,
    };

    const enhancedProps = {
      ...baseProps,
      ...(node.type === "heading" && {
        level: (node.level ?? 1) as 1 | 2 | 3 | 4 | 5 | 6,
      }),
      ...(node.type === "link" && {
        href: node.href ?? "",
        ...(node.title ? { title: node.title } : {}),
      }),
      ...(node.type === "image" && {
        url: node.href ?? "",
        ...(node.alt ? { alt: node.alt } : {}),
        ...(node.title ? { title: node.title } : {}),
      }),
      ...(node.type === "code_block" && {
        content: getTextContent(node),
        ...(node.language ? { language: node.language } : {}),
      }),
      ...(node.type === "code_inline" && { content: node.content ?? "" }),
      ...((node.type === "math_inline" || node.type === "math_block") && {
        content: getTextContent(node),
      }),
      ...(node.type === "list" && {
        ordered: node.ordered ?? false,
        ...(node.start === undefined ? {} : { start: node.start }),
      }),
      ...(node.type === "task_list_item" && { checked: node.checked ?? false }),
    };

    const result = customRenderer(enhancedProps);
    if (result !== undefined) {
      return result as ReactElement | null;
    }
  }

  switch (node.type) {
    case "document":
      return (
        <View style={[baseStyles.document, nodeStyles?.document]}>
          {renderChildren(node.children, false, false)}
        </View>
      );

    case "heading":
      return (
        <Heading
          level={node.level ?? 1}
          {...(nodeStyles?.heading ? { style: nodeStyles.heading } : {})}
        >
          {renderChildren(node.children, inListItem, true)}
        </Heading>
      );

    case "paragraph":
      if (containsInlineMath(node.children)) {
        return (
          <Paragraph inListItem={inListItem} style={nodeStyles?.paragraph}>
            {renderChildren(node.children, inListItem, false)}
          </Paragraph>
        );
      }
      return (
        <Text
          style={[
            baseStyles.text,
            inListItem ? undefined : { marginBottom: theme.spacing.l },
            nodeStyles?.paragraph as StyleProp<TextStyle>,
          ]}
        >
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "text":
      if (parentIsText) {
        return <Text>{node.content}</Text>;
      }
      return (
        <Text style={[baseStyles.text, nodeStyles?.text]}>{node.content}</Text>
      );

    case "bold":
      return (
        <Text style={[baseStyles.bold, nodeStyles?.bold]}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "italic":
      return (
        <Text style={[baseStyles.italic, nodeStyles?.italic]}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "strikethrough":
      return (
        <Text style={[baseStyles.strikethrough, nodeStyles?.strikethrough]}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "link":
      return (
        <Link
          href={node.href ?? ""}
          {...(nodeStyles?.link ? { style: nodeStyles.link } : {})}
        >
          {renderChildren(node.children, inListItem, true)}
        </Link>
      );

    case "image":
      return (
        <Image
          url={node.href ?? ""}
          Renderer={NodeRenderer}
          {...(node.title ? { title: node.title } : {})}
          {...(node.alt ? { alt: node.alt } : {})}
          {...(nodeStyles?.image ? { style: nodeStyles.image } : {})}
        />
      );

    case "code_inline":
      return (
        <InlineCode
          {...(nodeStyles?.code_inline
            ? { style: nodeStyles.code_inline }
            : {})}
        >
          {node.content}
        </InlineCode>
      );

    case "code_block":
      return (
        <CodeBlock
          content={getTextContent(node)}
          {...(node.language ? { language: node.language } : {})}
          {...(nodeStyles?.code_block ? { style: nodeStyles.code_block } : {})}
        />
      );

    case "blockquote":
      return (
        <Blockquote
          {...(nodeStyles?.blockquote
            ? { style: nodeStyles.blockquote }
            : {})}
        >
          {renderChildren(node.children, inListItem, false)}
        </Blockquote>
      );

    case "horizontal_rule":
      return (
        <HorizontalRule
          {...(nodeStyles?.horizontal_rule
            ? { style: nodeStyles.horizontal_rule }
            : {})}
        />
      );

    case "line_break":
      return <Text>{"\n"}</Text>;

    case "soft_break":
      return <Text> </Text>;

    case "math_inline": {
      let mathContent = getTextContent(node);
      if (!mathContent) return null;
      // Native math content excludes the dollar delimiters. Strip them only
      // when a non-native source (e.g. a pre-parsed custom AST) includes them.
      if (mathContent.startsWith("$") || mathContent.endsWith("$")) {
        mathContent = mathContent.replace(/^\$+|\$+$/g, "").trim();
      }
      return (
        <MathInline
          content={mathContent}
          {...(nodeStyles?.math_inline
            ? { style: nodeStyles.math_inline }
            : {})}
        />
      );
    }

    case "math_block":
      return (
        <MathBlock
          content={getTextContent(node)}
          {...(nodeStyles?.math_block ? { style: nodeStyles.math_block } : {})}
        />
      );

    case "html_inline":
      return (
        <HtmlInline
          {...(node.content ? { content: node.content } : {})}
          {...(nodeStyles?.html_inline ? { style: nodeStyles.html_inline } : {})}
        />
      );

    case "html_block":
      return (
        <HtmlBlock
          {...(node.content ? { content: node.content } : {})}
          {...(nodeStyles?.html_block ? { style: nodeStyles.html_block } : {})}
        />
      );

    case "list":
      return (
        <List
          ordered={node.ordered ?? false}
          depth={depth}
          {...(node.start === undefined ? {} : { start: node.start })}
          {...(nodeStyles?.list ? { style: nodeStyles.list } : {})}
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
        <TaskListItem
          checked={node.checked ?? false}
          {...(nodeStyles?.task_list_item
            ? { style: nodeStyles.task_list_item }
            : {})}
        >
          {renderChildren(node.children, true, false)}
        </TaskListItem>
      );

    case "table":
      return (
        <TableRenderer
          node={node}
          Renderer={NodeRenderer}
          {...(nodeStyles?.table ? { style: nodeStyles.table } : {})}
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

export const NodeRenderer = memo(NodeRendererComponent, (previousProps, nextProps) => {
  return (
    previousProps.node === nextProps.node &&
    previousProps.depth === nextProps.depth &&
    previousProps.inListItem === nextProps.inListItem &&
    previousProps.parentIsText === nextProps.parentIsText
  );
}) as FC<NodeRendererProps>;

export type BaseStyles = ReturnType<typeof createBaseStyles>;

export const getBaseStyles = (theme: MarkdownTheme): BaseStyles => {
  const cached = baseStylesCache.get(theme);
  if (cached) return cached;

  const created = createBaseStyles(theme);
  baseStylesCache.set(theme, created);
  return created;
};

const baseStylesCache = new WeakMap<MarkdownTheme, BaseStyles>();

export const createBaseStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    container: {
      width: "100%",
      maxWidth: "100%",
      flexShrink: 1,
    },
    virtualizedList: {
      flex: 1,
    },
    document: {
      width: "100%",
      maxWidth: "100%",
      flexShrink: 1,
    },
    errorText: {
      color: "#f87171",
      fontSize: 14,
      fontFamily: theme.fontFamilies.mono ?? "monospace",
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    text: {
      color: theme.colors.text,
      fontSize: theme.fontSizes.m,
      lineHeight: theme.fontSizes.m * 1.6,
      fontFamily: theme.fontFamilies.regular,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    bold: {
      fontWeight: "700",
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    italic: {
      fontStyle: "italic",
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    strikethrough: {
      textDecorationLine: "line-through",
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
  });
