import { type ReactNode, type FC } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { MarkdownNode } from "./headless";
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
import { defaultMarkdownTheme } from "./theme";

interface MarkdownRendererProps {
  node: MarkdownNode;
  depth?: number;
  inListItem?: boolean;
}

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
    type === "math_inline" ||
    type === "html_inline"
  );
};

const getTextContent = (node: MarkdownNode): string => {
  if (node.content) return node.content;
  return node.children?.map(getTextContent).join("") ?? "";
};

export const DefaultMarkdownRenderer: FC<MarkdownRendererProps> = ({
  node,
  depth = 0,
  inListItem = false,
}) => {
  const renderChildren = (
    children?: MarkdownNode[],
    childInListItem = false
  ) => {
    if (!children || children.length === 0) return null;

    const elements: ReactNode[] = [];
    let currentInlineGroup: MarkdownNode[] = [];

    const flushInlineGroup = () => {
      if (currentInlineGroup.length > 0) {
        elements.push(
          <Text key={`inline-group-${elements.length}`} style={styles.text}>
            {currentInlineGroup.map((child, index) => (
              <DefaultMarkdownRenderer
                key={`${child.type}-${index}`}
                node={child}
                depth={depth + 1}
                inListItem={childInListItem}
              />
            ))}
          </Text>
        );
        currentInlineGroup = [];
      }
    };

    children.forEach((child, index) => {
      if (isInline(child.type)) {
        currentInlineGroup.push(child);
      } else {
        flushInlineGroup();
        elements.push(
          <DefaultMarkdownRenderer
            key={`${child.type}-${index}`}
            node={child}
            depth={depth + 1}
            inListItem={childInListItem}
          />
        );
      }
    });

    flushInlineGroup();
    return elements;
  };

  switch (node.type) {
    case "document":
      return (
        <View style={styles.document}>
          {renderChildren(node.children, false)}
        </View>
      );

    case "heading":
      return (
        <Heading level={node.level ?? 1}>
          {renderChildren(node.children, inListItem)}
        </Heading>
      );

    case "paragraph":
      return (
        <Paragraph inListItem={inListItem}>
          {renderChildren(node.children, inListItem)}
        </Paragraph>
      );

    case "text":
      return <Text style={styles.text}>{node.content}</Text>;

    case "bold":
      return (
        <Text style={styles.bold}>
          {renderChildren(node.children, inListItem)}
        </Text>
      );

    case "italic":
      return (
        <Text style={styles.italic}>
          {renderChildren(node.children, inListItem)}
        </Text>
      );

    case "strikethrough":
      return (
        <Text style={styles.strikethrough}>
          {renderChildren(node.children, inListItem)}
        </Text>
      );

    case "link":
      return (
        <Link href={node.href ?? ""}>
          {renderChildren(node.children, inListItem)}
        </Link>
      );

    case "image":
      return (
        <Image
          url={node.href ?? ""}
          title={node.title}
          alt={node.alt}
          Renderer={DefaultMarkdownRenderer}
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
        <Blockquote>{renderChildren(node.children, inListItem)}</Blockquote>
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

    case "math_block": {
      let mathContent = getTextContent(node);
      if (!mathContent) return null;
      mathContent = mathContent.replace(/^\$+|\$+$/g, "").trim();
      return <MathBlock content={mathContent} />;
    }

    case "list":
      return (
        <List ordered={node.ordered ?? false} start={node.start} depth={depth}>
          {node.children?.map((child, index) => {
            if (child.type === "task_list_item") {
              return (
                <DefaultMarkdownRenderer
                  key={index}
                  node={child}
                  depth={depth + 1}
                  inListItem={true}
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
                <DefaultMarkdownRenderer
                  node={child}
                  depth={depth + 1}
                  inListItem={true}
                />
              </ListItem>
            );
          })}
        </List>
      );

    case "list_item":
      return <>{renderChildren(node.children, true)}</>;

    case "task_list_item":
      return (
        <TaskListItem checked={node.checked ?? false}>
          {renderChildren(node.children, true)}
        </TaskListItem>
      );

    case "table":
      return <TableRenderer node={node} Renderer={DefaultMarkdownRenderer} />;

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

const styles = StyleSheet.create({
  document: {
    flex: 1,
  },
  text: {
    color: defaultMarkdownTheme.colors.text,
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
