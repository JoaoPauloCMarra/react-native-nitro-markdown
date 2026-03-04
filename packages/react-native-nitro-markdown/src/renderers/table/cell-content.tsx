import { type FC, type ComponentType } from "react";
import { View, Text, type StyleProp, type TextStyle } from "react-native";
import type { MarkdownNode } from "../../headless";
import type { NodeRendererProps } from "../../MarkdownContext";

type CellContentProps = {
  node: MarkdownNode;
  Renderer: ComponentType<NodeRendererProps>;
  styles: {
    cellContentWrapper: object;
  };
  textStyle?: StyleProp<TextStyle>;
};

export const CellContent: FC<CellContentProps> = ({
  node,
  Renderer,
  styles,
  textStyle,
}) => {
  if (!node.children || node.children.length === 0) {
    return <Text style={textStyle}>{node.content ?? ""}</Text>;
  }

  return (
    <View style={styles.cellContentWrapper}>
      {node.children.map((child, idx) => (
        <Renderer
          key={idx}
          node={child}
          depth={0}
          inListItem={false}
          parentIsText={false}
        />
      ))}
    </View>
  );
};
