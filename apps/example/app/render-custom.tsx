import type { ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image as RNImage,
} from "react-native";
import {
  Markdown,
  TableRenderer,
  CodeBlock,
  type EnhancedRendererProps,
  type CustomRendererProps,
  type NodeStyleOverrides,
} from "react-native-nitro-markdown";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import {
  COMPLEX_MARKDOWN,
  CUSTOM_RENDER_COMPONENTS,
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

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabHeight + 20 },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <Markdown
          options={{ gfm: true, math: true }}
          styles={CUSTOM_STYLE_OVERRIDES}
          renderers={{
            // Using pre-mapped props - simpler custom renderers!
            heading: CustomHeading,
            blockquote: CustomBlockquote,
            image: CustomImage,
            code_block: CustomCodeBlock,
            table: CustomTable,
            horizontal_rule: () => <View style={customStyles.hr} />,
          }}
        >
          {`${CUSTOM_RENDER_COMPONENTS}\n\n${COMPLEX_MARKDOWN}`}
        </Markdown>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
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
    boxShadow: `0px 4px 10px ${EXAMPLE_COLORS.text}14`,
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
});
