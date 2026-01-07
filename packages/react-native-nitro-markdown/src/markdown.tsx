import { defaultMarkdownTheme, type MarkdownTheme } from "./theme";
import React, { useMemo, ReactNode } from "react";
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

interface MarkdownProps {
  children: string;
  options?: ParserOptions;
  renderers?: CustomRenderers;
  theme?: Partial<MarkdownTheme>;
  style?: StyleProp<ViewStyle>;
}

export const Markdown: React.FC<MarkdownProps> = ({
  children,
  options,
  renderers = {},
  theme: userTheme,
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

  const theme = useMemo(
    () => ({ ...defaultMarkdownTheme, ...userTheme }),
    [userTheme]
  );

  const baseStyles = useMemo(() => createBaseStyles(theme), [theme]);

  if (!ast) {
    return (
      <View style={[baseStyles.container, style]}>
        <Text style={baseStyles.errorText}>Error parsing markdown</Text>
      </View>
    );
  }

  return (
    <MarkdownContext.Provider value={{ renderers, theme }}>
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

const getTextContent = (node: MarkdownNode): string => {
  if (node.content) return node.content;
  return node.children?.map(getTextContent).join("") ?? "";
};

const NodeRenderer: React.FC<NodeRendererProps> = ({
  node,
  depth,
  inListItem,
  parentIsText = false,
}) => {
  const { renderers, theme } = useMarkdownContext();
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
                alignItems: "baseline",
                flexWrap: "wrap",
                flexShrink: 1,
                marginVertical: 0,
                paddingVertical: 0,
              }}
            >
              {currentInlineGroup.map((node, idx) => (
                <NodeRenderer
                  key={`${node.type}-${idx}`}
                  node={node}
                  depth={depth + 1}
                  inListItem={childInListItem}
                  parentIsText={false}
                />
              ))}
            </View>
          );
        } else {
          const Wrapper = childParentIsText ? React.Fragment : Text;
          const wrapperProps = childParentIsText
            ? {}
            : { style: baseStyles.text };

          elements.push(
            <Wrapper key={`inline-group-${elements.length}`} {...wrapperProps}>
              {currentInlineGroup.map((node, idx) => (
                <NodeRenderer
                  key={`${node.type}-${idx}`}
                  node={node}
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
    const result = customRenderer({
      node,
      children: childrenRendered,
      Renderer: NodeRenderer,
    });
    if (result !== undefined) return <>{result}</>;
  }

  switch (node.type) {
    case "document":
      return (
        <View style={baseStyles.document}>
          {renderChildren(node.children, false, false)}
        </View>
      );

    case "heading":
      return (
        <Heading level={node.level ?? 1}>
          {renderChildren(node.children, inListItem, true)}
        </Heading>
      );

    case "paragraph":
      return (
        <Paragraph inListItem={inListItem}>
          {renderChildren(node.children, inListItem, false)}
        </Paragraph>
      );

    case "text":
      if (parentIsText) {
        return <Text>{node.content}</Text>;
      }
      return <Text style={baseStyles.text}>{node.content}</Text>;

    case "bold":
      return (
        <Text style={baseStyles.bold}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "italic":
      return (
        <Text style={baseStyles.italic}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "strikethrough":
      return (
        <Text style={baseStyles.strikethrough}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "link":
      return (
        <Link href={node.href ?? ""}>
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
        />
      );

    case "code_inline":
      return <InlineCode>{node.content}</InlineCode>;

    case "code_block":
      return (
        <CodeBlock language={node.language} content={getTextContent(node)} />
      );

    case "blockquote":
      return (
        <Blockquote>
          {renderChildren(node.children, inListItem, false)}
        </Blockquote>
      );

    case "horizontal_rule":
      return <HorizontalRule />;

    case "line_break":
      return <Text>{"\n"}</Text>;

    case "soft_break":
      return <Text> </Text>;

    case "math_inline": {
      let mathContent = getTextContent(node);
      if (!mathContent) return null;
      mathContent = mathContent.replace(/^\$+|\$+$/g, "").trim();
      return <MathInline content={mathContent} />;
    }

    case "math_block":
      return <MathBlock content={getTextContent(node)} />;

    case "list":
      return (
        <List ordered={node.ordered ?? false} start={node.start} depth={depth}>
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
        <TaskListItem checked={node.checked ?? false}>
          {renderChildren(node.children, true, false)}
        </TaskListItem>
      );

    case "table":
      return <TableRenderer node={node} Renderer={NodeRenderer} />;

    case "table_head":
    case "table_body":
    case "table_row":
    case "table_cell":
      // Handled by TableRenderer
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
      fontFamily: "monospace",
    },
    text: {
      color: theme.colors.text,
      fontSize: theme.fontSizes.m,
      lineHeight: theme.fontSizes.m * 1.6,
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
