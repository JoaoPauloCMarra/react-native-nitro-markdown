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
  lightMarkdownTheme,
  type EnhancedRendererProps,
  type CustomRendererProps,
} from "react-native-nitro-markdown";
import {
  COMPLEX_MARKDOWN,
  CUSTOM_RENDER_COMPONENTS,
} from "../markdown-test-data";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";

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
    <Text style={customStyles.blockquoteIcon}>💡</Text>
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
    {title && <Text style={customStyles.imageCaption}>{title}</Text>}
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
    style={{ borderRadius: 16, borderWidth: 2, borderColor: "#6366F1" }}
  />
);

const CustomTable = (props: CustomRendererProps) => (
  <TableRenderer node={props.node} Renderer={props.Renderer} />
);

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
          theme={lightMarkdownTheme}
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
    backgroundColor: "#F3F4F6",
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
    backgroundColor: "#6366F1",
    marginRight: 12,
    borderRadius: 3,
  },
  headingText: {
    fontWeight: "800",
    color: "#1F2937",
    letterSpacing: -0.5,
  },
  blockquote: {
    flexDirection: "row",
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  blockquoteIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  blockquoteContent: {
    flex: 1,
    justifyContent: "center",
  },
  imageCard: {
    backgroundColor: "white",
    borderRadius: 16,
    overflow: "hidden",
    marginVertical: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  image: {
    width: "100%",
    height: 200,
  },
  imageCaption: {
    padding: 12,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    fontStyle: "italic",
    backgroundColor: "white",
  },
  hr: {
    height: 2,
    backgroundColor: "#E5E7EB",
    marginVertical: 24,
    borderRadius: 1,
  },
});
